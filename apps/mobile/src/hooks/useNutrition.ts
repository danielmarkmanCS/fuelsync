import { useCallback } from 'react';
import * as Location from 'expo-location';
import { useNutritionStore } from '../store/nutritionStore';
import { fetchWeather, evaluateEnvironment } from '../services/weatherService';
import { computeMacros, checkLegFatigueGate } from '../services/nutritionEngine';
import type { DailyLog, FoodEntry, TrainingType } from '../../../../shared/types';

const WEATHER_API_KEY = process.env.EXPO_PUBLIC_OPENWEATHER_KEY ?? '';

// ─── NUTRITION HOOK ──────────────────────────────────────────────────────────

export function useNutrition() {
  const store = useNutritionStore();

  const logDay = useCallback(
    (trainingType: TrainingType, plannedWorkoutTime?: string) => {
      const today = new Date().toISOString().split('T')[0];
      const log: DailyLog = {
        id: `${today}-${trainingType}`,
        date: today,
        trainingType,
        plannedWorkoutTime,
        intensity: trainingType === 'rest' ? 'low' : trainingType === 'cardio' ? 'high' : 'moderate',
      };

      // Check leg fatigue before accepting a cardio day
      const gate = checkLegFatigueGate(store.weeklyLoad, log);
      if (gate.blocked) {
        return { blocked: true, message: gate.message, log: null };
      }

      store.setTodayLog(log);
      return { blocked: false, message: null, log };
    },
    [store],
  );

  const refreshWeather = useCallback(async () => {
    if (!WEATHER_API_KEY) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      const weather = await fetchWeather(loc.coords.latitude, loc.coords.longitude, WEATHER_API_KEY);
      const alert = evaluateEnvironment(weather, store.todayLog?.trainingType ?? 'rest');
      store.setWeather(weather, alert);
      return { weather, alert };
    } catch {
      return null;
    }
  }, [store]);

  const getMacroBreakdown = useCallback(() => {
    if (!store.profile || !store.todayLog) return null;
    return computeMacros(store.profile, store.todayLog, store.weeklyLoad);
  }, [store.profile, store.todayLog, store.weeklyLoad]);

  const addFood = useCallback(
    (entry: Omit<FoodEntry, 'id' | 'timestamp' | 'synced'>) => {
      const full: FoodEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        synced: false,
      };
      store.addFoodEntry(full);
      return full;
    },
    [store],
  );

  return {
    profile: store.profile,
    todayLog: store.todayLog,
    targets: store.targets,
    consumed: store.consumed,
    remaining: store.remaining,
    foodEntries: store.foodEntries,
    weeklyLoad: store.weeklyLoad,
    weather: store.weather,
    environmentAlert: store.environmentAlert,
    adherenceScore: store.adherenceScore,

    setProfile: store.setProfile,
    logDay,
    addFood,
    removeFood: store.removeFoodEntry,
    refreshWeather,
    getMacroBreakdown,
    logWorkoutComplete: store.logWorkoutComplete,
    resetDay: store.resetDay,
  };
}
