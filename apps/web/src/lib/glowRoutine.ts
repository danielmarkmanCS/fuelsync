import { db } from './db';
import type { GlowRoutineItem, GlowRoutineLog, GlowMetricEntry, RoutineCategory } from './db';
import { addXP, XP_REWARDS } from './xp';

// ─── Default routine definitions ─────────────────────────────────────────────

let _seedPromise: Promise<void> | null = null;

const DEFAULT_ITEMS: Omit<GlowRoutineItem, 'id'>[] = [
  // ── SKIN ──────────────────────────────────────────────────────────────────
  { name: 'Morning cleanse',           category: 'SKIN',   icon: '💦', order: 0, active: true  },
  { name: 'Cold face rinse (30s)',     category: 'SKIN',   icon: '🧊', order: 1, active: true  },
  { name: 'Vitamin C serum (AM)',      category: 'SKIN',   icon: '🍋', order: 2, active: true  },
  { name: 'SPF 30+ applied',          category: 'SKIN',   icon: '☀️', order: 3, active: true  },
  { name: 'Gua sha (3 min face)',      category: 'SKIN',   icon: '🪬', order: 4, active: true  },
  { name: 'Night moisturizer',        category: 'SKIN',   icon: '🌙', order: 5, active: true  },
  { name: 'Retinol/Niacinamide (PM)', category: 'SKIN',   icon: '✨', order: 6, active: true  },
  { name: 'Hair mask (2×/week)',       category: 'SKIN',   icon: '💆', order: 7, active: false },
  // ── GROOM ─────────────────────────────────────────────────────────────────
  { name: 'Brush teeth (AM)',         category: 'GROOM',  icon: '🦷', order: 0, active: true  },
  { name: 'Brush teeth (PM)',         category: 'GROOM',  icon: '🦷', order: 1, active: true  },
  { name: 'Floss',                    category: 'GROOM',  icon: '🧵', order: 2, active: true  },
  { name: 'Beard / stubble clean',    category: 'GROOM',  icon: '✂️', order: 3, active: true  },
  { name: 'Nails clean',              category: 'GROOM',  icon: '🫧', order: 4, active: true  },
  { name: 'Eyebrow grooming',         category: 'GROOM',  icon: '👁️', order: 5, active: false },
  // ── HABITS ────────────────────────────────────────────────────────────────
  { name: 'Hot shower + cold finish', category: 'HABITS', icon: '🚿', order: 0, active: true  },
  { name: '8h sleep target',          category: 'HABITS', icon: '😴', order: 1, active: true  },
  { name: 'Hit water target',         category: 'HABITS', icon: '💧', order: 2, active: true  },
  { name: 'No processed food',        category: 'HABITS', icon: '🥗', order: 3, active: true  },
  { name: 'Screens off by 10pm',      category: 'HABITS', icon: '📵', order: 4, active: true  },
  { name: 'Walk 8k+ steps',          category: 'HABITS', icon: '🚶', order: 5, active: true  },
  // ── MEWING / POSTURE ──────────────────────────────────────────────────────
  { name: 'Mewing practice (15m)',    category: 'MEWING', icon: '🫦', order: 0, active: true  },
  { name: 'Chin tucks ×20',          category: 'MEWING', icon: '💪', order: 1, active: true  },
  { name: 'Dead hang (60s)',          category: 'MEWING', icon: '🏋️', order: 2, active: true  },
  { name: 'Upright posture check',   category: 'MEWING', icon: '🧍', order: 3, active: true  },
  { name: 'No forward head (desk)',   category: 'MEWING', icon: '🖥️', order: 4, active: true  },
];

function seedRoutineItems(): Promise<void> {
  if (!_seedPromise) {
    _seedPromise = (async () => {
      const count = await db.glow_routine_items.count();
      if (count === 0) await db.glow_routine_items.bulkAdd(DEFAULT_ITEMS);
    })();
  }
  return _seedPromise;
}

// ─── Routine items ────────────────────────────────────────────────────────────

export async function getRoutineItems(): Promise<GlowRoutineItem[]> {
  await seedRoutineItems();
  const all = await db.glow_routine_items.orderBy('order').toArray();
  return all.filter(i => i.active);
}

export async function getRoutineItemsByCategory(cat: RoutineCategory): Promise<GlowRoutineItem[]> {
  await seedRoutineItems();
  return db.glow_routine_items
    .where('category').equals(cat)
    .and(i => i.active)
    .sortBy('order');
}

