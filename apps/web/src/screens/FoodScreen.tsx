import { useState, useEffect, useCallback, useRef } from 'react';
import { getLogs, addLog, deleteLog, softDeleteLog, unremoveLog, estimateByWeight, estimateByDescription, analyzeByImage, suggestMeal, clearPullCache } from '../api/localFood';
import type { FoodLog, AIEstimate, IngredientItem } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';
import { playFoodLogSound } from '../utils/sounds';
import { searchFood, lookupBarcode } from '../api/openFoodFacts';
import type { OFFProduct } from '../api/openFoodFacts';
import { getRecentFoods, getFavoriteFoods, addRecentFood, toggleFavorite, isFavorite } from '../lib/recentFoods';
import type { SavedFood } from '../lib/recentFoods';
import { getTemplates, saveTemplate, deleteTemplate } from '../lib/mealTemplates';
import type { MealTemplate } from '../lib/mealTemplates';
import { getRecipes, saveRecipe, deleteRecipe } from '../lib/recipes';
import type { Recipe, RecipeIngredient } from '../lib/recipes';
import { getNoteForDate, setNoteForDate } from '../lib/diaryNotes';
import { getMealCalTargets, setMealCalTargets } from '../lib/mealCalTargets';
import type { MealCalTargets } from '../lib/mealCalTargets';

const BG     = '#0E1117';
const SURF   = '#161B27';
const SURF2  = '#1D2333';
const EDGE   = 'rgba(255,255,255,0.07)';
const TEXT   = '#DCE6FF';
const MUTED  = '#5A6990';
const BLUE   = '#1E40DC';
const BLUE2  = '#4B6FFF';
const GREEN  = '#05C56B';
const ORANGE = '#FF8B00';
const PURPLE = '#8034E0';
const CYAN   = '#00BDD0';
const RED    = '#EF3340';
const CARD_SHADOW = '0 1px 3px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.06)';

const MEAL_TYPES = ['breakfast', 'pre_workout', 'lunch', 'post_workout', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack',
};

const MEAL_ICON: Record<string, string> = {
  breakfast: '🌅', pre_workout: '⚡', lunch: '☀️', post_workout: '💪', dinner: '🌙', snack: '🍎', other: '🍽️',
};

const SUGGEST_CTX = ['morning', 'pre_workout', 'post_workout', 'rest', 'evening'] as const;
type SuggestCtx = typeof SUGGEST_CTX[number];
const CTX_LABEL: Record<SuggestCtx, string> = {
  morning: 'Morning', pre_workout: 'Pre-Workout', post_workout: 'Post-Workout', rest: 'Rest Day', evening: 'Evening',
};
const CTX_MEAL: Record<SuggestCtx, MealType> = {
  morning: 'breakfast', pre_workout: 'pre_workout', post_workout: 'post_workout', rest: 'lunch', evening: 'dinner',
};

interface Form {
  name: string; amount: string; amountIsText: boolean;
  calories: string; protein: string; carbs: string; fat: string; meal: MealType;
}
function mealFromTime(): MealType {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return 'breakfast';
  if (h >= 11 && h < 14) return 'lunch';
  if (h >= 14 && h < 18) return 'snack';
  if (h >= 18 && h < 22) return 'dinner';
  return 'snack';
}

function emptyForm(): Form {
  return { name: '', amount: '', amountIsText: false, calories: '', protein: '', carbs: '', fat: '', meal: mealFromTime() };
}
const EMPTY: Form = emptyForm();

function calcCal(p: number, c: number, f: number) { return p * 4 + c * 4 + f * 9; }

function validateEntry(form: Form): string | null {
  const p = parseFloat(form.protein), c = parseFloat(form.carbs), f = parseFloat(form.fat);
  const cal = parseFloat(form.calories), w = parseFloat(form.amount);
  if (!form.name.trim()) return 'Enter a food name.';
  if (!form.amount.trim()) return 'Enter an amount or weight.';
  if ([p, c, f, cal].some(isNaN)) return 'Fill in all macro fields.';
  if (p < 0 || c < 0 || f < 0 || cal < 0) return 'Values cannot be negative.';
  const macro = calcCal(p, c, f);
  if (macro > 0 && cal > 0 && Math.abs(macro - cal) / cal > 0.12)
    return `Calories (${Math.round(cal)}) don't match macros (~${Math.round(macro)} kcal).`;
  if (!form.amountIsText && !isNaN(w) && w > 0) {
    if (p + c + f > w * 1.1) return `Total macros exceed food weight (${w}g).`;
    if (p > w * 0.95) return `${Math.round(p)}g protein from ${w}g is not possible.`;
  }
  return null;
}

