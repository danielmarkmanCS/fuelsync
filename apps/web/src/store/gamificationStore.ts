import { create } from 'zustand';
import { getXP, getLevelInfo, TIER_CONFIG } from '../lib/xp';
import type { LevelInfo } from '../lib/xp';
import type { Achievement } from '../lib/achievements';

// ─── Gold ────────────────────────────────────────────────────────────────────

const GOLD_KEY = 'fs_gold_v1';

function readGold(): number {
  try { return Math.max(0, parseInt(localStorage.getItem(GOLD_KEY) ?? '0', 10) || 0); }
  catch { return 0; }
}

function writeGold(g: number): void {
  try { localStorage.setItem(GOLD_KEY, String(Math.max(0, g))); } catch {}
}

// ─── Streak (sync-friendly cache, separate from streak.ts's async version) ───

const STREAK_KEY = 'fs_gstore_streak_v1';

interface StreakState { days: number; lastActiveDate: string }

function readStreak(): StreakState {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null') ?? { days: 0, lastActiveDate: '' };
  } catch { return { days: 0, lastActiveDate: '' }; }
}

function writeStreak(s: StreakState): void {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch {}
}

function advanceStreak(current: StreakState): StreakState {
  const today     = new Date().toISOString().split('T')[0];
  if (current.lastActiveDate === today) return current;  // already touched today
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const days = current.lastActiveDate === yesterday ? current.days + 1 : 1;
  return { days, lastActiveDate: today };
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface GamificationStore {
  xp:               number;
  levelInfo:        LevelInfo;
  tierColor:        string;
  tierGlow:         string;
  tierTrack:        string;
  tierGradient:     [string, string];
  gold:             number;
  streakDays:       number;
  lastActiveDate:   string;
  achievementQueue: Achievement[];

  // Internal (used by module-level listeners only)
  _setXP:           (total: number) => void;
  _addGold:         (amount: number) => void;
  _advanceStreak:   () => void;

  // Public API
  addGold:          (amount: number) => void;
  spendGold:        (amount: number) => boolean;
  queueAchievement: (a: Achievement) => void;
  dismissAchievement: () => void;
}

function tierOf(info: LevelInfo) {
  const cfg = TIER_CONFIG[info.tier];
  return {
    tierColor:    cfg.color,
    tierGlow:     cfg.glow,
    tierTrack:    cfg.track,
    tierGradient: cfg.gradient as [string, string],
  };
}

const initialXP    = getXP();
const initialInfo  = getLevelInfo(initialXP);
const initialStreak = readStreak();

export const useGamificationStore = create<GamificationStore>((set, get) => ({
  xp:             initialXP,
  levelInfo:      initialInfo,
  gold:           readGold(),
  streakDays:     initialStreak.days,
  lastActiveDate: initialStreak.lastActiveDate,
  achievementQueue: [],
  ...tierOf(initialInfo),

  _setXP: (total) => {
    const info = getLevelInfo(total);
    set({ xp: total, levelInfo: info, ...tierOf(info) });
  },

  _addGold: (amount) => {
    if (amount <= 0) return;
    const next = get().gold + amount;
    writeGold(next);
    set({ gold: next });
    try { window.dispatchEvent(new CustomEvent('gold-earned', { detail: { amount, total: next } })); } catch {}
  },

  _advanceStreak: () => {
    const { streakDays, lastActiveDate } = get();
    const next = advanceStreak({ days: streakDays, lastActiveDate });
    if (next.lastActiveDate === lastActiveDate) return;  // no change
    writeStreak(next);
    set({ streakDays: next.days, lastActiveDate: next.lastActiveDate });
    try { window.dispatchEvent(new CustomEvent('streak-update', { detail: { days: next.days } })); } catch {}
  },

  addGold: (amount) => get()._addGold(amount),

  spendGold: (amount) => {
    const { gold } = get();
    if (gold < amount) return false;
    const next = gold - amount;
    writeGold(next);
    set({ gold: next });
    return true;
  },

  queueAchievement: (a) =>
    set(s => ({ achievementQueue: [...s.achievementQueue, a] })),

  dismissAchievement: () =>
    set(s => ({ achievementQueue: s.achievementQueue.slice(1) })),
}));

// ─── Module-level event subscriptions (singleton, runs once on import) ───────
//
// xp-earned  → sync reactive XP/level, advance streak, passively award gold
// level-up   → bonus gold burst (level × 5)

if (typeof window !== 'undefined') {
  window.addEventListener('xp-earned', (e: Event) => {
    const { total, amount } = (e as CustomEvent<{ total: number; amount: number }>).detail;
    const store = useGamificationStore.getState();
    store._setXP(total);
    store._advanceStreak();
    // 1 gold per 10 XP earned, minimum 1 when anything was awarded
    if (amount > 0) store._addGold(Math.max(1, Math.floor(amount / 10)));
  });

  window.addEventListener('level-up', (e: Event) => {
    const { level } = (e as CustomEvent<{ level: number }>).detail;
    useGamificationStore.getState()._addGold(level * 5);
  });
}
