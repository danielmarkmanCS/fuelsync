const XP_KEY = 'fs_xp_v1';

export const LEVELS = [
  { level: 1,  name: 'Rookie',    emoji: '🌱', xp: 0      },
  { level: 2,  name: 'Athlete',   emoji: '⚡', xp: 100    },
  { level: 3,  name: 'Grinder',   emoji: '🔥', xp: 300    },
  { level: 4,  name: 'Warrior',   emoji: '⚔️', xp: 700    },
  { level: 5,  name: 'Champion',  emoji: '🏆', xp: 1500   },
  { level: 6,  name: 'Elite',     emoji: '💎', xp: 3000   },
  { level: 7,  name: 'Legend',    emoji: '👑', xp: 6000   },
  { level: 8,  name: 'Ascended',  emoji: '🌟', xp: 12000  },
  { level: 9,  name: 'Godmode',   emoji: '🚀', xp: 25000  },
  { level: 10, name: 'Immortal',  emoji: '♾️', xp: 50000  },
] as const;

export const XP_REWARDS = {
  LOG_MEAL:              5,
  HIT_PROTEIN:          25,
  HIT_CALORIES:         20,
  HIT_WATER:            15,
  LOG_MEASUREMENT:      10,
  LOG_SLEEP:             8,
  LOG_WEIGHT:            5,
  STREAK_BONUS:         10,
  SUPPLEMENT_TAKEN:      3,
  GLOW_CATEGORY_DONE:   20,
  GLOW_FULL_ROUTINE:    50,
} as const;

export const LEVEL_PERKS: Record<number, string> = {
  1:  'Daily missions + streak tracking',
  2:  'AI food suggestions unlocked',
  3:  'Advanced sleep quality analysis',
  4:  'Weekly challenge missions',
  5:  'Custom glow routine items',
  6:  'Elite nutrition insights',
  7:  'Body composition tracking history',
  8:  'Personalized recovery advisor',
  9:  'Full analytics dashboard',
  10: 'Immortal — all features unlocked',
};

export function getXP(): number {
  try { return parseInt(localStorage.getItem(XP_KEY) ?? '0', 10) || 0; }
  catch { return 0; }
}

export function getStreakMultiplier(streak: number): number {
  if (streak >= 30) return 2.0;
  if (streak >= 14) return 1.75;
  if (streak >= 7)  return 1.5;
  if (streak >= 3)  return 1.25;
  return 1.0;
}

export function addXP(amount: number): number {
  const prev  = getLevelInfo(getXP());
  const total = getXP() + amount;
  localStorage.setItem(XP_KEY, String(total));
  const cur = getLevelInfo(total);
  try {
    window.dispatchEvent(new CustomEvent('xp-earned', { detail: { amount, total } }));
    if (cur.level > prev.level) {
      window.dispatchEvent(new CustomEvent('level-up', { detail: cur }));
    }
  } catch {}
  return total;
}

export function getTodayXP(): number {
  const d = getDailyXP();
  return d.granted.reduce((sum, key) => sum + (XP_REWARDS[key as keyof typeof XP_REWARDS] ?? 0), 0);
}

export interface LevelInfo {
  level: number;
  name: string;
  emoji: string;
  xpToNext: number;
  xpInLevel: number;
  xpSpanLevel: number;
  progressPct: number;
  isMaxLevel: boolean;
}

export function getLevelInfo(xp: number): LevelInfo {
  let cur: typeof LEVELS[number] = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.xp) cur = l; else break;
  }
  const next = LEVELS.find(l => l.level === cur.level + 1);
  const xpInLevel  = xp - cur.xp;
  const xpSpanLevel = next ? next.xp - cur.xp : 1;
  return {
    level:       cur.level,
    name:        cur.name,
    emoji:       cur.emoji,
    xpToNext:    next ? next.xp - xp : 0,
    xpInLevel,
    xpSpanLevel,
    progressPct: next ? Math.min((xpInLevel / xpSpanLevel) * 100, 100) : 100,
    isMaxLevel:  !next,
  };
}

// Track which XP rewards were already given today to avoid double-granting
const DAILY_XP_KEY = 'fs_daily_xp_v1';

interface DailyXP {
  date: string;
  granted: string[];
}

function getDailyXP(): DailyXP {
  const today = new Date().toISOString().split('T')[0];
  try {
    const d: DailyXP = JSON.parse(localStorage.getItem(DAILY_XP_KEY) ?? 'null');
    if (d?.date === today) return d;
  } catch {}
  return { date: today, granted: [] };
}

export function grantXP(customKey: string, amount: number): number | null {
  const today = new Date().toISOString().split('T')[0];
  const d = getDailyXP();
  if (d.granted.includes(customKey)) return null;
  d.granted.push(customKey);
  d.date = today;
  localStorage.setItem(DAILY_XP_KEY, JSON.stringify(d));
  return addXP(amount);
}

export function grantDailyXP(key: keyof typeof XP_REWARDS, multiplier = 1): number | null {
  const today = new Date().toISOString().split('T')[0];
  const d = getDailyXP();
  if (d.granted.includes(key)) return null;
  d.granted.push(key);
  d.date = today;
  localStorage.setItem(DAILY_XP_KEY, JSON.stringify(d));
  return addXP(Math.round(XP_REWARDS[key] * multiplier));
}
