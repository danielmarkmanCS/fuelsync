const SYNC_URL = import.meta.env.VITE_SYNC_WORKER_URL ?? '';
const TOKEN_KEY = 'fs_sync_token';

export function getSyncToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSyncToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSyncToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getSyncToken();
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
}

export interface SyncUser {
  id: string;
  email: string;
  name: string;
  picture: string;
  display_name?: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  age?: number | null;
  gender?: string | null;
  activity_level?: string;
  daily_goal?: number;
}

export async function googleSignIn(idToken: string): Promise<{ token: string; user: SyncUser }> {
  const res = await fetch(`${SYNC_URL}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: idToken }),
  });
  if (!res.ok) throw new Error('Sign-in failed');
  return res.json();
}

export async function getMe(): Promise<SyncUser | null> {
  if (!getSyncToken()) return null;
  const res = await fetch(`${SYNC_URL}/auth/me`, { headers: authHeaders() });
  if (!res.ok) return null;
  return res.json();
}

export async function syncProfile(data: Partial<SyncUser>): Promise<void> {
  if (!getSyncToken()) return;
  await fetch(`${SYNC_URL}/profile`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
}

export async function syncAddLog(log: {
  id: string; food_name: string; calories: number; protein: number;
  carbs: number; fat: number; weight_grams?: number | null;
  meal_type?: string; image_url?: string | null;
  ingredients?: unknown[] | null; logged_at: string; date: string;
}): Promise<void> {
  if (!getSyncToken()) return;
  await fetch(`${SYNC_URL}/logs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(log),
  });
}

export async function syncDeleteLog(id: string): Promise<void> {
  if (!getSyncToken()) return;
  await fetch(`${SYNC_URL}/logs/${id}`, { method: 'DELETE', headers: authHeaders() });
}

export async function fetchLogsForDate(date: string): Promise<unknown[]> {
  if (!getSyncToken()) return [];
  const res = await fetch(`${SYNC_URL}/logs?date=${date}`, { headers: authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function fetchAllLogs(): Promise<unknown[]> {
  if (!getSyncToken()) return [];
  const res = await fetch(`${SYNC_URL}/logs?all=1`, { headers: authHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function deleteAccount(): Promise<void> {
  if (!getSyncToken()) return;
  await fetch(`${SYNC_URL}/account`, { method: 'DELETE', headers: authHeaders() });
  clearSyncToken();
}
