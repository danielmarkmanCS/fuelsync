const KEY = 'fs_workout_prs_v1';

export interface PR {
  weight: number;
  reps: number;
  volume: number;   // weight × reps — used for comparison
  date: string;
}

type PRStore = Record<string, PR>;

function load(): PRStore {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

function save(store: PRStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
}

export function getPR(exercise: string): PR | null {
  return load()[exercise.toLowerCase().trim()] ?? null;
}

export function getAllPRs(): PRStore {
  return load();
}

// Returns true if this set is a new PR
export function checkAndSetPR(exercise: string, weight: number, reps: number, date: string): boolean {
  const key     = exercise.toLowerCase().trim();
  const store   = load();
  const current = store[key];
  const volume  = weight * reps;
  if (!current || volume > current.volume) {
    store[key] = { weight, reps, volume, date };
    save(store);
    return true;
  }
  return false;
}

// Returns list of past exercise names (for autocomplete)
export function getExerciseHistory(): string[] {
  return Object.keys(load()).map(k =>
    k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  );
}
