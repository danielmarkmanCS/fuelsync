// Glow personalization profile — shared between GlowScreen and RoutineChecklist.
// Kept here to avoid a circular dependency.

export type GlowGoal    = 'glow_skin' | 'clear_acne' | 'hair_growth' | 'jawline' | 'lose_fat' | 'build_muscle';
export type RoutineTime = '5min' | '15min' | '30min';
export type GlowConcern = 'dull_skin' | 'hair_loss' | 'posture' | 'low_energy' | 'poor_sleep' | 'acne';

export interface GlowProfile {
  goal:        GlowGoal;
  routineTime: RoutineTime;
  concerns:    GlowConcern[];
  setupDate:   string;
}

export const GLOW_PROFILE_KEY = 'fs_glow_profile_v1';

export function getGlowProfile(): GlowProfile | null {
  try { return JSON.parse(localStorage.getItem(GLOW_PROFILE_KEY) ?? 'null') as GlowProfile | null; }
  catch { return null; }
}

export function saveGlowProfile(p: GlowProfile): void {
  localStorage.setItem(GLOW_PROFILE_KEY, JSON.stringify(p));
}
