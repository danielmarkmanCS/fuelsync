import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DailyLog, MacroTargets, WeeklyLoad, WeatherConditions, EnvironmentAlert } from '@shared/types';
import { updateWeeklyLoad } from '@mobile/services/nutritionEngine';

interface NutritionState {
  todayLog: DailyLog | null;
  targets: MacroTargets | null;
  weeklyLoad: WeeklyLoad;
  weather: WeatherConditions | null;
  environmentAlert: EnvironmentAlert | null;

  setTargets: (targets: MacroTargets) => void;
  setTodayLog: (log: DailyLog) => void;
  setWeather: (weather: WeatherConditions, alert: EnvironmentAlert) => void;
  logWorkoutComplete: (km?: number, sets?: number) => void;
  addRunKm: (km: number) => void;
  resetDay: () => void;
}

const defaultWeeklyLoad = (): WeeklyLoad => ({
  weekStart: new Date().toISOString().split('T')[0],
  totalRunKm: 0,
  totalStrengthSets: 0,
  legFatigueScore: 0,
  recoveryScore: 80,
});

export const useNutritionStore = create<NutritionState>()(
  persist(
    (set, get) => ({
      todayLog: null,
      targets: null,
      weeklyLoad: defaultWeeklyLoad(),
      weather: null,
      environmentAlert: null,

      setTargets: (targets) => set({ targets }),

      setTodayLog: (log) => set({ todayLog: log }),

      setWeather: (weather, alert) => set({ weather, environmentAlert: alert }),

      addRunKm: (km) => {
        const { weeklyLoad } = get();
        set({ weeklyLoad: { ...weeklyLoad, totalRunKm: parseFloat((weeklyLoad.totalRunKm + km).toFixed(2)) } });
      },

      logWorkoutComplete: (km = 0, sets = 0) => {
        const { todayLog, weeklyLoad } = get();
        if (!todayLog) return;
        set({ weeklyLoad: updateWeeklyLoad(weeklyLoad, todayLog, { addKm: km, addSets: sets }) });
      },

      resetDay: () => set({ todayLog: null, targets: null }),
    }),
    {
      name: 'fuelsync-nutrition-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        weeklyLoad: s.weeklyLoad,
        todayLog: s.todayLog,
      }),
    },
  ),
);
