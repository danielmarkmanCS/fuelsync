import type {
  UserProfile,
  DailyLog,
  MacroBreakdown,
  MacroTargets,
  TrainingType,
  WeeklyLoad,
} from '../../../../shared/types';

// ─── TDEE ────────────────────────────────────────────────────────────────────

const ACTIVITY_MULTIPLIERS: Record<UserProfile['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

function calcBMR(profile: UserProfile): number {
  const { weightKg, heightCm, age, sex } = profile;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function calcTDEE(profile: UserProfile): number {
  return Math.round(calcBMR(profile) * ACTIVITY_MULTIPLIERS[profile.activityLevel]);
}

// ─── MACRO RATIOS ─────────────────────────────────────────────────────────────
// Each ratio tuple: [protein%, carbs%, fat%] of total calories

interface MacroRatio {
  protein: number;
  carbs: number;
  fat: number;
  caloricAdjustment: number; // multiplier applied to TDEE for that day type
  rationale: string;
}

const MACRO_RATIOS: Record<TrainingType, MacroRatio> = {
  rest: {
    protein: 0.30,
    carbs: 0.20,
    fat: 0.50,
    caloricAdjustment: 0.85,
    rationale:
      'Rest day: High fat as primary fuel, moderate protein for ongoing repair, low carb to deplete remaining glycogen and enhance fat adaptation.',
  },
  strength: {
    protein: 0.38,
    carbs: 0.35,
    fat: 0.27,
    caloricAdjustment: 1.05,
    rationale:
      'Strength day: High protein to maximise MPS, moderate carbs timed around the workout window, moderate fat to maintain hormone balance.',
  },
  cardio: {
    protein: 0.25,
    carbs: 0.55,
    fat: 0.20,
    caloricAdjustment: 1.10,
    rationale:
      'Cardio day: High carbs to saturate glycogen stores, moderate protein, low fat to accelerate gastric emptying pre-run.',
  },
  hybrid: {
    protein: 0.32,
    carbs: 0.43,
    fat: 0.25,
    caloricAdjustment: 1.08,
    rationale:
      'Hybrid day: Balanced macros favouring carbs slightly — supports both aerobic performance and recovery from strength work.',
  },
  hiit: {
    protein: 0.30,
    carbs: 0.50,
    fat: 0.20,
    caloricAdjustment: 1.12,
    rationale:
      'HIIT day: High intensity demands rapid glycogen replenishment — elevated carbs post-session, solid protein for muscle repair, minimal fat to maximise energy availability.',
  },
  cycling: {
    protein: 0.25,
    carbs: 0.52,
    fat: 0.23,
    caloricAdjustment: 1.10,
    rationale:
      'Cycling day: Sustained aerobic work burns primarily carbs — high carb intake to preserve glycogen, moderate protein for leg muscle support, moderate fat for sustained endurance fuel.',
  },
  yoga: {
    protein: 0.30,
    carbs: 0.30,
    fat: 0.40,
    caloricAdjustment: 0.90,
    rationale:
      'Yoga day: Low-intensity movement supports recovery — moderate protein for tissue repair, balanced fat for hormonal support, low-moderate carbs as glycogen demands are minimal.',
  },
  walk: {
    protein: 0.28,
    carbs: 0.30,
    fat: 0.42,
    caloricAdjustment: 0.92,
    rationale:
      'Walk day: Light aerobic activity — slightly above rest calories to support fat oxidation and active recovery. Low carb, moderate protein, higher fat for sustained low-intensity fuel.',
  },
};

// ─── CALORIC CONSTANTS ────────────────────────────────────────────────────────

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;

// ─── CARB TIMING WINDOW ───────────────────────────────────────────────────────

function buildCarbTimingWindow(
  plannedWorkoutTime: string | undefined,
  totalCarbsG: number,
  trainingType: TrainingType,
): MacroTargets['carbTimingWindow'] | undefined {
  if (!plannedWorkoutTime || trainingType === 'rest') return undefined;

  const [hours, minutes] = plannedWorkoutTime.split(':').map(Number);

  const preStart = new Date(0, 0, 0, hours - 2, minutes);
  const postEnd = new Date(0, 0, 0, hours + 2, minutes);

  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  // Concentrate 50-60% of daily carbs in the ±2 h workout window
  const windowRatio = trainingType === 'cardio' ? 0.60 : 0.50;
  const windowCarbsG = Math.round(totalCarbsG * windowRatio);

  return {
    preWorkoutStart: fmt(preStart),
    postWorkoutEnd: fmt(postEnd),
    windowCarbsG,
  };
}

// ─── LEG FATIGUE GATE ────────────────────────────────────────────────────────
// If leg fatigue > 70 and training type is cardio, we recommend swapping to
// upper-body strength to avoid injuring running economy.

export function checkLegFatigueGate(
  load: WeeklyLoad,
  log: DailyLog,
): { blocked: boolean; message?: string } {
  if (log.trainingType !== 'cardio' && log.trainingType !== 'hiit' && log.trainingType !== 'cycling') return { blocked: false };
  if (load.legFatigueScore >= 70) {
    return {
      blocked: true,
      message: `Leg fatigue score is ${load.legFatigueScore}/100. Recommend swapping today's run for upper-body strength to protect running economy.`,
    };
  }
  return { blocked: false };
}

// ─── MAIN ENGINE ─────────────────────────────────────────────────────────────

export function computeMacros(
  profile: UserProfile,
  log: DailyLog,
  weeklyLoad: WeeklyLoad,
): MacroBreakdown {
  const tdee = calcTDEE(profile);
  const ratio = MACRO_RATIOS[log.trainingType];

  // Step/activity modifier: low day pulls TDEE down, high day bumps it up
  const activityModifier = log.dailyActivityModifier === 'low' ? 0.87 : log.dailyActivityModifier === 'high' ? 1.08 : 1.0;

  // Adjust for weekly load: if recovery score is low, pull calories down slightly
  const recoveryMultiplier = weeklyLoad.recoveryScore < 40 ? 0.95 : 1.0;
  const targetCalories = Math.round(tdee * ratio.caloricAdjustment * activityModifier * recoveryMultiplier);

  const proteinG = Math.round((targetCalories * ratio.protein) / KCAL_PER_G.protein);
  const carbsG = Math.round((targetCalories * ratio.carbs) / KCAL_PER_G.carbs);
  const fatG = Math.round((targetCalories * ratio.fat) / KCAL_PER_G.fat);

  const carbTimingWindow = buildCarbTimingWindow(
    log.plannedWorkoutTime,
    carbsG,
    log.trainingType,
  );

  const targets: MacroTargets = { calories: targetCalories, proteinG, carbsG, fatG, carbTimingWindow };

  const recoveryNote =
    weeklyLoad.recoveryScore < 40
      ? ' Recovery score is low — calories reduced 5% to prioritise tissue repair over performance output.'
      : '';

  return {
    trainingType: log.trainingType,
    tdee,
    targets,
    rationale: ratio.rationale + recoveryNote,
  };
}

// ─── REMAINING MACRO CALCULATOR ──────────────────────────────────────────────

export function calcRemaining(
  targets: MacroTargets,
  consumed: MacroTargets,
): MacroTargets {
  return {
    calories: Math.max(0, targets.calories - consumed.calories),
    proteinG: Math.max(0, targets.proteinG - consumed.proteinG),
    carbsG: Math.max(0, targets.carbsG - consumed.carbsG),
    fatG: Math.max(0, targets.fatG - consumed.fatG),
  };
}

// ─── WEEKLY LOAD UPDATER ─────────────────────────────────────────────────────

export function updateWeeklyLoad(
  current: WeeklyLoad,
  log: DailyLog,
  options: { addKm?: number; addSets?: number },
): WeeklyLoad {
  const addKm = options.addKm ?? 0;
  const addSets = options.addSets ?? 0;

  // Leg fatigue increases with runs and leg-dominant strength sets, decays on rest
  let legDelta = 0;
  if (log.trainingType === 'cardio')   legDelta = Math.min(20, addKm * 1.5);
  if (log.trainingType === 'cycling')  legDelta = Math.min(15, addKm * 0.8);
  if (log.trainingType === 'hiit')     legDelta = 12;
  if (log.trainingType === 'strength') legDelta = addSets * 1.2;
  if (log.trainingType === 'rest' || log.trainingType === 'yoga') legDelta = -15; // recovery decay
  if (log.trainingType === 'walk')     legDelta = -8; // light recovery

  // Recovery score: improves on rest/low intensity, drops on high volume
  const intensityImpact = { low: 10, moderate: -5, high: -15 }[log.intensity];

  return {
    ...current,
    totalRunKm: current.totalRunKm + addKm,
    totalStrengthSets: current.totalStrengthSets + addSets,
    legFatigueScore: Math.min(100, Math.max(0, current.legFatigueScore + legDelta)),
    recoveryScore: Math.min(100, Math.max(0, current.recoveryScore + intensityImpact)),
  };
}

// ─── MACRO QUALITY SCORE ─────────────────────────────────────────────────────
// Simple 0-100 score: how close consumed macros are to targets for today.

export function macroAdherenceScore(targets: MacroTargets, consumed: MacroTargets): number {
  const proteinPct = Math.min(consumed.proteinG / targets.proteinG, 1);
  const carbsPct = Math.min(consumed.carbsG / targets.carbsG, 1);
  const fatPct = Math.min(consumed.fatG / targets.fatG, 1);
  const calPct = Math.min(consumed.calories / targets.calories, 1);

  // Weighted — protein compliance matters most for hybrid athletes
  const score = proteinPct * 0.4 + carbsPct * 0.3 + fatPct * 0.15 + calPct * 0.15;
  return Math.round(score * 100);
}
