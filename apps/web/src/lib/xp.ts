// ─── Storage keys ────────────────────────────────────────────────────────────
const XP_KEY       = 'fs_xp_v1';
const XP_SIGN_KEY  = 'fs_xp_sign_v1';
const XP_SALT_KEY  = 'fs_xp_salt_v1';
const DAILY_XP_KEY = 'fs_daily_xp_v2';   // v2 — adds .earned for cap tracking
const MULT_KEY     = 'fs_streak_mult_v1';
const MIGRATED_KEY = 'fs_xp_migrated_v2';

// ─── Daily caps ───────────────────────────────────────────────────────────────
export const DAILY_SOFT_CAP = 300;  // fires 'xp-soft-cap' event once
export const DAILY_HARD_CAP = 500;  // silently ignores further grants

// ─── Tier system ─────────────────────────────────────────────────────────────
export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Mythic';

export const TIER_CONFIG: Record<Tier, {
  color:    string;
  glow:     string;
  track:    string;
  gradient: [string, string];
}> = {
  Bronze:   { color: '#CD8B4A', glow: 'rgba(205,139,74,0.50)',   track: 'rgba(205,139,74,0.12)',   gradient: ['#E2A96B', '#A0522D'] },
  Silver:   { color: '#94A3B8', glow: 'rgba(148,163,184,0.45)',  track: 'rgba(148,163,184,0.12)',  gradient: ['#CBD5E1', '#64748B'] },
  Gold:     { color: '#EAB308', glow: 'rgba(234,179,8,0.55)',    track: 'rgba(234,179,8,0.12)',    gradient: ['#FDE68A', '#CA8A04'] },
  Platinum: { color: '#A78BFA', glow: 'rgba(167,139,250,0.55)',  track: 'rgba(167,139,250,0.12)', gradient: ['#C4B5FD', '#7C3AED'] },
  Diamond:  { color: '#38BDF8', glow: 'rgba(56,189,248,0.55)',   track: 'rgba(56,189,248,0.12)',  gradient: ['#7DD3FC', '#0EA5E9'] },
  Mythic:   { color: '#F43F5E', glow: 'rgba(244,63,94,0.60)',    track: 'rgba(244,63,94,0.12)',   gradient: ['#FDA4AF', '#BE123C'] },
};

// ─── Level definitions ────────────────────────────────────────────────────────
//
// XP formula: gap(N) = round(100 × N^1.5) — XP required to go from level N to N+1.
//
// Precomputed cumulative thresholds:
//   L1:0  L2:100  L3:383  L4:903  L5:1703  L6:2821  L7:4291  L8:6143  L9:8406  L10:11106
//
export const LEVELS = [
  { level: 1,  name: 'Rookie',   emoji: '🌱', xp: 0,     tier: 'Bronze'   as Tier },
  { level: 2,  name: 'Athlete',  emoji: '⚡', xp: 100,   tier: 'Bronze'   as Tier },
  { level: 3,  name: 'Grinder',  emoji: '🔥', xp: 383,   tier: 'Silver'   as Tier },
  { level: 4,  name: 'Warrior',  emoji: '⚔️', xp: 903,   tier: 'Silver'   as Tier },
  { level: 5,  name: 'Champion', emoji: '🏆', xp: 1703,  tier: 'Gold'     as Tier },
  { level: 6,  name: 'Elite',    emoji: '💎', xp: 2821,  tier: 'Gold'     as Tier },
  { level: 7,  name: 'Legend',   emoji: '👑', xp: 4291,  tier: 'Platinum' as Tier },
  { level: 8,  name: 'Ascended', emoji: '🌟', xp: 6143,  tier: 'Platinum' as Tier },
  { level: 9,  name: 'Godmode',  emoji: '🚀', xp: 8406,  tier: 'Diamond'  as Tier },
  { level: 10, name: 'Immortal', emoji: '♾️', xp: 11106, tier: 'Mythic'   as Tier },
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

// ─── Streak multiplier ────────────────────────────────────────────────────────
//
// Formula: 1 + min(streak, 10) × 0.05   →   1.00× at 0d, 1.50× at 10d (cap)
//
export function getStreakMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(streak, 0), 10) * 0.05;
}

