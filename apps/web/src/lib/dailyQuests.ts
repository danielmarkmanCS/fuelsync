// ─── Daily Quest System ───────────────────────────────────────────────────────
//
// 3 quests are seeded deterministically from the current date so the same
// three show all day and rotate to a fresh set at midnight.

export interface DailyQuest {
  id:          string;
  label:       string;
  description: string;
  emoji:       string;
  xpReward:    number;
  goldReward:  number;
  color:       string;
  category:    'nutrition' | 'hydration' | 'body' | 'glow' | 'ascend';
}

const QUEST_POOL: DailyQuest[] = [
  {
    id: 'log_meals',       label: 'Meal Tracker',      emoji: '🍽️',
    description: 'Log breakfast, lunch & dinner today',
    xpReward: 30, goldReward: 3, color: '#43A047', category: 'nutrition',
  },
  {
    id: 'hit_water',       label: 'Hydration Hero',    emoji: '💧',
    description: 'Hit your daily water goal',
    xpReward: 25, goldReward: 2, color: '#1E88E5', category: 'hydration',
  },
  {
    id: 'morning_routine', label: 'Morning Warrior',   emoji: '🌅',
    description: 'Complete every item in your Morning routine tab',
    xpReward: 25, goldReward: 3, color: '#FB8C00', category: 'glow',
  },
  {
    id: 'log_weight',      label: 'Weight Logger',     emoji: '⚖️',
    description: 'Log your weight today',
    xpReward: 15, goldReward: 1, color: '#7E57C2', category: 'body',
  },
  {
    id: 'all_supplements', label: 'Supplement Stack',  emoji: '💊',
    description: 'Mark all your supplements as taken',
    xpReward: 20, goldReward: 2, color: '#E53935', category: 'body',
  },
  {
    id: 'full_routine',    label: 'Full Routine',      emoji: '✨',
    description: 'Complete your entire Glow routine (all 3 tabs)',
    xpReward: 40, goldReward: 5, color: '#38BDF8', category: 'glow',
  },
  {
    id: 'hit_protein',     label: 'Protein Target',    emoji: '💪',
    description: 'Hit your daily protein goal',
    xpReward: 30, goldReward: 3, color: '#1E88E5', category: 'nutrition',
  },
  {
    id: 'evening_routine', label: 'Evening Wind-Down', emoji: '🌙',
    description: 'Complete your Evening routine tab',
    xpReward: 25, goldReward: 3, color: '#7E57C2', category: 'glow',
  },
  {
    id: 'log_sleep',       label: 'Sleep Tracker',     emoji: '😴',
    description: 'Log your sleep quality today',
    xpReward: 15, goldReward: 1, color: '#4ADE80', category: 'body',
  },
  {
    id: 'hit_calories',    label: 'Calorie Control',   emoji: '🎯',
    description: 'Stay within ±100 kcal of your daily calorie goal',
    xpReward: 25, goldReward: 2, color: '#FBBF24', category: 'nutrition',
  },
  {
    id: 'cold_shower',     label: 'Cold Warrior',      emoji: '🧊',
    description: 'Mark the "Hot shower + cold finish" habit as done',
    xpReward: 20, goldReward: 2, color: '#38BDF8', category: 'ascend',
  },
  {
    id: 'no_processed',    label: 'Clean Eating',      emoji: '🥗',
    description: 'Check off "No processed food" in your routine',
    xpReward: 25, goldReward: 3, color: '#4ADE80', category: 'nutrition',
  },
  {
    id: 'posture_day',     label: 'Posture Pro',       emoji: '🧍',
    description: 'Complete all Day-tab posture items',
    xpReward: 20, goldReward: 2, color: '#A78BFA', category: 'ascend',
  },
  {
    id: 'hit_steps',       label: 'Step Champion',     emoji: '🚶',
    description: 'Check off "Walk 8k+ steps" today',
    xpReward: 25, goldReward: 3, color: '#FBBF24', category: 'ascend',
  },
];

// ─── Deterministic seeded selection ──────────────────────────────────────────

function selectForDate(dateStr: string): DailyQuest[] {
  const dayNum = Math.floor(new Date(dateStr + 'T12:00:00').getTime() / 86400000);
  const indices: number[] = [];
  let seed = (dayNum * 9301 + 49297) & 0x7fffffff;
  while (indices.length < 3) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const idx = Math.abs(seed) % QUEST_POOL.length;
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices.map(i => QUEST_POOL[i]);
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const KEY = 'fs_daily_quests_v1';

interface QuestStore { date: string; completed: string[] }

function load(): QuestStore {
  const today = new Date().toISOString().split('T')[0];
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as QuestStore | null;
    if (d?.date === today) return d;
  } catch {}
  return { date: today, completed: [] };
}

function save(s: QuestStore): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTodayQuests(): DailyQuest[] {
  return selectForDate(new Date().toISOString().split('T')[0]);
}

export function getCompletedQuestIds(): string[] {
  return load().completed;
}

/** Marks quest as complete. Returns false if already done. */
export function completeQuest(id: string): boolean {
  const s = load();
  if (s.completed.includes(id)) return false;
  s.completed.push(id);
  save(s);
  return true;
}

export function isQuestComplete(id: string): boolean {
  return load().completed.includes(id);
}
