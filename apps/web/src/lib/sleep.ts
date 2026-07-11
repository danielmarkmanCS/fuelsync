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
  return ['', '#F87171', '#FBBF24', '#60AFFF', '#4ADE80', '#A78BFA'][q] ?? 'var(--muted)';
}
