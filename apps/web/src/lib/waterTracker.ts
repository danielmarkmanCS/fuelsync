const PREFIX    = 'fs_water_';
const GOAL_KEY  = 'fs_water_goal_ml';
const DEFAULT_G = 2500;

export function getWaterGoal(): number {
  return parseInt(localStorage.getItem(GOAL_KEY) ?? String(DEFAULT_G), 10) || DEFAULT_G;
}
export function setWaterGoal(ml: number): void {
  localStorage.setItem(GOAL_KEY, String(Math.max(500, ml)));
}

export function getWater(date: string): number {
  return parseInt(localStorage.getItem(`${PREFIX}${date}`) ?? '0', 10) || 0;
}
export function addWater(date: string, ml: number): number {
  const next = Math.max(0, getWater(date) + ml);
  localStorage.setItem(`${PREFIX}${date}`, String(next));
  return next;
}
export function setWater(date: string, ml: number): void {
  localStorage.setItem(`${PREFIX}${date}`, String(Math.max(0, ml)));
}
