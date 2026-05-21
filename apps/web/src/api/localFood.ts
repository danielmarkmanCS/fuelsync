import { db, type LocalFoodLog, type Ingredient } from '../lib/db';
import { workerPost } from './client';
import { syncAddLog, syncDeleteLog, getSyncToken, fetchLogsForDate, fetchAllLogs } from './syncClient';

export type { Ingredient };

async function queueAdd(payload: object): Promise<void> {
  await db.sync_queue.add({ operation: 'add', payload: JSON.stringify(payload), retries: 0, created_at: new Date().toISOString() }).catch(() => {});
}

async function queueDelete(id: string): Promise<void> {
  await db.sync_queue.add({ operation: 'delete', payload: JSON.stringify({ id }), retries: 0, created_at: new Date().toISOString() }).catch(() => {});
}

export async function drainSyncQueue(): Promise<void> {
  if (!getSyncToken()) return;
  const items = await db.sync_queue.toArray();
  if (items.length === 0) return;
  for (const item of items) {
    try {
      const payload = JSON.parse(item.payload);
      if (item.operation === 'add') {
        await syncAddLog(payload);
      } else {
        await syncDeleteLog(payload.id);
      }
      await db.sync_queue.delete(item.id!);
    } catch {
      const retries = (item.retries ?? 0) + 1;
      if (retries >= 5) {
        await db.sync_queue.delete(item.id!);
      } else {
        await db.sync_queue.update(item.id!, { retries }).catch(() => {});
      }
    }
  }
  clearPullCache();
}

export async function getSyncQueueSize(): Promise<number> {
  return db.sync_queue.count();
}

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
  fiber_g?: number | null;
  cholesterol_mg?: number | null;
  sodium_mg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
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
  fiber_g?: number | null;
  cholesterol_mg?: number | null;
  sodium_mg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
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
    fiber_g:        row.fiber_g        ?? null,
    cholesterol_mg: row.cholesterol_mg ?? null,
    sodium_mg:      row.sodium_mg      ?? null,
    vitamin_c_mg:   row.vitamin_c_mg   ?? null,
    vitamin_d_mcg:  row.vitamin_d_mcg  ?? null,
    calcium_mg:     row.calcium_mg     ?? null,
    iron_mg:        row.iron_mg        ?? null,
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
  deleted_at?: string | null;
}

async function upsertD1Logs(d1logs: unknown[]) {
  for (const raw of d1logs) {
    const log = raw as D1FoodLog;
    if (!log.id) continue;

    const bySyncId = await db.food_logs.where('sync_id').equals(log.id).first();

    // Propagate deletions from other devices
    if (log.deleted_at) {
      if (bySyncId?.id != null && !bySyncId.removed) {
        await db.food_logs.update(bySyncId.id, { removed: true });
      }
      continue;
    }

    // Already synced by sync_id?
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
  await withTimeout(pullWithKey(`d:${date}`, () => fetchLogsForDate(date)), 8000);
  const rows = await db.food_logs.where('date').equals(date).sortBy('logged_at');
  return rows.filter((r) => !r.removed).map(toFoodLog);
}

export async function getAllLogs(): Promise<FoodLog[]> {
  await withTimeout(pullWithKey('all', fetchAllLogs), 10000);
  const rows = await db.food_logs.orderBy('logged_at').reverse().toArray();
  return rows.map(toFoodLog);
}

export async function addLog(entry: {
  food_name: string; calories: number; protein: number;
  carbs: number; fat: number; weight_grams?: number;
  meal_type?: string; image_url?: string;
  ingredients?: Ingredient[] | null;
  logged_at?: string;
  fiber_g?: number | null;
  cholesterol_mg?: number | null;
  sodium_mg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
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
    fiber_g:        entry.fiber_g        ?? null,
    cholesterol_mg: entry.cholesterol_mg ?? null,
    sodium_mg:      entry.sodium_mg      ?? null,
    vitamin_c_mg:   entry.vitamin_c_mg   ?? null,
    vitamin_d_mcg:  entry.vitamin_d_mcg  ?? null,
    calcium_mg:     entry.calcium_mg     ?? null,
    iron_mg:        entry.iron_mg        ?? null,
  });
  const row = await db.food_logs.get(id);
  const log = toFoodLog(row!);
  const syncPayload = {
    id: sync_id,
    food_name: log.food_name, calories: log.calories,
    protein: log.protein, carbs: log.carbs, fat: log.fat,
    weight_grams: log.weight_grams, meal_type: log.meal_type,
    image_url: log.image_url, ingredients: log.ingredients,
    logged_at: log.logged_at, date: log.logged_at.slice(0, 10),
  };
  syncAddLog(syncPayload).catch(() => queueAdd(syncPayload));
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
  syncDeleteLog(id).catch(() => queueDelete(id));
}

// Soft-delete: removes from active log but keeps in History Foods tab
export async function softDeleteLog(id: string): Promise<void> {
  const bySync = await db.food_logs.where('sync_id').equals(id).first();
  if (bySync?.id != null) {
    await db.food_logs.update(bySync.id, { removed: true });
    syncDeleteLog(id).catch(() => queueDelete(id));
    return;
  }
  const numId = Number(id);
  if (!isNaN(numId) && Number.isInteger(numId)) {
    await db.food_logs.update(numId, { removed: true });
    syncDeleteLog(id).catch(() => queueDelete(id));
  }
}

export async function unremoveLog(id: string): Promise<void> {
  const bySync = await db.food_logs.where('sync_id').equals(id).first();
  if (bySync?.id == null) {
    const numId = Number(id);
    if (!isNaN(numId) && Number.isInteger(numId)) {
      await db.food_logs.update(numId, { removed: false });
    }
    return;
  }
  // If an identical active entry already exists for the same day (pre-existing duplicate
  // from old re-log bugs), just delete this removed copy — food is already in the log.
  const sameDay = await db.food_logs.where('date').equals(bySync.date).toArray();
  const hasDuplicate = sameDay.some(
    (r) => !r.removed && r.id !== bySync.id &&
      r.food_name === bySync.food_name &&
      Math.abs((r.calories ?? 0) - (bySync.calories ?? 0)) <= 5
  );
  if (hasDuplicate) {
    await db.food_logs.delete(bySync.id);
  } else {
    await db.food_logs.update(bySync.id, { removed: false });
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
