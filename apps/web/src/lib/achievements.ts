export interface Achievement {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: 'streak_3',     label: '3-Day Streak',    description: 'Logged 3 days in a row',         icon: '🔥', color: '#F97316' },
  { id: 'streak_7',     label: 'Week Warrior',     description: '7-day logging streak',           icon: '⚡', color: '#EF4444' },
  { id: 'streak_14',    label: '2-Week Grind',     description: '14 days in a row',               icon: '💪', color: '#8B5CF6' },
  { id: 'streak_30',    label: 'Month Strong',     description: '30-day logging streak',          icon: '🏆', color: '#F59E0B' },
  { id: 'streak_90',    label: 'Iron Discipline',  description: '90-day logging streak',          icon: '💎', color: '#38BDF8' },
  { id: 'logs_10',      label: 'Getting Started',  description: 'Logged 10 meals total',          icon: '🌱', color: '#22C55E' },
  { id: 'logs_50',      label: 'Building Habits',  description: 'Logged 50 meals total',          icon: '⭐', color: '#38BDF8' },
  { id: 'logs_100',     label: 'Centurion',        description: '100 meals logged',               icon: '💯', color: '#F97316' },
  { id: 'logs_500',     label: 'Dedicated',        description: '500 meals logged',               icon: '🎯', color: '#EC4899' },
  { id: 'logs_1000',    label: 'Elite Logger',     description: '1000 meals logged',              icon: '👑', color: '#F59E0B' },
  { id: 'goal_hit',     label: 'On Target',        description: 'Hit your calorie goal today',    icon: '🎯', color: '#22C55E' },
  { id: 'goal_hit_3',   label: 'Consistent',       description: '3 days in a row hitting goal',  icon: '✅', color: '#22C55E' },
  { id: 'goal_hit_7',   label: 'Perfect Week',     description: '7 days in a row hitting goal',  icon: '🌟', color: '#F59E0B' },
  { id: 'water_goal',   label: 'Hydrated',         description: 'Hit your water goal today',     icon: '💧', color: '#38BDF8' },
  { id: 'first_log',    label: 'First Step',       description: 'Logged your first meal',        icon: '🚀', color: '#A78BFA' },
];

const KEY = 'fs_unlocked_achievements_v1';

export function getUnlocked(): string[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

export function isUnlocked(id: string): boolean {
  return getUnlocked().includes(id);
}

// Returns the Achievement object if it was just newly unlocked, null if already had it
export function unlock(id: string): Achievement | null {
  const current = getUnlocked();
  if (current.includes(id)) return null;
  localStorage.setItem(KEY, JSON.stringify([...current, id]));
  return ALL_ACHIEVEMENTS.find(a => a.id === id) ?? null;
}

export interface CheckInput {
  streak: number;
  totalLogs: number;
  calGoalHitDays?: number;
  waterGoalHitToday?: boolean;
  isFirstLog?: boolean;
}

// Check all conditions and unlock newly-earned badges. Returns newly unlocked list.
export function checkAndUnlock(input: CheckInput): Achievement[] {
  const earned: Achievement[] = [];

  const tryUnlock = (id: string) => {
    const a = unlock(id);
    if (a) earned.push(a);
  };

  if (input.isFirstLog)             tryUnlock('first_log');
  if (input.streak >= 3)            tryUnlock('streak_3');
  if (input.streak >= 7)            tryUnlock('streak_7');
  if (input.streak >= 14)           tryUnlock('streak_14');
  if (input.streak >= 30)           tryUnlock('streak_30');
  if (input.streak >= 90)           tryUnlock('streak_90');
  if (input.totalLogs >= 1)         tryUnlock('first_log');
  if (input.totalLogs >= 10)        tryUnlock('logs_10');
  if (input.totalLogs >= 50)        tryUnlock('logs_50');
  if (input.totalLogs >= 100)       tryUnlock('logs_100');
  if (input.totalLogs >= 500)       tryUnlock('logs_500');
  if (input.totalLogs >= 1000)      tryUnlock('logs_1000');
  if ((input.calGoalHitDays ?? 0) >= 1) tryUnlock('goal_hit');
  if ((input.calGoalHitDays ?? 0) >= 3) tryUnlock('goal_hit_3');
  if ((input.calGoalHitDays ?? 0) >= 7) tryUnlock('goal_hit_7');
  if (input.waterGoalHitToday)      tryUnlock('water_goal');

  return earned;
}
