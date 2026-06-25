import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentKey = 'blue' | 'green' | 'purple' | 'orange' | 'red';
export type Units = 'metric' | 'imperial';
export type GoalMode = 'lose' | 'maintain' | 'gain';

export const ACCENT_COLORS: Record<AccentKey, { dark: string; light: string; label: string; muted: string }> = {
  blue:   { dark: '#2F81F7', light: '#0066EE', label: 'Ocean',   muted: 'rgba(47,129,247,0.12)'  },
  green:  { dark: '#22C55E', light: '#16A34A', label: 'Forest',  muted: 'rgba(34,197,94,0.12)'   },
  purple: { dark: '#A78BFA', light: '#7C3AED', label: 'Galaxy',  muted: 'rgba(167,139,250,0.12)' },
  orange: { dark: '#F97316', light: '#EA580C', label: 'Ember',   muted: 'rgba(249,115,22,0.12)'  },
  red:    { dark: '#EF4444', light: '#DC2626', label: 'Crimson', muted: 'rgba(239,68,68,0.12)'   },
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
      accentKey:   'blue',
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
