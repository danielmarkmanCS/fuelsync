import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { getLogs, addLog, deleteLog, softDeleteLog, unremoveLog, estimateByWeight, estimateByDescription, analyzeByImage, suggestMeal, clearPullCache, patchLogImage } from '../api/localFood';
import type { FoodLog, AIEstimate, IngredientItem } from '../api/localFood';
import NutritionGradeCard from '../components/NutritionGradeCard';
import type { DiaryCompletion } from '../lib/db';
import { useNutrition } from '../hooks/useNutrition';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { useAppStore } from '../store/appStore';
import { playFoodLogSound } from '../utils/sounds';
import { searchFood, lookupBarcode } from '../api/openFoodFacts';
import type { OFFProduct } from '../api/openFoodFacts';
import { getRecentFoods, getFavoriteFoods, addRecentFood, toggleFavorite, isFavorite } from '../lib/recentFoods';
import type { SavedFood } from '../lib/recentFoods';
import { getTemplates, saveTemplate, deleteTemplate } from '../lib/mealTemplates';
import type { MealTemplate } from '../lib/mealTemplates';
import { getRecipes, saveRecipe, deleteRecipe } from '../lib/recipes';
import type { Recipe, RecipeIngredient } from '../lib/recipes';
import { getMealCalTargets, setMealCalTargets } from '../lib/mealCalTargets';
import type { MealCalTargets } from '../lib/mealCalTargets';
import { db } from '../lib/db';

const BG      = 'var(--bg)';
const SURF    = 'var(--surf)';
const SURF2   = 'var(--surf2)';
const EDGE    = 'var(--edge)';
const TEXT    = 'var(--text)';
const MUTED   = 'var(--muted)';
const MUTED2  = 'var(--muted2)';
const GREEN      = '#22C55E';   // carbs
const ORANGE     = '#2F81F7';   // accent blue (hex so template-literal opacity suffixes work)
const YELLOW     = '#22C55E';   // carbs (alias)
const PROT       = '#38BDF8';   // protein — blue
const RED        = '#EF4444';
const FAT_CLR    = '#F59E0B';   // fat — amber
const CAL_CLR    = 'var(--accent)'; // blue calorie numbers, adapts to dark/light mode
const CARD_SHADOW = 'var(--shadow-md)';

const MEAL_TYPES = ['breakfast', 'pre_workout', 'lunch', 'post_workout', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack',
};
const MEAL_SHORT: Record<string, string> = {
  breakfast: 'Bfast', pre_workout: 'Pre-WO', lunch: 'Lunch',
  post_workout: 'Post-WO', dinner: 'Dinner', snack: 'Snack', other: 'Other',
};

