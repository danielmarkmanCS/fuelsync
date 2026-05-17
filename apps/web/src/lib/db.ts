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
  profile!: Table<LocalProfile, number>;
  food_logs!: Table<LocalFoodLog, number>;
  pin_state!: Table<PinState, number>;

  constructor() {
    super('FuelSyncDB');
    this.version(1).stores({
      profile:    '++id',
      food_logs:  '++id, date, logged_at',
      pin_state:  '++id',
    });
  }
}

export const db = new FuelSyncDB();
