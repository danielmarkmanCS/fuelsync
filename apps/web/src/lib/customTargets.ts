const KEY         = 'fs_custom_targets_v1';
const PRESETS_KEY = 'fs_macro_presets_v1';

export interface CustomTargets {
  enabled: boolean;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MacroPreset {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  createdAt: string;
}

const DEFAULT: CustomTargets = { enabled: false, calories: 2000, proteinG: 150, carbsG: 200, fatG: 65 };

export function getCustomTargets(): CustomTargets {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULT; }
}

export function setCustomTargets(t: CustomTargets): void {
  try { localStorage.setItem(KEY, JSON.stringify(t)); } catch {}
}

export function getPresets(): MacroPreset[] {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]'); } catch { return []; }
}

export function savePreset(name: string, targets: Omit<CustomTargets, 'enabled'>): MacroPreset {
  const preset: MacroPreset = { id: crypto.randomUUID(), name, ...targets, createdAt: new Date().toISOString() };
  const all = getPresets();
  all.unshift(preset);
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(all.slice(0, 10))); } catch {}
  return preset;
}

export function deletePreset(id: string): void {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(getPresets().filter(p => p.id !== id))); } catch {}
}
