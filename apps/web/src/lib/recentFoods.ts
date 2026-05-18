const RECENT_KEY = 'fs_recent_foods_v2';
const FAV_KEY    = 'fs_favorite_foods_v2';
const MAX        = 25;

export interface SavedFood {
  food_name:    string;
  calories:     number;
  protein:      number;
  carbs:        number;
  fat:          number;
  weight_grams: number | null;
  meal_type:    string;
  lastUsed:     number;
}

function read(key: string): SavedFood[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
}
function write(key: string, arr: SavedFood[]): void {
  try { localStorage.setItem(key, JSON.stringify(arr)); } catch {}
}

export function getRecentFoods(): SavedFood[] {
  return read(RECENT_KEY).sort((a, b) => b.lastUsed - a.lastUsed);
}

export function addRecentFood(food: Omit<SavedFood, 'lastUsed'>): void {
  const recents = read(RECENT_KEY).filter((r) => r.food_name.toLowerCase() !== food.food_name.toLowerCase());
  recents.unshift({ ...food, lastUsed: Date.now() });
  write(RECENT_KEY, recents.slice(0, MAX));
}

export function getFavoriteFoods(): SavedFood[] {
  return read(FAV_KEY);
}

export function toggleFavorite(food: Omit<SavedFood, 'lastUsed'>): boolean {
  const favs = read(FAV_KEY);
  const idx  = favs.findIndex((f) => f.food_name.toLowerCase() === food.food_name.toLowerCase());
  if (idx >= 0) {
    favs.splice(idx, 1);
    write(FAV_KEY, favs);
    return false;
  }
  favs.unshift({ ...food, lastUsed: Date.now() });
  write(FAV_KEY, favs);
  return true;
}

export function isFavorite(foodName: string): boolean {
  return read(FAV_KEY).some((f) => f.food_name.toLowerCase() === foodName.toLowerCase());
}
