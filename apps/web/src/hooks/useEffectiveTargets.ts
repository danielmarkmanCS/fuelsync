/**
 * useEffectiveTargets
 *
 * Single source of truth for the daily calorie / macro targets shown across all screens.
 * Applies, in order:
 *   1. Custom targets (user manually set in profile) — if enabled, those win outright
 *   2. Goal-mode adjustment: Cut = protect protein, reduce carbs/fat; Bulk = add to carbs/fat
 *
 * Both HomeScreen and FoodScreen must use this hook so they always show the same numbers.
 * goalMode is read from Zustand (reactive) — changes in Profile propagate immediately.
 */

import { useNutritionStore } from '../store/nutritionStore';
import { useThemeStore } from '../store/themeStore';
import { getCustomTargets } from '../lib/customTargets';
import type { MacroTargets } from '@shared/types';

const DEFICIT = 500; // kcal removed on Cut
const SURPLUS = 300; // kcal added on Bulk

export function useEffectiveTargets(): MacroTargets | null {
  const rawTargets    = useNutritionStore((s) => s.targets);
  const goalMode      = useThemeStore((s) => s.goalMode);
  const customTargets = getCustomTargets();

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

  if (goalMode === 'maintain') return rawTargets;

  if (goalMode === 'lose') {
    // Floor at 1200 kcal; deficit may be smaller if close to floor
    const adjCal       = Math.max(1200, rawTargets.calories - DEFICIT);
    const actualDeficit = rawTargets.calories - adjCal;
    // Protect protein — cuts come from carbs (65%) and fat (35%)
    const carbCut = Math.round((actualDeficit * 0.65) / 4);
    const fatCut  = Math.round((actualDeficit * 0.35) / 9);
    return {
      ...rawTargets,
      calories: adjCal,
      proteinG: rawTargets.proteinG,
      carbsG:   Math.max(20, rawTargets.carbsG - carbCut),
      fatG:     Math.max(20, rawTargets.fatG   - fatCut),
    };
  }

  // gain — surplus goes to carbs (70%) and fat (30%), protein unchanged
  const carbAdd = Math.round((SURPLUS * 0.70) / 4);
  const fatAdd  = Math.round((SURPLUS * 0.30) / 9);
  return {
    ...rawTargets,
    calories: rawTargets.calories + SURPLUS,
    proteinG: rawTargets.proteinG,
    carbsG:   rawTargets.carbsG + carbAdd,
    fatG:     rawTargets.fatG   + fatAdd,
  };
}