const MEAL_COLOR: Record<string, string> = {
  breakfast: ORANGE, pre_workout: ORANGE, lunch: '#38BDF8', post_workout: '#38BDF8', dinner: '#A0A0A0', snack: '#FF4444', other: '#444444',
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
  fontFamily: 'inherit', fontWeight: 700,
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
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{item.amount}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: CAL_CLR }}>{Math.round(item.calories)}</div>
              <div style={{ fontSize: 9, color: MUTED, letterSpacing: 0.5 }}>kcal</div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginLeft: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 9, color: PROT,    fontWeight: 700 }}>P{Math.round(item.protein)}</span>
              <span style={{ fontSize: 9, color: YELLOW,  fontWeight: 700 }}>C{Math.round(item.carbs)}</span>
              <span style={{ fontSize: 9, color: FAT_CLR, fontWeight: 700 }}>F{Math.round(item.fat)}</span>
            </div>
            {onEdit && (
              <button onClick={() => editingIdx === i ? setEditingIdx(null) : startEdit(i)} style={{
                marginLeft: 8, background: editingIdx === i ? SURF2 : 'none',
                border: `1px solid ${editingIdx === i ? EDGE : 'transparent'}`,
                borderRadius: 6, color: editingIdx === i ? MUTED : ORANGE,
                fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: '3px 8px', fontFamily: 'inherit',
              }}>{editingIdx === i ? '✕' : 'edit'}</button>
            )}
          </div>
          {editingIdx === i && onEdit && (
            <div style={{ padding: '6px 0 10px', borderBottom: i < ingredients.length - 1 ? `1px solid ${EDGE}` : 'none', marginBottom: i < ingredients.length - 1 ? 7 : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                {([
                  { label: 'kcal', key: 'calories' as const, color: GREEN   },
                  { label: 'P(g)',  key: 'protein'  as const, color: PROT    },
                  { label: 'C(g)',  key: 'carbs'    as const, color: YELLOW  },
                  { label: 'F(g)',  key: 'fat'      as const, color: FAT_CLR },
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
                background: ORANGE, color: '#fff', fontWeight: 800, fontSize: 12,
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
  const isNative = Capacitor.isNativePlatform();
  const { weather } = useNutrition();
  const targets = useEffectiveTargets(); // synced with HomeScreen (goal-mode + custom targets applied)
  const { pendingMealType, setPendingMealType } = useAppStore();
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const isToday = selectedDate === todayStr;

  // Supplement status for today
  const [suppTotal, setSuppTotal] = useState(0);
  const [suppTaken, setSuppTaken] = useState(0);
  useEffect(() => {
    db.supplements.toArray().then(all => setSuppTotal(all.filter(s => s.active !== false).length)).catch(() => {});
    db.supplement_logs.where('date').equals(todayStr).toArray().then(logs => {
      setSuppTaken(logs.filter(l => l.taken).length);
    }).catch(() => {});
  }, [todayStr]);

  const [logs,       setLogs]       = useState<FoodLog[]>([]);
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState<'search' | 'ai' | 'photo' | 'manual' | 'suggest' | 'recipe' | 'quick'>('search');

  // Quick Add state
  const [quickCal,   setQuickCal]   = useState('');
  const [quickPro,   setQuickPro]   = useState('');
  const [quickCarb,  setQuickCarb]  = useState('');
  const [quickFat,   setQuickFat]   = useState('');
  const [quickNote,  setQuickNote]  = useState('');
  const [quickMeal,  setQuickMeal]  = useState<MealType>(mealFromTime());

  // Diary completion
  const [diaryCompletion, setDiaryCompletion] = useState<DiaryCompletion | null>(null);

  // Diary notes
  const NOTES_KEY = 'fs_diary_notes_v1';
  const notesForDate = (date: string): string => {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}')[date] ?? ''; } catch { return ''; }
  };
  const [diaryNote, setDiaryNote] = useState(() => notesForDate(todayStr));
  const [noteEditing, setNoteEditing] = useState(false);
  const saveDiaryNote = (note: string) => {
    try {
      const map = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}');
      if (note.trim()) map[selectedDate] = note.trim();
      else delete map[selectedDate];
      const keys = Object.keys(map).sort().slice(-90);
      const trimmed: Record<string, string> = {};
      keys.forEach(k => { trimmed[k] = map[k]; });
      localStorage.setItem(NOTES_KEY, JSON.stringify(trimmed));
    } catch {}
  };

  // Reload note when date changes
  useEffect(() => { setDiaryNote(notesForDate(selectedDate)); setNoteEditing(false); }, [selectedDate]);
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

  // Voice input
  const [isListening,  setIsListening]  = useState(false);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  // Meal calorie targets
  const [mealCalTargets,     setMealCalTargetsState] = useState<MealCalTargets>(getMealCalTargets);
  const [editingMealTargets, setEditingMealTargets]  = useState<boolean>(false);

  // Undo deleted meal
  const [undoEntry, setUndoEntry] = useState<FoodLog | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collapsible meal sections — track which meals are collapsed
  const [collapsedMeals, setCollapsedMeals] = useState<Set<string>>(new Set());
  const toggleMealCollapse = (meal: string) =>
    setCollapsedMeals((prev) => { const n = new Set(prev); if (n.has(meal)) n.delete(meal); else n.add(meal); return n; });

  const [nowTime, setNowTime] = useState(() => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  useEffect(() => {
    const tick = () => setNowTime(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const fetchLogs = useCallback(() => getLogs(selectedDate).then(setLogs).catch(() => {}), [selectedDate]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Load diary completion for selected date
  useEffect(() => {
    db.diary_completions.where('date').equals(selectedDate).first()
      .then(c => setDiaryCompletion(c ?? null))
      .catch(() => setDiaryCompletion(null));
  }, [selectedDate]);

  // Open sheet pre-selecting meal type when navigated from HomeScreen
  useEffect(() => {
    if (!pendingMealType) return;
    setForm((f) => ({ ...f, meal: pendingMealType as MealType }));
    setMode('ai');
    setOpen(true);
    setPendingMealType(null);
  }, [pendingMealType, setPendingMealType]);

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
    if (isNative) { setScanSupported(false); return; }
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
    setRecipeView('list'); setRecipeSearch(''); setRecipeResults([]);
    setLoggingRecipeId(null); setLoggingRecipeServings('1');
    setQuickCal(''); setQuickPro(''); setQuickCarb(''); setQuickFat(''); setQuickNote('');
    setQuickMeal(mealFromTime());
    stopScan();
  };

  const handleQuickAdd = async () => {
    const kcal = parseFloat(quickCal);
    if (isNaN(kcal) || kcal <= 0) { setFormError('Enter a calorie value.'); return; }
    const p = parseFloat(quickPro)  || 0;
    const c = parseFloat(quickCarb) || 0;
    const f = parseFloat(quickFat)  || 0;
    const computedCal = p * 4 + c * 4 + f * 9;
    if (computedCal > 0 && Math.abs(computedCal - kcal) / kcal > 0.2) {
      setFormError(`Macros compute to ~${Math.round(computedCal)} kcal — adjust macros or calories.`);
      return;
    }
    setSubmitting(true); setFormError('');
    try {
      await addLog({
        food_name: quickNote.trim() || 'Quick Add',
        calories: kcal, protein: p, carbs: c, fat: f,
        meal_type: quickMeal,
      });
      playFoodLogSound();
      fetchLogs(); closeSheet();
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSubmitting(false); }
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

  const handleVoiceInput = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SR = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SR) { setAiError('Voice input not supported in this browser.'); return; }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      const transcript: string = e.results[0][0].transcript;
      setAiQuery((prev) => prev ? `${prev} ${transcript}` : transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend   = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
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
      const newLog = await addLog({
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
        // Auto-fetch food photo in background if no image yet
        if (!estimate?.imageUrl && newLog?.id) {
          patchLogImage(newLog.id, form.name.trim()).then(fetchLogs).catch(() => {});
        }
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
        background: 'var(--surf)',
        padding: '32px 16px 16px', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid var(--edge)',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'var(--muted)', marginBottom: 10, textTransform: 'uppercase' }}>Fuel Log</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => setSelectedDate((d) => offsetDate(d, -1))} style={{
              background: 'var(--surf2)', border: '1px solid var(--edge)',
              borderRadius: 8, color: 'var(--text)', fontSize: 20, width: 40, height: 40,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>‹</button>
            <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1.5, color: 'var(--text)', lineHeight: 1.1 }}>
                {dateLabel(selectedDate).toUpperCase()}
              </div>
              {isToday ? (
                <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1 }}>{nowTime}</div>
              ) : (
                <button onClick={() => setSelectedDate(todayStr)} style={{
                  marginTop: 7, background: 'var(--accent-muted)', border: '1px solid var(--accent)',
                  borderRadius: 8, color: 'var(--accent)', fontSize: 10, fontWeight: 700,
                  padding: '5px 14px', cursor: 'pointer', letterSpacing: 1,
                }}>← Back to Today</button>
              )}
            </div>
            <button onClick={() => { if (!isToday) setSelectedDate((d) => offsetDate(d, 1)); }} style={{
              background: 'var(--surf2)', border: '1px solid var(--edge)',
              borderRadius: 8, color: 'var(--text)', fontSize: 20, width: 40, height: 40,
              cursor: isToday ? 'default' : 'pointer', opacity: isToday ? 0.35 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>›</button>
          </div>
        </div>
      </div>

      {/* ── CALORIE + MACROS ── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 22px 0' }}>
        <div style={{
          background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`,
          padding: '20px 20px 18px', overflow: 'hidden', position: 'relative', boxShadow: CARD_SHADOW,
        }}>
          <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,189,208,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
            Calories Consumed
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, lineHeight: 1 }}>
              <div style={{
                fontSize: 52, fontWeight: 900, letterSpacing: -4, lineHeight: 1,
                color: calPct >= 100 ? RED : CAL_CLR,
                transition: 'color 0.4s',
              }}>
                {Math.round(consumed.calories).toLocaleString()}
              </div>
              {targets && (
                <div style={{ paddingBottom: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 300, color: MUTED }}>/</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: MUTED, marginLeft: 4 }}>
                    {Math.round(targets.calories).toLocaleString()}
                  </span>
                  <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, marginTop: 2 }}>kcal</div>
                </div>
              )}
            </div>
            {calPct >= 85 && calPct < 100 && (
              <div style={{
                marginLeft: 'auto', paddingBottom: 8,
                background: `${GREEN}10`, border: `1px solid ${GREEN}25`,
                borderRadius: 8, padding: '4px 12px',
                fontSize: 10, fontWeight: 800, color: GREEN, letterSpacing: 0.5,
              }}>
                ON TRACK
              </div>
            )}
          </div>
          <div style={{ height: 7, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
            <div
              className="bar-ani"
              style={{
                height: '100%', width: `${Math.min(calPct, 100)}%`,
                background: calPct >= 100 ? RED : GREEN,
                borderRadius: 4, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
              }}
            />
          </div>

          {/* 4 mini rings row */}
          {targets && (() => {
            const rings = [
              { label: 'Cal',  val: consumed.calories, max: targets.calories, color: CAL_CLR },
              { label: 'Prot', val: consumed.protein,  max: targets.proteinG, color: PROT },
              { label: 'Carb', val: consumed.carbs,    max: targets.carbsG,   color: YELLOW },
              { label: 'Fat',  val: consumed.fat,      max: targets.fatG,     color: FAT_CLR },
            ];
            return (
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
                {rings.map(({ label, val, max, color }) => {
                  if (!max || max <= 0) return null;
                  const pct = Math.min(val / max, 1);
                  const deg = Math.round(pct * 360);
                  const R = 18; const sz = R * 2 + 6;
                  return (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{ width: sz, height: sz, borderRadius: '50%', position: 'relative',
                        background: `conic-gradient(${color} ${deg}deg, var(--edge) 0deg)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <div style={{ width: R * 1.3, height: R * 1.3, borderRadius: '50%', background: SURF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 8, fontWeight: 800, color }}>{Math.round(pct * 100)}%</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 7, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { name: 'Protein', val: consumed.protein, tgt: targets?.proteinG, color: PROT    },
              { name: 'Carbs',   val: consumed.carbs,   tgt: targets?.carbsG,   color: YELLOW  },
              { name: 'Fat',     val: consumed.fat,     tgt: targets?.fatG,     color: FAT_CLR },
            ].map(({ name, val, tgt, color }) => {
              const pct2 = tgt && tgt > 0 ? Math.min((val / tgt) * 100, 100) : 0;
              const over = tgt && tgt > 0 && val > tgt;
              return (
                <div key={name} style={{ background: `${color}06`, borderRadius: 12, padding: '10px 10px 8px', border: `1px solid ${color}15` }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: over ? RED : color, textTransform: 'uppercase', marginBottom: 5 }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1.5, color: over ? RED : TEXT, lineHeight: 1 }}>
                    {Math.round(val)}<span style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}>g</span>
                  </div>
                  <div style={{ marginTop: 7, height: 4, background: `${color}18`, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct2}%`, background: `linear-gradient(90deg, ${color}70, ${color})`, borderRadius: 3, transition: 'width 0.7s ease' }} />
                  </div>
                  {tgt && tgt > 0 && (
                    <div style={{ fontSize: 8, color: over ? RED : MUTED, fontWeight: 700, marginTop: 3 }}>
                      {over ? `+${Math.round(val - tgt)}g` : `${Math.round(tgt - val)}g left`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Meal calorie distribution */}
          {byMeal.length > 1 && consumed.calories > 0 && (() => {
            const MEAL_COLORS_MAP: Record<string, string> = {
              breakfast: '#38BDF8', pre_workout: '#A78BFA', lunch: '#22C55E',
              post_workout: '#34D399', dinner: '#F59E0B', snack: '#FB923C', other: '#6B7280',
            };
            const total = consumed.calories;
            return (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>
                  Meal Distribution
                </div>
                {/* Stacked bar */}
                <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 8, gap: 1 }}>
                  {byMeal.map(({ meal, entries }) => {
                    const mCal = entries.reduce((s, e) => s + parseFloat(e.calories as unknown as string), 0);
                    const pct  = (mCal / total) * 100;
                    const col  = MEAL_COLORS_MAP[meal] ?? '#6B7280';
                    return pct > 0 ? (
                      <div key={meal} style={{ width: `${pct}%`, background: col, transition: 'width 0.5s ease' }} />
                    ) : null;
                  })}
                </div>
                {/* Legend pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {byMeal.map(({ meal, entries }) => {
                    const mCal = Math.round(entries.reduce((s, e) => s + parseFloat(e.calories as unknown as string), 0));
                    const pct  = Math.round((mCal / total) * 100);
                    const col  = MEAL_COLORS_MAP[meal] ?? '#6B7280';
                    const lbl  = MEAL_LABEL[meal as keyof typeof MEAL_LABEL] ?? meal;
                    return (
                      <div key={meal} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
                        <span style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>
                          {lbl}: {mCal} kcal ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── REMAINING MACROS ── */}
      {isToday && targets && (consumed.protein > 0 || consumed.carbs > 0 || consumed.fat > 0) && (
        <div className="nrc-a nrc-a3" style={{ padding: '10px 22px 0' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: 'Protein', got: consumed.protein, need: targets.proteinG ?? 0, color: PROT    },
              { label: 'Carbs',   got: consumed.carbs,   need: targets.carbsG   ?? 0, color: YELLOW  },
              { label: 'Fat',     got: consumed.fat,      need: targets.fatG     ?? 0, color: FAT_CLR },
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
            width: '100%', padding: '12px 0', borderRadius: 8,
            background: copyingYesterday ? SURF2 : `${ORANGE}08`,
            border: `1px solid ${ORANGE}22`,
            color: copyingYesterday ? MUTED : ORANGE,
            fontWeight: 700, fontSize: 13, cursor: copyingYesterday ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {copyingYesterday ? 'Copying…' : '↩ Copy Yesterday\'s Meals'}
          </button>
        </div>
      )}

      {/* ── SUPPLEMENT STATUS ── */}
      {isToday && suppTotal > 0 && (
        <div style={{ padding: '8px 22px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 10,
            background: SURF, border: `1px solid ${EDGE}`,
          }}>
            <span style={{ fontSize: 14 }}>💊</span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: suppTaken === suppTotal ? GREEN : MUTED,
              flex: 1,
            }}>
              {suppTaken}/{suppTotal} supplements taken today
            </span>
            {suppTaken === suppTotal && (
              <span style={{ fontSize: 9, fontWeight: 800, color: GREEN, letterSpacing: 0.5 }}>ALL DONE ✓</span>
            )}
          </div>
        </div>
      )}

      {/* ── MEAL CALORIE TARGETS (always visible at top of log) ── */}
      {isToday && (
        <div style={{ padding: '12px 22px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, color: MUTED, textTransform: 'uppercase' }}>Meal Targets</div>
            <button onClick={() => setEditingMealTargets(v => !v)} style={{
              background: 'none', border: 'none', color: editingMealTargets ? ORANGE : MUTED,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, letterSpacing: 0.5,
            }}>⚙ {editingMealTargets ? 'Done' : 'Edit'}</button>
          </div>

          {editingMealTargets ? (
            <div style={{ background: SURF, borderRadius: 8, padding: '14px 14px', border: `1px solid ${EDGE}`, marginBottom: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(Object.keys(mealCalTargets) as (keyof MealCalTargets)[]).map((k) => (
                  <div key={k}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' }}>{MEAL_LABEL[k as MealType] ?? k}</div>
                    <input type="number" value={mealCalTargets[k]} min={0}
                      onChange={(e) => setMealCalTargetsState((prev) => ({ ...prev, [k]: parseInt(e.target.value) || 0 }))}
                      style={{ ...inp, padding: '8px 10px', fontSize: 14, width: '100%', boxSizing: 'border-box' as const }} />
                  </div>
                ))}
              </div>
              <button onClick={() => handleSaveMealCalTargets(mealCalTargets)} style={{
                marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 8, border: 'none',
                background: ORANGE, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>Save Targets</button>
            </div>
          ) : (
            /* Compact horizontal scroll — one pill per meal with kcal progress */
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' as const }}>
              {MEAL_TYPES.map((m) => {
                const entries = logs.filter((l) => l.meal_type === m);
                const consumed_m = entries.reduce((s, e) => s + Number(e.calories), 0);
                const target_m = mealCalTargets[m as keyof MealCalTargets] ?? 0;
                const pct = target_m > 0 ? Math.min(consumed_m / target_m, 1) : 0;
                const over = target_m > 0 && consumed_m > target_m;
                const hasData = consumed_m > 0 || target_m > 0;
                if (!hasData) return null;
                return (
                  <div key={m} style={{
                    flexShrink: 0, padding: '8px 12px', borderRadius: 8,
                    background: SURF, border: `1px solid ${over ? RED + '40' : EDGE}`,
                    minWidth: 90,
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: MUTED, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
                      {MEAL_SHORT[m] ?? m}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: over ? RED : CAL_CLR, letterSpacing: -0.5, lineHeight: 1 }}>
                      {Math.round(consumed_m)}
                      {target_m > 0 && <span style={{ fontSize: 9, fontWeight: 500, color: MUTED }}>/{target_m}</span>}
                    </div>
                    {target_m > 0 && (
                      <div style={{ marginTop: 5, height: 3, background: EDGE, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct * 100}%`, background: over ? RED : GREEN, borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                );
              }).filter(Boolean)}
            </div>
          )}
        </div>
      )}

      {/* ── FOOD LOG ── */}
      <div className="nrc-a nrc-a3" style={{ padding: '16px 22px 100px' }}>
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
            <div style={{ color: MUTED, fontSize: 13, fontWeight: 700, lineHeight: 1.65, maxWidth: 260, margin: '0 auto 24px' }}>
              Tap <strong style={{ color: ORANGE }}>+</strong> to log a meal — describe anything in plain English and AI will handle the rest.
            </div>
          </div>
        ) : byMeal.map(({ meal, entries }) => {
          const mealTotal  = entries.reduce((s, e) => s + Number(e.calories), 0);
          const mealProt   = Math.round(entries.reduce((s, e) => s + Number(e.protein ?? 0), 0));
          const mealCarbs  = Math.round(entries.reduce((s, e) => s + Number(e.carbs ?? 0), 0));
          const mealFat    = Math.round(entries.reduce((s, e) => s + Number(e.fat ?? 0), 0));
          const mealTarget = mealCalTargets[meal as keyof MealCalTargets] ?? 0;
          const mealPct    = mealTarget > 0 ? Math.min(mealTotal / mealTarget, 1) : 0;
          const mealOver   = mealTarget > 0 && mealTotal > mealTarget;
          const collapsed  = collapsedMeals.has(meal);
          return (
            <div key={meal} style={{ marginBottom: 10, background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
              {/* Collapsible meal header */}
              <button onClick={() => toggleMealCollapse(meal)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: collapsed ? 'none' : `1px solid ${EDGE}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: MEAL_COLOR[meal] ?? MUTED, flexShrink: 0 }} />
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2.5, color: MUTED, textTransform: 'uppercase' }}>
                    {MEAL_LABEL[meal as MealType] ?? 'Other'}
                  </span>
                  <span style={{ fontSize: 9, color: MUTED }}>({entries.length})</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {mealTotal > 0 && (
                    <>
                      <span style={{ fontSize: 8, fontWeight: 700, color: PROT }}>P{mealProt}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, color: GREEN }}>C{mealCarbs}</span>
                      <span style={{ fontSize: 8, fontWeight: 700, color: FAT_CLR }}>F{mealFat}</span>
                    </>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 700, color: mealOver ? RED : CAL_CLR }}>
                    {Math.round(mealTotal)}
                    {mealTarget > 0 && <span style={{ fontWeight: 500, color: mealOver ? RED : MUTED, fontSize: 10 }}> / {mealTarget}</span>}
                    <span style={{ fontWeight: 400, color: MUTED, fontSize: 9, marginLeft: 2 }}>kcal</span>
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={MUTED} strokeWidth="2" strokeLinecap="round"
                    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <polyline points="2,4 6,8 10,4"/>
                  </svg>
                </div>
              </button>
              {!collapsed && (
                <div style={{ padding: '10px 12px 12px' }}>
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
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── DIARY NOTE ── */}
      <div style={{ margin: '0 22px 12px' }}>
        {noteEditing ? (
          <div style={{ background: SURF, borderRadius: 10, border: `1px solid ${ORANGE}40`, overflow: 'hidden' }}>
            <textarea
              autoFocus
              value={diaryNote}
              onChange={(e) => setDiaryNote(e.target.value)}
              placeholder="Add a note to this day — mood, context, how you felt…"
              rows={3}
              style={{
                width: '100%', background: 'transparent', border: 'none',
                color: TEXT, fontSize: 13, fontWeight: 600, padding: '12px 14px',
                resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', borderTop: `1px solid ${EDGE}` }}>
              <button onClick={() => { saveDiaryNote(diaryNote); setNoteEditing(false); }} style={{
                flex: 1, padding: '9px 0', background: `${ORANGE}10`, border: 'none',
                color: ORANGE, fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>Save Note</button>
              <button onClick={() => { setDiaryNote(notesForDate(selectedDate)); setNoteEditing(false); }} style={{
                flex: 1, padding: '9px 0', background: 'none', border: 'none',
                color: MUTED, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setNoteEditing(true)} style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            background: 'none', border: `1px dashed ${diaryNote ? ORANGE + '40' : EDGE}`,
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
          }}>
            {diaryNote ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, lineHeight: 1.5 }}>
                <span style={{ color: ORANGE, fontWeight: 700, marginRight: 6 }}>📝</span>
                {diaryNote}
              </div>
            ) : (
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED }}>
                + Add diary note
              </div>
            )}
          </button>
        )}
      </div>

      {/* ── MICRONUTRIENT SNAPSHOT ── */}
      {logs.length > 0 && (() => {
        const fiber  = Math.round(logs.reduce((s, l) => s + (l.fiber_g        ?? 0), 0));
        const sodium = Math.round(logs.reduce((s, l) => s + (l.sodium_mg      ?? 0), 0));
        const vitC   = Math.round(logs.reduce((s, l) => s + (l.vitamin_c_mg   ?? 0), 0));
        const vitD   = Math.round(logs.reduce((s, l) => s + (l.vitamin_d_mcg ?? 0), 0) * 10) / 10;
        const calc   = Math.round(logs.reduce((s, l) => s + (l.calcium_mg    ?? 0), 0));
        const iron   = Math.round(logs.reduce((s, l) => s + (l.iron_mg       ?? 0), 0) * 10) / 10;
        const hasAny = fiber > 0 || sodium > 0 || vitC > 0 || calc > 0 || iron > 0;
        if (!hasAny) return null;
        const items = [
          { label: 'Fiber',     value: fiber,  unit: 'g',   goal: 25,   color: GREEN,   isLower: false },
          { label: 'Sodium',    value: sodium,  unit: 'mg',  goal: 2300, color: RED,     isLower: true  },
          { label: 'Vit C',     value: vitC,    unit: 'mg',  goal: 90,   color: '#FB923C', isLower: false },
          { label: 'Vit D',     value: vitD,    unit: 'mcg', goal: 15,   color: '#FCD34D', isLower: false },
          { label: 'Calcium',   value: calc,    unit: 'mg',  goal: 1000, color: PROT,    isLower: false },
          { label: 'Iron',      value: iron,    unit: 'mg',  goal: 10,   color: '#F87171', isLower: false },
        ].filter(n => n.value > 0);
        if (items.length < 2) return null;
        return (
          <div style={{ margin: '0 22px 12px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>
              Micronutrients · Today
            </div>
            <div style={{ background: SURF, borderRadius: 10, border: `1px solid ${EDGE}`, padding: '12px 14px', boxShadow: CARD_SHADOW }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(({ label, value, unit, goal, color, isLower }) => {
                  const pct     = Math.min((value / goal) * 100, 100);
                  const isOver  = value > goal;
                  const barCol  = isLower ? (isOver ? RED : GREEN) : (pct >= 80 ? GREEN : pct >= 50 ? ORANGE : color);
                  const status  = isLower ? (isOver ? 'OVER' : 'OK') : (pct >= 80 ? 'MET' : pct >= 50 ? 'PARTIAL' : 'LOW');
                  return (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: barCol }}>{label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: barCol }}>{value}{unit}</span>
                          <span style={{ fontSize: 9, color: MUTED }}>/ {goal}{unit}</span>
                          <span style={{ fontSize: 8, fontWeight: 700, color: barCol, letterSpacing: 0.5 }}>{status}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, background: SURF2, borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 2, background: barCol, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}


      {/* ── COMPLETE DIARY ── */}
      {isToday && logs.length > 0 && targets && (
        <NutritionGradeCard
          date={selectedDate}
          consumed={consumed}
          targets={targets}
          existingCompletion={diaryCompletion}
          onCompleted={setDiaryCompletion}
        />
      )}

      {/* ── FAB ── */}
      {isToday && (
        <button
          onClick={() => { setOpen(true); setMode('ai'); }}
          className="nrc-press fab-pulse"
          style={{
            position: 'fixed',
            bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
            right: 'max(20px, calc(50vw - 220px))',
            width: 60, height: 60, borderRadius: 30,
            background: `linear-gradient(135deg, ${YELLOW} 0%, ${ORANGE} 100%)`,
            border: 'none', cursor: 'pointer',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 4px 20px ${ORANGE}50, 0 1px 4px rgba(0,0,0,0.15)`,
            zIndex: 90,
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
          <div style={{ flex: 1, fontSize: 13, color: '#FFFFFF', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Removed "{undoEntry.food_name}"
          </div>
          <button onClick={handleUndo} style={{
            background: ORANGE, border: 'none', borderRadius: 8, color: '#fff',
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
                  {editingId ? 'EDIT' : 'LOG IT'}
                </div>
                <button onClick={closeSheet} style={{ background: SURF2, border: `1px solid ${EDGE}`, color: MUTED, fontSize: 18, cursor: 'pointer', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>

              {/* Mode tabs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 22 }}>
                {([
                  ['search',  '🔍', 'Search'],
                  ['ai',      '✨', 'Describe'],
                  ['photo',   '📷', 'Camera'],
                  ['suggest', '🍽', 'Suggest'],
                  ['recipe',  '📖', 'Recipe'],
                  ['manual',  '✏️',  'Manual'],
                  ['quick',   '⚡', 'Quick Add'],
                ] as const).map(([m, icon, label]) => {
                  const active = mode === m;
                  return (
                    <button key={m} onClick={() => {
                      setMode(m); setAiError(''); setFormError(''); setSuggestResult(null);
                      if (m !== 'search') { setScanActive(false); stopScan(); }
                    }} style={{
                      padding: '10px 4px 9px', borderRadius: 12, border: `1px solid ${active ? ORANGE : EDGE}`,
                      background: active ? `${ORANGE}14` : SURF2,
                      color: active ? ORANGE : MUTED,
                      fontWeight: active ? 800 : 600,
                      fontSize: 10, cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: 'inherit', letterSpacing: 0.3,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      boxShadow: active ? `0 0 12px ${ORANGE}25` : 'none',
                    }}>
                      <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* RECIPE MODE */}
              {mode === 'recipe' && (
                <>
                  {/* Sub-nav */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                    {(['list', 'build'] as const).map((v) => (
                      <button key={v} onClick={() => setRecipeView(v)} style={{
                        flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${recipeView === v ? ORANGE + '60' : EDGE}`,
                        background: recipeView === v ? `${ORANGE}14` : SURF2,
                        color: recipeView === v ? ORANGE : MUTED,
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
                      <div key={recipe.id} style={{ background: SURF2, borderRadius: 8, padding: '14px 14px', marginBottom: 10, border: `1px solid ${EDGE}` }}>
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
                          {[['Cal', recipe.totalCal, ORANGE], ['Pro', recipe.totalProtein + 'g', YELLOW], ['Carb', recipe.totalCarbs + 'g', GREEN], ['Fat', recipe.totalFat + 'g', FAT_CLR]].map(([l, v, c]) => (
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
                              background: `${ORANGE}14`, border: `1px solid ${ORANGE}40`, borderRadius: 10,
                              color: ORANGE, fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '8px 16px',
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
                                [recipeIngredients.reduce((s, i) => s + i.protein, 0).toFixed(1) + 'g P', YELLOW],
                                [recipeIngredients.reduce((s, i) => s + i.carbs, 0).toFixed(1) + 'g C', GREEN],
                                [recipeIngredients.reduce((s, i) => s + i.fat, 0).toFixed(1) + 'g F', FAT_CLR],
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
                          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', border: `2px solid ${ORANGE}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
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
                              <div style={{ fontSize: 11, color: ORANGE, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
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
                        background: `${ORANGE}0C`, border: `1px solid ${ORANGE}25`,
                        borderRadius: 12, color: ORANGE, width: 50, flexShrink: 0,
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
                    <div style={{ background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden', marginBottom: 16 }}>
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
                            <div style={{ width: 36, height: 36, borderRadius: 8, background: `${ORANGE}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="2" strokeLinecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="5" y1="8" x2="19" y2="8"/><line x1="12" y1="3" x2="12" y2="8"/></svg>
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
                          <div style={{ fontSize: 15, fontWeight: 900, color: ORANGE, flexShrink: 0 }}>{product.caloriesPer100g}</div>
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
                                background: favTab === t ? `${ORANGE}08` : SURF2,
                                border: `1px solid ${favTab === t ? ORANGE : EDGE}`,
                                color: favTab === t ? ORANGE : MUTED,
                                fontWeight: 700, fontSize: 12, fontFamily: 'inherit',
                              }}>
                                {t === 'recent' ? `Recent (${recents.length})` : t === 'fav' ? `Favourites (${favorites.length})` : `Templates (${templates.length})`}
                              </button>
                            ))}
                          </div>

                          {(() => {
                            if (favTab === 'templates') {
                              if (templates.length === 0) return (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: MUTED, fontSize: 13, fontWeight: 700 }}>
                                  No templates yet — tap "Save as Template" on a meal below
                                </div>
                              );
                              return (
                                <div style={{ background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
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
                              <div style={{ textAlign: 'center', padding: '20px 0', color: MUTED, fontSize: 13, fontWeight: 700 }}>
                                {favTab === 'recent' ? 'No recent foods yet' : 'No favourites yet — tap ★ on a recent food'}
                              </div>
                            );
                            return (
                              <div style={{ background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
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
                                        background: `${ORANGE}0C`, border: `1px solid ${ORANGE}25`,
                                        borderRadius: 8, color: ORANGE, fontWeight: 800,
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
                          <div style={{ marginBottom: 10 }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
                          </div>
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
              {mode === 'search' && (scanActive || barcodeLoading || scanSupported === false) && (
                <div>
                  {barcodeLoading && (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: MUTED, fontSize: 14, fontWeight: 700 }}>
                      Looking up product…
                    </div>
                  )}
                  {scanActive && (
                    <div style={{ position: 'relative', marginBottom: 16 }}>
                      <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, display: 'block', background: '#000' }} />
                      <div style={{
                        position: 'absolute', inset: 0, borderRadius: 8,
                        border: `2px solid ${ORANGE}`, pointerEvents: 'none',
                        boxShadow: `inset 0 0 0 2000px rgba(0,0,0,0.3)`,
                      }}>
                        <div style={{
                          position: 'absolute', top: '50%', left: '10%', right: '10%',
                          height: 2, background: `${ORANGE}90`, transform: 'translateY(-50%)',
                          boxShadow: `0 0 8px ${ORANGE}`,
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
                          background: ORANGE, border: 'none', borderRadius: 12, color: '#fff',
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
                  <div style={{ position: 'relative', marginBottom: 12 }}>
                    <textarea autoFocus value={aiQuery}
                      onChange={(e) => { setAiQuery(e.target.value); setAiError(''); }}
                      placeholder="What did you eat?" rows={3}
                      style={{ ...inp, width: '100%', resize: 'none', lineHeight: 1.6, paddingRight: isNative ? undefined : 44 }} />
                    {/* Mic button — web only (Speech API not available in Android WebView) */}
                    {!isNative && (
                      <button
                        onClick={handleVoiceInput}
                        title={isListening ? 'Stop listening' : 'Speak your meal'}
                        style={{
                          position: 'absolute', right: 8, top: 8,
                          width: 32, height: 32, borderRadius: 8,
                          border: `1.5px solid ${isListening ? '#EF4444' : 'var(--edge)'}`,
                          background: isListening ? '#EF444420' : 'var(--surf2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', transition: 'all 0.2s ease',
                          animation: isListening ? 'pulse 1s infinite' : 'none',
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                          stroke={isListening ? '#EF4444' : 'var(--muted)'}
                          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                          <line x1="12" y1="19" x2="12" y2="23"/>
                          <line x1="8" y1="23" x2="16" y2="23"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {!isNative && isListening && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                      padding: '8px 12px', borderRadius: 8, background: '#EF444412', border: '1px solid #EF444440' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', animation: 'pulse 1s infinite' }} />
                      <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 700 }}>Listening… speak your meal</span>
                    </div>
                  )}
                  <MealChips form={form} setForm={setForm} />
                  {aiError && <ErrBox msg={aiError} />}
                  <button onClick={handleAISmart} disabled={aiLoading} className="nrc-press" style={bigBtn(aiLoading, ORANGE)}>
                    {aiLoading ? 'Analysing…' : 'Analyse with AI →'}
                  </button>
                </>
              )}

              {/* PHOTO MODE */}
              {mode === 'photo' && (
                <>
                  {aiLoading ? (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 16, padding: '40px 20px', borderRadius: 8,
                      border: `2px dashed ${EDGE}`, background: SURF2, marginBottom: 16,
                    }}>
                      <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${ORANGE}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                      <div style={{ fontSize: 16, fontWeight: 800, color: MUTED, textAlign: 'center' }}>Analysing…</div>
                      <div style={{ fontSize: 12, color: MUTED, textAlign: 'center', fontWeight: 600 }}>AI is estimating macros</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                      {/* Take photo with camera */}
                      <label style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 12, padding: '28px 12px', borderRadius: 8,
                        border: `2px dashed ${ORANGE}`, background: `${ORANGE}05`,
                        cursor: 'pointer', transition: 'all 0.2s ease',
                      }}>
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                          onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhotoAnalyze(file); e.target.value = ''; }} />
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                        <div style={{ fontSize: 13, fontWeight: 800, color: ORANGE, textAlign: 'center' }}>Take Photo</div>
                        <div style={{ fontSize: 10, color: MUTED, textAlign: 'center', fontWeight: 600 }}>Open camera</div>
                      </label>
                      {/* Upload from gallery */}
                      <label style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 12, padding: '28px 12px', borderRadius: 8,
                        border: `2px dashed ${EDGE}`, background: SURF2,
                        cursor: 'pointer', transition: 'all 0.2s ease',
                      }}>
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhotoAnalyze(file); e.target.value = ''; }} />
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, textAlign: 'center' }}>Choose Photo</div>
                        <div style={{ fontSize: 10, color: MUTED, textAlign: 'center', fontWeight: 600 }}>From gallery</div>
                      </label>
                    </div>
                  )}
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
                          background: active ? `${ORANGE}08` : SURF2,
                          border: `1px solid ${active ? ORANGE : EDGE}`,
                          borderLeft: active ? `3px solid ${ORANGE}` : `1px solid ${EDGE}`,
                          color: active ? ORANGE : MUTED, fontWeight: 700, fontSize: 12,
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
                        background: suggestSize === v ? `${ORANGE}08` : SURF2,
                        border: `1px solid ${suggestSize === v ? ORANGE : EDGE}`,
                        color: suggestSize === v ? ORANGE : MUTED, fontWeight: 700, fontSize: 12,
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
                      <span style={{ fontSize: 10, color: ORANGE, fontWeight: 700, marginLeft: 'auto' }}>Weather factored in</span>
                    </div>
                  )}
                  {aiError && <ErrBox msg={aiError} />}
                  <button onClick={handleSuggest} disabled={aiLoading} className="nrc-press" style={bigBtn(aiLoading, ORANGE)}>
                    {aiLoading ? 'thinking…' : 'suggest →'}
                  </button>
                </>
              )}

              {/* SUGGEST RESULT */}
              {mode === 'suggest' && suggestResult && (
                <>
                  {/* Meal header */}
                  <div style={{ background: SURF2, borderRadius: 8, padding: '14px 16px', marginBottom: 16, border: `1px solid ${EDGE}` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 6 }}>
                      {CTX_LABEL[suggestCtx]} · {suggestSize === 'big' ? 'Full Meal' : 'Light'}{weather ? ` · ${Math.round(weather.tempC)}°C` : ''}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, color: TEXT, marginBottom: 10 }}>{suggestResult.food_name}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Calories', val: Math.round(suggestResult.calories), unit: 'kcal', color: ORANGE },
                        { label: 'Protein',  val: Math.round(suggestResult.protein),  unit: 'g',    color: GREEN },
                        { label: 'Carbs',    val: Math.round(suggestResult.carbs),    unit: 'g',    color: ORANGE },
                        { label: 'Fat',      val: Math.round(suggestResult.fat),      unit: 'g',    color: FAT_CLR },
                      ].map(({ label, val, unit, color }) => (
                        <div key={label} style={{ textAlign: 'center', background: SURF, borderRadius: 10, padding: '8px 4px', border: `1px solid ${EDGE}` }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: color, letterSpacing: -0.5 }}>{val}</div>
                          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>{unit}</div>
                          <div style={{ fontSize: 8, color: MUTED, letterSpacing: 0.5, marginTop: 1 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Ingredient list */}
                  {suggestResult.ingredients && suggestResult.ingredients.length > 0 && (
                    <div style={{ background: SURF, borderRadius: 8, border: `1px solid ${EDGE}`, overflow: 'hidden', marginBottom: 16 }}>
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
                            <div style={{ fontSize: 16, fontWeight: 900, color: ORANGE }}>{Math.round(item.calories)}</div>
                            <div style={{ fontSize: 9, color: MUTED }}>kcal</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                            <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>P {Math.round(item.protein)}g</span>
                            <span style={{ fontSize: 9, color: ORANGE, fontWeight: 700 }}>C {Math.round(item.carbs)}g</span>
                            <span style={{ fontSize: 9, color: FAT_CLR, fontWeight: 700 }}>F {Math.round(item.fat)}g</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {aiError && <ErrBox msg={aiError} />}

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setSuggestResult(null)} className="nrc-press" style={{
                      flex: 1, padding: 15, borderRadius: 8, border: `1px solid ${EDGE}`,
                      background: 'none', color: MUTED, fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>← Back</button>
                    <button onClick={handleLogSuggestedMeal} disabled={loggingAll} className="nrc-press" style={bigBtn(loggingAll, ORANGE, 2)}>
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
                          background: form.amountIsText === isText ? ORANGE : 'transparent',
                          border: 'none',
                          color: form.amountIsText === isText ? '#FFFFFF' : MUTED,
                          fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                          fontFamily: 'inherit',
                        }}>{isText ? 'pcs' : 'g'}</button>
                      ))}
                    </div>
                    <input style={{ ...inp, flex: 1 }} type={form.amountIsText ? 'text' : 'number'}
                      value={form.amount} onChange={(e) => patch({ amount: e.target.value })}
                      placeholder={form.amountIsText ? 'e.g. 2 eggs' : 'Weight in grams'} />
                  </div>

                  {aiError && <ErrBox msg={aiError} />}

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Macros</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <MacroInp label="Protein" color={ORANGE}  value={form.protein} onChange={(v) => patch({ protein: v })} />
                      <MacroInp label="Carbs"   color={YELLOW}  value={form.carbs}   onChange={(v) => patch({ carbs: v })} />
                      <MacroInp label="Fat"     color={FAT_CLR} value={form.fat}     onChange={(v) => patch({ fat: v })} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 12 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', flexShrink: 0 }}>Kcal</div>
                      <input type="number" value={form.calories}
                        onChange={(e) => { setForm((f) => ({ ...f, calories: e.target.value })); setFormError(''); }}
                        style={{ ...inp, flex: 1, padding: '8px 10px', fontSize: 22, fontWeight: 900, color: ORANGE, letterSpacing: -0.5, background: 'transparent', border: 'none' }}
                        placeholder="—" />
                      <div style={{ fontSize: 9, color: MUTED, flexShrink: 0 }}>auto</div>
                    </div>
                    {(() => {
                      const p = parseFloat(form.protein), c = parseFloat(form.carbs), fa = parseFloat(form.fat);
                      const entered = parseFloat(form.calories);
                      if (isNaN(p) || isNaN(c) || isNaN(fa)) return null;
                      const comp = calcCal(p, c, fa);
                      if (!isNaN(entered) && entered > 0 && Math.abs(comp - entered) / entered > 0.12)
                        return <div style={{ fontSize: 11, color: ORANGE, marginTop: 8, fontWeight: 700 }}>Macros compute to ~{Math.round(comp)} kcal</div>;
                      return null;
                    })()}
                  </div>

                  <MealChips form={form} setForm={setForm} />
                  {formError && <ErrBox msg={formError} />}

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button onClick={closeSheet} className="nrc-press" style={{ flex: 1, padding: 15, borderRadius: 8, border: `1px solid ${EDGE}`, background: 'none', color: MUTED, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={handleAdd} disabled={submitting} className="nrc-press" style={bigBtn(submitting, ORANGE, 2)}>
                      {submitting ? '···' : editingId ? 'save →' : 'log it →'}
                    </button>
                  </div>
                </>
              )}

              {/* QUICK ADD MODE */}
              {mode === 'quick' && (
                <>
                  <div style={{ background: `${ORANGE}08`, border: `1px solid ${ORANGE}20`, borderRadius: 10, padding: '10px 14px', marginBottom: 18 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: ORANGE, letterSpacing: -0.3 }}>Quick Add</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2, lineHeight: 1.5 }}>
                      Log calories without a full food entry — just the numbers.
                    </div>
                  </div>

                  {/* Calories — big hero input */}
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Calories *</div>
                    <input
                      autoFocus
                      type="number" min={1} max={9999} value={quickCal}
                      onChange={(e) => { setQuickCal(e.target.value); setFormError(''); }}
                      placeholder="0"
                      style={{
                        ...inp, fontSize: 42, fontWeight: 900, letterSpacing: -2,
                        color: ORANGE, textAlign: 'center', padding: '16px 14px',
                      }}
                    />
                    <div style={{ textAlign: 'center', fontSize: 10, color: MUTED, fontWeight: 600, marginTop: 4 }}>kcal</div>
                  </div>

                  {/* Optional macros */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Macros (optional)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      {([
                        { label: 'Protein', color: PROT,    val: quickPro,  set: setQuickPro  },
                        { label: 'Carbs',   color: YELLOW,  val: quickCarb, set: setQuickCarb },
                        { label: 'Fat',     color: FAT_CLR, val: quickFat,  set: setQuickFat  },
                      ] as const).map(({ label, color, val, set }) => (
                        <div key={label}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                          <input type="number" min={0} value={val}
                            onChange={(e) => { (set as React.Dispatch<React.SetStateAction<string>>)(e.target.value); setFormError(''); }}
                            placeholder="0"
                            style={{ width: '100%', background: SURF2, border: `1px solid ${color}30`, borderRadius: 10, color: TEXT, fontSize: 18, fontWeight: 700, padding: '10px 10px', outline: 'none', fontFamily: 'inherit' }}
                          />
                          <div style={{ fontSize: 9, color: MUTED, marginTop: 3, textAlign: 'right' }}>g</div>
                        </div>
                      ))}
                    </div>
                    {/* computed total */}
                    {(parseFloat(quickPro) || parseFloat(quickCarb) || parseFloat(quickFat)) ? (
                      <div style={{ marginTop: 8, fontSize: 11, color: MUTED, textAlign: 'center', fontWeight: 700 }}>
                        Macros → {Math.round((parseFloat(quickPro)||0)*4 + (parseFloat(quickCarb)||0)*4 + (parseFloat(quickFat)||0)*9)} kcal
                      </div>
                    ) : null}
                  </div>

                  {/* Note */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Note (optional)</div>
                    <input value={quickNote} onChange={(e) => setQuickNote(e.target.value)}
                      placeholder='e.g. "cheat meal", "protein shake"'
                      style={{ ...inp }}
                    />
                  </div>

                  {/* Meal selector */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Meal</div>
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' as const }}>
                      {MEAL_TYPES.map((m) => (
                        <button key={m} onClick={() => setQuickMeal(m)} className="nrc-press" style={{
                          flexShrink: 0, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                          background: quickMeal === m ? ORANGE : SURF2,
                          border: `1px solid ${quickMeal === m ? ORANGE : EDGE}`,
                          color: quickMeal === m ? '#fff' : MUTED, fontWeight: 700, fontSize: 11,
                          fontFamily: 'inherit',
                        }}>{MEAL_LABEL[m]}</button>
                      ))}
                    </div>
                  </div>

                  {formError && <ErrBox msg={formError} />}
                  <button onClick={handleQuickAdd} disabled={submitting || !quickCal} className="nrc-press" style={bigBtn(submitting || !quickCal, ORANGE)}>
                    {submitting ? '···' : `Log ${quickCal || '0'} kcal →`}
                  </button>
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
  if (pC >= cC && pC >= fC) return ORANGE;
  if (cC >= pC && cC >= fC) return GREEN;
  return FAT_CLR;
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
            <span style={{ background: `${PROT}15`,   border: `1px solid ${PROT}30`,   borderRadius: 6, padding: '2px 7px', fontSize: 10, color: PROT,  fontWeight: 700 }}>
              P {Math.round(Number(entry.protein))}g
            </span>
            <span style={{ background: `${YELLOW}15`,   border: `1px solid ${YELLOW}30`,   borderRadius: 6, padding: '2px 7px', fontSize: 10, color: YELLOW,  fontWeight: 700 }}>
              C {Math.round(Number(entry.carbs))}g
            </span>
            <span style={{ background: `${FAT_CLR}10`, border: `1px solid ${FAT_CLR}20`, borderRadius: 6, padding: '2px 7px', fontSize: 10, color: FAT_CLR, fontWeight: 700 }}>
              F {Math.round(Number(entry.fat))}g
            </span>
            {entry.weight_grams && (
              <span style={{ background: SURF2, borderRadius: 6, padding: '2px 7px', fontSize: 10, color: MUTED, fontWeight: 700 }}>
                {entry.weight_grams}g
              </span>
            )}
            {hasIngredients && (
              <span style={{ background: `${ORANGE}08`, borderRadius: 6, padding: '2px 7px', fontSize: 10, color: ORANGE, fontWeight: 700 }}>
                {entry.ingredients!.length} items
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: CAL_CLR, letterSpacing: -2, lineHeight: 1 }}>
            {Math.round(Number(entry.calories))}
          </div>
          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1, marginTop: 2 }}>KCAL</div>
          {(() => {
            const kcal = Number(entry.calories); const prot = Number(entry.protein);
            if (kcal < 20 || prot < 1) return null;
            const eff = Math.round((prot / kcal) * 100 * 10) / 10;
            const color = eff >= 10 ? PROT : eff >= 6 ? GREEN : MUTED2;
            return (
              <div style={{ fontSize: 8, fontWeight: 700, color, marginTop: 2, letterSpacing: 0.5 }}>
                {eff}g P/100
              </div>
            );
          })()}
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: `1px solid ${EDGE}` }}>
        <button onClick={() => onEdit(entry)} style={{
          flex: 1, padding: '9px 0', background: 'none', border: 'none',
          color: ORANGE, fontSize: 11, fontWeight: 700, cursor: 'pointer',
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
          color: showBreakdown ? ORANGE : MUTED, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3,
        }}>Info {showBreakdown ? '▲' : '▼'}</button>
      </div>
      {showBreakdown && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${EDGE}`, background: SURF2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Protein', val: Math.round(Number(entry.protein)), unit: 'g', color: PROT    },
              { label: 'Carbs',   val: Math.round(Number(entry.carbs)),   unit: 'g', color: YELLOW  },
              { label: 'Fat',     val: Math.round(Number(entry.fat)),     unit: 'g', color: FAT_CLR },
            ].map(({ label, val, unit, color }) => (
              <div key={label} style={{ textAlign: 'center', background: SURF, borderRadius: 10, padding: '8px 4px', border: `1px solid ${EDGE}` }}>
                <div style={{ fontSize: 18, fontWeight: 900, color, letterSpacing: -0.5 }}>{val}{unit}</div>
                <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>{label}</div>
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
                  <div style={{ width: `${pP}%`, background: ORANGE  }} />
                  <div style={{ width: `${cP}%`, background: YELLOW  }} />
                  <div style={{ width: `${fP}%`, background: FAT_CLR }} />
                </div>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: ORANGE,  fontWeight: 700 }}>P {pP}%</span>
                  <span style={{ fontSize: 10, color: YELLOW,  fontWeight: 700 }}>C {cP}%</span>
                  <span style={{ fontSize: 10, color: FAT_CLR, fontWeight: 700 }}>F {fP}%</span>
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
                          <div style={{ fontSize: 15, fontWeight: 900, color: ORANGE, letterSpacing: -0.5 }}>{Math.round(ing.calories)} <span style={{ fontSize: 9, fontWeight: 700, color: MUTED }}>kcal</span></div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>{pct}% of meal</div>
                        </div>
                      </div>
                      {/* Calorie bar */}
                      <div style={{ height: 4, background: SURF2, borderRadius: 2, marginBottom: 4 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: ORANGE, borderRadius: 2, opacity: 0.7 }} />
                      </div>
                      {/* Macro row */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 9, color: GREEN,  fontWeight: 700 }}>P {Math.round(ing.protein)}g</span>
                        <span style={{ fontSize: 9, color: ORANGE, fontWeight: 700 }}>C {Math.round(ing.carbs)}g</span>
                        <span style={{ fontSize: 9, color: FAT_CLR, fontWeight: 700 }}>F {Math.round(ing.fat)}g</span>
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
          flexShrink: 0, padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
          background: form.meal === m ? ORANGE : SURF2,
          border: `1px solid ${form.meal === m ? ORANGE : EDGE}`,
          color: form.meal === m ? '#fff' : MUTED, fontWeight: 700, fontSize: 11,
          fontFamily: 'inherit',
        }}>{MEAL_LABEL[m]}</button>
      ))}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ color: RED, fontSize: 12, marginBottom: 12, padding: '10px 13px', background: 'rgba(198,40,40,0.06)', borderRadius: 10, fontWeight: 700, border: '1px solid rgba(198,40,40,0.18)', lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

function bigBtn(disabled: boolean, color: string, flex?: number): React.CSSProperties {
  return {
    ...(flex ? { flex } : { width: '100%' }),
    padding: '15px 0', borderRadius: 8, border: 'none',
    background: disabled ? SURF2 : color,
    color: disabled ? MUTED : '#fff',
    fontWeight: 800, fontSize: 15, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
    boxShadow: disabled ? 'none' : `0 4px 20px ${color}40`,
  };
}
