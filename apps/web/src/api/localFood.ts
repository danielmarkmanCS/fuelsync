import { db, type LocalFoodLog } from '../lib/db';
import { workerPost } from './client';

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

export interface IngredientItem {
  name: string;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface AIEstimate {
  food_name: string;
  estimated_weight_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
  breakdown?: string | null;
  imageUrl?: string | null;
  ingredients?: IngredientItem[] | null;
}

function toFoodLog(row: LocalFoodLog): FoodLog {
  return {
    id: String(row.id!),
    food_name: row.food_name,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    weight_grams: row.weight_grams,
    meal_type: row.meal_type,
    image_url: row.image_url,
    logged_at: row.logged_at,
  };
}

export async function getLogs(date: string): Promise<FoodLog[]> {
  const rows = await db.food_logs.where('date').equals(date).sortBy('logged_at');
  return rows.map(toFoodLog);
}

export async function getAllLogs(): Promise<FoodLog[]> {
  const rows = await db.food_logs.orderBy('logged_at').reverse().toArray();
  return rows.map(toFoodLog);
}

export async function addLog(entry: {
  food_name: string; calories: number; protein: number;
  carbs: number; fat: number; weight_grams?: number;
  meal_type?: string; image_url?: string;
}): Promise<FoodLog> {
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const id = await db.food_logs.add({
    food_name: entry.food_name,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    weight_grams: entry.weight_grams ?? null,
    meal_type: entry.meal_type ?? 'other',
    image_url: entry.image_url ?? null,
    logged_at: now,
    date,
  });
  const row = await db.food_logs.get(id);
  return toFoodLog(row!);
}

export async function deleteLog(id: string): Promise<void> {
  await db.food_logs.delete(Number(id));
}

export function estimateByWeight(food_name: string, weight_grams: number): Promise<AIEstimate> {
  return workerPost<AIEstimate>('ai', '/estimate', { food_name, weight_grams });
}

export function estimateByDescription(description: string): Promise<AIEstimate> {
  return workerPost<AIEstimate>('ai', '/describe', { description });
}

export function suggestMeal(context: string, size: 'big' | 'small'): Promise<AIEstimate> {
  return workerPost<AIEstimate>('ai', '/suggest', { context, size });
}

export async function analyzeByImage(file: File): Promise<AIEstimate> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return workerPost<AIEstimate>('ai', '/analyze', { base64, mimeType: file.type });
}
