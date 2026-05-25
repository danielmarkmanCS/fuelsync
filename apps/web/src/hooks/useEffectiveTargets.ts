/**
 * useEffectiveTargets
 *
 * Single source of truth for the daily calorie / macro targets shown across all screens.
 * Applies, in order:
 *   1. Custom targets (user manually set in profile) — if enabled, those win outright
 *   2. Goal-mode adjustment (lose: -500 kcal, maintain: 0, gain: +300 kcal) scaled to macros
 *
 * Both HomeScreen and FoodScreen must use this hook so they always show the same numbers.
 */

import { useNutritionStore } from '../store/nutritionStore';
import { getCustomTargets } from '../lib/customTargets';
import type { MacroTargets } from '@shared/types';

const GOAL_ADJ: Record<'lose' | 'maintain' | 'gain', number> = {
  lose:     -500,
  maintain:    0,
  gain:      300,
};

function getGoalMode(): 'lose' | 'maintain' | 'gain' {
  try {
    return (localStorage.getItem('fs_goal_mode_v1') ?? 'maintain') as 'lose' | 'maintain' | 'gain';
  } catch {
    return 'maintain';
  }
}

export function useEffectiveTargets(): MacroTargets | null {
  const rawTargets = useNutritionStore((s) => s.targets);
  const customTargets = getCustomTargets();
  const goalMode = getGoalMode();

  if (!rawTargets) return null;

  // Custom targets override everything
  if (customTargets.enabled) {
    return {
      ...rawTargets,
      calories: customTargets.calories,
      proteinG: customTargets.proteinG,
      carbsG:   customTargets.carbsG,
      fatG:     customTargets.fatG,
    };
  }

  // Goal-mode adjustment: shift calories, scale macros proportionally
  const adjCal = Math.max(1200, rawTargets.calories + GOAL_ADJ[goalMode]);
  const scale  = rawTargets.calories > 0 ? adjCal / rawTargets.calories : 1;
  return {
    ...rawTargets,
    calories: adjCal,
    proteinG: Math.round(rawTargets.proteinG * scale),
    carbsG:   Math.round(rawTargets.carbsG   * scale),
    fatG:     Math.round(rawTargets.fatG     * scale),
  };
}
