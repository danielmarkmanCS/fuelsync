import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  UserProfile,
  DailyLog,
  MacroTargets,
  FoodEntry,
  WeeklyLoad,
  WeatherConditions,
  EnvironmentAlert,
} from '../../../../shared/types';
import {
  computeMacros,
  calcRemaining,
  updateWeeklyLoad,
  macroAdherenceScore,
} from '../services/nutritionEngine';

// ─── STATE ────────────────────────────────────────────────────────────────────

interface NutritionState {
  profile: UserProfile | null;
  todayLog: DailyLog | null;
  targets: MacroTargets | null;
  consumed: MacroTargets;
  remaining: MacroTargets | null;
  foodEntries: FoodEntry[];
  weeklyLoad: WeeklyLoad;
  weather: WeatherConditions | null;
  environmentAlert: EnvironmentAlert | null;
  adherenceScore: number;

  // Actions
  setProfile: (profile: UserProfile) => void;
  setTodayLog: (log: DailyLog) => void;
  addFoodEntry: (entry: FoodEntry) => void;
  removeFoodEntry: (id: string) => void;
  setWeather: (weather: WeatherConditions, alert: EnvironmentAlert) => void;
  logWorkoutComplete: (km?: number, sets?: number) => void;
  resetDay: () => void;
}

// ─── EMPTY MACROS HELPER ─────────────────────────────────────────────────────

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

const defaultWeeklyLoad = (): WeeklyLoad => ({
  weekStart: new Date().toISOString().split('T')[0],
  totalRunKm: 0,
  totalStrengthSets: 0,
  legFatigueScore: 0,
  recoveryScore: 80,
});

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useNutritionStore = create<NutritionState>()(
  persist(
    (set, get) => ({
      profile: null,
      todayLog: null,
      targets: null,
      consumed: emptyMacros(),
      remaining: null,
      foodEntries: [],
      weeklyLoad: defaultWeeklyLoad(),
      weather: null,
      environmentAlert: null,
      adherenceScore: 0,

      setProfile: (profile) => {
        set({ profile });
        const { todayLog, weeklyLoad } = get();
        if (todayLog) {
          const breakdown = computeMacros(profile, todayLog, weeklyLoad);
          const consumed = get().consumed;
          set({
            targets: breakdown.targets,
            remaining: calcRemaining(breakdown.targets, consumed),
          });
        }
      },

      setTodayLog: (log) => {
        const { profile, weeklyLoad, consumed } = get();
        set({ todayLog: log });
        if (!profile) return;
        const breakdown = computeMacros(profile, log, weeklyLoad);
        set({
          targets: breakdown.targets,
          remaining: calcRemaining(breakdown.targets, consumed),
        });
      },

      addFoodEntry: (entry) => {
        const { foodEntries, targets, consumed } = get();
        const next: FoodEntry[] = [...foodEntries, entry];
        const nextConsumed: MacroTargets = {
          calories: consumed.calories + entry.calories,
          proteinG: consumed.proteinG + entry.proteinG,
          carbsG: consumed.carbsG + entry.carbsG,
          fatG: consumed.fatG + entry.fatG,
        };
        const nextRemaining = targets ? calcRemaining(targets, nextConsumed) : null;
        const score = targets ? macroAdherenceScore(targets, nextConsumed) : 0;
        set({
          foodEntries: next,
          consumed: nextConsumed,
          remaining: nextRemaining,
          adherenceScore: score,
        });
      },

      removeFoodEntry: (id) => {
        const { foodEntries, targets } = get();
        const removed = foodEntries.find((e) => e.id === id);
        if (!removed) return;
        const next = foodEntries.filter((e) => e.id !== id);
        const nextConsumed = next.reduce<MacroTargets>(
          (acc, e) => ({
            calories: acc.calories + e.calories,
            proteinG: acc.proteinG + e.proteinG,
            carbsG: acc.carbsG + e.carbsG,
            fatG: acc.fatG + e.fatG,
          }),
          emptyMacros(),
        );
        set({
          foodEntries: next,
          consumed: nextConsumed,
          remaining: targets ? calcRemaining(targets, nextConsumed) : null,
          adherenceScore: targets ? macroAdherenceScore(targets, nextConsumed) : 0,
        });
      },

      setWeather: (weather, alert) => set({ weather, environmentAlert: alert }),

      logWorkoutComplete: (km = 0, sets = 0) => {
        const { todayLog, weeklyLoad } = get();
        if (!todayLog) return;
        set({ weeklyLoad: updateWeeklyLoad(weeklyLoad, todayLog, { addKm: km, addSets: sets }) });
      },

      resetDay: () =>
        set({
          todayLog: null,
          targets: null,
          consumed: emptyMacros(),
          remaining: null,
          foodEntries: [],
          adherenceScore: 0,
        }),
    }),
    {
      name: 'fuelsync-nutrition',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        profile: state.profile,
        weeklyLoad: state.weeklyLoad,
        foodEntries: state.foodEntries,
        consumed: state.consumed,
        todayLog: state.todayLog,
      }),
    },
  ),
);
