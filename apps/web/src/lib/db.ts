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
  name: string;
  dose: string;
  unit: string;
  timing: 'morning' | 'pre-workout' | 'post-workout' | 'evening' | 'anytime';
  active: boolean;
}

export interface SupplementLog {
  id?: number;
  supplement_id: number;
  date: string;       // YYYY-MM-DD
  taken: boolean;
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

class FuelSyncDB extends Dexie {
  profile!:          Table<LocalProfile, number>;
  food_logs!:        Table<LocalFoodLog, number>;
  pin_state!:        Table<PinState, number>;
  weight_logs!:      Table<WeightLog, number>;
  sync_queue!:       Table<SyncQueueItem, number>;
  supplements!:      Table<Supplement, number>;
  supplement_logs!:  Table<SupplementLog, number>;

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
  }
}

export const db = new FuelSyncDB();
