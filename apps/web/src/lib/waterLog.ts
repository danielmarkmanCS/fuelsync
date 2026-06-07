import { db } from './db';

const GOAL_KEY = 'fs_water_goal_ml';
const DEFAULT_GOAL = 2500;

export function getWaterGoal(): number {
  try { return parseInt(localStorage.getItem(GOAL_KEY) ?? String(DEFAULT_GOAL), 10) || DEFAULT_GOAL; }
  catch { return DEFAULT_GOAL; }
}

export function setWaterGoal(ml: number) {
  localStorage.setItem(GOAL_KEY, String(ml));
}

export async function getWaterTotal(date: string): Promise<number> {
  const logs = await db.water_logs.where('date').equals(date).toArray();
  return logs.reduce((s, l) => s + l.ml, 0);
}

export async function addWater(date: string, ml: number): Promise<void> {
  await db.water_logs.add({ date, ml, logged_at: new Date().toISOString() });
}

export async function removeLastWater(date: string): Promise<void> {
  const logs = await db.water_logs.where('date').equals(date).toArray();
  if (logs.length === 0) return;
  const last = logs.sort((a, b) => b.logged_at.localeCompare(a.logged_at))[0];
  await db.water_logs.delete(last.id!);
}

export async function clearWater(date: string): Promise<void> {
  await db.water_logs.where('date').equals(date).delete();
}