/** Cache streak multiplier so addXP can apply it synchronously on any screen. */
export function setStoredStreakMult(streak: number): void {
  try { localStorage.setItem(MULT_KEY, String(getStreakMultiplier(streak))); } catch {}
}

export function getStoredStreakMult(): number {
  try { return parseFloat(localStorage.getItem(MULT_KEY) ?? '1') || 1; }
  catch { return 1; }
}

// ─── Lightweight XP integrity ─────────────────────────────────────────────────
//
// Not cryptographic — just raises the bar above a casual DevTools edit.
// A device-specific salt means the signature can't be guessed externally.
//
function getSalt(): string {
  try {
    let s = localStorage.getItem(XP_SALT_KEY);
    if (!s) {
      s = Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem(XP_SALT_KEY, s);
    }
    return s;
  } catch { return 'fs'; }
}

function signXP(xp: number): string {
  try { return btoa(`${xp}|${getSalt()}|fs`).slice(0, 22); } catch { return ''; }
}

// ─── Raw XP I/O ──────────────────────────────────────────────────────────────

export function getXP(): number {
  try {
    const raw = parseInt(localStorage.getItem(XP_KEY) ?? '0', 10) || 0;
    const sig = localStorage.getItem(XP_SIGN_KEY) ?? '';
    if (sig && sig !== signXP(raw)) {
      // Signature mismatch — signal potential tampering but don't reset.
      try { window.dispatchEvent(new CustomEvent('xp-integrity-fail', { detail: { xp: raw } })); } catch {}
    }
    return raw;
  } catch { return 0; }
}

function writeXP(total: number): void {
  try {
    localStorage.setItem(XP_KEY, String(total));
    localStorage.setItem(XP_SIGN_KEY, signXP(total));
  } catch {}
}

// ─── Daily XP tracking ───────────────────────────────────────────────────────

interface DailyXP {
  date:    string;
  granted: string[];  // dedup action keys — one grant per key per day
  earned:  number;    // actual XP earned today (post-multiplier); used for cap
}

function getDailyXP(): DailyXP {
  const today = new Date().toISOString().split('T')[0];
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_XP_KEY) ?? 'null') as DailyXP | null;
    if (d?.date === today) return d;
  } catch {}
  return { date: today, granted: [], earned: 0 };
}

function saveDailyXP(d: DailyXP): void {
  try { localStorage.setItem(DAILY_XP_KEY, JSON.stringify(d)); } catch {}
}

/** Returns total XP earned today (post-multiplier). */
export function getTodayXP(): number {
  return getDailyXP().earned;
}

// ─── Core XP adder ───────────────────────────────────────────────────────────

/**
 * Apply the streak multiplier to `baseAmount`, enforce daily caps, persist,
 * dispatch events, and handle multi-level-up sequences.
 *
 * Returns the actual XP added (may be less than expected if near the daily cap,
 * or 0 if already at the hard cap).
 */
