import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DailyLog, MacroTargets, WeeklyLoad, WeatherConditions, EnvironmentAlert, LoggedStrengthSession } from '@shared/types';
import { updateWeeklyLoad } from '../services/nutritionEngine';

interface NutritionState {
  todayLog: DailyLog | null;
  targets: MacroTargets | null;
  weeklyLoad: WeeklyLoad;
  weather: WeatherConditions | null;
  environmentAlert: EnvironmentAlert | null;

  setTargets: (targets: MacroTargets) => void;
  setTodayLog: (log: DailyLog) => void;
  setActivityModifier: (modifier: DailyLog['dailyActivityModifier']) => void;
  setWeather: (weather: WeatherConditions, alert: EnvironmentAlert) => void;
  logWorkoutComplete: (km?: number, sets?: number, label?: string) => void;
  addRunKm: (km: number, name?: string, source?: 'strava' | 'manual', durationMin?: number, paceMinPerKm?: number) => void;
  removeRunKm: (km: number, name?: string) => void;
  renameRun: (idx: number, newName: string) => void;
  resetWeeklyRuns: () => void;
  addStrengthSession: (label?: string) => void;
  removeStrengthSession: (id?: string) => void;
  startNewWeek: (monday: string) => void;
  setWeeklyLoad: (weeklyLoad: WeeklyLoad) => void;
  resetDay: () => void;
  resetAll: () => void;
}

const defaultWeeklyLoad = (): WeeklyLoad => ({
  weekStart: new Date().toISOString().split('T')[0],
  totalRunKm: 0,
  totalStrengthSets: 0,
  legFatigueScore: 0,
  recoveryScore: 80,
  loggedRuns: [],
  strengthSessions: [],
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

      setActivityModifier: (modifier) => set((s) => ({
        todayLog: s.todayLog ? { ...s.todayLog, dailyActivityModifier: modifier } : s.todayLog,
      })),

      setWeather: (weather, alert) => set({ weather, environmentAlert: alert }),

      addRunKm: (km, name = 'Run', source = 'manual', durationMin, paceMinPerKm) => {
        const { weeklyLoad } = get();
        const run = { km, name, source, ...(durationMin != null ? { durationMin } : {}), ...(paceMinPerKm != null ? { paceMinPerKm } : {}) };
        const legDelta = Math.min(20, km * 1.5);
        set({ weeklyLoad: {
          ...weeklyLoad,
          totalRunKm: parseFloat((weeklyLoad.totalRunKm + km).toFixed(2)),
          loggedRuns: [...(weeklyLoad.loggedRuns ?? []), run],
          legFatigueScore: Math.min(100, weeklyLoad.legFatigueScore + legDelta),
          recoveryScore: Math.max(0, weeklyLoad.recoveryScore - 15),
        }});
      },

      removeRunKm: (km, name) => {
        const { weeklyLoad } = get();
        const runs = weeklyLoad.loggedRuns ?? [];
        const idx  = runs.findIndex((r) => r.km === km && (!name || r.name === name));
        const loggedRuns = idx >= 0 ? [...runs.slice(0, idx), ...runs.slice(idx + 1)] : runs;
        const legDelta = Math.min(20, km * 1.5);
        set({ weeklyLoad: {
          ...weeklyLoad,
          totalRunKm: parseFloat((Math.max(0, weeklyLoad.totalRunKm - km)).toFixed(2)),
          loggedRuns,
          legFatigueScore: Math.max(0, weeklyLoad.legFatigueScore - legDelta),
          recoveryScore: Math.min(100, weeklyLoad.recoveryScore + 15),
        }});
      },

      logWorkoutComplete: (km = 0, sets = 0, label = 'Strength') => {
        const { todayLog, weeklyLoad } = get();
        if (!todayLog) return;
        const updated = updateWeeklyLoad(weeklyLoad, todayLog, { addKm: km, addSets: sets });
        if (km > 0) {
          updated.loggedRuns = [...(updated.loggedRuns ?? []), { km, name: 'Manual Run', source: 'manual' }];
        }
        if (sets > 0) {
          const today = new Date().toISOString().split('T')[0];
          const session: LoggedStrengthSession = { id: crypto.randomUUID(), date: today, label, sets };
          updated.strengthSessions = [...(updated.strengthSessions ?? []), session];
        }
        set({ weeklyLoad: updated });
      },

      renameRun: (idx, newName) => {
        const { weeklyLoad } = get();
        const runs = [...(weeklyLoad.loggedRuns ?? [])];
        if (idx >= 0 && idx < runs.length) runs[idx] = { ...runs[idx], name: newName };
        set({ weeklyLoad: { ...weeklyLoad, loggedRuns: runs } });
      },

      resetWeeklyRuns: () => {
        const { weeklyLoad } = get();
        set({ weeklyLoad: { ...weeklyLoad, totalRunKm: 0, loggedRuns: [] } });
      },

      addStrengthSession: (label = 'Strength') => {
        const { weeklyLoad } = get();
        const today = new Date().toISOString().split('T')[0];
        const session: LoggedStrengthSession = { id: crypto.randomUUID(), date: today, label, sets: 1 };
        set({ weeklyLoad: {
          ...weeklyLoad,
          totalStrengthSets: weeklyLoad.totalStrengthSets + 1,
          strengthSessions: [...(weeklyLoad.strengthSessions ?? []), session],
          recoveryScore: Math.max(0, (weeklyLoad.recoveryScore ?? 80) - 10),
        }});
      },

      removeStrengthSession: (id) => {
        const { weeklyLoad } = get();
        if (id) {
          // remove by id
          const sessions = (weeklyLoad.strengthSessions ?? []).filter(s => s.id !== id);
          set({ weeklyLoad: {
            ...weeklyLoad,
            totalStrengthSets: Math.max(0, weeklyLoad.totalStrengthSets - 1),
            strengthSessions: sessions,
            recoveryScore: Math.min(100, (weeklyLoad.recoveryScore ?? 80) + 10),
          }});
        } else {
          // legacy: just decrement count
          set({ weeklyLoad: { ...weeklyLoad, totalStrengthSets: Math.max(0, weeklyLoad.totalStrengthSets - 1) } });
        }
      },

      startNewWeek: (monday) => set({ weeklyLoad: {
        weekStart: monday,
        totalRunKm: 0,
        totalStrengthSets: 0,
        legFatigueScore: 0,
        recoveryScore: 80,
        loggedRuns: [],
        strengthSessions: [],
      }}),

      setWeeklyLoad: (weeklyLoad) => set({ weeklyLoad }),

      resetDay: () => set({ todayLog: null, targets: null }),

      resetAll: () => set({ todayLog: null, targets: null, weeklyLoad: defaultWeeklyLoad(), weather: null, environmentAlert: null }),
    }),
    {
      name: 'fuelsync-nutrition-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        weeklyLoad: s.weeklyLoad,
        todayLog: s.todayLog,
        weather: s.weather,
        environmentAlert: s.environmentAlert,
      }),
    },
  ),
);
