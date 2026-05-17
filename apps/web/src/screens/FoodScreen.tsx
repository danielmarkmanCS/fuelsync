import { useState, useEffect, useCallback, useRef } from 'react';
import { getLogs, addLog, deleteLog, softDeleteLog, unremoveLog, estimateByWeight, estimateByDescription, analyzeByImage, suggestMeal } from '../api/localFood';
import type { FoodLog, AIEstimate, IngredientItem } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';
import { playFoodLogSound } from '../utils/sounds';

const BG     = '#EEF4FF';
const SURF   = '#FFFFFF';
const SURF2  = '#E4EEFF';
const EDGE   = 'rgba(0,56,168,0.10)';
const TEXT   = '#0A1628';
const MUTED  = '#6878A0';
const BLUE   = '#0038A8';
const GREEN  = '#00A651';
const ORANGE = '#E65100';
const PURPLE = '#7B1FA2';
const RED    = '#C62828';

const MEAL_TYPES = ['breakfast', 'pre_workout', 'lunch', 'post_workout', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack',
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
              <span style={{ fontSize: 9, color: GREEN, fontWeight: 700 }}>P{Math.round(item.protein)}</span>
              <span style={{ fontSize: 9, color: ORANGE, fontWeight: 700 }}>C{Math.round(item.carbs)}</span>
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
                  { label: 'P(g)',  key: 'protein'  as const, color: GREEN },
                  { label: 'C(g)',  key: 'carbs'    as const, color: ORANGE },
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
  const [mode,       setMode]       = useState<'ai' | 'photo' | 'manual' | 'suggest'>('ai');
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

  const resetSheet = () => {
    setForm(emptyForm()); setEstimate(null);
    setAiError(''); setFormError(''); setAiQuery(''); setEditingId(null); setBasePerGram(null);
    setSuggestResult(null); setEditableIngredients(null);
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
    try {
      if (editingId !== null) await deleteLog(editingId);
      await addLog({
        food_name: form.name.trim(), calories: parseFloat(form.calories),
        protein: parseFloat(form.protein), carbs: parseFloat(form.carbs), fat: parseFloat(form.fat),
        weight_grams: w && !isNaN(w) ? w : undefined, meal_type: form.meal,
        image_url: estimate?.imageUrl ?? undefined,
        ingredients: editableIngredients?.length ? editableIngredients : null,
      });
      if (!editingId) playFoodLogSound();
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
        background: 'linear-gradient(135deg, #0038A8 0%, #1565E0 100%)',
        padding: '44px 22px 20px',
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase' }}>Fuel Log</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => setSelectedDate((d) => offsetDate(d, -1))} style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 10, color: '#fff', fontSize: 18, width: 38, height: 38,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>‹</button>
          <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: '#FFFFFF', lineHeight: 1.1 }}>
              {dateLabel(selectedDate).toUpperCase()}
            </div>
            {isToday ? (
              <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: 1 }}>{nowTime}</div>
            ) : (
              <button onClick={() => setSelectedDate(todayStr)} style={{
                marginTop: 6, background: 'rgba(255,255,255,0.2)', border: 'none',
                borderRadius: 20, color: '#fff', fontSize: 10, fontWeight: 700,
                padding: '4px 12px', cursor: 'pointer', letterSpacing: 1,
              }}>Back to Today</button>
            )}
          </div>
          <button onClick={() => { if (!isToday) setSelectedDate((d) => offsetDate(d, 1)); }} style={{
            background: isToday ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 10, color: isToday ? 'rgba(255,255,255,0.3)' : '#fff',
            fontSize: 18, width: 38, height: 38,
            cursor: isToday ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>›</button>
        </div>
      </div>

      {/* ── CALORIE + MACROS ── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 22px 0' }}>
        <div style={{ background: SURF, borderRadius: 20, border: `1px solid ${EDGE}`, padding: '20px 20px 16px', overflow: 'hidden', position: 'relative', boxShadow: '0 4px 20px rgba(0,56,168,0.08)' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,56,168,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Calories Consumed</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: -4, lineHeight: 1, color: calPct >= 100 ? RED : TEXT }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && <div style={{ fontSize: 14, fontWeight: 700, color: MUTED, paddingBottom: 8 }}>/ {Math.round(targets.calories).toLocaleString()}</div>}
          </div>
          <div style={{ height: 4, background: 'rgba(0,56,168,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: '100%', width: `${calPct}%`, background: calPct >= 100 ? RED : BLUE, borderRadius: 2, transition: 'width 0.6s ease' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { name: 'Protein', val: consumed.protein, tgt: targets?.proteinG, color: GREEN },
              { name: 'Carbs',   val: consumed.carbs,   tgt: targets?.carbsG,   color: ORANGE },
              { name: 'Fat',     val: consumed.fat,     tgt: targets?.fatG,     color: PURPLE },
            ].map(({ name, val, tgt, color }) => {
              const pct2 = tgt && tgt > 0 ? Math.min((val / tgt) * 100, 100) : 0;
              return (
                <div key={name}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: color, textTransform: 'uppercase', marginBottom: 4 }}>{name}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: TEXT, lineHeight: 1 }}>
                    {Math.round(val)}<span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>g</span>
                  </div>
                  <div style={{ marginTop: 6, height: 3, background: 'rgba(0,56,168,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct2}%`, background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── FOOD LOG ── */}
      <div className="nrc-a nrc-a3" style={{ padding: '24px 22px 100px' }}>
        {byMeal.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -3, color: 'rgba(0,56,168,0.07)', marginBottom: 14 }}>EMPTY</div>
            <div style={{ color: MUTED, fontSize: 13, fontWeight: 600 }}>Tap + to log your first meal</div>
          </div>
        ) : byMeal.map(({ meal, entries }) => (
          <div key={meal} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>{MEAL_LABEL[meal as MealType] ?? 'Other'}</div>
            {entries.map((entry) => (
              <FoodCard key={entry.id} entry={entry} onEdit={openEdit} onDelete={handleDelete}
                onReLog={!isToday ? handleReLog : undefined}
                reLogLabel={!isToday ? 'Log today' : undefined}
              />
            ))}
          </div>
        ))}
      </div>

      {/* ── FAB ── */}
      {isToday && <button onClick={() => { setOpen(true); setMode('ai'); }} className="nrc-press" style={{
        position: 'fixed', bottom: 84, right: 'max(20px, calc(50vw - 220px))',
        width: 56, height: 56, borderRadius: 28, background: BLUE,
        border: 'none', cursor: 'pointer', fontSize: 28, fontWeight: 900,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 24px ${BLUE}55`,
      }}>+</button>}

      {/* ── UNDO TOAST ── */}
      {undoEntry && (
        <div style={{
          position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)',
          background: TEXT, borderRadius: 12, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 4px 20px rgba(10,22,40,0.25)',
          zIndex: 200, maxWidth: 340, width: 'calc(100vw - 40px)',
          animation: 'slideUp 0.3s ease both',
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
          <div style={{ background: '#F8FBFF', borderRadius: '24px 24px 0 0', maxWidth: 480, width: '100%', margin: '0 auto', borderTop: `1px solid ${EDGE}`, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 -8px 40px rgba(0,56,168,0.12)' }}>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,56,168,0.15)' }} />
            </div>

            <div style={{ padding: '16px 22px 44px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: MUTED, textTransform: 'uppercase' }}>
                  {editingId ? 'Edit Fuel' : 'Log Fuel'}
                </div>
                <button onClick={closeSheet} style={{ background: SURF2, border: `1px solid ${EDGE}`, color: MUTED, fontSize: 18, cursor: 'pointer', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>

              {/* Mode tabs */}
              <div style={{ display: 'flex', borderBottom: `2px solid ${EDGE}`, marginBottom: 24 }}>
                {([['ai', 'AI'], ['photo', 'Photo'], ['manual', 'Manual'], ['suggest', 'Suggest']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => { setMode(m); setAiError(''); setFormError(''); setSuggestResult(null); }} style={{
                    flex: 1, padding: '10px 0', background: 'none', border: 'none',
                    borderBottom: `2px solid ${mode === m ? BLUE : 'transparent'}`,
                    marginBottom: -2,
                    color: mode === m ? BLUE : MUTED,
                    fontWeight: mode === m ? 800 : 600,
                    fontSize: 12, cursor: 'pointer', transition: 'color 0.15s',
                    fontFamily: 'inherit', letterSpacing: 0.3,
                  }}>{label}</button>
                ))}
              </div>

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
                    background: aiLoading ? SURF2 : 'rgba(0,56,168,0.03)',
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

function FoodCard({ entry, onEdit, onDelete, onReLog, reLogLabel }: {
  entry: FoodLog;
  onEdit: (e: FoodLog) => void;
  onDelete: (e: FoodLog) => void;
  onReLog?: (e: FoodLog) => void;
  reLogLabel?: string;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const hasIngredients = entry.ingredients && entry.ingredients.length > 1;
  return (
    <div style={{ background: SURF, borderRadius: 16, marginBottom: 8, border: `1px solid ${EDGE}`, overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,56,168,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px' }}>
        {entry.image_url && <img src={entry.image_url} alt={entry.food_name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: TEXT, fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{entry.food_name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
            <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>P {Math.round(Number(entry.protein))}g</span>
            <span style={{ fontSize: 10, color: ORANGE, fontWeight: 700 }}>C {Math.round(Number(entry.carbs))}g</span>
            <span style={{ fontSize: 10, color: PURPLE, fontWeight: 700 }}>F {Math.round(Number(entry.fat))}g</span>
            {entry.weight_grams && <span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{entry.weight_grams}g</span>}
            {hasIngredients && <span style={{ fontSize: 10, color: BLUE, fontWeight: 600 }}>{entry.ingredients!.length} items</span>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: BLUE, letterSpacing: -0.5 }}>{Math.round(Number(entry.calories))}</div>
          <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1 }}>KCAL</div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: `1px solid ${EDGE}` }}>
        <button onClick={() => onEdit(entry)} style={{
          flex: 1, padding: '9px 0', background: 'none', border: 'none',
          color: MUTED, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          borderRight: `1px solid ${EDGE}`, letterSpacing: 0.5,
        }}>Edit</button>
        <button onClick={() => onDelete(entry)} style={{
          flex: 1, padding: '9px 0', background: 'none', border: 'none',
          color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
          borderRight: `1px solid ${EDGE}`,
        }}>Remove</button>
        {onReLog ? (
          <button onClick={() => onReLog(entry)} className="nrc-press" style={{
            flex: 1, padding: '9px 0', background: 'none', border: 'none',
            color: BLUE, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
            borderRight: `1px solid ${EDGE}`,
          }}>{reLogLabel ?? 'Again'}</button>
        ) : null}
        <button onClick={() => setShowBreakdown((v) => !v)} style={{
          flex: onReLog ? undefined : 1, padding: '9px 12px', background: 'none', border: 'none',
          color: showBreakdown ? BLUE : MUTED, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
        }}>Info {showBreakdown ? '▲' : '▼'}</button>
      </div>
      {showBreakdown && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${EDGE}`, background: '#F8FBFF' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Protein', val: Math.round(Number(entry.protein)), unit: 'g', color: GREEN },
              { label: 'Carbs',   val: Math.round(Number(entry.carbs)),   unit: 'g', color: ORANGE },
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
                  <div style={{ width: `${pP}%`, background: GREEN }} />
                  <div style={{ width: `${cP}%`, background: ORANGE }} />
                  <div style={{ width: `${fP}%`, background: PURPLE }} />
                </div>
                <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>P {pP}%</span>
                  <span style={{ fontSize: 10, color: ORANGE, fontWeight: 700 }}>C {cP}%</span>
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
