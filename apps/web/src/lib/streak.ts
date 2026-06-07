import { db } from './db';

const CACHE_KEY = 'fs_streak_cache_v1';

interface StreakCache {
  date: string;
  streak: number;
  longestStreak: number;
}

export async function calcStreak(): Promise<{ current: number; longest: number }> {
  const today = new Date().toISOString().split('T')[0];

  const cached: StreakCache | null = (() => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'); }
    catch { return null; }
  })();
  if (cached?.date === today) return { current: cached.streak, longest: cached.longestStreak };

  const all = await db.food_logs
    .filter(l => !l.removed)
    .toArray();

  const datesWithLogs = new Set(all.map(l => l.date));

  let current = 0;
  let longest = 0;
  let streak  = 0;
  const d = new Date(today);

  // Walk backwards from today counting consecutive days with logs
  for (let i = 0; i < 730; i++) {
    const key = d.toISOString().split('T')[0];
    if (datesWithLogs.has(key)) {
      streak++;
      if (i === 0 || i === 1) current = streak; // today or yesterday counts
    } else {
      if (i === 0) break; // today has no logs — streak is 0
      if (i === 1) { current = streak; break; } // gap at yesterday
      break;
    }
    if (streak > longest) longest = streak;
    d.setDate(d.getDate() - 1);
  }

  // Full scan for longest streak
  const sorted = Array.from(datesWithLogs).sort();
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) { run = 1; }
    else {
      const prev = new Date(sorted[i - 1] + 'T12:00:00');
      const cur  = new Date(sorted[i]     + 'T12:00:00');
      const diff = (cur.getTime() - prev.getTime()) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    }
    if (run > longest) longest = run;
  }

  const result = { current, longest };
  localStorage.setItem(CACHE_KEY, JSON.stringify({ date: today, streak: current, longestStreak: longest }));
  return result;
}

export function invalidateStreakCache() {
  localStorage.removeItem(CACHE_KEY);
}
