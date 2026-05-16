import { useState, useEffect, useCallback } from 'react';
import { getLogs, addLog, deleteLog, estimateByWeight, estimateByDescription, analyzeByImage } from '../api/localFood';
import type { FoodLog, AIEstimate } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';
import { playFoodLogSound } from '../utils/sounds';

const RED = '#FF3B30';

const MEAL_TYPES = ['breakfast', 'pre_workout', 'lunch', 'post_workout', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack',
};

interface Form {
  name: string;
  amount: string;       // grams OR text like "2 eggs"
  amountIsText: boolean;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  meal: MealType;
}
const EMPTY: Form = { name: '', amount: '', amountIsText: false, calories: '', protein: '', carbs: '', fat: '', meal: 'lunch' };

// Calories from macros: P×4 + C×4 + F×9
function calcCalories(p: number, c: number, f: number): number {
  return p * 4 + c * 4 + f * 9;
}

function validateEntry(form: Form): string | null {
  const p   = parseFloat(form.protein);
  const c   = parseFloat(form.carbs);
  const f   = parseFloat(form.fat);
  const cal = parseFloat(form.calories);
  const w   = parseFloat(form.amount);

  if (!form.name.trim()) return 'Enter a food name.';
  if (!form.amount.trim()) return 'Enter an amount or weight.';
  if ([p, c, f, cal].some(isNaN)) return 'Fill in all macro fields.';
  if (p < 0 || c < 0 || f < 0 || cal < 0) return 'Values cannot be negative.';

  // Macros must match calories (±12%)
  const macroCal = calcCalories(p, c, f);
  if (macroCal > 0 && cal > 0 && Math.abs(macroCal - cal) / cal > 0.12) {
    const expected = Math.round(macroCal);
    return `Calories (${Math.round(cal)} kcal) don't match macros — P·C·F add up to ~${expected} kcal. Fix one or the other.`;
  }

  // Macros can't exceed weight (only when weight is a number)
  if (!form.amountIsText && !isNaN(w) && w > 0) {
    const total = p + c + f;
    if (total > w * 1.1) {
      return `Total macros (${Math.round(total)}g) exceed food weight (${w}g). Check your numbers.`;
    }
    // Individual sanity: no single macro > 95% of weight
    if (p > w * 0.95) return `${Math.round(p)}g protein from ${w}g of food? That's not possible.`;
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

const CONF_COLOR: Record<string, string> = { high: '#22c55e', medium: '#f59e0b', low: RED };

const baseInp: React.CSSProperties = {
  background: '#FAFAFA', border: '1px solid #E5E5EA',
  borderRadius: 10, color: '#111111', fontSize: 14,
  padding: '13px 14px', outline: 'none',
  fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
};

export default function FoodScreen() {
  const { targets } = useNutrition();
  const today    = new Date().toISOString().split('T')[0];
  const dayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  const [logs,       setLogs]       = useState<FoodLog[]>([]);
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState<'ai' | 'photo' | 'manual' | 'suggest'>('ai');
  const [form,       setForm]       = useState<Form>(EMPTY);
  const [estimate,   setEstimate]   = useState<AIEstimate | null>(null);
  const [aiLoading,  setAiLoading]  = useState(false);
  const [aiError,    setAiError]    = useState('');
  const [formError,  setFormError]  = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [aiQuery,     setAiQuery]     = useState('');
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [basePerGram, setBasePerGram] = useState<{ protein: number; carbs: number; fat: number } | null>(null);
  const [suggestCtx,  setSuggestCtx]  = useState<'pre_workout'|'post_workout'|'rest'|'morning'|'evening'>('morning');
  const [suggestSize, setSuggestSize] = useState<'big'|'small'>('big');

  const fetchLogs = useCallback(() => getLogs(today).then(setLogs).catch(() => {}), [today]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const resetSheet = () => {
    setForm(EMPTY); setEstimate(null);
    setAiError(''); setFormError(''); setAiQuery(''); setEditingId(null); setBasePerGram(null);
  };
  const closeSheet = () => { setOpen(false); resetSheet(); };

  const openEdit = (entry: FoodLog) => {
    const grams = entry.weight_grams || 100;
    setForm({
      name:         entry.food_name,
      amount:       entry.weight_grams ? String(entry.weight_grams) : '1',
      amountIsText: !entry.weight_grams,
      calories:     String(Math.round(Number(entry.calories))),
      protein:      String(Math.round(Number(entry.protein))),
      carbs:        String(Math.round(Number(entry.carbs))),
      fat:          String(Math.round(Number(entry.fat))),
      meal:         (entry.meal_type as MealType) ?? 'lunch',
    });
    setBasePerGram({
      protein: Number(entry.protein) / grams,
      carbs:   Number(entry.carbs)   / grams,
      fat:     Number(entry.fat)     / grams,
    });
    setEstimate(null);
    setEditingId(entry.id);
    setMode('manual');
    setOpen(true);
  };

  // Auto-calc calories. If weight changes and we have per-gram rates, scale macros.
  const patch = (p: Partial<Form>) => {
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
      if (!isNaN(pr) && !isNaN(ca) && !isNaN(fa)) {
        next.calories = String(Math.round(calcCalories(pr, ca, fa)));
      }
      return next;
    });
    setFormError('');
  };

  const handleSuggest = async () => {
    const ctxLabel: Record<typeof suggestCtx, string> = {
      pre_workout: 'pre-workout', post_workout: 'post-workout',
      rest: 'rest day', morning: 'morning', evening: 'evening',
    };
    const prompt = `Suggest a specific ${suggestSize === 'big' ? 'full' : 'light'} ${ctxLabel[suggestCtx]} meal with exact macros. Give one specific meal (e.g. "Grilled chicken with rice and vegetables"). Include realistic portion size in grams.`;
    setAiLoading(true); setAiError('');
    try {
      const r = await estimateByDescription(prompt);
      const g = r.estimated_weight_grams || 100;
      setBasePerGram({ protein: r.protein/g, carbs: r.carbs/g, fat: r.fat/g });
      setEstimate(r);
      setForm({
        name: r.food_name, amount: String(g), amountIsText: false,
        calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)),
        carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)), meal: form.meal,
      });
      setMode('manual');
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  // Photo mode: image → analyze endpoint
  const handlePhotoAnalyze = async (file: File) => {
    setAiLoading(true); setAiError('');
    try {
      const r = await analyzeByImage(file);
      setEstimate(r);
      const g = r.estimated_weight_grams || 100;
      setBasePerGram({ protein: r.protein / g, carbs: r.carbs / g, fat: r.fat / g });
      setForm({
        name: r.food_name, amount: String(g), amountIsText: false,
        calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)),
        carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)), meal: form.meal,
      });
      setMode('manual');
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'Photo analysis failed'); }
    finally { setAiLoading(false); }
  };

  // AI Smart mode: free-text → describe endpoint
  const handleAISmart = async () => {
    const q = aiQuery.trim();
    if (!q) { setAiError('Describe what you ate.'); return; }
    setAiLoading(true); setAiError('');
    try {
      const r = await estimateByDescription(q);
      setEstimate(r);
      const g = r.estimated_weight_grams || 100;
      setBasePerGram({ protein: r.protein/g, carbs: r.carbs/g, fat: r.fat/g });
      setForm({
        name: r.food_name,
        amount: String(g),
        amountIsText: false,
        calories: String(Math.round(r.calories)),
        protein:  String(Math.round(r.protein)),
        carbs:    String(Math.round(r.carbs)),
        fat:      String(Math.round(r.fat)),
        meal: form.meal,
      });
      setMode('manual');
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  // Manual mode AI assist: name + weight → estimate endpoint
  const handleWeightAI = async () => {
    const name = form.name.trim();
    const w    = parseFloat(form.amount);
    if (!name) { setAiError('Enter a food name first.'); return; }
    if (isNaN(w) || w <= 0) { setAiError('Enter weight in grams.'); return; }
    setAiLoading(true); setAiError('');
    try {
      const r = await estimateByWeight(name, w);
      setEstimate(r);
      setBasePerGram({ protein: r.protein/w, carbs: r.carbs/w, fat: r.fat/w });
      setForm((f) => ({
        ...f,
        name: r.food_name,
        calories: String(Math.round(r.calories)),
        protein:  String(Math.round(r.protein)),
        carbs:    String(Math.round(r.carbs)),
        fat:      String(Math.round(r.fat)),
      }));
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  const handleAdd = async () => {
    const err = validateEntry(form);
    if (err) { setFormError(err); return; }

    const w   = form.amountIsText ? null : parseFloat(form.amount);
    const cal = parseFloat(form.calories);
    const pro = parseFloat(form.protein);
    const carbs = parseFloat(form.carbs);
    const fat = parseFloat(form.fat);

    setSubmitting(true); setFormError('');
    try {
      if (editingId !== null) {
        await deleteLog(editingId);
      }
      await addLog({
        food_name:    form.name.trim(),
        calories:     cal,
        protein:      pro,
        carbs,
        fat,
        weight_grams: w && !isNaN(w) ? w : undefined,
        meal_type:    form.meal,
        image_url:    estimate?.imageUrl ?? undefined,
      });
      if (!editingId) playFoodLogSound();
      fetchLogs();
      closeSheet();
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const consumed = sumMacros(logs);
  const byMeal   = MEAL_TYPES
    .map((m) => ({ meal: m, entries: logs.filter((l) => l.meal_type === m) }))
    .filter((g) => g.entries.length > 0);
  const calPct = targets && targets.calories > 0
    ? Math.min((consumed.calories / targets.calories) * 100, 100) : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#F2F2F7', position: 'relative' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="nrc-a nrc-a1" style={{ padding: '28px 20px 0' }}>
        <div className="nrc-label" style={{ marginBottom: 6 }}>Fuel Log</div>
        <div className="nrc-hero" style={{ fontSize: 32 }}>{dayLabel}</div>
      </div>

      {/* ── HERO CALORIES ──────────────────────────────────────── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 20px 0' }}>
        <div style={{
          background: '#FFFFFF', borderRadius: 20,
          padding: '20px 20px 16px', position: 'relative', overflow: 'hidden',
          border: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
        }}>
          <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,59,48,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div className="nrc-label" style={{ marginBottom: 10 }}>Calories Consumed</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div className="nrc-hero" style={{ fontSize: 60, color: calPct >= 100 ? RED : '#111111' }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && <div style={{ fontSize: 16, fontWeight: 700, color: '#BBBBBB', paddingBottom: 8 }}>/ {Math.round(targets.calories).toLocaleString()}</div>}
          </div>
          <div style={{ marginTop: 14, height: 3, background: 'rgba(0,0,0,0.07)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${calPct}%`, background: RED, borderRadius: 2, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>

      {/* ── MACRO ROW ──────────────────────────────────────────── */}
      <div className="nrc-a nrc-a3" style={{ padding: '10px 20px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: 'Protein', val: consumed.protein, tgt: targets?.proteinG },
            { label: 'Carbs',   val: consumed.carbs,   tgt: targets?.carbsG },
            { label: 'Fat',     val: consumed.fat,     tgt: targets?.fatG },
          ].map(({ label, val, tgt }) => {
            const pct = tgt && tgt > 0 ? Math.min((val / tgt) * 100, 100) : 0;
            return (
              <div key={label} className="nrc-press" style={{ background: '#FFFFFF', borderRadius: 14, padding: '12px 10px 10px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 1px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#999999', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
                <div className="nrc-hero" style={{ fontSize: 26, marginBottom: 8 }}>
                  {Math.round(val)}<span style={{ fontSize: 12, color: '#BBBBBB', fontWeight: 600 }}>g</span>
                </div>
                <div className="volt-bar-track"><div className="volt-bar-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── FOOD LOG ───────────────────────────────────────────── */}
      <div className="nrc-a nrc-a4" style={{ padding: '28px 20px 100px' }}>
        {byMeal.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div className="nrc-hero" style={{ fontSize: 44, color: 'rgba(0,0,0,0.07)', marginBottom: 14 }}>EMPTY</div>
            <div style={{ color: '#AAAAAA', fontSize: 13, fontWeight: 600 }}>Tap + to log your first meal</div>
          </div>
        ) : byMeal.map(({ meal, entries }) => (
          <div key={meal} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#AAAAAA', textTransform: 'uppercase', marginBottom: 10 }}>
              {MEAL_LABEL[meal]}
            </div>
            {entries.map((entry) => (
              <div key={entry.id} style={{ background: '#FFFFFF', borderRadius: 14, marginBottom: 8, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px' }}>
                  {entry.image_url && <img src={entry.image_url} alt={entry.food_name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#111111', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{entry.food_name}</div>
                    <div style={{ color: '#AAAAAA', fontSize: 11, marginTop: 4 }}>
                      P {Math.round(Number(entry.protein))}g · C {Math.round(Number(entry.carbs))}g · F {Math.round(Number(entry.fat))}g
                      {entry.weight_grams ? ` · ${entry.weight_grams}g` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: RED, letterSpacing: -0.5 }}>{Math.round(Number(entry.calories))}</div>
                    <div style={{ fontSize: 9, color: '#AAAAAA', fontWeight: 700, letterSpacing: 1 }}>KCAL</div>
                  </div>
                </div>
                <div style={{ display: 'flex', borderTop: '1px solid #F5F5F5' }}>
                  <button onClick={() => openEdit(entry)} style={{
                    flex: 1, padding: '8px 0', background: 'none', border: 'none',
                    color: '#AAAAAA', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    cursor: 'pointer', borderRight: '1px solid #F5F5F5',
                  }}>✏️ Edit</button>
                  <button onClick={() => deleteLog(entry.id).then(fetchLogs).catch(() => {})} style={{
                    flex: 1, padding: '8px 0', background: 'none', border: 'none',
                    color: '#FFBBB8', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    cursor: 'pointer',
                  }}>× Remove</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── FAB ─────────────────────────────────────────────────── */}
      <button onClick={() => { setOpen(true); setMode('ai'); }} className="nrc-press" style={{
        position: 'fixed', bottom: 84, right: 'max(20px, calc(50vw - 220px))',
        width: 56, height: 56, borderRadius: 28, background: RED,
        border: 'none', cursor: 'pointer', fontSize: 28, fontWeight: 900,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(255,28,28,0.4)',
      }}>+</button>

      {/* ── ADD SHEET ───────────────────────────────────────────── */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: '24px 24px 0 0', padding: '26px 22px 44px', maxWidth: 480, width: '100%', margin: '0 auto', borderTop: '1px solid rgba(0,0,0,0.08)', maxHeight: '92vh', overflowY: 'auto' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div className="nrc-hero" style={{ fontSize: 26 }}>{editingId ? 'Edit Fuel' : 'Add Fuel'}</div>
              <button onClick={closeSheet} style={{ background: '#F5F5F5', border: '1px solid #E5E5EA', color: '#AAAAAA', fontSize: 18, cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', background: '#F2F2F7', borderRadius: 12, padding: 3, marginBottom: 20, border: '1px solid #E5E5EA' }}>
              {([['ai', '🤖 AI'], ['photo', '📷 Photo'], ['manual', '✏️ Manual'], ['suggest', '✨ Suggest']] as const).map(([m, label]) => (
                <button key={m} onClick={() => { setMode(m); setAiError(''); setFormError(''); }} className="nrc-press" style={{
                  flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: mode === m ? RED : 'transparent',
                  color: mode === m ? '#fff' : '#888888',
                  fontWeight: 700, fontSize: 11, transition: 'all 0.18s',
                }}>{label}</button>
              ))}
            </div>

            {/* ── AI SMART MODE ─────────────────────────────── */}
            {mode === 'ai' && (
              <>
                <div style={{ fontSize: 12, color: '#888888', marginBottom: 10, lineHeight: 1.5 }}>
                  Describe anything: "100g chicken breast", "2 scrambled eggs", "bowl of overnight oats with banana"
                </div>
                <textarea
                  autoFocus
                  value={aiQuery}
                  onChange={(e) => { setAiQuery(e.target.value); setAiError(''); }}
                  placeholder="What did you eat?"
                  rows={3}
                  style={{ ...baseInp, width: '100%', resize: 'none', marginBottom: 12, lineHeight: 1.6 }}
                />

                {/* Meal picker (even in AI mode) */}
                <MealChips form={form} setForm={setForm} />

                {aiError && <ErrMsg msg={aiError} />}

                <button onClick={handleAISmart} disabled={aiLoading} className="nrc-press" style={{
                  width: '100%', padding: 15, borderRadius: 14, border: 'none',
                  background: aiLoading ? '#1A1A1A' : RED,
                  color: aiLoading ? '#444' : '#fff',
                  fontWeight: 800, fontSize: 15, cursor: aiLoading ? 'not-allowed' : 'pointer',
                }}>
                  {aiLoading ? 'Analysing…' : 'Analyse with AI →'}
                </button>
              </>
            )}

            {/* ── PHOTO MODE ────────────────────────────────── */}
            {mode === 'photo' && (
              <>
                <div style={{ fontSize: 12, color: '#888888', marginBottom: 16, lineHeight: 1.6 }}>
                  Take a photo or upload one — AI will estimate the calories and macros.
                </div>

                <label style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 12, padding: '32px 20px', borderRadius: 16,
                  border: `2px dashed ${aiLoading ? '#DDDDDD' : RED}`,
                  background: aiLoading ? '#FAFAFA' : 'rgba(255,59,48,0.03)',
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.18s',
                }}>
                  <input
                    type="file" accept="image/*" capture="environment"
                    style={{ display: 'none' }}
                    disabled={aiLoading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoAnalyze(file);
                      e.target.value = '';
                    }}
                  />
                  <div style={{ fontSize: 40 }}>{aiLoading ? '⏳' : '📷'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: aiLoading ? '#AAAAAA' : RED }}>
                    {aiLoading ? 'Analysing photo…' : 'Tap to take or upload photo'}
                  </div>
                  <div style={{ fontSize: 11, color: '#BBBBBB', fontWeight: 500 }}>
                    Camera · Gallery · Screenshot
                  </div>
                </label>

                <MealChips form={form} setForm={setForm} />
                {aiError && <ErrMsg msg={aiError} />}
              </>
            )}

            {/* ── SUGGEST MODE ──────────────────────────────── */}
            {mode === 'suggest' && (
              <>
                <div style={{ fontSize: 12, color: '#888888', marginBottom: 16, lineHeight: 1.5 }}>
                  Tell me where you are in your day and I'll suggest the right meal.
                </div>

                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 10 }}>When is this?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                  {([
                    ['morning',      '🌅 Morning'],
                    ['pre_workout',  '⚡ Pre-Workout'],
                    ['post_workout', '💪 Post-Workout'],
                    ['rest',         '😴 Rest Day'],
                    ['evening',      '🌙 Evening'],
                  ] as const).map(([v, label]) => (
                    <button key={v} onClick={() => setSuggestCtx(v)} style={{
                      padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                      background: suggestCtx === v ? 'rgba(255,59,48,0.06)' : '#FAFAFA',
                      border: `1px solid ${suggestCtx === v ? RED : '#EEEEEE'}`,
                      borderLeft: suggestCtx === v ? `3px solid ${RED}` : '1px solid #EEEEEE',
                      color: suggestCtx === v ? RED : '#888888',
                      fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
                    }}>{label}</button>
                  ))}
                </div>

                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 10 }}>Meal size</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
                  {([['big', '🍽 Full meal'], ['small', '🥗 Light meal']] as const).map(([v, label]) => (
                    <button key={v} onClick={() => setSuggestSize(v)} style={{
                      flex: 1, padding: 12, borderRadius: 12, cursor: 'pointer',
                      background: suggestSize === v ? 'rgba(255,59,48,0.06)' : '#FAFAFA',
                      border: `1px solid ${suggestSize === v ? RED : '#EEEEEE'}`,
                      color: suggestSize === v ? RED : '#888888',
                      fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
                    }}>{label}</button>
                  ))}
                </div>

                <MealChips form={form} setForm={setForm} />
                {aiError && <ErrMsg msg={aiError} />}

                <button onClick={handleSuggest} disabled={aiLoading} className="nrc-press" style={{
                  width: '100%', padding: 15, borderRadius: 14, border: 'none',
                  background: aiLoading ? '#F2F2F7' : RED,
                  color: aiLoading ? '#AAAAAA' : '#fff',
                  fontWeight: 800, fontSize: 15, cursor: aiLoading ? 'not-allowed' : 'pointer',
                }}>
                  {aiLoading ? 'Thinking…' : '✨ Suggest a meal →'}
                </button>
              </>
            )}

            {/* ── MANUAL MODE ───────────────────────────────── */}
            {mode === 'manual' && (
              <>
                {/* AI filled banner */}
                {estimate && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: '#F8F8F8', borderRadius: 12, padding: '10px 14px', border: '1px solid #E5E5EA' }}>
                    {estimate.imageUrl && <img src={estimate.imageUrl} alt={estimate.food_name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#111111', fontSize: 13, fontWeight: 700 }}>{estimate.food_name}</div>
                      <div style={{ color: '#888888', fontSize: 11, marginTop: 1 }}>AI estimate · {estimate.estimated_weight_grams}g</div>
                    </div>
                    <div style={{ background: `${CONF_COLOR[estimate.confidence]}12`, border: `1px solid ${CONF_COLOR[estimate.confidence]}30`, borderRadius: 8, padding: '3px 9px' }}>
                      <span style={{ color: CONF_COLOR[estimate.confidence], fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{estimate.confidence.toUpperCase()}</span>
                    </div>
                  </div>
                )}

                {/* Food name */}
                <input style={{ ...baseInp, width: '100%', marginBottom: 10 }}
                  value={form.name} onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Food name (e.g. Chicken Breast)" autoFocus={!estimate}
                />

                {/* Amount / weight row */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'stretch' }}>
                  {/* Unit toggle */}
                  <div style={{ display: 'flex', background: '#F2F2F7', borderRadius: 10, border: '1px solid #E5E5EA', flexShrink: 0 }}>
                    {([false, true] as const).map((isText) => (
                      <button key={String(isText)} onClick={() => patch({ amountIsText: isText, amount: '' })} style={{
                        padding: '0 12px', background: form.amountIsText === isText ? '#FFFFFF' : 'transparent',
                        border: 'none', borderRadius: 8, color: form.amountIsText === isText ? '#111111' : '#AAAAAA',
                        fontWeight: 700, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>
                        {isText ? 'qty' : 'g'}
                      </button>
                    ))}
                  </div>

                  <input
                    style={{ ...baseInp, flex: 1 }}
                    type={form.amountIsText ? 'text' : 'number'}
                    value={form.amount}
                    onChange={(e) => patch({ amount: e.target.value })}
                    placeholder={form.amountIsText ? 'e.g. 2 eggs, 1 cup' : 'Weight in grams'}
                  />

                  {/* AI assist button (only when weight in grams) */}
                  {!form.amountIsText && (
                    <button onClick={handleWeightAI} disabled={aiLoading} className="nrc-press" style={{
                      background: 'rgba(255,28,28,0.08)', border: '1px solid rgba(255,28,28,0.2)',
                      borderRadius: 10, color: RED, fontWeight: 800, fontSize: 12,
                      cursor: aiLoading ? 'not-allowed' : 'pointer', padding: '0 14px', letterSpacing: 0.5,
                      whiteSpace: 'nowrap',
                    }}>
                      {aiLoading ? '…' : '✦ AI'}
                    </button>
                  )}
                </div>

                {aiError && <ErrMsg msg={aiError} />}

                {/* Macros — calories auto-calculated */}
                <div style={{ background: '#F8F8F8', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #EEEEEE' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#999999', textTransform: 'uppercase', marginBottom: 10 }}>Macros</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <MacroInput label="Protein" color="rgba(255,28,28,0.3)"  value={form.protein} onChange={(v) => patch({ protein: v })} />
                    <MacroInput label="Carbs"   color="rgba(245,158,11,0.3)" value={form.carbs}   onChange={(v) => patch({ carbs: v })} />
                    <MacroInput label="Fat"     color="rgba(99,102,241,0.3)" value={form.fat}     onChange={(v) => patch({ fat: v })} />
                  </div>
                  {/* Calories — read-only auto-calc, editable override */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#AAAAAA', textTransform: 'uppercase', flexShrink: 0 }}>Kcal</div>
                    <input
                      type="number"
                      value={form.calories}
                      onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))}
                      style={{ ...baseInp, flex: 1, padding: '10px 12px', fontSize: 20, fontWeight: 900, color: RED, letterSpacing: -0.5, background: 'transparent', border: 'none' }}
                      placeholder="—"
                    />
                    <div style={{ fontSize: 10, color: '#AAAAAA', flexShrink: 0 }}>auto</div>
                  </div>
                  {/* Live calories preview */}
                  {(() => {
                    const p = parseFloat(form.protein), c = parseFloat(form.carbs), fa = parseFloat(form.fat);
                    const entered = parseFloat(form.calories);
                    if (isNaN(p) || isNaN(c) || isNaN(fa)) return null;
                    const computed = calcCalories(p, c, fa);
                    if (!isNaN(entered) && entered > 0 && Math.abs(computed - entered) / entered > 0.12) {
                      return (
                        <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8, fontWeight: 600 }}>
                          ⚠ Macros compute to ~{Math.round(computed)} kcal — check your numbers
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <MealChips form={form} setForm={setForm} />

                {formError && <ErrMsg msg={formError} />}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button onClick={closeSheet} className="nrc-press" style={{ flex: 1, padding: 15, borderRadius: 14, border: '1px solid #E5E5EA', background: 'none', color: '#888888', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={handleAdd} disabled={submitting} className="nrc-press" style={{
                    flex: 2, padding: 15, borderRadius: 14, border: 'none',
                    background: submitting ? '#F2F2F7' : RED,
                    color: submitting ? '#AAAAAA' : '#fff',
                    fontWeight: 800, fontSize: 15, cursor: submitting ? 'not-allowed' : 'pointer',
                  }}>{submitting ? 'Saving…' : editingId ? 'Save Changes →' : 'Log Fuel →'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Small reusable sub-components ─────────────────────────── */

function MacroInput({ label, color, value, onChange }: { label: string; color: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#AAAAAA', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <input
        type="number" value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        style={{
          width: '100%', background: '#FFFFFF',
          border: `1px solid ${color}`,
          borderRadius: 8, color: '#111111', fontSize: 15, fontWeight: 700,
          padding: '10px 10px', outline: 'none', fontFamily: 'inherit',
        }}
      />
      <div style={{ fontSize: 9, color: '#AAAAAA', marginTop: 4, textAlign: 'right' }}>g</div>
    </div>
  );
}

function MealChips({ form, setForm }: { form: Form; setForm: React.Dispatch<React.SetStateAction<Form>> }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
      {MEAL_TYPES.map((m) => (
        <button key={m} onClick={() => setForm((f) => ({ ...f, meal: m }))} className="nrc-press" style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
          background: form.meal === m ? RED : '#F0F0F0',
          border: '1px solid', borderColor: form.meal === m ? RED : '#E5E5EA',
          color: form.meal === m ? '#fff' : '#888888',
          fontWeight: 700, fontSize: 11, transition: 'all 0.15s',
        }}>{MEAL_LABEL[m]}</button>
      ))}
    </div>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return (
    <div style={{ color: RED, fontSize: 12, marginBottom: 12, padding: '10px 13px', background: 'rgba(255,59,48,0.06)', borderRadius: 10, fontWeight: 600, border: '1px solid rgba(255,59,48,0.18)', lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}
