const AI_WORKER = import.meta.env.VITE_AI_WORKER_URL ?? 'http://localhost:8787/ai';
const STRAVA_WORKER = import.meta.env.VITE_STRAVA_WORKER_URL ?? 'http://localhost:8787/strava';

export async function workerPost<T>(worker: 'ai' | 'strava', path: string, body: unknown): Promise<T> {
  const base = worker === 'ai' ? AI_WORKER : STRAVA_WORKER;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export async function workerGet<T>(worker: 'ai' | 'strava', path: string): Promise<T> {
  const base = worker === 'ai' ? AI_WORKER : STRAVA_WORKER;
  const res = await fetch(`${base}${path}`);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}
