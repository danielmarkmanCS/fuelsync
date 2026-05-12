export type TrainingType = 'rest' | 'strength' | 'cardio' | 'hybrid';

export type IntensityLevel = 'low' | 'moderate' | 'high';

export interface UserProfile {
  id: string;
  weightKg: number;
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'very_active' | 'extra_active';
  goalDeadline?: string; // ISO date
  goals: AthleteGoal[];
}

export interface AthleteGoal {
  id: string;
  type: 'run' | 'lift' | 'body_comp';
  description: string;
  targetValue: number;
  unit: string; // 'km', 'kg', '%'
  deadline: string; // ISO date
  currentValue: number;
}

export interface DailyLog {
  id: string;
  date: string; // ISO date YYYY-MM-DD
  trainingType: TrainingType;
  plannedWorkoutTime?: string; // HH:MM — for carb timing window
  plannedDuration?: number; // minutes
  intensity: IntensityLevel;
  notes?: string;
  actualWorkoutLogged?: boolean;
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Carb timing window around workout (if applicable) */
  carbTimingWindow?: {
    preWorkoutStart: string; // HH:MM
    postWorkoutEnd: string;  // HH:MM
    windowCarbsG: number;    // carbs to concentrate in this window
  };
}

export interface MacroBreakdown {
  trainingType: TrainingType;
  tdee: number;
  targets: MacroTargets;
  rationale: string;
}

export interface WeatherConditions {
  tempC: number;
  humidity: number; // percentage
  uvIndex: number;
  description: string;
  city: string;
  timestamp: number;
}

export interface EnvironmentAlert {
  level: 'none' | 'caution' | 'danger';
  message: string;
  suggestedPivot?: TrainingType;
  pivotReason?: string;
  extraHydrationMl?: number;
}

export interface WeeklyLoad {
  weekStart: string; // ISO date Monday
  totalRunKm: number;
  totalStrengthSets: number;
  legFatigueScore: number; // 0-100, blocks high-intensity runs when high
  recoveryScore: number;   // 0-100
}

export interface NearbyVenue {
  id: string;
  name: string;
  type: 'gym' | 'outdoor_park' | 'track';
  distanceM: number;
  allowsDropIn: boolean;
  lat: number;
  lng: number;
  googleMapsUrl?: string;
}

export interface FoodEntry {
  id: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  grams: number;
  timestamp: string; // ISO datetime
  mealSlot: 'breakfast' | 'pre_workout' | 'lunch' | 'post_workout' | 'dinner' | 'snack';
  synced: boolean;
}

export interface DaySnapshot {
  date: string;
  log: DailyLog;
  targets: MacroTargets;
  consumed: MacroTargets;
  weather?: WeatherConditions;
  alert?: EnvironmentAlert;
  weeklyLoad: WeeklyLoad;
}
