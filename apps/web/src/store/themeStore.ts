import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentKey = 'blue' | 'green' | 'purple' | 'orange' | 'red';
export type Units = 'metric' | 'imperial';
export type GoalMode = 'lose' | 'maintain' | 'gain';

export const ACCENT_COLORS: Record<AccentKey, { dark: string; light: string; label: string; muted: string }> = {
  blue:   { dark: '#60AFFF', light: '#2563EB', label: 'Ocean',   muted: 'rgba(96,175,255,0.13)'  },
  green:  { dark: '#4ADE80', light: '#16A34A', label: 'Forest',  muted: 'rgba(74,222,128,0.13)'  },
  purple: { dark: '#9D7EFF', light: '#7C3AED', label: 'Galaxy',  muted: 'rgba(157,126,255,0.15)' },
  orange: { dark: '#FB923C', light: '#EA580C', label: 'Ember',   muted: 'rgba(251,146,60,0.13)'  },
  red:    { dark: '#F87171', light: '#DC2626', label: 'Crimson', muted: 'rgba(248,113,113,0.13)' },
};

interface ThemeStore {
  isDark:       boolean;
  accentKey:    AccentKey;
  units:        Units;
  goalMode:     GoalMode;
  toggleTheme:  () => void;
  setDark:      (v: boolean) => void;
  setAccent:    (k: AccentKey) => void;
  setUnits:     (u: Units) => void;
  setGoalMode:  (m: GoalMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      isDark:      true,
      accentKey:   'purple',
      units:       'metric',
      // Migrate from old fs_goal_mode_v1 key on first load
      goalMode:    (() => {
        try { return (localStorage.getItem('fs_goal_mode_v1') as GoalMode) ?? 'maintain'; } catch { return 'maintain'; }
      })(),
      toggleTheme: () => set((s) => ({ isDark: !s.isDark })),
      setDark:     (v)  => set({ isDark: v }),
      setAccent:   (k)  => set({ accentKey: k }),
      setUnits:    (u)  => set({ units: u }),
      setGoalMode: (m)  => set({ goalMode: m }),
    }),
    { name: 'fs_theme' }
  )
);
