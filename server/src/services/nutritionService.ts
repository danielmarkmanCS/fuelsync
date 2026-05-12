import type { UserProfile, DailyLog, WeeklyLoad, MacroBreakdown } from '../../../shared/types';
import {
  computeMacros,
  calcTDEE,
  checkLegFatigueGate,
  macroAdherenceScore,
} from '../../../apps/mobile/src/services/nutritionEngine';

export interface WeeklyPlan {
  weekStart: string;
  days: Array<{ date: string; trainingType: DailyLog['trainingType']; targets: MacroBreakdown }>;
  totalCalories: number;
  avgProteinG: number;
}

// ─── WEEKLY PLAN GENERATOR ────────────────────────────────────────────────────
// Builds a 7-day plan from a given training schedule and user profile.

export function generateWeeklyPlan(
  profile: UserProfile,
  schedule: Record<string, DailyLog['trainingType']>,
  weeklyLoad: WeeklyLoad,
): WeeklyPlan {
  const days = Object.keys(schedule).sort();
  const result: WeeklyPlan['days'] = [];

  let runningLoad = { ...weeklyLoad };

  for (const date of days) {
    const trainingType = schedule[date];
    const log: DailyLog = {
      id: date,
      date,
      trainingType,
      intensity: trainingType === 'rest' ? 'low' : trainingType === 'cardio' ? 'high' : 'moderate',
    };

    const targets = computeMacros(profile, log, runningLoad);
    result.push({ date, trainingType, targets });

    // Simulate load accumulation across the week
    if (trainingType === 'cardio') {
      runningLoad = { ...runningLoad, legFatigueScore: Math.min(100, runningLoad.legFatigueScore + 15) };
    } else if (trainingType === 'strength') {
      runningLoad = { ...runningLoad, legFatigueScore: Math.min(100, runningLoad.legFatigueScore + 8) };
    } else {
      runningLoad = { ...runningLoad, legFatigueScore: Math.max(0, runningLoad.legFatigueScore - 12) };
    }
  }

  const totalCalories = result.reduce((s, d) => s + d.targets.targets.calories, 0);
  const avgProteinG = Math.round(result.reduce((s, d) => s + d.targets.targets.proteinG, 0) / days.length);

  return { weekStart: days[0], days: result, totalCalories, avgProteinG };
}

// ─── PERIODIZATION HELPER ─────────────────────────────────────────────────────

export interface GoalPeriodization {
  phase: 'base' | 'build' | 'peak' | 'taper';
  weekNumber: number;
  totalWeeks: number;
  recommendedWeeklyKm?: number;
  recommendedHeavyLiftSessions?: number;
  notes: string;
}

export function getPeriodizationPhase(
  goalDeadline: string,
  today: string,
  goalType: 'run' | 'lift',
): GoalPeriodization {
  const deadlineMs = new Date(goalDeadline).getTime();
  const todayMs = new Date(today).getTime();
  const totalWeeks = Math.ceil((deadlineMs - todayMs) / (7 * 24 * 60 * 60 * 1000));
  const weeksRemaining = Math.max(0, totalWeeks);
  const weekNumber = Math.max(1, totalWeeks - weeksRemaining + 1);

  // Simple 4-phase model: Base → Build → Peak → Taper
  if (weeksRemaining > totalWeeks * 0.6) {
    return {
      phase: 'base',
      weekNumber,
      totalWeeks,
      recommendedWeeklyKm: goalType === 'run' ? 30 : undefined,
      recommendedHeavyLiftSessions: goalType === 'lift' ? 2 : 1,
      notes: 'Base phase: build aerobic/structural foundation. Keep intensity moderate. Focus on form.',
    };
  }
  if (weeksRemaining > totalWeeks * 0.3) {
    return {
      phase: 'build',
      weekNumber,
      totalWeeks,
      recommendedWeeklyKm: goalType === 'run' ? 45 : undefined,
      recommendedHeavyLiftSessions: goalType === 'lift' ? 3 : 2,
      notes: 'Build phase: increase volume progressively. One quality session per week at race/max pace.',
    };
  }
  if (weeksRemaining > 2) {
    return {
      phase: 'peak',
      weekNumber,
      totalWeeks,
      recommendedWeeklyKm: goalType === 'run' ? 55 : undefined,
      recommendedHeavyLiftSessions: goalType === 'lift' ? 3 : 2,
      notes: 'Peak phase: highest load week. Then begin taper. Prioritise sleep and nutrition compliance.',
    };
  }
  return {
    phase: 'taper',
    weekNumber,
    totalWeeks,
    recommendedWeeklyKm: goalType === 'run' ? 25 : undefined,
    recommendedHeavyLiftSessions: goalType === 'lift' ? 1 : 1,
    notes: 'Taper: cut volume 40-50%, keep some intensity. Trust the training. Carb-load 48 h before.',
  };
}

export { computeMacros, calcTDEE, checkLegFatigueGate, macroAdherenceScore };