// ─── Routine logs ─────────────────────────────────────────────────────────────

export async function getRoutineLogs(date: string): Promise<GlowRoutineLog[]> {
  return db.glow_routine_logs.where('date').equals(date).toArray();
}

// Returns { xpGranted, categoryComplete, fullRoutineComplete }
export async function toggleRoutineLog(
  itemId: number,
  date: string,
  currentDone: boolean,
): Promise<{ xpGranted: number; categoryComplete: boolean; fullRoutineComplete: boolean }> {
  const existing = await db.glow_routine_logs
    .where('item_id').equals(itemId)
    .and(l => l.date === date)
    .first();
  const now = new Date().toISOString();
  if (existing?.id !== undefined) {
    await db.glow_routine_logs.update(existing.id, { done: !currentDone, logged_at: now });
  } else {
    await db.glow_routine_logs.add({ item_id: itemId, date, done: true, logged_at: now });
  }

  const nowDone = !currentDone;
  if (!nowDone) return { xpGranted: 0, categoryComplete: false, fullRoutineComplete: false };

  // Check if this toggle completed a category
  const item = await db.glow_routine_items.get(itemId);
  if (!item) return { xpGranted: 0, categoryComplete: false, fullRoutineComplete: false };

  const catItems  = await getRoutineItemsByCategory(item.category);
  const logs      = await getRoutineLogs(date);
  const doneSet   = new Set(logs.filter(l => l.done).map(l => l.item_id));
  doneSet.add(itemId); // include the one we just toggled

  const catComplete = catItems.length > 0 && catItems.every(ci => ci.id !== undefined && doneSet.has(ci.id!));
  const allItems    = await getRoutineItems();
  const fullComplete = allItems.length > 0 && allItems.every(i => i.id !== undefined && doneSet.has(i.id!));

  let xpGranted = 0;

  // Category bonus (once per category per day)
  const catBonusKey = `fs_glow_cat_xp_${date}_${item.category}`;
  if (catComplete && !localStorage.getItem(catBonusKey)) {
    localStorage.setItem(catBonusKey, '1');
    xpGranted += XP_REWARDS.GLOW_CATEGORY_DONE;
    addXP(XP_REWARDS.GLOW_CATEGORY_DONE);
  }

  // Full routine bonus (once per day)
  const fullBonusKey = `fs_glow_full_xp_${date}`;
  if (fullComplete && !localStorage.getItem(fullBonusKey)) {
    localStorage.setItem(fullBonusKey, '1');
    xpGranted += XP_REWARDS.GLOW_FULL_ROUTINE;
    addXP(XP_REWARDS.GLOW_FULL_ROUTINE);
  }

  return { xpGranted, categoryComplete: catComplete, fullRoutineComplete: fullComplete };
}

// ─── Streak calculation ───────────────────────────────────────────────────────

export async function getAllStreaks(itemIds: number[]): Promise<Record<number, number>> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 1; i <= 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const allLogs = await db.glow_routine_logs
    .where('date').anyOf(dates)
    .and(l => l.done)
    .toArray();

  const doneSet = new Set(allLogs.map(l => `${l.item_id}:${l.date}`));
  const streaks: Record<number, number> = {};
  for (const itemId of itemIds) {
    let streak = 0;
    for (const date of dates) {
      if (doneSet.has(`${itemId}:${date}`)) streak++;
      else break;
    }
    streaks[itemId] = streak;
  }
  return streaks;
}

// ─── Completion % ─────────────────────────────────────────────────────────────

export async function getRoutineCompletionPct(date: string): Promise<number> {
  const items = await getRoutineItems();
  if (items.length === 0) return 0;
  const logs    = await getRoutineLogs(date);
  const doneIds = new Set(logs.filter(l => l.done).map(l => l.item_id));
  const done    = items.filter(i => i.id !== undefined && doneIds.has(i.id!)).length;
  return Math.round((done / items.length) * 100);
}

// ─── Metric entries ───────────────────────────────────────────────────────────

export async function logMetricEntry(entry: Omit<GlowMetricEntry, 'id'>): Promise<void> {
  const existing = await db.glow_metric_entries.where('date').equals(entry.date).first();
  if (existing?.id !== undefined) {
    await db.glow_metric_entries.update(existing.id, entry);
  } else {
    await db.glow_metric_entries.add(entry);
  }
}

export async function getMetricEntries(limit = 20): Promise<GlowMetricEntry[]> {
  return db.glow_metric_entries.orderBy('date').reverse().limit(limit).toArray();
}
