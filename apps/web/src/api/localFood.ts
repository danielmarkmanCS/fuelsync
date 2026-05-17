import { db, type LocalFoodLog, type Ingredient } from '../lib/db';
import { workerPost } from './client';
import { syncAddLog, syncDeleteLog, getSyncToken, fetchLogsForDate, fetchAllLogs } from './syncClient';

export type { Ingredient };

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
  ingredients?: Ingredient[] | null;
  removed?: boolean;
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
    id: row.sync_id ?? String(row.id!),
    food_name: row.food_name,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    weight_grams: row.weight_grams,
    meal_type: row.meal_type,
    image_url: row.image_url,
    logged_at: row.logged_at,
    ingredients: row.ingredients ?? null,
    removed: row.removed ?? false,
  };
}

// ── D1 pull helpers ───────────────────────────────────────────────────────────

interface D1FoodLog {
  id: string;
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight_grams: number | null;
  meal_type: string;
  image_url: string | null;
  ingredients: Ingredient[] | null;
  logged_at: string;
  date: string;
}

async function upsertD1Logs(d1logs: unknown[]) {
  for (const raw of d1logs) {
    const log = raw as D1FoodLog;
    if (!log.id) continue;

    // Already synced by sync_id?
    const bySyncId = await db.food_logs.where('sync_id').equals(log.id).first();
    if (bySyncId) continue;

    // Legacy log: D1 id is the string of the local numeric id (e.g. "1", "2")
    // Backfill sync_id on the existing row to avoid duplicate insertion.
    const numericId = Number(log.id);
    if (!isNaN(numericId) && Number.isInteger(numericId)) {
      const byNumId = await db.food_logs.get(numericId);
      if (byNumId && !byNumId.sync_id) {
        await db.food_logs.update(numericId, { sync_id: log.id });
        continue;
      }
    }

    // Unknown on this device — insert it
    await db.food_logs.add({
      sync_id: log.id,
      food_name: log.food_name,
      calories: log.calories,
      protein: log.protein,
      carbs: log.carbs,
      fat: log.fat,
      weight_grams: log.weight_grams ?? null,
      meal_type: log.meal_type ?? 'other',
      image_url: log.image_url ?? null,
      ingredients: log.ingredients ?? null,
      logged_at: log.logged_at,
      date: log.date,
    });
  }
}

// Per-key pull cache and in-flight dedup
const pullCache = new Map<string, number>();
const inFlight  = new Map<string, Promise<void>>();
const PULL_TTL  = 30_000;

export function clearPullCache() {
  pullCache.clear();
}

function pullWithKey(key: string, fetcher: () => Promise<unknown[]>): Promise<void> {
  if (!getSyncToken()) return Promise.resolve();
  const now = Date.now();
  if ((pullCache.get(key) ?? 0) + PULL_TTL > now) return Promise.resolve();
  if (inFlight.has(key)) return inFlight.get(key)!;

  const p = (async () => {
    pullCache.set(key, now);
    try {
      const logs = await fetcher();
      await upsertD1Logs(logs);
    } catch {
      pullCache.delete(key);
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, p);
  return p;
}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return Promise.race([promise, new Promise<void>((r) => setTimeout(r, ms))]);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getLogs(date: string): Promise<FoodLog[]> {
  await withTimeout(pullWithKey(`d:${date}`, () => fetchLogsForDate(date)), 3000);
  const rows = await db.food_logs.where('date').equals(date).sortBy('logged_at');
  return rows.filter((r) => !r.removed).map(toFoodLog);
}

export async function getAllLogs(): Promise<FoodLog[]> {
  await withTimeout(pullWithKey('all', fetchAllLogs), 5000);
  const rows = await db.food_logs.orderBy('logged_at').reverse().toArray();
  return rows.map(toFoodLog);
}

export async function addLog(entry: {
  food_name: string; calories: number; protein: number;
  carbs: number; fat: number; weight_grams?: number;
  meal_type?: string; image_url?: string;
  ingredients?: Ingredient[] | null;
  logged_at?: string;
}): Promise<FoodLog> {
  const sync_id = crypto.randomUUID();
  const now = entry.logged_at ?? new Date().toISOString();
  const date = now.slice(0, 10);
  const id = await db.food_logs.add({
    sync_id,
    food_name: entry.food_name,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    weight_grams: entry.weight_grams ?? null,
    meal_type: entry.meal_type ?? 'other',
    image_url: entry.image_url ?? null,
    ingredients: entry.ingredients ?? null,
    logged_at: now,
    date,
  });
  const row = await db.food_logs.get(id);
  const log = toFoodLog(row!);
  syncAddLog({
    id: sync_id,
    food_name: log.food_name, calories: log.calories,
    protein: log.protein, carbs: log.carbs, fat: log.fat,
    weight_grams: log.weight_grams, meal_type: log.meal_type,
    image_url: log.image_url, ingredients: log.ingredients,
    logged_at: log.logged_at, date: log.logged_at.slice(0, 10),
  }).catch(() => {});
  return log;
}

export async function deleteLog(id: string): Promise<void> {
  // id may be a UUID (sync_id) for new logs or a numeric string for legacy logs
  const bySync = await db.food_logs.where('sync_id').equals(id).first();
  if (bySync?.id != null) {
    await db.food_logs.delete(bySync.id);
  } else {
    await db.food_logs.delete(Number(id));
  }
  syncDeleteLog(id).catch(() => {});
}

// Soft-delete: removes from active log but keeps in History Foods tab
export async function softDeleteLog(id: string): Promise<void> {
  const bySync = await db.food_logs.where('sync_id').equals(id).first();
  if (bySync?.id != null) {
    await db.food_logs.update(bySync.id, { removed: true });
    return;
  }
  const numId = Number(id);
  if (!isNaN(numId) && Number.isInteger(numId)) {
    await db.food_logs.update(numId, { removed: true });
  }
}

export async function unremoveLog(id: string): Promise<void> {
  const bySync = await db.food_logs.where('sync_id').equals(id).first();
  if (bySync?.id != null) {
    await db.food_logs.update(bySync.id, { removed: false });
    return;
  }
  const numId = Number(id);
  if (!isNaN(numId) && Number.isInteger(numId)) {
    await db.food_logs.update(numId, { removed: false });
  }
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

export function estimateSteps(description: string): Promise<{ steps: number; label: 'low' | 'normal' | 'high' }> {
  return workerPost('ai', '/steps', { description });
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