function sumMacros(logs: FoodLog[]) {
  return logs.reduce((acc, l) => ({
    calories: acc.calories + parseFloat(l.calories as unknown as string),
    protein:  acc.protein  + parseFloat(l.protein  as unknown as string),
    carbs:    acc.carbs    + parseFloat(l.carbs    as unknown as string),
    fat:      acc.fat      + parseFloat(l.fat      as unknown as string),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

const CONF_COLOR: Record<string, string> = { high: GREEN, medium: ORANGE, low: RED };

const inp: React.CSSProperties = {
  background: SURF2, border: `1px solid ${EDGE}`,
  borderRadius: 12, color: TEXT, fontSize: 15,
  padding: '13px 15px', outline: 'none',
  fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
};

function IngredientBreakdown({ ingredients, onEdit }: { ingredients: IngredientItem[]; onEdit?: (idx: number, updated: IngredientItem) => void }) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editVals,   setEditVals]   = useState({ calories: '', protein: '', carbs: '', fat: '' });

  const startEdit = (i: number) => {
    const item = ingredients[i];
    setEditingIdx(i);
    setEditVals({ calories: String(Math.round(item.calories)), protein: String(Math.round(item.protein)), carbs: String(Math.round(item.carbs)), fat: String(Math.round(item.fat)) });
  };

  const confirmEdit = () => {
    if (editingIdx === null || !onEdit) return;
    onEdit(editingIdx, {
      ...ingredients[editingIdx],
      calories: parseFloat(editVals.calories) || 0,
      protein:  parseFloat(editVals.protein)  || 0,
      carbs:    parseFloat(editVals.carbs)    || 0,
      fat:      parseFloat(editVals.fat)      || 0,
    });
    setEditingIdx(null);
  };

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${EDGE}` }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Breakdown</div>
      {ingredients.map((item, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: editingIdx === i ? 6 : 7, marginBottom: editingIdx === i ? 0 : 7, borderBottom: i < ingredients.length - 1 && editingIdx !== i ? `1px solid ${EDGE}` : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{item.amount}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: BLUE }}>{Math.round(item.calories)}</div>
              <div style={{ fontSize: 9, color: MUTED, letterSpacing: 0.5 }}>kcal</div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginLeft: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: RED,    fontWeight: 700 }}>P{Math.round(item.protein)}</span>
              <span style={{ fontSize: 9, color: CYAN,   fontWeight: 700 }}>C{Math.round(item.carbs)}</span>
              <span style={{ fontSize: 9, color: PURPLE, fontWeight: 700 }}>F{Math.round(item.fat)}</span>
            </div>
            {onEdit && (
              <button onClick={() => editingIdx === i ? setEditingIdx(null) : startEdit(i)} style={{
                marginLeft: 8, background: editingIdx === i ? SURF2 : 'none',
                border: `1px solid ${editingIdx === i ? EDGE : 'transparent'}`,
                borderRadius: 6, color: editingIdx === i ? MUTED : BLUE,
                fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '3px 8px', fontFamily: 'inherit',
              }}>{editingIdx === i ? '✕' : 'edit'}</button>
            )}
          </div>
          {editingIdx === i && onEdit && (
            <div style={{ padding: '6px 0 10px', borderBottom: i < ingredients.length - 1 ? `1px solid ${EDGE}` : 'none', marginBottom: i < ingredients.length - 1 ? 7 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {([
                  { label: 'kcal', key: 'calories' as const, color: BLUE },
                  { label: 'P(g)',  key: 'protein'  as const, color: RED    },
                  { label: 'C(g)',  key: 'carbs'    as const, color: CYAN   },
                  { label: 'F(g)',  key: 'fat'      as const, color: PURPLE },
                ]).map(({ label, key, color }) => (
                  <div key={key}>
                    <div style={{ fontSize: 8, fontWeight: 700, color, letterSpacing: 1, marginBottom: 3, textTransform: 'uppercase' }}>{label}</div>
                    <input type="number" value={editVals[key]}
                      onChange={(e) => setEditVals((v) => ({ ...v, [key]: e.target.value }))}
                      style={{ width: '100%', background: SURF2, border: `1px solid ${color}40`, borderRadius: 8, color: TEXT, fontSize: 14, fontWeight: 700, padding: '6px 6px', outline: 'none', fontFamily: 'inherit' }}
                    />
                  </div>
                ))}
              </div>
              <button onClick={confirmEdit} style={{
                width: '100%', padding: '8px 0', borderRadius: 10, border: 'none',
                background: BLUE, color: '#fff', fontWeight: 800, fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Done ✓</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function offsetDate(base: string, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function dateLabel(date: string): string {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = offsetDate(today, -1);
  if (date === today)     return 'Today';
  if (date === yesterday) return 'Yesterday';
  return new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function FoodScreen() {
  const { targets, weather } = useNutrition();
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday = selectedDate === todayStr;

  const [logs,       setLogs]       = useState<FoodLog[]>([]);
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState<'quick' | 'search' | 'ai' | 'photo' | 'manual' | 'suggest' | 'recipe'>('search');
  const [form,       setForm]       = useState<Form>(emptyForm);
  const [estimate,   setEstimate]   = useState<AIEstimate | null>(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState('');
  const [formError,  setFormError]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiQuery,    setAiQuery]    = useState('');
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [basePerGram, setBasePerGram] = useState<{ protein: number; carbs: number; fat: number } | null>(null);
  const [suggestCtx,  setSuggestCtx]  = useState<SuggestCtx>('morning');
  const [suggestSize, setSuggestSize] = useState<'big' | 'small'>('big');
  const [suggestResult, setSuggestResult] = useState<AIEstimate | null>(null);
  const [loggingAll, setLoggingAll] = useState(false);
  const [editableIngredients, setEditableIngredients] = useState<IngredientItem[] | null>(null);

  // Tracks the most recently applied USDA/OFF product (for micro scaling at submit)
  const [currentProduct, setCurrentProduct] = useState<OFFProduct | null>(null);

  // Search + barcode state
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchResults, setSearchResults] = useState<OFFProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError,   setSearchError]   = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Barcode scanner state
  const [scanActive,   setScanActive]   = useState(false);
  const [scanError,    setScanError]    = useState('');
  const [scanSupported, setScanSupported] = useState<boolean | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const detectingRef = useRef(false);

  // Recents + favorites
  const [recents,   setRecents]   = useState<SavedFood[]>([]);
  const [favorites, setFavorites] = useState<SavedFood[]>([]);
  const [favTab,    setFavTab]    = useState<'recent' | 'fav' | 'templates'>('recent');
  const [favoriteStates, setFavoriteStates] = useState<Record<string, boolean>>({});
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [loggingTemplateId, setLoggingTemplateId] = useState<string | null>(null);
  const [savingTemplateMeal, setSavingTemplateMeal] = useState<string | null>(null);
  const [templateNameInput, setTemplateNameInput] = useState('');

  // Quick add
  const [quickCal,  setQuickCal]  = useState('');
  const [quickPro,  setQuickPro]  = useState('');
  const [quickCarb, setQuickCarb] = useState('');
  const [quickFat,  setQuickFat]  = useState('');
  const [quickName, setQuickName] = useState('');
  const [quickMeal, setQuickMeal] = useState<MealType>(mealFromTime());

  // Copy yesterday
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // Recipe builder
  const [recipes,              setRecipes]              = useState<Recipe[]>([]);
  const [recipeView,           setRecipeView]           = useState<'list' | 'build'>('list');
  const [recipeBuilderName,    setRecipeBuilderName]    = useState('');
  const [recipeBuilderServings, setRecipeBuilderServings] = useState('1');
  const [recipeIngredients,    setRecipeIngredients]    = useState<RecipeIngredient[]>([]);
  const [recipeSearch,         setRecipeSearch]         = useState('');
  const [recipeResults,        setRecipeResults]        = useState<OFFProduct[]>([]);
  const [recipeSearchLoading,  setRecipeSearchLoading]  = useState(false);
  const [loggingRecipeId,      setLoggingRecipeId]      = useState<string | null>(null);
  const [loggingRecipeServings, setLoggingRecipeServings] = useState('1');
  const recipeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Diary notes
  const [diaryNote,     setDiaryNote]     = useState('');
  const [noteExpanded,  setNoteExpanded]  = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Meal calorie targets
  const [mealCalTargets,     setMealCalTargetsState] = useState<MealCalTargets>(getMealCalTargets);
  const [editingMealTargets, setEditingMealTargets]  = useState(false);

  // Undo deleted meal
  const [undoEntry, setUndoEntry] = useState<FoodLog | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nowTime, setNowTime] = useState(() => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  useEffect(() => {
    const tick = () => setNowTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const fetchLogs = useCallback(() => getLogs(selectedDate).then(setLogs).catch(() => {}), [selectedDate]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Re-fetch from D1 when app comes back to foreground (picks up changes from other devices)
  const fetchLogsRef = useRef(fetchLogs);
  fetchLogsRef.current = fetchLogs;
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) { clearPullCache(); fetchLogsRef.current(); }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Load diary note when date changes
  useEffect(() => {
    setDiaryNote(getNoteForDate(selectedDate));
    setNoteExpanded(false);
  }, [selectedDate]);

  // Load recents + favorites + templates + recipes when sheet opens
  useEffect(() => {
    if (open) {
      setRecents(getRecentFoods());
      setFavorites(getFavoriteFoods());
      setTemplates(getTemplates());
      setRecipes(getRecipes());
    }
  }, [open]);

  // Debounced food search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults([]); setSearchError(''); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true); setSearchError('');
      try {
        const results = await searchFood(searchQuery.trim());
        setSearchResults(results);
        if (results.length === 0) setSearchError('No results found. Try a different name.');
      } catch { setSearchError('Search failed — check connection.'); }
      finally { setSearchLoading(false); }
    }, 500);
  }, [searchQuery]);

  // Barcode scanner helpers
  const stopScan = () => {
    detectingRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanActive(false);
  };

  const startScan = async () => {
    setScanError('');
    const supported = 'BarcodeDetector' in window;
    setScanSupported(supported);
    if (!supported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanActive(true);
        detectingRef.current = true;
        const detector = new (window as unknown as { BarcodeDetector: new (opts: object) => { detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector(
          { formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] }
        );
        const loop = async () => {
          if (!detectingRef.current || !videoRef.current) return;
          try {
            const found = await detector.detect(videoRef.current);
            if (found.length > 0) {
              stopScan();
              await handleBarcodeFound(found[0].rawValue);
              return;
            }
          } catch {}
          if (detectingRef.current) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    } catch { setScanError('Camera access denied.'); }
  };

  const handleBarcodeFound = async (barcode: string) => {
    setBarcodeLoading(true); setScanError('');
    try {
      const product = await lookupBarcode(barcode);
      if (!product) { setScanError(`Barcode ${barcode} not found in database.`); setBarcodeLoading(false); return; }
      applyOFFProduct(product);
    } catch { setScanError('Lookup failed — check connection.'); }
    finally { setBarcodeLoading(false); }
  };

  const applyOFFProduct = (product: OFFProduct, weightG = product.servingSizeG ?? 100) => {
    const factor = weightG / 100;
    const protein  = Math.round(product.proteinPer100g  * factor * 10) / 10;
    const carbs    = Math.round(product.carbsPer100g    * factor * 10) / 10;
    const fat      = Math.round(product.fatPer100g      * factor * 10) / 10;
    const calories = Math.round(product.caloriesPer100g * factor);
    setBasePerGram({ protein: product.proteinPer100g / 100, carbs: product.carbsPer100g / 100, fat: product.fatPer100g / 100 });
    setCurrentProduct(product);
    setEstimate(null);
    setForm((f) => ({
      ...f,
      name:     product.name + (product.brand ? ` (${product.brand})` : ''),
      amount:   String(weightG),
      amountIsText: false,
      protein:  String(protein),
      carbs:    String(carbs),
      fat:      String(fat),
      calories: String(calories),
    }));
    setMode('manual');
    setSearchQuery('');
    setSearchResults([]);
  };

  const applySavedFood = (food: SavedFood) => {
    setBasePerGram(null);
    setForm({
      name:         food.food_name,
      amount:       food.weight_grams ? String(food.weight_grams) : '1',
      amountIsText: !food.weight_grams,
      calories:     String(Math.round(food.calories)),
      protein:      String(Math.round(food.protein)),
      carbs:        String(Math.round(food.carbs)),
      fat:          String(Math.round(food.fat)),
      meal:         food.meal_type as MealType ?? mealFromTime(),
    });
    setMode('manual');
    setSearchQuery('');
  };

  const handleCopyYesterday = async () => {
    const yesterday = offsetDate(todayStr, -1);
    setCopyingYesterday(true);
    try {
      const yesterdayLogs = await getLogs(yesterday);
      if (yesterdayLogs.length === 0) { alert('No meals logged yesterday.'); return; }
      for (const entry of yesterdayLogs) {
        await addLog({
          food_name:    entry.food_name,
          calories:     entry.calories,
          protein:      entry.protein,
          carbs:        entry.carbs,
          fat:          entry.fat,
          weight_grams: entry.weight_grams ?? undefined,
          meal_type:    entry.meal_type,
          ingredients:  entry.ingredients ?? undefined,
          fiber_g: entry.fiber_g, cholesterol_mg: entry.cholesterol_mg,
          sodium_mg: entry.sodium_mg, vitamin_c_mg: entry.vitamin_c_mg,
          vitamin_d_mcg: entry.vitamin_d_mcg, calcium_mg: entry.calcium_mg,
          iron_mg: entry.iron_mg,
        });
      }
      playFoodLogSound();
      fetchLogs();
    } catch {}
    finally { setCopyingYesterday(false); }
  };

  const handleLogTemplate = async (template: MealTemplate) => {
    if (loggingTemplateId) return;
    setLoggingTemplateId(template.id);
    try {
      for (const food of template.foods) {
        await addLog({
          food_name:    food.food_name,
          calories:     food.calories,
          protein:      food.protein,
          carbs:        food.carbs,
          fat:          food.fat,
          weight_grams: food.weight_grams ?? undefined,
          meal_type:    template.mealType,
        });
      }
      playFoodLogSound();
      fetchLogs();
      closeSheet();
    } catch {}
    finally { setLoggingTemplateId(null); }
  };

  const handleSaveTemplate = (meal: string, entries: FoodLog[]) => {
    setSavingTemplateMeal(meal);
    setTemplateNameInput(MEAL_LABEL[meal as MealType] ?? meal);
  };

  const confirmSaveTemplate = (meal: string, entries: FoodLog[]) => {
    const name = templateNameInput.trim() || (MEAL_LABEL[meal as MealType] ?? meal);
    saveTemplate(name, meal, entries.map((e) => ({
      food_name:    e.food_name,
      calories:     Number(e.calories),
      protein:      Number(e.protein),
      carbs:        Number(e.carbs),
      fat:          Number(e.fat),
      weight_grams: e.weight_grams,
    })));
    setSavingTemplateMeal(null);
    setTemplateNameInput('');
    setTemplates(getTemplates());
  };

  const handleQuickAdd = async () => {
    const cal = parseFloat(quickCal);
    if (isNaN(cal) || cal <= 0) return;
    const pro  = parseFloat(quickPro)  || 0;
    const carb = parseFloat(quickCarb) || 0;
    const fat  = parseFloat(quickFat)  || 0;
    setSubmitting(true);
    try {
      await addLog({
        food_name: quickName.trim() || 'Quick Add',
        calories:  cal,
        protein:   pro,
        carbs:     carb,
        fat:       fat,
        meal_type: quickMeal,
      });
      addRecentFood({ food_name: quickName.trim() || 'Quick Add', calories: cal, protein: pro, carbs: carb, fat: fat, weight_grams: null, meal_type: quickMeal });
      playFoodLogSound();
      fetchLogs();
      closeSheet();
    } catch {}
    finally { setSubmitting(false); }
  };

  const handleToggleFavorite = (food: SavedFood) => {
    const nowFav = toggleFavorite(food);
    setFavoriteStates((prev) => ({ ...prev, [food.food_name]: nowFav }));
    setFavorites(getFavoriteFoods());
    setRecents(getRecentFoods());
  };

  // Recipe search (debounced)
  useEffect(() => {
    if (recipeSearchTimer.current) clearTimeout(recipeSearchTimer.current);
    if (!recipeSearch.trim()) { setRecipeResults([]); return; }
    recipeSearchTimer.current = setTimeout(async () => {
      setRecipeSearchLoading(true);
      try {
        const r = await searchFood(recipeSearch);
        setRecipeResults(r.slice(0, 10));
      } catch {}
      setRecipeSearchLoading(false);
    }, 400);
  }, [recipeSearch]);

  const addRecipeIngredient = (p: OFFProduct) => {
    const amountG = p.servingSizeG ?? 100;
    const scale = amountG / 100;
    setRecipeIngredients((prev) => [...prev, {
      food_name: p.name,
      calories:  Math.round(p.caloriesPer100g * scale),
      protein:   Math.round(p.proteinPer100g  * scale * 10) / 10,
      carbs:     Math.round(p.carbsPer100g    * scale * 10) / 10,
      fat:       Math.round(p.fatPer100g      * scale * 10) / 10,
      amountG,
    }]);
    setRecipeSearch(''); setRecipeResults([]);
  };

  const updateRecipeIngredientAmount = (idx: number, amountG: number) => {
    setRecipeIngredients((prev) => prev.map((ing, i) => {
      if (i !== idx) return ing;
      const base = ing.amountG > 0 ? (1 / ing.amountG) : 0;
      const scale = amountG * base;
      return { ...ing, amountG, calories: Math.round(ing.calories * (amountG / (ing.amountG || 1))), protein: Math.round(ing.protein * scale * 10) / 10, carbs: Math.round(ing.carbs * scale * 10) / 10, fat: Math.round(ing.fat * scale * 10) / 10 };
    }));
  };

  const handleSaveRecipe = () => {
    if (!recipeBuilderName.trim() || recipeIngredients.length === 0) return;
    saveRecipe(recipeBuilderName, parseInt(recipeBuilderServings) || 1, recipeIngredients);
    setRecipes(getRecipes());
    setRecipeBuilderName(''); setRecipeBuilderServings('1'); setRecipeIngredients([]);
    setRecipeView('list');
  };

  const handleLogRecipe = async (recipe: Recipe) => {
    const servings = parseFloat(loggingRecipeServings) || 1;
    const scale = servings / recipe.servings;
    setLoggingRecipeId(recipe.id);
    try {
      await addLog({
        food_name: `${recipe.name} (${servings === Math.round(servings) ? servings : servings.toFixed(1)} serving${servings !== 1 ? 's' : ''})`,
        calories:  Math.round(recipe.totalCal     * scale),
        protein:   Math.round(recipe.totalProtein * scale * 10) / 10,
        carbs:     Math.round(recipe.totalCarbs   * scale * 10) / 10,
        fat:       Math.round(recipe.totalFat     * scale * 10) / 10,
        meal_type: form.meal,
      });
      playFoodLogSound(); fetchLogs(); closeSheet();
    } catch {}
    setLoggingRecipeId(null);
  };

  const handleNoteChange = (val: string) => {
    setDiaryNote(val);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNoteForDate(selectedDate, val), 600);
  };

  const handleSaveMealCalTargets = (updated: MealCalTargets) => {
    setMealCalTargetsState(updated);
    setMealCalTargets(updated);
    setEditingMealTargets(false);
  };

  const resetSheet = () => {
    setForm(emptyForm()); setEstimate(null); setCurrentProduct(null);
    setAiError(''); setFormError(''); setAiQuery(''); setEditingId(null); setBasePerGram(null);
    setSuggestResult(null); setEditableIngredients(null);
    setSearchQuery(''); setSearchResults([]); setSearchError('');
    setScanError(''); setManualBarcode('');
    setQuickCal(''); setQuickPro(''); setQuickCarb(''); setQuickFat(''); setQuickName(''); setQuickMeal(mealFromTime());
    setSavingTemplateMeal(null); setTemplateNameInput('');
    setRecipeView('list'); setRecipeSearch(''); setRecipeResults([]);
    setLoggingRecipeId(null); setLoggingRecipeServings('1');
    stopScan();
  };
  const closeSheet = () => { setOpen(false); resetSheet(); };

  const handleDelete = (entry: FoodLog) => {
    softDeleteLog(entry.id).then(() => {
      fetchLogs();
      setUndoEntry(entry);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoEntry(null), 5000);
    }).catch(() => {});
  };

  const handleUndo = async () => {
    if (!undoEntry) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const entry = undoEntry;
    setUndoEntry(null);
    await unremoveLog(entry.id);
    fetchLogs();
  };

  const handleReLog = async (entry: FoodLog) => {
    await addLog({
      food_name: entry.food_name, calories: entry.calories,
      protein: entry.protein, carbs: entry.carbs, fat: entry.fat,
      weight_grams: entry.weight_grams ?? undefined,
      meal_type: mealFromTime(), image_url: entry.image_url ?? undefined,
      ingredients: entry.ingredients ?? undefined,
      fiber_g: entry.fiber_g, cholesterol_mg: entry.cholesterol_mg,
      sodium_mg: entry.sodium_mg, vitamin_c_mg: entry.vitamin_c_mg,
      vitamin_d_mcg: entry.vitamin_d_mcg, calcium_mg: entry.calcium_mg,
      iron_mg: entry.iron_mg,
    });
    playFoodLogSound();
    fetchLogs();
  };

  const openEdit = (entry: FoodLog) => {
    const g = entry.weight_grams || 100;
    setForm({
      name: entry.food_name, amount: entry.weight_grams ? String(entry.weight_grams) : '1',
      amountIsText: !entry.weight_grams,
      calories: String(Math.round(Number(entry.calories))), protein: String(Math.round(Number(entry.protein))),
      carbs: String(Math.round(Number(entry.carbs))), fat: String(Math.round(Number(entry.fat))),
      meal: (entry.meal_type as MealType) ?? 'lunch',
    });
    setBasePerGram({ protein: Number(entry.protein)/g, carbs: Number(entry.carbs)/g, fat: Number(entry.fat)/g });
    setEstimate(null); setEditingId(entry.id); setMode('manual'); setOpen(true);
  };

  const patch = (p: Partial<Form>) => {
    if ('protein' in p || 'carbs' in p || 'fat' in p) setBasePerGram(null);
    setForm((f) => {
      const next = { ...f, ...p };
      if ('amount' in p && !next.amountIsText && basePerGram) {
        const w = parseFloat(next.amount);
        if (!isNaN(w) && w > 0) {
          next.protein = String(Math.round(basePerGram.protein * w));
          next.carbs   = String(Math.round(basePerGram.carbs   * w));
          next.fat     = String(Math.round(basePerGram.fat     * w));
        }
      }
      const pr = parseFloat(next.protein), ca = parseFloat(next.carbs), fa = parseFloat(next.fat);
      if (!isNaN(pr) && !isNaN(ca) && !isNaN(fa)) next.calories = String(Math.round(calcCal(pr, ca, fa)));
      return next;
    });
    setFormError('');
  };

  const handleSuggest = async () => {
    setAiLoading(true); setAiError(''); setSuggestResult(null);
    try {
      let ctx = CTX_LABEL[suggestCtx];
      if (weather) {
        const t = Math.round(weather.tempC);
        const feel = t >= 32 ? 'very hot' : t >= 26 ? 'hot' : t >= 18 ? 'warm' : t >= 10 ? 'cool' : 'cold';
        ctx = `${ctx}, ${feel} weather (${t}°C, ${weather.description})`;
      }
      const r = await suggestMeal(ctx, suggestSize);
      setSuggestResult(r);
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  const handleLogSuggestedMeal = async () => {
    if (!suggestResult) return;
    const meal = CTX_MEAL[suggestCtx];
    setLoggingAll(true);
    try {
      // Log the whole meal as one entry (ingredients stored as breakdown, not separate logs)
      await addLog({
        food_name: suggestResult.food_name,
        calories: suggestResult.calories,
        protein: suggestResult.protein,
        carbs: suggestResult.carbs,
        fat: suggestResult.fat,
        weight_grams: suggestResult.estimated_weight_grams || undefined,
        meal_type: meal,
        ingredients: suggestResult.ingredients ?? undefined,
        fiber_g: suggestResult.fiber_g, cholesterol_mg: suggestResult.cholesterol_mg,
        sodium_mg: suggestResult.sodium_mg, vitamin_c_mg: suggestResult.vitamin_c_mg,
        vitamin_d_mcg: suggestResult.vitamin_d_mcg, calcium_mg: suggestResult.calcium_mg,
        iron_mg: suggestResult.iron_mg,
      });
      playFoodLogSound();
      fetchLogs(); closeSheet();
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'Failed to log'); }
    finally { setLoggingAll(false); }
  };

  const handleIngredientEdit = (idx: number, updated: IngredientItem) => {
    const next = editableIngredients ? editableIngredients.map((item, i) => i === idx ? updated : item) : null;
    setEditableIngredients(next);
    if (!next) return;
    const totals = next.reduce((acc, item) => ({
      calories: acc.calories + item.calories,
      protein:  acc.protein  + item.protein,
      carbs:    acc.carbs    + item.carbs,
      fat:      acc.fat      + item.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    setForm((f) => ({
      ...f,
      calories: String(Math.round(totals.calories)),
      protein:  String(Math.round(totals.protein)),
      carbs:    String(Math.round(totals.carbs)),
      fat:      String(Math.round(totals.fat)),
    }));
    setBasePerGram(null);
  };

  const handlePhotoAnalyze = async (file: File) => {
    setAiLoading(true); setAiError('');
    try {
      const r = await analyzeByImage(file);
      setEstimate(r);
      setEditableIngredients(r.ingredients?.length ? [...r.ingredients] : null);
      const g = r.estimated_weight_grams || 100;
      setBasePerGram({ protein: r.protein/g, carbs: r.carbs/g, fat: r.fat/g });
      setForm({ name: r.food_name, amount: String(g), amountIsText: false, calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)), carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)), meal: form.meal });
      setMode('manual');
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'Photo analysis failed'); }
    finally { setAiLoading(false); }
  };

  const handleAISmart = async () => {
    const q = aiQuery.trim();
    if (!q) { setAiError('Describe what you ate.'); return; }
    setAiLoading(true); setAiError('');
    try {
      const r = await estimateByDescription(q);
      setEstimate(r);
      setEditableIngredients(r.ingredients?.length ? [...r.ingredients] : null);
      const g = r.estimated_weight_grams || 100;
      setBasePerGram({ protein: r.protein/g, carbs: r.carbs/g, fat: r.fat/g });
      setForm({ name: r.food_name, amount: String(g), amountIsText: false, calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)), carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)), meal: form.meal });
      setMode('manual');
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  const handleWeightAI = async () => {
    const name = form.name.trim();
    if (!name) { setAiError('Enter a food name first.'); return; }
    setAiLoading(true); setAiError('');
    try {
      if (form.amountIsText) {
        const desc = form.amount.trim() ? `${form.amount.trim()} ${name}` : name;
        const r = await estimateByDescription(desc);
        const g = r.estimated_weight_grams || 100;
        setEstimate(r);
        setEditableIngredients(r.ingredients?.length ? [...r.ingredients] : null);
        setBasePerGram({ protein: r.protein/g, carbs: r.carbs/g, fat: r.fat/g });
        setForm((f) => ({ ...f, name: r.food_name, calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)), carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)) }));
      } else {
        const w = parseFloat(form.amount);
        if (isNaN(w) || w <= 0) { setAiError('Enter weight in grams.'); setAiLoading(false); return; }
        const r = await estimateByWeight(name, w);
        setEstimate(r);
        setEditableIngredients(r.ingredients?.length ? [...r.ingredients] : null);
        setBasePerGram({ protein: r.protein/w, carbs: r.carbs/w, fat: r.fat/w });
        setForm((f) => ({ ...f, name: r.food_name, calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)), carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)) }));
      }
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  const handleAdd = async () => {
    const err = validateEntry(form);
    if (err) { setFormError(err); return; }
    const w = form.amountIsText ? null : parseFloat(form.amount);
    setSubmitting(true); setFormError('');
    // Compute micros: prefer AI estimate; fall back to scaled product values
    const micros = (() => {
      if (estimate) {
        return { fiber_g: estimate.fiber_g, cholesterol_mg: estimate.cholesterol_mg, sodium_mg: estimate.sodium_mg, vitamin_c_mg: estimate.vitamin_c_mg, vitamin_d_mcg: estimate.vitamin_d_mcg, calcium_mg: estimate.calcium_mg, iron_mg: estimate.iron_mg };
      }
      if (currentProduct && w && !isNaN(w)) {
        const f = w / 100;
        return {
          fiber_g:        currentProduct.fiberPer100g        != null ? Math.round(currentProduct.fiberPer100g        * f * 10) / 10 : null,
          cholesterol_mg: currentProduct.cholesterolPer100g  != null ? Math.round(currentProduct.cholesterolPer100g  * f)           : null,
          sodium_mg:      currentProduct.sodiumPer100g       != null ? Math.round(currentProduct.sodiumPer100g       * f)           : null,
          vitamin_c_mg:   currentProduct.vitaminCPer100g     != null ? Math.round(currentProduct.vitaminCPer100g     * f * 10) / 10 : null,
          vitamin_d_mcg:  currentProduct.vitaminDPer100g     != null ? Math.round(currentProduct.vitaminDPer100g     * f * 100) / 100 : null,
          calcium_mg:     currentProduct.calciumPer100g      != null ? Math.round(currentProduct.calciumPer100g      * f)           : null,
          iron_mg:        currentProduct.ironPer100g         != null ? Math.round(currentProduct.ironPer100g         * f * 100) / 100 : null,
        };
      }
      return {};
    })();
    try {
      if (editingId !== null) await deleteLog(editingId);
      await addLog({
        food_name: form.name.trim(), calories: parseFloat(form.calories),
        protein: parseFloat(form.protein), carbs: parseFloat(form.carbs), fat: parseFloat(form.fat),
        weight_grams: w && !isNaN(w) ? w : undefined, meal_type: form.meal,
        image_url: estimate?.imageUrl ?? undefined,
        ingredients: editableIngredients?.length ? editableIngredients : null,
        ...micros,
      });
      if (!editingId) {
        playFoodLogSound();
        addRecentFood({
          food_name:    form.name.trim(),
          calories:     parseFloat(form.calories),
          protein:      parseFloat(form.protein),
          carbs:        parseFloat(form.carbs),
          fat:          parseFloat(form.fat),
          weight_grams: w && !isNaN(w) ? w : null,
          meal_type:    form.meal,
        });
      }
      fetchLogs(); closeSheet();
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const consumed = sumMacros(logs);
  const knownMealSet = new Set<string>(MEAL_TYPES);
  const byMeal = [
    ...MEAL_TYPES.map((m) => ({ meal: m as string, entries: logs.filter((l) => l.meal_type === m) })),
    { meal: 'other', entries: logs.filter((l) => !knownMealSet.has(l.meal_type)) },
  ].filter((g) => g.entries.length > 0);
  const calPct   = targets && targets.calories > 0 ? Math.min((consumed.calories / targets.calories) * 100, 100) : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG, position: 'relative' }}>

      {/* ── HEADER ── */}
      <div className="nrc-a nrc-a1" style={{
        background: 'linear-gradient(145deg, #080F30 0%, #006080 40%, #00BDD0 100%)',
        padding: '44px 22px 22px', position: 'relative', overflow: 'hidden',
      }}>
        <div className="orb1" style={{ position: 'absolute', top: -20, right: 5, width: 150, height: 150, borderRadius: '50%', background: 'rgba(0,189,208,0.12)' }} />
        <div className="orb2" style={{ position: 'absolute', bottom: -20, left: -5, width: 100, height: 100, borderRadius: '50%', background: 'rgba(75,111,255,0.10)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.55)', marginBottom: 10, textTransform: 'uppercase' }}>Fuel Log</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setSelectedDate((d) => offsetDate(d, -1))} style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 12, color: '#fff', fontSize: 20, width: 40, height: 40,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>‹</button>
            <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1.5, color: '#FFFFFF', lineHeight: 1.1 }}>
                {dateLabel(selectedDate).toUpperCase()}
              </div>
              {isToday ? (
                <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', letterSpacing: 1 }}>{nowTime}</div>
              ) : (
                <button onClick={() => setSelectedDate(todayStr)} style={{
                  marginTop: 7, background: 'rgba(255,255,255,0.18)', border: 'none',
                  borderRadius: 20, color: '#fff', fontSize: 10, fontWeight: 700,
                  padding: '5px 14px', cursor: 'pointer', letterSpacing: 1,
                }}>← Back to Today</button>
              )}
            </div>
            <button onClick={() => { if (!isToday) setSelectedDate((d) => offsetDate(d, 1)); }} style={{
              background: isToday ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 12, color: isToday ? 'rgba(255,255,255,0.25)' : '#fff',
              fontSize: 20, width: 40, height: 40,
              cursor: isToday ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>›</button>
          </div>
        </div>
      </div>

      {/* ── CALORIE + MACROS ── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 22px 0' }}>
        <div style={{
          background: SURF, borderRadius: 22, border: `1px solid ${EDGE}`,
          padding: '20px 20px 18px', overflow: 'hidden', position: 'relative', boxShadow: CARD_SHADOW,
        }}>
          <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,189,208,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
            Calories Consumed
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
            <div style={{
              fontSize: 72, fontWeight: 900, letterSpacing: -5, lineHeight: 1,
              color: calPct >= 100 ? RED : calPct >= 85 ? GREEN : TEXT,
              transition: 'color 0.4s',
            }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && (
              <div style={{ paddingBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: MUTED }}>
                  / {Math.round(targets.calories).toLocaleString()}
                </div>
                <div style={{ fontSize: 9, fontWeight: 600, color: MUTED }}>kcal</div>
              </div>
            )}
            {calPct >= 85 && calPct < 100 && (
              <div style={{
                marginLeft: 'auto', paddingBottom: 8,
                background: `${GREEN}10`, border: `1px solid ${GREEN}25`,
                borderRadius: 20, padding: '4px 12px',
                fontSize: 10, fontWeight: 800, color: GREEN, letterSpacing: 0.5,
              }}>
                ON TRACK
              </div>
            )}
          </div>
          <div style={{ height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 18 }}>
            <div
              className="bar-ani"
              style={{
                height: '100%', width: `${Math.min(calPct, 100)}%`,
                background: calPct >= 100 ? `linear-gradient(90deg, ${RED}80, ${RED})` : calPct >= 85 ? `linear-gradient(90deg, ${GREEN}80, ${GREEN})` : `linear-gradient(90deg, ${CYAN}60, ${BLUE})`,
                borderRadius: 4, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { name: 'Protein', val: consumed.protein, tgt: targets?.proteinG, color: RED    },
              { name: 'Carbs',   val: consumed.carbs,   tgt: targets?.carbsG,   color: CYAN   },
              { name: 'Fat',     val: consumed.fat,     tgt: targets?.fatG,     color: PURPLE },
            ].map(({ name, val, tgt, color }) => {
              const pct2 = tgt && tgt > 0 ? Math.min((val / tgt) * 100, 100) : 0;
              const over = tgt && tgt > 0 && val > tgt;
              return (
                <div key={name} style={{ background: `${color}06`, borderRadius: 12, padding: '10px 10px 8px', border: `1px solid ${color}15` }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: over ? RED : color, textTransform: 'uppercase', marginBottom: 5 }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1.5, color: over ? RED : TEXT, lineHeight: 1 }}>
                    {Math.round(val)}<span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>g</span>
                  </div>
                  <div style={{ marginTop: 7, height: 4, background: `${color}18`, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct2}%`, background: `linear-gradient(90deg, ${color}70, ${color})`, borderRadius: 3, transition: 'width 0.7s ease' }} />
                  </div>
                  {tgt && tgt > 0 && (
                    <div style={{ fontSize: 8, color: over ? RED : MUTED, fontWeight: 600, marginTop: 3 }}>
                      {over ? `+${Math.round(val - tgt)}g` : `${Math.round(tgt - val)}g left`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── REMAINING MACROS ── */}
      {isToday && targets && (consumed.protein > 0 || consumed.carbs > 0 || consumed.fat > 0) && (
        <div className="nrc-a nrc-a3" style={{ padding: '10px 22px 0' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'Protein', got: consumed.protein, need: targets.proteinG ?? 0, color: RED    },
              { label: 'Carbs',   got: consumed.carbs,   need: targets.carbsG   ?? 0, color: CYAN   },
              { label: 'Fat',     got: consumed.fat,      need: targets.fatG     ?? 0, color: PURPLE },
            ].map(({ label, got, need, color }) => {
              const rem  = need - got;
              const over = rem < 0;
              const disp = Math.abs(Math.round(rem));
              return (
                <div key={label} style={{
                  flex: 1, textAlign: 'center', padding: '9px 6px',
                  background: over ? `${color}08` : SURF,
                  borderRadius: 12, border: `1px solid ${over ? color + '30' : EDGE}`,
                  boxShadow: over ? `0 2px 12px ${color}14` : CARD_SHADOW,
                }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: over ? color : TEXT, letterSpacing: -0.5, lineHeight: 1 }}>
                    {over ? `+${disp}` : disp}g
                  </div>
                  <div style={{ fontSize: 8, fontWeight: 700, color: over ? color : MUTED, letterSpacing: 0.8, marginTop: 3, textTransform: 'uppercase' }}>
                    {over ? `${label} over` : `${label} left`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── COPY YESTERDAY ── */}
      {isToday && logs.length === 0 && (
        <div style={{ padding: '12px 22px 0' }}>
          <button onClick={handleCopyYesterday} disabled={copyingYesterday} style={{
            width: '100%', padding: '12px 0', borderRadius: 14,
            background: copyingYesterday ? SURF2 : `${BLUE}08`,
            border: `1px solid ${BLUE}22`,
            color: copyingYesterday ? MUTED : BLUE,
            fontWeight: 700, fontSize: 13, cursor: copyingYesterday ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {copyingYesterday ? 'Copying…' : '↩ Copy Yesterday\'s Meals'}
          </button>
        </div>
      )}

      {/* ── FOOD LOG ── */}
      <div className="nrc-a nrc-a3" style={{ padding: '24px 22px 100px' }}>
        {byMeal.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            {/* Plate illustration */}
            <div className="float" style={{ display: 'inline-block', marginBottom: 20 }}>
              <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                <circle cx="40" cy="40" r="36" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
                <circle cx="40" cy="40" r="26" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeDasharray="3 4" />
                <path d="M30 38 Q40 30 50 38 Q40 46 30 38Z" fill="rgba(75,111,255,0.20)" />
                <circle cx="40" cy="38" r="5" fill="rgba(75,111,255,0.28)" />
                <line x1="40" y1="20" x2="40" y2="14" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" />
                <line x1="37" y1="20" x2="37" y2="15" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="43" y1="20" x2="43" y2="15" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M48 14 Q52 16 52 20 Q52 24 48 24" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 8, letterSpacing: -0.5 }}>
              Nothing logged yet
            </div>
            <div style={{ color: MUTED, fontSize: 13, fontWeight: 500, lineHeight: 1.65, maxWidth: 260, margin: '0 auto 24px' }}>
              Tap <strong style={{ color: BLUE }}>+</strong> to log a meal — describe anything in plain English and AI will handle the rest.
            </div>
          </div>
        ) : byMeal.map(({ meal, entries }) => {
          const mealTotal = entries.reduce((s, e) => s + Number(e.calories), 0);
          const mealTarget = mealCalTargets[meal as keyof MealCalTargets] ?? 0;
          const mealPct = mealTarget > 0 ? Math.min(mealTotal / mealTarget, 1) : 0;
          const mealOver = mealTarget > 0 && mealTotal > mealTarget;
          return (
            <div key={meal} style={{ marginBottom: 26 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: mealTarget > 0 ? 6 : 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>{MEAL_ICON[meal] ?? '🍽️'}</span>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2.5, color: MUTED, textTransform: 'uppercase' }}>
                    {MEAL_LABEL[meal as MealType] ?? 'Other'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {mealTarget > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: mealOver ? RED : MUTED }}>
                      / {mealTarget} kcal
                    </div>
                  )}
                  <div style={{ fontSize: 11, fontWeight: 700, color: mealOver ? RED : BLUE }}>
                    {Math.round(mealTotal)} kcal
                  </div>
                </div>
              </div>
              {mealTarget > 0 && (
                <div style={{ height: 2, background: EDGE, borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${mealPct * 100}%`, background: mealOver ? RED : GREEN, borderRadius: 2, transition: 'width 0.4s ease' }} />
                </div>
              )}
              {entries.map((entry) => (
                <FoodCard key={entry.id} entry={entry} onEdit={openEdit} onDelete={handleDelete}
                  onReLog={!isToday ? handleReLog : undefined}
                  reLogLabel={!isToday ? 'Log today' : undefined}
                />
              ))}
              {isToday && entries.length > 0 && (
                savingTemplateMeal === meal ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <input
                      value={templateNameInput}
                      onChange={(e) => setTemplateNameInput(e.target.value)}
                      placeholder="Template name"
                      style={{ ...inp, flex: 1, padding: '8px 12px', fontSize: 13 }}
                    />
                    <button onClick={() => confirmSaveTemplate(meal, entries)} style={{
                      background: GREEN, border: 'none', borderRadius: 8, color: '#000',
                      fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '8px 14px', flexShrink: 0,
                    }}>Save</button>
                    <button onClick={() => setSavingTemplateMeal(null)} style={{
                      background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 8, color: MUTED,
                      fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '8px 12px', flexShrink: 0,
                    }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => handleSaveTemplate(meal, entries)} style={{
                    marginTop: 8, background: 'none', border: `1px dashed ${EDGE}`,
                    borderRadius: 8, color: MUTED, fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', padding: '7px 14px', width: '100%',
                    letterSpacing: 0.5, fontFamily: 'inherit',
                  }}>+ Save as Template</button>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* ── MEAL TARGET EDITOR ── */}
      {isToday && editingMealTargets && (
        <div style={{ padding: '0 22px 16px' }}>
          <div style={{ background: SURF, borderRadius: 16, padding: '16px 16px', border: `1px solid ${EDGE}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: MUTED, textTransform: 'uppercase' }}>Meal Calorie Targets</div>
              <button onClick={() => setEditingMealTargets(false)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(Object.keys(mealCalTargets) as (keyof MealCalTargets)[]).map((k) => (
                <div key={k}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>{MEAL_LABEL[k as MealType] ?? k}</div>
                  <input type="number" value={mealCalTargets[k]} min={0}
                    onChange={(e) => setMealCalTargetsState((prev) => ({ ...prev, [k]: parseInt(e.target.value) || 0 }))}
                    style={{ ...inp, padding: '8px 10px', fontSize: 14 }} />
                </div>
              ))}
            </div>
            <button onClick={() => handleSaveMealCalTargets(mealCalTargets)} style={{
              marginTop: 12, width: '100%', padding: '11px 0', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${BLUE} 0%, ${BLUE2} 100%)`,
              color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>Save Targets</button>
          </div>
        </div>
      )}
      {isToday && !editingMealTargets && logs.length > 0 && (
        <div style={{ padding: '0 22px 8px', textAlign: 'right' }}>
          <button onClick={() => setEditingMealTargets(true)} style={{
            background: 'none', border: 'none', color: MUTED, fontSize: 11,
            fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
          }}>⚙ Meal targets</button>
        </div>
      )}

      {/* ── DIARY NOTE ── */}
      <div style={{ padding: '0 22px 20px' }}>
        <button onClick={() => setNoteExpanded((v) => !v)} style={{
          background: 'none', border: 'none', color: MUTED, fontSize: 11,
          fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
          display: 'flex', alignItems: 'center', gap: 6, padding: 0,
        }}>
          <span style={{ fontSize: 13 }}>{noteExpanded ? '▾' : '▸'}</span>
          {diaryNote ? 'Daily Note ✎' : '+ Add Daily Note'}
        </button>
        {noteExpanded && (
          <textarea
            value={diaryNote}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="How are you feeling? Any notes about today's nutrition…"
            rows={3}
            style={{
              ...inp, marginTop: 8, width: '100%', resize: 'vertical',
              fontSize: 13, lineHeight: 1.6, boxSizing: 'border-box',
            }}
          />
        )}
        {!noteExpanded && diaryNote && (
          <div style={{ marginTop: 6, fontSize: 12, color: MUTED, fontStyle: 'italic', lineHeight: 1.5 }}>
            {diaryNote.slice(0, 120)}{diaryNote.length > 120 ? '…' : ''}
          </div>
        )}
      </div>

      {/* ── FAB ── */}
      {isToday && (
        <button
          onClick={() => { setOpen(true); setMode('ai'); }}
          className="nrc-press fab-pulse"
          style={{
            position: 'fixed', bottom: 84, right: 'max(20px, calc(50vw - 220px))',
            width: 60, height: 60, borderRadius: 30,
            background: `linear-gradient(135deg, ${CYAN} 0%, ${BLUE} 100%)`,
            border: 'none', cursor: 'pointer',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 20px ${BLUE}50, 0 1px 4px rgba(0,0,0,0.15)`,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* ── UNDO TOAST ── */}
      {undoEntry && (
        <div style={{
          position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)',
          background: TEXT, borderRadius: 12, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 4px 20px rgba(10,22,40,0.25)',
          zIndex: 200, maxWidth: 340, width: 'calc(100vw - 40px)',
          animation: 'slideUpCenter 0.3s ease both',
        }}>
          <div style={{ flex: 1, fontSize: 13, color: '#FFFFFF', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Removed "{undoEntry.food_name}"
          </div>
          <button onClick={handleUndo} style={{
            background: BLUE, border: 'none', borderRadius: 8, color: '#fff',
            fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '6px 14px',
            flexShrink: 0,
          }}>Undo</button>
        </div>
      )}

      {/* ── SHEET ── */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,22,40,0.5)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
          <div style={{ background: SURF, borderRadius: '24px 24px 0 0', maxWidth: 480, width: '100%', margin: '0 auto', borderTop: `1px solid ${EDGE}`, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -12px 48px rgba(0,0,0,0.5), 0 -1px 0 rgba(255,255,255,0.07)' }}>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
            </div>

            <div style={{ padding: '16px 22px 44px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: MUTED, textTransform: 'uppercase' }}>
                  {editingId ? 'Edit Fuel' : 'Log Fuel'}
                </div>
                <button onClick={closeSheet} style={{ background: SURF2, border: `1px solid ${EDGE}`, color: MUTED, fontSize: 18, cursor: 'pointer', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>

              {/* Mode tabs */}
              <div style={{ display: 'flex', borderBottom: `2px solid ${EDGE}`, marginBottom: 24, overflowX: 'auto' }}>
                {([['quick', 'Quick'], ['search', 'Search'], ['recipe', 'Recipe'], ['ai', 'AI'], ['photo', 'Photo'], ['manual', 'Manual'], ['suggest', 'Suggest']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => {
                    setMode(m); setAiError(''); setFormError(''); setSuggestResult(null);
                    if (m !== 'search') { setScanActive(false); stopScan(); }
                  }} style={{
                    flexShrink: 0, flex: 1, padding: '10px 0', background: 'none', border: 'none',
                    borderBottom: `2px solid ${mode === m ? BLUE : 'transparent'}`,
                    marginBottom: -2,
                    color: mode === m ? BLUE : MUTED,
                    fontWeight: mode === m ? 800 : 600,
                    fontSize: 11, cursor: 'pointer', transition: 'color 0.15s',
                    fontFamily: 'inherit', letterSpacing: 0.3,
                  }}>{label}</button>
                ))}
              </div>

              {/* QUICK ADD MODE */}
              {mode === 'quick' && (
                <>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 16, lineHeight: 1.6 }}>
                    Log calories fast — food name is optional.
                  </div>

                  <input
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder='Food name (optional, e.g. "Snack")'
                    style={{ ...inp, width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
                  />

                  {/* Big calorie input */}
                  <div style={{
                    background: SURF2, borderRadius: 14, padding: '14px 16px',
                    border: `1px solid ${BLUE}20`, marginBottom: 10, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: BLUE, textTransform: 'uppercase', marginBottom: 8 }}>Calories</div>
                    <input
                      autoFocus
                      type="number"
                      value={quickCal}
                      onChange={(e) => setQuickCal(e.target.value)}
                      placeholder="0"
                      style={{
                        background: 'transparent', border: 'none', outline: 'none',
                        fontSize: 56, fontWeight: 900, letterSpacing: -4, color: BLUE,
                        textAlign: 'center', width: '100%',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}
                    />
                    <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>kcal</div>
                  </div>

                  {/* Optional macros */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {([
                      { label: 'Protein', val: quickPro,  set: setQuickPro,  color: RED    },
                      { label: 'Carbs',   val: quickCarb, set: setQuickCarb, color: CYAN   },
                      { label: 'Fat',     val: quickFat,  set: setQuickFat,  color: PURPLE },
                    ] as const).map(({ label, val, set, color }) => (
                      <div key={label}>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
                        <input
                          type="number"
                          value={val}
                          onChange={(e) => set(e.target.value)}
                          placeholder="0"
                          style={{ ...inp, padding: '9px 10px', fontSize: 16, fontWeight: 700, color: TEXT }}
                        />
                        <div style={{ fontSize: 9, color: MUTED, marginTop: 2, textAlign: 'right' }}>g (opt.)</div>
                      </div>
                    ))}
                  </div>

                  <MealChips form={{ ...form, meal: quickMeal }} setForm={(f) => { const next = typeof f === 'function' ? f({ ...form, meal: quickMeal }) : f; setQuickMeal(next.meal); }} />

                  <button
                    onClick={handleQuickAdd}
                    disabled={submitting || !quickCal.trim() || parseFloat(quickCal) <= 0}
                    className="nrc-press"
                    style={bigBtn(submitting || !quickCal.trim() || parseFloat(quickCal) <= 0, BLUE)}
                  >
                    {submitting ? 'Logging…' : 'Quick Log →'}
                  </button>
                </>
              )}

              {/* RECIPE MODE */}
              {mode === 'recipe' && (
                <>
                  {/* Sub-nav */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                    {(['list', 'build'] as const).map((v) => (
                      <button key={v} onClick={() => setRecipeView(v)} style={{
                        flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${recipeView === v ? BLUE + '60' : EDGE}`,
                        background: recipeView === v ? `${BLUE}14` : SURF2,
                        color: recipeView === v ? BLUE : MUTED,
                        fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                      }}>{v === 'list' ? 'My Recipes' : '+ New Recipe'}</button>
                    ))}
                  </div>

                  {recipeView === 'list' && (
                    recipes.length === 0 ? (
                      <div style={{ textAlign: 'center', color: MUTED, fontSize: 13, padding: '32px 0' }}>
                        No recipes yet — build one with the "New Recipe" tab.
                      </div>
                    ) : recipes.map((recipe) => (
                      <div key={recipe.id} style={{ background: SURF2, borderRadius: 14, padding: '14px 14px', marginBottom: 10, border: `1px solid ${EDGE}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>{recipe.name}</div>
                            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                              {recipe.servings} serving{recipe.servings !== 1 ? 's' : ''} · {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <button onClick={() => { deleteRecipe(recipe.id); setRecipes(getRecipes()); }} style={{
                            background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 16, padding: '0 4px',
                          }}>×</button>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                          {[['Cal', recipe.totalCal, ORANGE], ['Pro', recipe.totalProtein + 'g', BLUE2], ['Carb', recipe.totalCarbs + 'g', GREEN], ['Fat', recipe.totalFat + 'g', PURPLE]].map(([l, v, c]) => (
                            <div key={String(l)} style={{ fontSize: 11, fontWeight: 700, color: String(c) }}>{l}: {v}</div>
                          ))}
                        </div>
                        {loggingRecipeId === recipe.id ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input type="number" value={loggingRecipeServings} min="0.25" step="0.25"
                              onChange={(e) => setLoggingRecipeServings(e.target.value)}
                              placeholder="Servings"
                              style={{ ...inp, flex: 1, padding: '9px 12px', fontSize: 14 }} />
                            <button onClick={() => handleLogRecipe(recipe)} style={{
                              ...bigBtn(submitting, GREEN, 0), padding: '9px 18px', borderRadius: 10, fontSize: 13, flexShrink: 0,
                            }}>Log</button>
                            <button onClick={() => setLoggingRecipeId(null)} style={{
                              background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: MUTED,
                              fontWeight: 700, fontSize: 12, cursor: 'pointer', padding: '9px 14px', flexShrink: 0,
                            }}>Cancel</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <div style={{ fontSize: 11, color: MUTED, flex: 1, alignSelf: 'center' }}>
                              per serving: {Math.round(recipe.totalCal / recipe.servings)} kcal
                            </div>
                            <button onClick={() => { setLoggingRecipeId(recipe.id); setLoggingRecipeServings('1'); }} style={{
                              background: `${BLUE}14`, border: `1px solid ${BLUE}40`, borderRadius: 10,
                              color: BLUE, fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '8px 16px',
                            }}>Log →</button>
                          </div>
                        )}
                      </div>
                    ))
                  )}

                  {recipeView === 'build' && (
                    <>
                      <input value={recipeBuilderName} onChange={(e) => setRecipeBuilderName(e.target.value)}
                        placeholder="Recipe name (e.g. Post-workout bowl)"
                        style={{ ...inp, marginBottom: 10 }} />
                      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>SERVINGS MADE</div>
                          <input type="number" value={recipeBuilderServings} min="1"
                            onChange={(e) => setRecipeBuilderServings(e.target.value)}
                            style={{ ...inp, padding: '10px 12px' }} />
                        </div>
                        {recipeIngredients.length > 0 && (
                          <div style={{ flex: 2, background: SURF2, borderRadius: 12, padding: '10px 14px', border: `1px solid ${EDGE}` }}>
                            <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>TOTAL (all servings)</div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              {[
                                [recipeIngredients.reduce((s, i) => s + i.calories, 0) + ' kcal', ORANGE],
                                [recipeIngredients.reduce((s, i) => s + i.protein, 0).toFixed(1) + 'g P', BLUE2],
                                [recipeIngredients.reduce((s, i) => s + i.carbs, 0).toFixed(1) + 'g C', GREEN],
                                [recipeIngredients.reduce((s, i) => s + i.fat, 0).toFixed(1) + 'g F', PURPLE],
                              ].map(([v, c]) => (
                                <div key={String(v)} style={{ fontSize: 12, fontWeight: 800, color: String(c) }}>{v}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Ingredient search */}
                      <div style={{ position: 'relative', marginBottom: 10 }}>
                        <input value={recipeSearch} onChange={(e) => setRecipeSearch(e.target.value)}
                          placeholder="Search ingredient to add…"
                          style={{ ...inp, paddingRight: recipeSearchLoading ? 40 : 14 }} />
                        {recipeSearchLoading && (
                          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', border: `2px solid ${BLUE}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                        )}
                      </div>
                      {recipeResults.length > 0 && (
                        <div style={{ background: SURF2, borderRadius: 12, marginBottom: 12, overflow: 'hidden', border: `1px solid ${EDGE}` }}>
                          {recipeResults.map((p, i) => (
                            <button key={i} onClick={() => addRecipeIngredient(p)} style={{
                              width: '100%', textAlign: 'left', background: 'none', border: 'none',
                              borderBottom: i < recipeResults.length - 1 ? `1px solid ${EDGE}` : 'none',
                              padding: '10px 14px', cursor: 'pointer',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{p.name}</div>
                                {p.brand && <div style={{ fontSize: 11, color: MUTED }}>{p.brand}</div>}
                              </div>
                              <div style={{ fontSize: 11, color: BLUE, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                                {p.caloriesPer100g} kcal/100g
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Ingredient list */}
                      {recipeIngredients.map((ing, idx) => (
                        <div key={idx} style={{ background: SURF2, borderRadius: 12, padding: '10px 12px', marginBottom: 8, border: `1px solid ${EDGE}`, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.food_name}</div>
                            <div style={{ fontSize: 11, color: MUTED }}>{ing.calories} kcal · {ing.protein}g P · {ing.carbs}g C · {ing.fat}g F</div>
                          </div>
                          <input type="number" value={ing.amountG} min={1}
                            onChange={(e) => updateRecipeIngredientAmount(idx, parseFloat(e.target.value) || 1)}
                            style={{ ...inp, width: 64, padding: '6px 8px', fontSize: 13, textAlign: 'center' }} />
                          <div style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>g</div>
                          <button onClick={() => setRecipeIngredients((prev) => prev.filter((_, i) => i !== idx))} style={{
                            background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 16, flexShrink: 0,
                          }}>×</button>
                        </div>
                      ))}

                      <button onClick={handleSaveRecipe}
                        disabled={!recipeBuilderName.trim() || recipeIngredients.length === 0}
                        style={bigBtn(!recipeBuilderName.trim() || recipeIngredients.length === 0, GREEN)}>
                        Save Recipe
                      </button>
                    </>
                  )}
                </>
              )}

              {/* SEARCH MODE */}
              {mode === 'search' && !scanActive && !barcodeLoading && (
                <>
                  {/* Search bar + barcode button */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                      <input
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search food database (3M+ foods)…"
                        style={{ ...inp, width: '100%', paddingRight: 36, boxSizing: 'border-box' }}
                      />
                      {searchLoading && (
                        <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED, fontSize: 14 }}>···</div>
                      )}
                      {searchQuery && !searchLoading && (
                        <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer',
                        }}>×</button>
                      )}
                    </div>
                    <button
                      onClick={() => startScan()}
                      title="Scan barcode"
                      style={{
                        background: `${BLUE}0C`, border: `1px solid ${BLUE}25`,
                        borderRadius: 12, color: BLUE, width: 50, flexShrink: 0,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4"/>
                        <line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/>
                        <line x1="13" y1="8" x2="13" y2="16"/><line x1="16" y1="8" x2="16" y2="11"/>
                        <line x1="16" y1="13" x2="16" y2="16"/>
                      </svg>
                    </button>
                  </div>

                  {searchError && <ErrBox msg={searchError} />}

                  {/* Search results */}
                  {searchQuery && searchResults.length > 0 && (
                    <div style={{ background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: 'hidden', marginBottom: 16 }}>
                      <div style={{ padding: '10px 14px 6px', fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
                        {searchResults.length} results · Open Food Facts
                      </div>
                      {searchResults.map((product, i) => (
                        <button key={i} onClick={() => applyOFFProduct(product)} style={{
                          width: '100%', textAlign: 'left', padding: '10px 14px',
                          background: 'none', border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${EDGE}`,
                          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                          fontFamily: 'inherit',
                        }}>
                          {product.imageUrl && (
                            <img src={product.imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          )}
                          {!product.imageUrl && (
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${BLUE}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontSize: 16 }}>🥫</span>
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {product.name}
                            </div>
                            <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                              {product.brand && `${product.brand} · `}per 100g: {product.caloriesPer100g} kcal · P{Math.round(product.proteinPer100g)}g · C{Math.round(product.carbsPer100g)}g · F{Math.round(product.fatPer100g)}g
                            </div>
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 900, color: BLUE, flexShrink: 0 }}>{product.caloriesPer100g}</div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Recents + Favorites + Templates (when not searching) */}
                  {!searchQuery && (
                    <>
                      {(recents.length > 0 || favorites.length > 0 || templates.length > 0) && (
                        <>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                            {(['recent', 'fav', 'templates'] as const).map((t) => (
                              <button key={t} onClick={() => setFavTab(t)} style={{
                                flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer',
                                background: favTab === t ? `${BLUE}08` : SURF2,
                                border: `1px solid ${favTab === t ? BLUE : EDGE}`,
                                color: favTab === t ? BLUE : MUTED,
                                fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
                              }}>
                                {t === 'recent' ? `Recent (${recents.length})` : t === 'fav' ? `Favourites (${favorites.length})` : `Templates (${templates.length})`}
                              </button>
                            ))}
                          </div>

                          {(() => {
                            if (favTab === 'templates') {
                              if (templates.length === 0) return (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: MUTED, fontSize: 13, fontWeight: 600 }}>
                                  No templates yet — tap "Save as Template" on a meal below
                                </div>
                              );
                              return (
                                <div style={{ background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
                                  {templates.map((t, i) => (
                                    <div key={t.id} style={{
                                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                                      borderTop: i === 0 ? 'none' : `1px solid ${EDGE}`,
                                    }}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                                        <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                                          {t.foods.length} item{t.foods.length !== 1 ? 's' : ''} · {t.totalCal} kcal · {MEAL_LABEL[t.mealType as MealType] ?? t.mealType}
                                        </div>
                                      </div>
                                      <button onClick={() => { deleteTemplate(t.id); setTemplates(getTemplates()); }} style={{
                                        background: 'none', border: 'none', color: MUTED, fontSize: 16, cursor: 'pointer', padding: '0 4px', flexShrink: 0,
                                      }}>×</button>
                                      <button
                                        onClick={() => handleLogTemplate(t)}
                                        disabled={loggingTemplateId === t.id}
                                        style={{
                                          background: loggingTemplateId === t.id ? SURF2 : `${GREEN}12`,
                                          border: `1px solid ${loggingTemplateId === t.id ? EDGE : GREEN + '30'}`,
                                          borderRadius: 8, color: loggingTemplateId === t.id ? MUTED : GREEN,
                                          fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '5px 12px',
                                          flexShrink: 0, fontFamily: 'inherit', whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {loggingTemplateId === t.id ? '···' : 'Log All'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              );
                            }

                            const list = favTab === 'recent' ? recents : favorites;
                            if (list.length === 0) return (
                              <div style={{ textAlign: 'center', padding: '20px 0', color: MUTED, fontSize: 13, fontWeight: 600 }}>
                                {favTab === 'recent' ? 'No recent foods yet' : 'No favourites yet — tap ★ on a recent food'}
                              </div>
                            );
                            return (
                              <div style={{ background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
                                {list.map((food, i) => {
                                  const isFav = favoriteStates[food.food_name] ?? isFavorite(food.food_name);
                                  return (
                                    <div key={i} style={{
                                      display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                                      borderTop: i === 0 ? 'none' : `1px solid ${EDGE}`,
                                    }}>
                                      <button onClick={() => applySavedFood(food)} style={{
                                        flex: 1, textAlign: 'left', background: 'none', border: 'none',
                                        cursor: 'pointer', fontFamily: 'inherit', minWidth: 0,
                                      }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {food.food_name}
                                        </div>
                                        <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                                          {Math.round(food.calories)} kcal · P{Math.round(food.protein)}g · C{Math.round(food.carbs)}g · F{Math.round(food.fat)}g
                                          {food.weight_grams ? ` · ${food.weight_grams}g` : ''}
                                        </div>
                                      </button>
                                      <button onClick={() => handleToggleFavorite(food)} style={{
                                        background: 'none', border: 'none', cursor: 'pointer',
                                        color: isFav ? '#FFC107' : MUTED, fontSize: 18, padding: '0 4px', flexShrink: 0,
                                      }}>★</button>
                                      <button onClick={() => applySavedFood(food)} style={{
                                        background: `${BLUE}0C`, border: `1px solid ${BLUE}25`,
                                        borderRadius: 8, color: BLUE, fontWeight: 800,
                                        fontSize: 13, cursor: 'pointer', padding: '5px 12px',
                                        flexShrink: 0, fontFamily: 'inherit',
                                      }}>+</button>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {recents.length === 0 && favorites.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '32px 20px', color: MUTED }}>
                          <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 6 }}>Search millions of foods</div>
                          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                            Type a food name above, or tap the barcode icon to scan a product.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* BARCODE SCANNER */}
              {mode === 'search' && (scanActive || barcodeLoading) && (
                <div>
                  {barcodeLoading && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: 14, fontWeight: 600 }}>
                      Looking up product…
                    </div>
                  )}
                  {scanActive && (
                    <div style={{ position: 'relative', marginBottom: 16 }}>
                      <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 14, display: 'block', background: '#000' }} />
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 14,
                        border: `2px solid ${BLUE}`, pointerEvents: 'none',
                        boxShadow: `inset 0 0 0 2000px rgba(0,0,0,0.3)`,
                      }}>
                        <div style={{
                          position: 'absolute', top: '50%', left: '10%', right: '10%',
                          height: 2, background: `${BLUE}90`, transform: 'translateY(-50%)',
                          boxShadow: `0 0 8px ${BLUE}`,
                        }} />
                      </div>
                      <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, fontWeight: 700, color: MUTED }}>
                        Point camera at barcode
                      </div>
                      <button onClick={() => stopScan()} style={{
                        width: '100%', padding: 12, borderRadius: 12, border: `1px solid ${EDGE}`,
                        background: SURF2, color: MUTED, fontWeight: 700, fontSize: 13,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>Cancel Scan</button>
                    </div>
                  )}
                  {scanError && <ErrBox msg={scanError} />}
                  {scanSupported === false && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: MUTED, marginBottom: 10, lineHeight: 1.6 }}>
                        Live scanning isn't supported in this browser. Enter the barcode number manually:
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={manualBarcode}
                          onChange={(e) => setManualBarcode(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && manualBarcode.trim()) handleBarcodeFound(manualBarcode.trim()); }}
                          placeholder="Barcode number (e.g. 5000112637922)"
                          style={{ ...inp, flex: 1 }}
                          type="text"
                          inputMode="numeric"
                        />
                        <button onClick={() => manualBarcode.trim() && handleBarcodeFound(manualBarcode.trim())} style={{
                          background: BLUE, border: 'none', borderRadius: 12, color: '#fff',
                          fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: '0 18px',
                          fontFamily: 'inherit',
                        }}>Go</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* AI MODE */}
              {mode === 'ai' && (
                <>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.6 }}>
                    Describe anything — single or multi-ingredient: "2 eggs, yogurt, grapes"
                  </div>
                  <textarea autoFocus value={aiQuery}
                    onChange={(e) => { setAiQuery(e.target.value); setAiError(''); }}
                    placeholder="What did you eat?" rows={3}
                    style={{ ...inp, width: '100%', resize: 'none', marginBottom: 12, lineHeight: 1.6 }} />
                  <MealChips form={form} setForm={setForm} />
                  {aiError && <ErrBox msg={aiError} />}
                  <button onClick={handleAISmart} disabled={aiLoading} className="nrc-press" style={bigBtn(aiLoading, BLUE)}>
                    {aiLoading ? 'Analysing…' : 'Analyse with AI →'}
                  </button>
                </>
              )}

              {/* PHOTO MODE */}
              {mode === 'photo' && (
                <>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 16, lineHeight: 1.6 }}>
                    Take a photo — AI estimates the calories and macros.
                  </div>
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 12, padding: '32px 20px', borderRadius: 16,
                    border: `2px dashed ${aiLoading ? EDGE : BLUE}`,
                    background: aiLoading ? SURF2 : SURF,
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                  }}>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={aiLoading}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhotoAnalyze(file); e.target.value = ''; }} />
                    <div style={{ fontSize: 32, lineHeight: 1, color: aiLoading ? MUTED : BLUE, fontWeight: 900 }}>
                      {aiLoading ? '···' : '↑'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: aiLoading ? MUTED : BLUE }}>
                      {aiLoading ? 'Analysing photo…' : 'Tap to take or upload photo'}
                    </div>
                    <div style={{ fontSize: 11, color: MUTED }}>Camera · Gallery · Screenshot</div>
                  </label>
                  <MealChips form={form} setForm={setForm} />
                  {aiError && <ErrBox msg={aiError} />}
                </>
              )}

              {/* SUGGEST MODE */}
              {mode === 'suggest' && !suggestResult && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>What's the timing?</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                    {SUGGEST_CTX.map((v) => {
                      const active = suggestCtx === v;
                      return (
                        <button key={v} onClick={() => setSuggestCtx(v)} style={{
                          padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                          background: active ? `${BLUE}08` : SURF2,
                          border: `1px solid ${active ? BLUE : EDGE}`,
                          borderLeft: active ? `3px solid ${BLUE}` : `1px solid ${EDGE}`,
                          color: active ? BLUE : MUTED, fontWeight: 700, fontSize: 12,
                          fontFamily: 'inherit',
                        }}>{CTX_LABEL[v]}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Size</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                    {([['big','Full Meal'],['small','Light']] as const).map(([v, label]) => (
                      <button key={v} onClick={() => setSuggestSize(v)} style={{
                        flex: 1, padding: 12, borderRadius: 12, cursor: 'pointer',
                        background: suggestSize === v ? `${BLUE}08` : SURF2,
                        border: `1px solid ${suggestSize === v ? BLUE : EDGE}`,
                        color: suggestSize === v ? BLUE : MUTED, fontWeight: 700, fontSize: 12,
                        fontFamily: 'inherit',
                      }}>{label}</button>
                    ))}
                  </div>
                  {weather && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, background: SURF2, borderRadius: 10, padding: '8px 12px', border: `1px solid ${EDGE}` }}>
                      <span style={{ fontSize: 16 }}>
                        {weather.tempC >= 32 ? '🌡' : weather.tempC >= 22 ? '☀️' : weather.tempC >= 12 ? '🌤' : '❄️'}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>{Math.round(weather.tempC)}°C · {weather.description}</span>
                      <span style={{ fontSize: 10, color: BLUE, fontWeight: 700, marginLeft: 'auto' }}>Weather factored in</span>
                    </div>
                  )}
                  {aiError && <ErrBox msg={aiError} />}
                  <button onClick={handleSuggest} disabled={aiLoading} className="nrc-press" style={bigBtn(aiLoading, BLUE)}>
                    {aiLoading ? 'Generating meal…' : 'Suggest a meal →'}
                  </button>
                </>
              )}

              {/* SUGGEST RESULT */}
              {mode === 'suggest' && suggestResult && (
                <>
                  {/* Meal header */}
                  <div style={{ background: SURF2, borderRadius: 14, padding: '14px 16px', marginBottom: 16, border: `1px solid ${EDGE}` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>
                      {CTX_LABEL[suggestCtx]} · {suggestSize === 'big' ? 'Full Meal' : 'Light'}{weather ? ` · ${Math.round(weather.tempC)}°C` : ''}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, color: TEXT, marginBottom: 10 }}>{suggestResult.food_name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Calories', val: Math.round(suggestResult.calories), unit: 'kcal', color: BLUE },
                        { label: 'Protein',  val: Math.round(suggestResult.protein),  unit: 'g',    color: GREEN },
                        { label: 'Carbs',    val: Math.round(suggestResult.carbs),    unit: 'g',    color: ORANGE },
                        { label: 'Fat',      val: Math.round(suggestResult.fat),      unit: 'g',    color: PURPLE },
                      ].map(({ label, val, unit, color }) => (
                        <div key={label} style={{ textAlign: 'center', background: SURF, borderRadius: 10, padding: '8px 4px', border: `1px solid ${EDGE}` }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: color, letterSpacing: -0.5 }}>{val}</div>
                          <div style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>{unit}</div>
                          <div style={{ fontSize: 8, color: MUTED, letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ingredient list */}
                  {suggestResult.ingredients && suggestResult.ingredients.length > 0 && (
                    <div style={{ background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: 'hidden', marginBottom: 16 }}>
                      <div style={{ padding: '12px 16px 0', fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>Ingredients</div>
                      {suggestResult.ingredients.map((item, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                          borderTop: i === 0 ? 'none' : `1px solid ${EDGE}`,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{item.amount}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: BLUE }}>{Math.round(item.calories)}</div>
                            <div style={{ fontSize: 9, color: MUTED }}>kcal</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                            <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>P {Math.round(item.protein)}g</span>
                            <span style={{ fontSize: 9, color: ORANGE, fontWeight: 700 }}>C {Math.round(item.carbs)}g</span>
                            <span style={{ fontSize: 9, color: PURPLE, fontWeight: 700 }}>F {Math.round(item.fat)}g</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiError && <ErrBox msg={aiError} />}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setSuggestResult(null)} className="nrc-press" style={{
                      flex: 1, padding: 15, borderRadius: 14, border: `1px solid ${EDGE}`,
                      background: 'none', color: MUTED, fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>← Back</button>
                    <button onClick={handleLogSuggestedMeal} disabled={loggingAll} className="nrc-press" style={bigBtn(loggingAll, BLUE, 2)}>
                      {loggingAll ? 'Logging…' : `Log ${suggestResult.ingredients?.length ?? 1} items →`}
                    </button>
                  </div>
                </>
              )}

              {/* MANUAL MODE */}
              {mode === 'manual' && (
                <>
                  {estimate && (
                    <div style={{ marginBottom: 16, background: SURF2, borderRadius: 12, padding: '12px 14px', border: `1px solid ${EDGE}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {estimate.imageUrl && <img src={estimate.imageUrl} alt={estimate.food_name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ color: TEXT, fontSize: 13, fontWeight: 700 }}>{estimate.food_name}</div>
                          <div style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>AI estimate · {estimate.estimated_weight_grams}g</div>
                        </div>
                        <div style={{ background: `${CONF_COLOR[estimate.confidence]}12`, border: `1px solid ${CONF_COLOR[estimate.confidence]}30`, borderRadius: 8, padding: '3px 9px', flexShrink: 0 }}>
                          <span style={{ color: CONF_COLOR[estimate.confidence], fontSize: 10, fontWeight: 800 }}>{estimate.confidence.toUpperCase()}</span>
                        </div>
                      </div>
                      {editableIngredients && editableIngredients.length > 1 && (
                        <IngredientBreakdown ingredients={editableIngredients} onEdit={handleIngredientEdit} />
                      )}
                    </div>
                  )}

                  <input style={{ ...inp, width: '100%', marginBottom: 10 }}
                    value={form.name} onChange={(e) => patch({ name: e.target.value })}
                    placeholder="Food name" autoFocus={!estimate} />

                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', background: SURF2, borderRadius: 10, border: `1px solid ${EDGE}`, overflow: 'hidden', flexShrink: 0 }}>
                      {([false, true] as const).map((isText) => (
                        <button key={String(isText)} onClick={() => patch({ amountIsText: isText, amount: '' })} style={{
                          padding: '0 14px', height: '100%',
                          background: form.amountIsText === isText ? BLUE : 'transparent',
                          border: 'none',
                          color: form.amountIsText === isText ? '#FFFFFF' : MUTED,
                          fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                          fontFamily: 'inherit',
                        }}>{isText ? 'qty' : 'g'}</button>
                      ))}
                    </div>
                    <input style={{ ...inp, flex: 1 }} type={form.amountIsText ? 'text' : 'number'}
                      value={form.amount} onChange={(e) => patch({ amount: e.target.value })}
                      placeholder={form.amountIsText ? 'e.g. 2 eggs' : 'Weight in grams'} />
                    <button onClick={handleWeightAI} disabled={aiLoading} className="nrc-press" style={{
                      background: `${BLUE}0C`, border: `1px solid ${BLUE}25`, borderRadius: 10,
                      color: aiLoading ? MUTED : BLUE, fontWeight: 800, fontSize: 11,
                      cursor: aiLoading ? 'not-allowed' : 'pointer',
                      padding: '0 14px', whiteSpace: 'nowrap', fontFamily: 'inherit', letterSpacing: 0.5,
                    }}>{aiLoading ? '···' : 'AI'}</button>
                  </div>

                  {aiError && <ErrBox msg={aiError} />}

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Macros</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <MacroInp label="Protein" color={GREEN}  value={form.protein} onChange={(v) => patch({ protein: v })} />
                      <MacroInp label="Carbs"   color={ORANGE} value={form.carbs}   onChange={(v) => patch({ carbs: v })} />
                      <MacroInp label="Fat"     color={PURPLE} value={form.fat}     onChange={(v) => patch({ fat: v })} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 12 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', flexShrink: 0 }}>Kcal</div>
                      <input type="number" value={form.calories}
                        onChange={(e) => { setForm((f) => ({ ...f, calories: e.target.value })); setFormError(''); }}
                        style={{ ...inp, flex: 1, padding: '8px 10px', fontSize: 22, fontWeight: 900, color: BLUE, letterSpacing: -0.5, background: 'transparent', border: 'none' }}
                        placeholder="—" />
                      <div style={{ fontSize: 9, color: MUTED, flexShrink: 0 }}>auto</div>
                    </div>
                    {(() => {
                      const p = parseFloat(form.protein), c = parseFloat(form.carbs), fa = parseFloat(form.fat);
                      const entered = parseFloat(form.calories);
                      if (isNaN(p) || isNaN(c) || isNaN(fa)) return null;
                      const comp = calcCal(p, c, fa);
                      if (!isNaN(entered) && entered > 0 && Math.abs(comp - entered) / entered > 0.12)
                        return <div style={{ fontSize: 11, color: ORANGE, marginTop: 8, fontWeight: 600 }}>Macros compute to ~{Math.round(comp)} kcal</div>;
                      return null;
                    })()}
                  </div>

                  <MealChips form={form} setForm={setForm} />
                  {formError && <ErrBox msg={formError} />}

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button onClick={closeSheet} className="nrc-press" style={{ flex: 1, padding: 15, borderRadius: 14, border: `1px solid ${EDGE}`, background: 'none', color: MUTED, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={handleAdd} disabled={submitting} className="nrc-press" style={bigBtn(submitting, BLUE, 2)}>
                      {submitting ? 'Saving…' : editingId ? 'Save Changes →' : 'Log Fuel →'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getDominantColor(protein: number, carbs: number, fat: number): string {
  const pC = protein * 4, cC = carbs * 4, fC = fat * 9;
  if (pC >= cC && pC >= fC) return RED;
  if (cC >= pC && cC >= fC) return CYAN;
  return PURPLE;
}

function FoodCard({ entry, onEdit, onDelete, onReLog, reLogLabel }: {
  entry: FoodLog;
  onEdit: (e: FoodLog) => void;
  onDelete: (e: FoodLog) => void;
  onReLog?: (e: FoodLog) => void;
  reLogLabel?: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const hasIngredients = entry.ingredients && entry.ingredients.length > 1;
  const accentColor = getDominantColor(Number(entry.protein), Number(entry.carbs), Number(entry.fat));
  return (
    <div className="card-lift" style={{
      background: `linear-gradient(135deg, ${accentColor}18 0%, ${SURF} 50%)`,
      borderRadius: 18, marginBottom: 10,
      border: `1px solid ${accentColor}18`, overflow: 'hidden', boxShadow: CARD_SHADOW,
      borderLeft: `3px solid ${accentColor}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px 12px' }}>
        {entry.image_url && (
          <img src={entry.image_url} alt={entry.food_name} style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: `1px solid ${EDGE}` }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 }}>
            {entry.food_name}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ background: `${RED}10`,    border: `1px solid ${RED}20`,    borderRadius: 6, padding: '2px 7px', fontSize: 10, color: RED,    fontWeight: 700 }}>
              P {Math.round(Number(entry.protein))}g
            </span>
            <span style={{ background: `${CYAN}10`,   border: `1px solid ${CYAN}20`,   borderRadius: 6, padding: '2px 7px', fontSize: 10, color: CYAN,   fontWeight: 700 }}>
              C {Math.round(Number(entry.carbs))}g
            </span>
            <span style={{ background: `${PURPLE}10`, border: `1px solid ${PURPLE}20`, borderRadius: 6, padding: '2px 7px', fontSize: 10, color: PURPLE, fontWeight: 700 }}>
              F {Math.round(Number(entry.fat))}g
            </span>
            {entry.weight_grams && (
              <span style={{ background: SURF2, borderRadius: 6, padding: '2px 7px', fontSize: 10, color: MUTED, fontWeight: 600 }}>
                {entry.weight_grams}g
              </span>
            )}
            {hasIngredients && (
              <span style={{ background: `${BLUE}08`, borderRadius: 6, padding: '2px 7px', fontSize: 10, color: BLUE, fontWeight: 600 }}>
                {entry.ingredients!.length} items
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: BLUE, letterSpacing: -2, lineHeight: 1 }}>
            {Math.round(Number(entry.calories))}
          </div>
          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>KCAL</div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: `1px solid ${EDGE}` }}>
        <button onClick={() => onEdit(entry)} style={{
          flex: 1, padding: '9px 0', background: 'none', border: 'none',
          color: BLUE, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          borderRight: `1px solid ${EDGE}`, letterSpacing: 0.3,
        }}>Edit</button>
        <button onClick={() => onDelete(entry)} style={{
          flex: 1, padding: '9px 0', background: 'none', border: 'none',
          color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
          borderRight: `1px solid ${EDGE}`,
        }}>Remove</button>
        {onReLog ? (
          <button onClick={() => onReLog(entry)} className="nrc-press" style={{
            flex: 1, padding: '9px 0', background: 'none', border: 'none',
            color: GREEN, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
            borderRight: `1px solid ${EDGE}`,
          }}>{reLogLabel ?? 'Again'}</button>
        ) : null}
        <button onClick={() => setShowBreakdown((v) => !v)} style={{
          flex: onReLog ? undefined : 1, padding: '9px 12px', background: 'none', border: 'none',
          color: showBreakdown ? BLUE : MUTED, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
        }}>Info {showBreakdown ? '▲' : '▼'}</button>
      </div>
      {showBreakdown && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${EDGE}`, background: SURF2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Protein', val: Math.round(Number(entry.protein)), unit: 'g', color: RED    },
              { label: 'Carbs',   val: Math.round(Number(entry.carbs)),   unit: 'g', color: CYAN   },
              { label: 'Fat',     val: Math.round(Number(entry.fat)),     unit: 'g', color: PURPLE },
            ].map(({ label, val, unit, color }) => (
              <div key={label} style={{ textAlign: 'center', background: SURF, borderRadius: 10, padding: '8px 4px', border: `1px solid ${EDGE}` }}>
                <div style={{ fontSize: 18, fontWeight: 900, color, letterSpacing: -0.5 }}>{val}{unit}</div>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
          {/* Macro calorie split */}
          {(() => {
            const p = Number(entry.protein), c = Number(entry.carbs), f = Number(entry.fat);
            const tot = p * 4 + c * 4 + f * 9 || 1;
            const pP = Math.round(p * 4 / tot * 100);
            const cP = Math.round(c * 4 / tot * 100);
            const fP = 100 - pP - cP;
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 5 }}>
                  <div style={{ width: `${pP}%`, background: RED    }} />
                  <div style={{ width: `${cP}%`, background: CYAN   }} />
                  <div style={{ width: `${fP}%`, background: PURPLE }} />
                </div>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: RED,    fontWeight: 700 }}>P {pP}%</span>
                  <span style={{ fontSize: 10, color: CYAN,   fontWeight: 700 }}>C {cP}%</span>
                  <span style={{ fontSize: 10, color: PURPLE, fontWeight: 700 }}>F {fP}%</span>
                </div>
              </div>
            );
          })()}
          {entry.weight_grams && (
            <div style={{ marginTop: 8, fontSize: 11, color: MUTED, textAlign: 'center' }}>
              Portion: {entry.weight_grams}g · {Math.round(Number(entry.calories) / entry.weight_grams * 100)} kcal/100g
            </div>
          )}
          {hasIngredients && (() => {
            const totalCal = entry.ingredients!.reduce((s, i) => s + i.calories, 0) || 1;
            return (
              <div style={{ marginTop: 12, borderTop: `1px solid ${EDGE}`, paddingTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Breakdown</div>
                {entry.ingredients!.map((ing, i) => {
                  const pct = Math.round((ing.calories / totalCal) * 100);
                  return (
                    <div key={i} style={{ marginBottom: i < entry.ingredients!.length - 1 ? 12 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ing.name}</div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{ing.amount}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                          <div style={{ fontSize: 15, fontWeight: 900, color: BLUE, letterSpacing: -0.5 }}>{Math.round(ing.calories)} <span style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>kcal</span></div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>{pct}% of meal</div>
                        </div>
                      </div>
                      {/* Calorie bar */}
                      <div style={{ height: 4, background: SURF2, borderRadius: 2, marginBottom: 4 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: BLUE, borderRadius: 2, opacity: 0.7 }} />
                      </div>
                      {/* Macro row */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 9, color: GREEN,  fontWeight: 700 }}>P {Math.round(ing.protein)}g</span>
                        <span style={{ fontSize: 9, color: ORANGE, fontWeight: 700 }}>C {Math.round(ing.carbs)}g</span>
                        <span style={{ fontSize: 9, color: PURPLE, fontWeight: 700 }}>F {Math.round(ing.fat)}g</span>
                      </div>
                      {i < entry.ingredients!.length - 1 && <div style={{ marginTop: 10, borderBottom: `1px solid ${EDGE}` }} />}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function MacroInp({ label, color, value, onChange }: { label: string; color: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: color, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0"
        style={{ width: '100%', background: SURF2, border: `1px solid ${color}30`, borderRadius: 10, color: TEXT, fontSize: 18, fontWeight: 700, padding: '10px 10px', outline: 'none', fontFamily: 'inherit' }} />
      <div style={{ fontSize: 9, color: MUTED, marginTop: 3, textAlign: 'right' }}>g</div>
    </div>
  );
}

function MealChips({ form, setForm }: { form: Form; setForm: React.Dispatch<React.SetStateAction<Form>> }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
      {MEAL_TYPES.map((m) => (
        <button key={m} onClick={() => setForm((f) => ({ ...f, meal: m }))} className="nrc-press" style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
          background: form.meal === m ? BLUE : SURF2,
          border: `1px solid ${form.meal === m ? BLUE : EDGE}`,
          color: form.meal === m ? '#fff' : MUTED, fontWeight: 700, fontSize: 11,
          fontFamily: 'inherit',
        }}>{MEAL_LABEL[m]}</button>
      ))}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ color: RED, fontSize: 12, marginBottom: 12, padding: '10px 13px', background: 'rgba(198,40,40,0.06)', borderRadius: 10, fontWeight: 600, border: '1px solid rgba(198,40,40,0.18)', lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

function bigBtn(disabled: boolean, color: string, flex?: number): React.CSSProperties {
  return {
    ...(flex ? { flex } : { width: '100%' }),
    padding: '15px 0', borderRadius: 14, border: 'none',
    background: disabled ? SURF2 : color,
    color: disabled ? MUTED : '#fff',
    fontWeight: 800, fontSize: 15, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : `0 4px 20px ${color}40`,
  };
}
