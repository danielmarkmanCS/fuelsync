const KEY = 'fs_meal_templates_v1';

export interface TemplateFood {
  food_name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  weight_grams: number | null;
}

export interface MealTemplate {
  id: string;
  name: string;
  mealType: string;
  foods: TemplateFood[];
  totalCal: number;
  savedAt: number;
}

function read(): MealTemplate[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(arr: MealTemplate[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch {}
}

export function getTemplates(): MealTemplate[] {
  return read().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveTemplate(name: string, mealType: string, foods: TemplateFood[]): void {
  const templates = read().filter((t) => t.name.toLowerCase() !== name.toLowerCase());
  templates.unshift({
    id:       crypto.randomUUID(),
    name:     name.trim(),
    mealType,
    foods,
    totalCal: Math.round(foods.reduce((s, f) => s + f.calories, 0)),
    savedAt:  Date.now(),
  });
  write(templates.slice(0, 30));
}

export function deleteTemplate(id: string): void {
  write(read().filter((t) => t.id !== id));
}
