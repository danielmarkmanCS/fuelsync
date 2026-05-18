const KEY = 'fs_custom_targets_v1';

export interface CustomTargets {
  enabled: boolean;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const DEFAULT: CustomTargets = { enabled: false, calories: 2000, proteinG: 150, carbsG: 200, fatG: 65 };

export function getCustomTargets(): CustomTargets {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT; }
}

export function setCustomTargets(t: CustomTargets): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {}
}