export function addXP(baseAmount: number): number {
  if (baseAmount <= 0) return 0;

  const mult    = getStoredStreakMult();
  const amount  = Math.round(baseAmount * mult);
  const daily   = getDailyXP();

  // Hard cap: ignore completely
  if (daily.earned >= DAILY_HARD_CAP) return 0;

  // Clamp to remaining headroom
  const clamped = Math.min(amount, DAILY_HARD_CAP - daily.earned);

  // Fire soft-cap event once per day when the threshold is first crossed
  const softKey = `fs_sc_${daily.date}`;
  if (daily.earned < DAILY_SOFT_CAP && daily.earned + clamped >= DAILY_SOFT_CAP) {
    if (!localStorage.getItem(softKey)) {
      localStorage.setItem(softKey, '1');
      try {
        window.dispatchEvent(new CustomEvent('xp-soft-cap', {
          detail: { earned: daily.earned + clamped },
        }));
      } catch {}
    }
  }

  // Single read → compute → single write (avoids stale reads on rapid calls)
  const prev     = getXP();
  const prevInfo = getLevelInfo(prev);
  const total    = prev + clamped;
  writeXP(total);

  daily.earned += clamped;
  saveDailyXP(daily);

  try {
    window.dispatchEvent(new CustomEvent('xp-earned', {
      detail: { amount: clamped, base: baseAmount, mult, total },
    }));
  } catch {}

  // Dispatch one level-up event per crossed level, staggered so modals can queue.
  const newInfo = getLevelInfo(total);
  if (newInfo.level > prevInfo.level) {
    for (let lv = prevInfo.level + 1; lv <= newInfo.level; lv++) {
      const lvInfo = getLevelInfo(LEVELS[lv - 1].xp);
      const delay  = (lv - prevInfo.level - 1) * 400;
      setTimeout(() => {
        try { window.dispatchEvent(new CustomEvent('level-up', { detail: lvInfo })); } catch {}
      }, delay);
    }
  }

  return clamped;
}

// ─── Level info ───────────────────────────────────────────────────────────────

export interface LevelInfo {
  level:        number;
  name:         string;
  emoji:        string;
  tier:         Tier;
  xpToNext:     number;
  xpInLevel:    number;
  xpSpanLevel:  number;
  progressPct:  number;
  isMaxLevel:   boolean;
}

export function getLevelInfo(xp: number): LevelInfo {
  let cur: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.xp) cur = l;
    else break;
  }
  const next        = LEVELS.find(l => l.level === cur.level + 1);
  const xpInLevel   = xp - cur.xp;
  const xpSpanLevel = next ? next.xp - cur.xp : 1;
  return {
    level:       cur.level,
    name:        cur.name,
    emoji:       cur.emoji,
    tier:        cur.tier,
    xpToNext:    next ? next.xp - xp : 0,
    xpInLevel,
    xpSpanLevel,
    progressPct: next ? Math.min((xpInLevel / xpSpanLevel) * 100, 100) : 100,
    isMaxLevel:  !next,
  };
}

// ─── Dedup-protected grant functions ─────────────────────────────────────────

/**
 * Grant XP for a standard action. Deduped once per calendar day.
 * The streak multiplier is applied automatically inside addXP.
 * Returns XP actually added, or null if already granted today.
 */
export function grantDailyXP(key: keyof typeof XP_REWARDS): number | null {
  const daily = getDailyXP();
  if (daily.granted.includes(key)) return null;
  daily.granted.push(key);
  saveDailyXP(daily);
  return addXP(XP_REWARDS[key]);
}

/**
 * Grant XP for a custom action key not in XP_REWARDS.
 * Deduped once per calendar day per key.
 */
export function grantXP(customKey: string, baseAmount: number): number | null {
  const daily = getDailyXP();
  if (daily.granted.includes(customKey)) return null;
  daily.granted.push(customKey);
  saveDailyXP(daily);
  return addXP(baseAmount);
}

// ─── One-time XP schema migration ────────────────────────────────────────────
//
// Old system had much higher thresholds (max 50 000 XP). The new formula peaks
// at 11 106 XP for level 10. This migration ensures users never appear to lose
// a level: their XP is bumped up to at least the new threshold for their
// equivalent old level.
//
export function migrateXPIfNeeded(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    localStorage.setItem(MIGRATED_KEY, '1');

    const raw = parseInt(localStorage.getItem(XP_KEY) ?? '0', 10) || 0;
    if (raw === 0) return;

    const OLD = [0, 100, 300, 700, 1500, 3000, 6000, 12000, 25000, 50000];
    let oldLevel = 1;
    for (let i = 0; i < OLD.length; i++) {
      if (raw >= OLD[i]) oldLevel = i + 1; else break;
    }

    // Give user at minimum the XP for the start of their equivalent level in the new system
    const newFloor   = LEVELS[Math.min(oldLevel - 1, LEVELS.length - 1)].xp;
    const migratedXP = Math.max(raw, newFloor);
    writeXP(migratedXP);
  } catch {}
}
