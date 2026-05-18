const KEY = 'fs_recipes_v1';

export interface RecipeIngredient {
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  amountG: number;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  totalCal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  savedAt: number;
}

function read(): Recipe[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(arr: Recipe[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
}

export function getRecipes(): Recipe[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveRecipe(name: string, servings: number, ingredients: RecipeIngredient[]): Recipe {
  const existing = read().filter((r) => r.name.toLowerCase() !== name.toLowerCase());
  const recipe: Recipe = {
    id:           crypto.randomUUID(),
    name:         name.trim(),
    servings:     Math.max(1, servings),
    ingredients,
    totalCal:     Math.round(ingredients.reduce((s, i) => s + i.calories, 0)),
    totalProtein: Math.round(ingredients.reduce((s, i) => s + i.protein,  0) * 10) / 10,
    totalCarbs:   Math.round(ingredients.reduce((s, i) => s + i.carbs,    0) * 10) / 10,
    totalFat:     Math.round(ingredients.reduce((s, i) => s + i.fat,      0) * 10) / 10,
    savedAt:      Date.now(),
  };
  write([recipe, ...existing].slice(0, 50));
  return recipe;
}

export function deleteRecipe(id: string): void {
  write(read().filter((r) => r.id !== id));
}
