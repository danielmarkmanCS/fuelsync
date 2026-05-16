import { db, type LocalProfile } from '../lib/db';

export type { LocalProfile };

// BackendUser shape kept for compatibility with authStore / screens
export interface BackendUser {
  id: string;
  displayName: string;
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  gender: 'male' | 'female' | null;
  activityLevel: string;
  dailyGoal: number;
}

function toBackendUser(p: LocalProfile): BackendUser {
  return {
    id: String(p.id ?? 0),
    displayName: p.displayName,
    weightKg: p.weightKg,
    heightCm: p.heightCm,
    age: p.age,
    gender: p.gender,
    activityLevel: p.activityLevel,
    dailyGoal: p.dailyGoal,
  };
}

export async function getProfile(): Promise<BackendUser | null> {
  const rows = await db.profile.toArray();
  return rows[0] ? toBackendUser(rows[0]) : null;
}

export async function createProfile(data: Omit<LocalProfile, 'id'>): Promise<BackendUser> {
  await db.profile.clear();
  const id = await db.profile.add(data);
  const profile = await db.profile.get(id);
  return toBackendUser(profile!);
}

export async function updateProfile(data: Partial<Omit<LocalProfile, 'id'>>): Promise<BackendUser> {
  const rows = await db.profile.toArray();
  if (!rows[0]?.id) throw new Error('No profile found');
  await db.profile.update(rows[0].id, data);
  const updated = await db.profile.get(rows[0].id);
  return toBackendUser(updated!);
}

export async function clearProfile(): Promise<void> {
  await db.profile.clear();
}
