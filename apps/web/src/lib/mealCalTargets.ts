const KEY = 'fs_meal_cal_targets_v1';

export interface MealCalTargets {
  breakfast: number;
  pre_workout: number;
  lunch: number;
  post_workout: number;
  dinner: number;
  snack: number;
}

const DEFAULT: MealCalTargets = {
  breakfast: 500, pre_workout: 250, lunch: 650,
  post_workout: 300, dinner: 600, snack: 200,
};

export function getMealCalTargets(): MealCalTargets {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT; }
}

export function setMealCalTargets(t: MealCalTargets): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {}
}
