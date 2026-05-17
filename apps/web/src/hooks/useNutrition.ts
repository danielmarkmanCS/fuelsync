import { useCallback, useEffect } from 'react';
import { useNutritionStore } from '../store/nutritionStore';
import { useAuthStore } from '../store/authStore';
import { fetchWeather, evaluateEnvironment } from '@mobile/services/weatherService';
import { computeMacros, checkLegFatigueGate } from '@mobile/services/nutritionEngine';
import type { DailyLog, TrainingType, UserProfile, WeatherConditions, EnvironmentAlert } from '@shared/types';
import type { BackendUser } from '../api/auth';

const WEATHER_API_KEY = import.meta.env.VITE_OPENWEATHER_KEY ?? '';

export function toUserProfile(user: BackendUser): UserProfile | null {
  if (!user.weightKg || !user.heightCm || !user.age || !user.gender) return null;
  return {
    id: user.id,
    weightKg: user.weightKg,
    heightCm: user.heightCm,
    age: user.age,
    sex: user.gender,
    activityLevel: (user.activityLevel as UserProfile['activityLevel']) ?? 'moderate',
    goals: [],
  };
}

export function useNutrition() {
  const store = useNutritionStore();
  const { user } = useAuthStore();

  const profile = user ? toUserProfile(user) : null;

  // Auto-reset training type if it's from a previous day
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    if (store.todayLog && store.todayLog.date !== today) {
      store.resetDay();
    }
    // Auto-reset weekly load on a new Monday
    const d = new Date();
    const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).toISOString().split('T')[0];
    if (store.weeklyLoad.weekStart !== monday) {
      store.startNewWeek(monday);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute targets on mount (todayLog survives reload but targets don't)
  // Also recomputes whenever profile changes (e.g. after saving profile)
  useEffect(() => {
    if (!profile || !store.todayLog) return;
    const breakdown = computeMacros(profile, store.todayLog, store.weeklyLoad);
    store.setTargets(breakdown.targets);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.weightKg, user?.heightCm, user?.age, user?.gender, user?.activityLevel, store.todayLog?.trainingType, store.todayLog?.dailyActivityModifier]);

  const logDay = useCallback(
    (trainingType: TrainingType, plannedWorkoutTime?: string, dailyActivityModifier?: DailyLog['dailyActivityModifier']) => {
      const today = new Date().toISOString().split('T')[0];
      const log: DailyLog = {
        id: `${today}-${trainingType}`,
        date: today,
        trainingType,
        plannedWorkoutTime,
        dailyActivityModifier,
        intensity: trainingType === 'rest' ? 'low' : trainingType === 'cardio' ? 'high' : 'moderate',
      };
      const gate = checkLegFatigueGate(store.weeklyLoad, log);
      if (gate.blocked) return { blocked: true, message: gate.message, log: null };
      store.setTodayLog(log);
      if (profile) {
        const breakdown = computeMacros(profile, log, store.weeklyLoad);
        store.setTargets(breakdown.targets);
      }
      return { blocked: false, message: null, log };
    },
    [store, profile],
  );

  const refreshWeather = useCallback((): Promise<{ weather: WeatherConditions; alert: EnvironmentAlert } | null> => {
    if (!WEATHER_API_KEY) return Promise.resolve(null);
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          try {
            const weather = await fetchWeather(coords.latitude, coords.longitude, WEATHER_API_KEY);
            const alert = evaluateEnvironment(weather, store.todayLog?.trainingType ?? 'rest');
            store.setWeather(weather, alert);
            resolve({ weather, alert });
          } catch {
            resolve(null);
          }
        },
        () => resolve(null),
      );
    });
  }, [store]);

  const getMacroBreakdown = useCallback(() => {
    if (!profile || !store.todayLog) return null;
    return computeMacros(profile, store.todayLog, store.weeklyLoad);
  }, [profile, store.todayLog, store.weeklyLoad]);

  const setActivityModifier = useCallback((modifier: DailyLog['dailyActivityModifier']) => {
    store.setActivityModifier(modifier);
    if (profile && store.todayLog) {
      const updated = { ...store.todayLog, dailyActivityModifier: modifier };
      const breakdown = computeMacros(profile, updated, store.weeklyLoad);
      store.setTargets(breakdown.targets);
    }
  }, [store, profile]);

  return {
    profile,
    todayLog: store.todayLog,
    targets: store.targets,
    weeklyLoad: store.weeklyLoad,
    weather: store.weather,
    environmentAlert: store.environmentAlert,
    logDay,
    refreshWeather,
    getMacroBreakdown,
    setActivityModifier,
    logWorkoutComplete: store.logWorkoutComplete,
    resetDay: store.resetDay,
  };
}
