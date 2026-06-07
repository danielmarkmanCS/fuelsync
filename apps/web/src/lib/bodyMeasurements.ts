import { db } from './db';
import type { BodyMeasurement } from './db';

export type { BodyMeasurement };

export async function getLatestMeasurement(): Promise<BodyMeasurement | null> {
  const all = await db.body_measurements.orderBy('date').reverse().limit(1).toArray();
  return all[0] ?? null;
}

export async function getMeasurements(limit = 30): Promise<BodyMeasurement[]> {
  return db.body_measurements.orderBy('date').reverse().limit(limit).toArray();
}

export async function getMeasurementForDate(date: string): Promise<BodyMeasurement | null> {
  const result = await db.body_measurements.where('date').equals(date).first();
  return result ?? null;
}

export async function saveMeasurement(date: string, fields: Omit<BodyMeasurement, 'id' | 'date' | 'logged_at'>): Promise<void> {
  const existing = await getMeasurementForDate(date);
  const entry: BodyMeasurement = {
    ...fields,
    date,
    logged_at: new Date().toISOString(),
  };
  if (existing?.id) {
    await db.body_measurements.update(existing.id, entry);
  } else {
    await db.body_measurements.add(entry);
  }
}

export async function deleteMeasurement(id: number): Promise<void> {
  await db.body_measurements.delete(id);
}
