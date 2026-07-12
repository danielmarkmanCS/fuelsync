import { db } from './db';
import type { SleepLog } from './db';

export type { SleepLog };

export async function getSleep(date: string): Promise<SleepLog | null> {
  return (await db.sleep_logs.where('date').equals(date).first()) ?? null;
}

export async function logSleep(
  date: string,
  hours: number,
  quality: 1 | 2 | 3 | 4 | 5,
  bedtime?: string,
  wakeup?: string,
): Promise<void> {
  const existing = await getSleep(date);
  const entry = { date, hours, quality, bedtime: bedtime ?? null, wakeup: wakeup ?? null, logged_at: new Date().toISOString() };
  if (existing?.id) await db.sleep_logs.update(existing.id, entry);
  else await db.sleep_logs.add(entry);
}

export async function getSleepHistory(days = 14): Promise<SleepLog[]> {
  return db.sleep_logs.orderBy('date').reverse().limit(days).toArray();
}

export function sleepQualityLabel(q: number): string {
  return ['', 'Terrible', 'Poor', 'Okay', 'Good', 'Amazing'][q] ?? '';
}

export function sleepQualityColor(q: number): string {
  return ['', '#E53935', '#FB8C00', '#1E88E5', '#43A047', '#7E57C2'][q] ?? 'var(--muted)';
}

export function estimateSleepQuality(hours: number, todayTraining?: string, yesterdayTraining?: string): 1 | 2 | 3 | 4 | 5 {
  let score = 3;
  if (hours >= 8) score++;
  else if (hours < 6) score--;
  if (hours < 5) score--;
  const intense = ['hiit', 'cardio', 'cycling'];
  const heavy   = ['strength', 'hybrid'];
  if (todayTraining && intense.includes(todayTraining)) score--;
  if (yesterdayTraining && heavy.includes(yesterdayTraining)) score--;
  if (todayTraining === 'rest') score++;
  return Math.max(1, Math.min(5, score)) as 1 | 2 | 3 | 4 | 5;
}

export function parseTimeToMinutes(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function calcSleepHours(bedtime: string, wakeup: string): number | null {
  const b = parseTimeToMinutes(bedtime);
  const w = parseTimeToMinutes(wakeup);
  if (b === null || w === null) return null;
  let diff = w - b;
  if (diff <= 0) diff += 24 * 60; // crosses midnight
  return Math.round((diff / 60) * 10) / 10;
}
