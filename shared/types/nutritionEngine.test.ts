/**
 * Quick smoke-tests for the NutritionEngine.
 * Run with: npx ts-node shared/types/nutritionEngine.test.ts
 */

// We test the logic directly — no framework dependency needed.
import {
  calcTDEE,
  computeMacros,
  calcRemaining,
  macroAdherenceScore,
  updateWeeklyLoad,
  checkLegFatigueGate,
} from '../../apps/mobile/src/services/nutritionEngine';
import type { UserProfile, DailyLog, WeeklyLoad } from './index';

const profile: UserProfile = {
  id: 'test-user',
  weightKg: 80,
  heightCm: 180,
  age: 28,
  sex: 'male',
  activityLevel: 'very_active',
  goals: [],
};

const load: WeeklyLoad = {
  weekStart: '2025-05-12',
  totalRunKm: 0,
  totalStrengthSets: 0,
  legFatigueScore: 0,
  recoveryScore: 80,
};

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`FAIL: ${msg}`);
  console.log(`  PASS: ${msg}`);
}

// ─── TDEE ────────────────────────────────────────────────────────────────────
const tdee = calcTDEE(profile);
assert(tdee > 2500 && tdee < 3500, `TDEE in expected range (${tdee} kcal)`);

// ─── REST DAY ────────────────────────────────────────────────────────────────
const restLog: DailyLog = { id: '1', date: '2025-05-12', trainingType: 'rest', intensity: 'low' };
const rest = computeMacros(profile, restLog, load);
assert(rest.targets.fatG > rest.targets.carbsG, 'Rest: fat > carbs');
assert(rest.targets.carbTimingWindow === undefined, 'Rest: no carb window');

// ─── STRENGTH DAY ────────────────────────────────────────────────────────────
const strengthLog: DailyLog = {
  id: '2', date: '2025-05-13', trainingType: 'strength',
  plannedWorkoutTime: '18:00', intensity: 'moderate',
};
const strength = computeMacros(profile, strengthLog, load);
assert(strength.targets.proteinG > strength.targets.fatG, 'Strength: protein > fat');
assert(strength.targets.carbTimingWindow !== undefined, 'Strength: carb timing window exists');

// ─── CARDIO DAY ──────────────────────────────────────────────────────────────
const cardioLog: DailyLog = {
  id: '3', date: '2025-05-14', trainingType: 'cardio',
  plannedWorkoutTime: '07:00', intensity: 'high',
};
const cardio = computeMacros(profile, cardioLog, load);
assert(cardio.targets.carbsG > cardio.targets.proteinG, 'Cardio: carbs > protein');
assert(cardio.targets.carbsG > cardio.targets.fatG, 'Cardio: carbs > fat');

// ─── CARB TIMING WINDOW ──────────────────────────────────────────────────────
const window = cardio.targets.carbTimingWindow!;
assert(window.preWorkoutStart === '05:00', `Cardio pre-window at 05:00 (got ${window.preWorkoutStart})`);
assert(window.postWorkoutEnd === '09:00', `Cardio post-window at 09:00 (got ${window.postWorkoutEnd})`);
assert(window.windowCarbsG > 0, 'Carb window has grams assigned');

// ─── REMAINING ───────────────────────────────────────────────────────────────
const consumed = { calories: 800, proteinG: 40, carbsG: 100, fatG: 20 };
const remaining = calcRemaining(cardio.targets, consumed);
assert(remaining.carbsG === cardio.targets.carbsG - 100, 'Remaining carbs calculated correctly');

// ─── ADHERENCE SCORE ─────────────────────────────────────────────────────────
const perfect = { ...cardio.targets }; // consumed === targets
const score = macroAdherenceScore(cardio.targets, perfect);
assert(score === 100, `Perfect adherence = 100 (got ${score})`);

// ─── LEG FATIGUE GATE ────────────────────────────────────────────────────────
const highLoad: WeeklyLoad = { ...load, legFatigueScore: 75 };
const gate = checkLegFatigueGate(highLoad, cardioLog);
assert(gate.blocked === true, 'Leg fatigue gate blocks cardio at score 75');

const safeLoad: WeeklyLoad = { ...load, legFatigueScore: 50 };
const safeGate = checkLegFatigueGate(safeLoad, cardioLog);
assert(safeGate.blocked === false, 'Leg fatigue gate allows cardio at score 50');

// ─── WEEKLY LOAD UPDATE ──────────────────────────────────────────────────────
const updated = updateWeeklyLoad(load, cardioLog, { addKm: 10 });
assert(updated.totalRunKm === 10, 'Weekly km updated');
assert(updated.legFatigueScore > 0, 'Leg fatigue increased after cardio');

console.log('\nAll NutritionEngine tests passed.');
