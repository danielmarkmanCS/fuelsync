import Dexie, { type Table } from 'dexie';

export interface LocalProfile {
  id?: number;
  displayName: string;
  weightKg: number;
  heightCm: number;
  age: number;
  gender: 'male' | 'female';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
  dailyGoal: number;
  stravaAccessToken?: string;
  stravaRefreshToken?: string;
  stravaExpiresAt?: number;
  stravaAthleteName?: string;
  stravaAthletePic?: string;
}

export interface Ingredient {
  name: string;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface LocalFoodLog {
  id?: number;
  sync_id?: string;     // UUID used as D1 id — device-agnostic dedup key
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight_grams: number | null;
  meal_type: string;
  image_url: string | null;
  logged_at: string;
  date: string;
  ingredients?: Ingredient[] | null;
  removed?: boolean;    // soft-delete: excluded from active log, stays in history
  // micronutrients (optional — populated by AI/USDA sources)
  fiber_g?: number | null;
  cholesterol_mg?: number | null;
  sodium_mg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
}

export interface WeightLog {
  id?: number;
  sync_id?: string;   // UUID for D1 sync
  date: string;       // YYYY-MM-DD
  weightKg: number;
  logged_at: string;  // ISO timestamp
}

export interface SyncQueueItem {
  id?: number;
  operation: 'add' | 'delete';
  payload: string;    // JSON-stringified log or { id }
  retries: number;
  created_at: string;
}

export interface Supplement {
  id?: number;
  sync_id?: string;   // UUID for D1 sync
  name: string;
  dose: string;
  unit: string;
  timing: 'morning' | 'pre-workout' | 'post-workout' | 'evening' | 'anytime';
  active: boolean;
}

export interface SupplementLog {
  id?: number;
  sync_id?: string;   // UUID for D1 sync
  supplement_id: number;
  date: string;       // YYYY-MM-DD
  taken: boolean;
  skipped?: boolean;
  logged_at: string;
}

export interface WaterLog {
  id?: number;
  date: string;
  ml: number;
  note?: string | null;
  logged_at: string;
}

export interface DiaryCompletion {
  id?: number;
  date: string;       // YYYY-MM-DD
  completed_at: string;
  totalCal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
}

export interface BodyMeasurement {
  id?: number;
  date: string;       // YYYY-MM-DD
  waist_cm?: number | null;
  chest_cm?: number | null;
  arms_cm?: number | null;   // bicep
  hips_cm?: number | null;
  thighs_cm?: number | null;
  neck_cm?: number | null;
  body_fat_pct?: number | null;
  logged_at: string;
}

export interface WorkoutSet {
  reps: number;
  weight: number;   // kg
  logged_at: string;
}

export interface WorkoutExercise {
  id?: number;
  date: string;           // YYYY-MM-DD
  exercise_name: string;
  muscle_group: string;
  sets: WorkoutSet[];     // stored as JSON blob
  order: number;
  logged_at: string;
}

export interface PinState {
  id?: number;
  hash: string;
  salt: string;                    // PBKDF2 random salt (hex)
  attempts: number;
  lockedUntil: number | null;
  totalAttempts: number;           // cumulative wrong attempts (resets on correct PIN)
  securityQuestion?: string;
  securityAnswerHash?: string;
  securityAnswerSalt?: string;
  securityAnswerAttempts?: number;
}

// ─── Looksmaxxing / Self-Improvement ─────────────────────────────────────────

export type RoutineCategory = 'SKIN' | 'GROOM' | 'HABITS' | 'MEWING';

export interface GlowRoutineItem {
  id?: number;
  name: string;
  category: RoutineCategory;
  icon: string;
  order: number;
  active: boolean;
}

export interface GlowRoutineLog {
  id?: number;
  item_id: number;
  date: string;      // YYYY-MM-DD
  done: boolean;
  logged_at: string; // ISO timestamp
}

export interface SleepLog {
  id?: number;
  date: string;       // YYYY-MM-DD
  hours: number;
  quality: 1 | 2 | 3 | 4 | 5;
  bedtime?: string | null;
  wakeup?: string | null;
  logged_at: string;
}

export type BeardStage = 1 | 2 | 3 | 4 | 5;

export interface GlowMetricEntry {
  id?: number;
  date: string;              // YYYY-MM-DD
  weightKg?: number | null;
  bodyFatPct?: number | null;
  beardStage?: BeardStage | null; // 1=clean 5=full
  notes?: string | null;
  logged_at: string;
}

class FuelSyncDB extends Dexie {
  profile!:              Table<LocalProfile, number>;
  food_logs!:            Table<LocalFoodLog, number>;
  pin_state!:            Table<PinState, number>;
  weight_logs!:          Table<WeightLog, number>;
  sync_queue!:           Table<SyncQueueItem, number>;
  supplements!:          Table<Supplement, number>;
  supplement_logs!:      Table<SupplementLog, number>;
  workout_exercises!:    Table<WorkoutExercise, number>;
  water_logs!:           Table<WaterLog, number>;
  diary_completions!:    Table<DiaryCompletion, number>;
  body_measurements!:    Table<BodyMeasurement, number>;
  glow_routine_items!:   Table<GlowRoutineItem, number>;
  glow_routine_logs!:    Table<GlowRoutineLog, number>;
  glow_metric_entries!:  Table<GlowMetricEntry, number>;
  sleep_logs!:           Table<SleepLog, number>;

  constructor() {
    super('FuelSyncDB');
    this.version(1).stores({
      profile:    '++id',
      food_logs:  '++id, date, logged_at',
      pin_state:  '++id',
    });
    this.version(2).stores({
      food_logs:  '++id, date, logged_at, sync_id',
    });
    this.version(3).stores({
      weight_logs: '++id, date',
    });
    this.version(4).stores({
      sync_queue: '++id, operation',
    });
    this.version(5).stores({
      supplements:     '++id, active',
      supplement_logs: '++id, supplement_id, date',
    });
    this.version(6).stores({
      supplements:     '++id, active, sync_id',
      supplement_logs: '++id, supplement_id, date, sync_id',
      weight_logs:     '++id, date, sync_id',
    });
    this.version(7).stores({
      workout_exercises: '++id, date, exercise_name',
    });
    this.version(8).stores({
      water_logs:         '++id, date',
      diary_completions:  '++id, date',
    });
    this.version(9).stores({
      body_measurements: '++id, date',
    });
    this.version(10).stores({
      glow_routine_items:  '++id, category, active',
      glow_routine_logs:   '++id, item_id, date',
      glow_metric_entries: '++id, date',
    });
    this.version(11).stores({
      sleep_logs: '++id, date',
    });
  }
}

export const db = new FuelSyncDB();
