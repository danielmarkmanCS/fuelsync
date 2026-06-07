import { useCallback, useEffect, useRef, useState } from 'react';
import { useNutritionStore } from '../store/nutritionStore';
import { useAuthStore } from '../store/authStore';
import { fetchWeather, evaluateEnvironment } from '../services/weatherService';
import { computeMacros, checkLegFatigueGate } from '../services/nutritionEngine';
import { fetchTrainingState, saveTrainingState, getSyncToken } from '../api/syncClient';
import { drainSyncQueue, clearPullCache, onSyncQueueDrop } from '../api/localFood';
import type { DailyLog, TrainingType, UserProfile, WeatherConditions, EnvironmentAlert, WeeklyLoad, MacroTargets } from '@shared/types';
import type { BackendUser } from '../api/auth';

// ── Daily goal snapshot ────────────────────────────────────────────────────
// Saves per-date targets to localStorage so past days still show goals.
const GOAL_LOG_KEY = 'fs_daily_goals_v1';
type GoalLog = Record<string, MacroTargets>; // date → targets

function loadGoalLog(): GoalLog {
  try { return JSON.parse(localStorage.getItem(GOAL_LOG_KEY) ?? '{}'); }
  catch { return {}; }
}

export function saveDailyGoal(date: string, targets: MacroTargets): void {
  const log = loadGoalLog();
  log[date] = targets;
  // Keep only last 60 days to avoid unbounded growth
  const keys = Object.keys(log).sort();
  if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(k => delete log[k]);
  try { localStorage.setItem(GOAL_LOG_KEY, JSON.stringify(log)); } catch {}
}

export function getDailyGoal(date: string): MacroTargets | null {
  return loadGoalLog()[date] ?? null;
}

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

  // trainingLoaded gates the save effect so it never fires before the remote load finishes
  const [trainingLoaded, setTrainingLoaded] = useState(false);
  const isFirstSaveRender = useRef(true);

  // On mount: drain queue, load training state from D1, then apply date resets
  useEffect(() => {
    drainSyncQueue().catch(() => {});
    clearPullCache();

    const today = new Date().toISOString().split('T')[0];
    const getMonday = () => {
      const d = new Date();
      const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
      return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).toISOString().split('T')[0];
    };

    const applyDateResets = () => {
      // Reset today's log if it's from a previous day
      if (store.todayLog && store.todayLog.date !== today) store.resetDay();
      // Reset weekly load on a new Monday
      const monday = getMonday();
      if (store.weeklyLoad.weekStart !== monday) store.startNewWeek(monday);
    };

    if (!getSyncToken()) {
      applyDateResets();
      setTrainingLoaded(true);
      return;
    }

    fetchTrainingState().then((remote) => {
      if (!remote) {
        // D1 has no row yet — push local state if it has meaningful data
        const hasLocal = store.weeklyLoad.totalRunKm > 0 ||
          store.weeklyLoad.totalStrengthSets > 0 ||
          store.todayLog !== null;
        if (hasLocal) saveTrainingState({ todayLog: store.todayLog, weeklyLoad: store.weeklyLoad }).catch(() => {});
        return;
      }
      const monday = getMonday();
      // Restore today's log from D1 if it matches today
      if (remote.todayLog && (remote.todayLog as DailyLog).date === today) {
        store.setTodayLog(remote.todayLog as DailyLog);
      }
      // Restore weekly load from D1 if it matches the current week
      if (remote.weeklyLoad && (remote.weeklyLoad as WeeklyLoad).weekStart === monday) {
        store.setWeeklyLoad(remote.weeklyLoad as WeeklyLoad);
      }
    }).catch(() => {}).finally(() => {
      applyDateResets();
      setTrainingLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced push to D1 on every training state change — skipped until load completes
  useEffect(() => {
    if (!trainingLoaded) return;
    if (isFirstSaveRender.current) { isFirstSaveRender.current = false; return; }
    if (!getSyncToken()) return;
    const timer = setTimeout(() => {
      saveTrainingState({ todayLog: store.todayLog, weeklyLoad: store.weeklyLoad }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.todayLog, store.weeklyLoad, trainingLoaded]);

  // Midnight reset — re-schedules itself after each firing so it stays accurate
  // across DST shifts, long app sessions, and system sleep/wake cycles.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const now = new Date();
      const msUntilMidnight =
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      t = setTimeout(() => {
        const d = new Date();
        const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff).toISOString().split('T')[0];
        store.resetDay();
        if (useNutritionStore.getState().weeklyLoad.weekStart !== monday) store.startNewWeek(monday);
        scheduleNext();
      }, msUntilMidnight);
    };
    scheduleNext();
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute targets on mount (todayLog survives reload but targets don't)
  // Also recomputes whenever profile changes (e.g. after saving profile)
  useEffect(() => {
    if (!profile || !store.todayLog) return;
    const breakdown = computeMacros(profile, store.todayLog, store.weeklyLoad);
    store.setTargets(breakdown.targets);
    // Snapshot today's goal so past-day views can still show it
    saveDailyGoal(store.todayLog.date, breakdown.targets);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.weightKg, user?.heightCm, user?.age, user?.gender, user?.activityLevel, store.todayLog?.trainingType, store.todayLog?.dailyActivityModifier]);

  const logDay = useCallback(
    (trainingType: TrainingType, plannedWorkoutTime?: string, dailyActivityModifier?: DailyLog['dailyActivityModifier'], force?: boolean) => {
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
      if (gate.blocked && !force) return { blocked: true, message: gate.message, log: null };
      store.setTodayLog(log);
      if (profile) {
        const breakdown = computeMacros(profile, log, store.weeklyLoad);
        store.setTargets(breakdown.targets);
        saveDailyGoal(today, breakdown.targets);
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

  const [syncDropped, setSyncDropped] = useState(0);
  useEffect(() => onSyncQueueDrop(count => setSyncDropped(n => n + count)), []);

  return {
    profile,
    todayLog: store.todayLog,
    targets: store.targets,
    weeklyLoad: store.weeklyLoad,
    weather: store.weather,
    environmentAlert: store.environmentAlert,
    trainingLoaded,
    logDay,
    refreshWeather,
    getMacroBreakdown,
    setActivityModifier,
    logWorkoutComplete: store.logWorkoutComplete,
    resetDay: store.resetDay,
    syncDropped,
    clearSyncDropped: () => setSyncDropped(0),
  };
}
