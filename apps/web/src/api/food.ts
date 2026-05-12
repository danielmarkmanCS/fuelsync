import { api } from './client';

export interface FoodLog {
  id: string;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight_grams: number | null;
  meal_type: string;
  image_url: string | null;
  logged_at: string;
}

export interface AIEstimate {
  food_name: string;
  estimated_weight_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
  imageUrl?: string | null;
}

export function getLogs(date: string) {
  return api.get<FoodLog[]>(`/food/logs?date=${date}`);
}

export function addLog(entry: {
  food_name: string; calories: number; protein: number;
  carbs: number; fat: number; weight_grams?: number;
  meal_type?: string; type?: string; image_url?: string;
}) {
  return api.post<FoodLog>('/food/logs', entry);
}

export function deleteLog(id: string) {
  return api.delete<{ ok: boolean }>(`/food/logs/${id}`);
}

export function estimateByWeight(food_name: string, weight_grams: number) {
  return api.post<AIEstimate>('/food/estimate', { food_name, weight_grams });
}

export function estimateByDescription(description: string) {
  return api.post<AIEstimate>('/food/describe', { description });
}
