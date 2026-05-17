import { useState, useEffect, useCallback } from 'react';
import { getLogs, addLog, deleteLog, estimateByWeight, estimateByDescription, analyzeByImage } from '../api/localFood';
import type { FoodLog, AIEstimate } from '../api/localFood';
import { useNutrition } from '../hooks/useNutrition';
import { playFoodLogSound } from '../utils/sounds';

const BG     = '#060606';
const SURF   = '#0F0F0F';
const SURF2  = '#161616';
const EDGE   = 'rgba(255,255,255,0.08)';
const RED    = '#FF453A';
const GREEN  = '#30D158';
const ORANGE = '#FF9F0A';
const PURPLE = '#BF5AF2';

const MEAL_TYPES = ['breakfast', 'pre_workout', 'lunch', 'post_workout', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack',
};

interface Form {
  name: string; amount: string; amountIsText: boolean;
  calories: string; protein: string; carbs: string; fat: string; meal: MealType;
}
const EMPTY: Form = { name: '', amount: '', amountIsText: false, calories: '', protein: '', carbs: '', fat: '', meal: 'lunch' };

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
  borderRadius: 12, color: '#FFFFFF', fontSize: 15,
  padding: '13px 15px', outline: 'none',
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
  const [aiQuery,    setAiQuery]    = useState('');
  const [editingId,  setEditingId]  = useState<string | null>(null);
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
    // If user manually edits a macro, clear AI-based scaling to prevent stale overrides
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
    const ctxLabel: Record<typeof suggestCtx, string> = { pre_workout: 'pre-workout', post_workout: 'post-workout', rest: 'rest day', morning: 'morning', evening: 'evening' };
    const prompt = `Suggest a specific ${suggestSize === 'big' ? 'full' : 'light'} ${ctxLabel[suggestCtx]} meal with exact macros. Include realistic portion size in grams.`;
    setAiLoading(true); setAiError('');
    try {
      const r = await estimateByDescription(prompt);
      const g = r.estimated_weight_grams || 100;
      setBasePerGram({ protein: r.protein/g, carbs: r.carbs/g, fat: r.fat/g });
      setEstimate(r);
      setForm({ name: r.food_name, amount: String(g), amountIsText: false, calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)), carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)), meal: form.meal });
      setMode('manual');
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  const handlePhotoAnalyze = async (file: File) => {
    setAiLoading(true); setAiError('');
    try {
      const r = await analyzeByImage(file);
      setEstimate(r);
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
      const g = r.estimated_weight_grams || 100;
      setBasePerGram({ protein: r.protein/g, carbs: r.carbs/g, fat: r.fat/g });
      setForm({ name: r.food_name, amount: String(g), amountIsText: false, calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)), carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)), meal: form.meal });
      setMode('manual');
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  const handleWeightAI = async () => {
    const name = form.name.trim(), w = parseFloat(form.amount);
    if (!name) { setAiError('Enter a food name first.'); return; }
    if (isNaN(w) || w <= 0) { setAiError('Enter weight in grams.'); return; }
    setAiLoading(true); setAiError('');
    try {
      const r = await estimateByWeight(name, w);
      setEstimate(r);
      setBasePerGram({ protein: r.protein/w, carbs: r.carbs/w, fat: r.fat/w });
      setForm((f) => ({ ...f, name: r.food_name, calories: String(Math.round(r.calories)), protein: String(Math.round(r.protein)), carbs: String(Math.round(r.carbs)), fat: String(Math.round(r.fat)) }));
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
      });
      if (!editingId) playFoodLogSound();
      fetchLogs(); closeSheet();
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const consumed = sumMacros(logs);
  const byMeal   = MEAL_TYPES.map((m) => ({ meal: m, entries: logs.filter((l) => l.meal_type === m) })).filter((g) => g.entries.length > 0);
  const calPct   = targets && targets.calories > 0 ? Math.min((consumed.calories / targets.calories) * 100, 100) : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG, position: 'relative' }}>

      {/* ── HEADER ── */}
      <div className="nrc-a nrc-a1" style={{ padding: '36px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#2A2A2A', marginBottom: 4, textTransform: 'uppercase' }}>Fuel Log</div>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1.5, color: '#FFFFFF' }}>{dayLabel}</div>
      </div>

      {/* ── CALORIE + MACROS ── */}
      <div className="nrc-a nrc-a2" style={{ padding: '20px 22px 0' }}>
        <div style={{ background: SURF, borderRadius: 20, border: `1px solid ${EDGE}`, padding: '20px 20px 16px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,69,58,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Calories Consumed</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 68, fontWeight: 900, letterSpacing: -4, lineHeight: 1, color: calPct >= 100 ? RED : '#FFFFFF' }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && <div style={{ fontSize: 14, fontWeight: 700, color: '#2A2A2A', paddingBottom: 8 }}>/ {Math.round(targets.calories).toLocaleString()}</div>}
          </div>
          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ height: '100%', width: `${calPct}%`, background: RED, borderRadius: 1, transition: 'width 0.6s ease' }} />
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
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: '#FFFFFF', lineHeight: 1 }}>
                    {Math.round(val)}<span style={{ fontSize: 10, color: '#333333', fontWeight: 600 }}>g</span>
                  </div>
                  <div style={{ marginTop: 6, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct2}%`, background: color, borderRadius: 1, transition: 'width 0.6s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── FOOD LOG ── */}
      <div className="nrc-a nrc-a3" style={{ padding: '28px 22px 100px' }}>
        {byMeal.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -3, color: 'rgba(255,255,255,0.04)', marginBottom: 14 }}>EMPTY</div>
            <div style={{ color: '#2A2A2A', fontSize: 13, fontWeight: 600 }}>Tap + to log your first meal</div>
          </div>
        ) : byMeal.map(({ meal, entries }) => (
          <div key={meal} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#2A2A2A', textTransform: 'uppercase', marginBottom: 10 }}>{MEAL_LABEL[meal]}</div>
            {entries.map((entry) => (
              <div key={entry.id} style={{ background: SURF, borderRadius: 16, marginBottom: 8, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px' }}>
                  {entry.image_url && <img src={entry.image_url} alt={entry.food_name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{entry.food_name}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                      <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>P {Math.round(Number(entry.protein))}g</span>
                      <span style={{ fontSize: 10, color: ORANGE, fontWeight: 700 }}>C {Math.round(Number(entry.carbs))}g</span>
                      <span style={{ fontSize: 10, color: PURPLE, fontWeight: 700 }}>F {Math.round(Number(entry.fat))}g</span>
                      {entry.weight_grams && <span style={{ fontSize: 10, color: '#333333', fontWeight: 600 }}>{entry.weight_grams}g</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: RED, letterSpacing: -0.5 }}>{Math.round(Number(entry.calories))}</div>
                    <div style={{ fontSize: 9, color: '#333333', fontWeight: 700, letterSpacing: 1 }}>KCAL</div>
                  </div>
                </div>
                <div style={{ display: 'flex', borderTop: `1px solid ${EDGE}` }}>
                  <button onClick={() => openEdit(entry)} style={{
                    flex: 1, padding: '9px 0', background: 'none', border: 'none',
                    color: '#3A3A3A', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    borderRight: `1px solid ${EDGE}`, letterSpacing: 0.5,
                  }}>Edit</button>
                  <button onClick={() => deleteLog(entry.id).then(fetchLogs).catch(() => {})} style={{
                    flex: 1, padding: '9px 0', background: 'none', border: 'none',
                    color: '#CC3333', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5,
                  }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── FAB ── */}
      <button onClick={() => { setOpen(true); setMode('ai'); }} className="nrc-press" style={{
        position: 'fixed', bottom: 84, right: 'max(20px, calc(50vw - 220px))',
        width: 56, height: 56, borderRadius: 28, background: RED,
        border: 'none', cursor: 'pointer', fontSize: 28, fontWeight: 900,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 4px 24px ${RED}55`,
      }}>+</button>

      {/* ── SHEET ── */}
      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 100 }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
          <div style={{ background: '#0A0A0A', borderRadius: '24px 24px 0 0', maxWidth: 480, width: '100%', margin: '0 auto', borderTop: `1px solid ${EDGE}`, maxHeight: '92vh', overflowY: 'auto' }}>

            {/* drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }} />
            </div>

            <div style={{ padding: '16px 22px 44px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: '#444444', textTransform: 'uppercase' }}>
                  {editingId ? 'Edit Fuel' : 'Log Fuel'}
                </div>
                <button onClick={closeSheet} style={{ background: SURF2, border: `1px solid ${EDGE}`, color: '#555555', fontSize: 18, cursor: 'pointer', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>

              {/* Mode tabs */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${EDGE}`, marginBottom: 24 }}>
                {([['ai', 'AI'], ['photo', 'Photo'], ['manual', 'Manual'], ['suggest', 'Suggest']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => { setMode(m); setAiError(''); setFormError(''); }} style={{
                    flex: 1, padding: '10px 0', background: 'none', border: 'none',
                    borderBottom: `2px solid ${mode === m ? RED : 'transparent'}`,
                    marginBottom: -1,
                    color: mode === m ? '#FFFFFF' : '#3A3A3A',
                    fontWeight: mode === m ? 700 : 600,
                    fontSize: 12, cursor: 'pointer',
                    transition: 'color 0.15s',
                    fontFamily: 'inherit',
                    letterSpacing: 0.3,
                  }}>{label}</button>
                ))}
              </div>

              {/* AI MODE */}
              {mode === 'ai' && (
                <>
                  <div style={{ fontSize: 12, color: '#3A3A3A', marginBottom: 12, lineHeight: 1.6 }}>
                    Describe anything: "100g chicken breast", "2 scrambled eggs", "bowl of oats"
                  </div>
                  <textarea autoFocus value={aiQuery}
                    onChange={(e) => { setAiQuery(e.target.value); setAiError(''); }}
                    placeholder="What did you eat?" rows={3}
                    style={{ ...inp, width: '100%', resize: 'none', marginBottom: 12, lineHeight: 1.6 }} />
                  <MealChips form={form} setForm={setForm} />
                  {aiError && <ErrBox msg={aiError} />}
                  <button onClick={handleAISmart} disabled={aiLoading} className="nrc-press" style={bigBtn(aiLoading, RED)}>
                    {aiLoading ? 'Analysing…' : 'Analyse with AI →'}
                  </button>
                </>
              )}

              {/* PHOTO MODE */}
              {mode === 'photo' && (
                <>
                  <div style={{ fontSize: 12, color: '#3A3A3A', marginBottom: 16, lineHeight: 1.6 }}>
                    Take a photo — AI estimates the calories and macros.
                  </div>
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 12, padding: '32px 20px', borderRadius: 16,
                    border: `2px dashed ${aiLoading ? '#222222' : RED}`,
                    background: aiLoading ? SURF2 : `${RED}06`,
                    cursor: aiLoading ? 'not-allowed' : 'pointer',
                  }}>
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={aiLoading}
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) handlePhotoAnalyze(file); e.target.value = ''; }} />
                    <div style={{ fontSize: 32, lineHeight: 1, color: aiLoading ? '#333333' : RED, fontWeight: 900 }}>
                      {aiLoading ? '···' : '↑'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: aiLoading ? '#333333' : RED }}>
                      {aiLoading ? 'Analysing photo…' : 'Tap to take or upload photo'}
                    </div>
                    <div style={{ fontSize: 11, color: '#333333' }}>Camera · Gallery · Screenshot</div>
                  </label>
                  <MealChips form={form} setForm={setForm} />
                  {aiError && <ErrBox msg={aiError} />}
                </>
              )}

              {/* SUGGEST MODE */}
              {mode === 'suggest' && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Timing</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                    {(['morning','pre_workout','post_workout','rest','evening'] as const).map((v) => {
                      const labels: Record<typeof v, string> = { morning: 'Morning', pre_workout: 'Pre-Workout', post_workout: 'Post-Workout', rest: 'Rest Day', evening: 'Evening' };
                      const active = suggestCtx === v;
                      return (
                        <button key={v} onClick={() => setSuggestCtx(v)} style={{
                          padding: '11px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                          background: active ? `${RED}0A` : SURF2,
                          border: `1px solid ${active ? RED : EDGE}`,
                          borderLeft: active ? `3px solid ${RED}` : `1px solid ${EDGE}`,
                          color: active ? '#FFFFFF' : '#3A3A3A', fontWeight: 700, fontSize: 12,
                          fontFamily: 'inherit',
                        }}>{labels[v]}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Size</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                    {([['big','Full Meal'],['small','Light']] as const).map(([v, label]) => (
                      <button key={v} onClick={() => setSuggestSize(v)} style={{
                        flex: 1, padding: 12, borderRadius: 12, cursor: 'pointer',
                        background: suggestSize === v ? `${RED}0A` : SURF2,
                        border: `1px solid ${suggestSize === v ? RED : EDGE}`,
                        color: suggestSize === v ? '#FFFFFF' : '#3A3A3A', fontWeight: 700, fontSize: 12,
                        fontFamily: 'inherit',
                      }}>{label}</button>
                    ))}
                  </div>
                  <MealChips form={form} setForm={setForm} />
                  {aiError && <ErrBox msg={aiError} />}
                  <button onClick={handleSuggest} disabled={aiLoading} className="nrc-press" style={bigBtn(aiLoading, RED)}>
                    {aiLoading ? 'Thinking…' : 'Suggest a meal →'}
                  </button>
                </>
              )}

              {/* MANUAL MODE */}
              {mode === 'manual' && (
                <>
                  {estimate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, background: SURF2, borderRadius: 12, padding: '10px 14px', border: `1px solid ${EDGE}` }}>
                      {estimate.imageUrl && <img src={estimate.imageUrl} alt={estimate.food_name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 700 }}>{estimate.food_name}</div>
                        <div style={{ color: '#444444', fontSize: 11, marginTop: 1 }}>AI estimate · {estimate.estimated_weight_grams}g</div>
                      </div>
                      <div style={{ background: `${CONF_COLOR[estimate.confidence]}12`, border: `1px solid ${CONF_COLOR[estimate.confidence]}30`, borderRadius: 8, padding: '3px 9px' }}>
                        <span style={{ color: CONF_COLOR[estimate.confidence], fontSize: 10, fontWeight: 800 }}>{estimate.confidence.toUpperCase()}</span>
                      </div>
                    </div>
                  )}

                  <input style={{ ...inp, width: '100%', marginBottom: 10 }}
                    value={form.name} onChange={(e) => patch({ name: e.target.value })}
                    placeholder="Food name" autoFocus={!estimate} />

                  {/* Amount row */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', background: SURF2, borderRadius: 10, border: `1px solid ${EDGE}`, overflow: 'hidden', flexShrink: 0 }}>
                      {([false, true] as const).map((isText) => (
                        <button key={String(isText)} onClick={() => patch({ amountIsText: isText, amount: '' })} style={{
                          padding: '0 14px', height: '100%',
                          background: form.amountIsText === isText ? '#222222' : 'transparent',
                          border: 'none',
                          color: form.amountIsText === isText ? '#FFFFFF' : '#3A3A3A',
                          fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                          fontFamily: 'inherit',
                        }}>{isText ? 'qty' : 'g'}</button>
                      ))}
                    </div>
                    <input style={{ ...inp, flex: 1 }} type={form.amountIsText ? 'text' : 'number'}
                      value={form.amount} onChange={(e) => patch({ amount: e.target.value })}
                      placeholder={form.amountIsText ? 'e.g. 2 eggs' : 'Weight in grams'} />
                    {!form.amountIsText && (
                      <button onClick={handleWeightAI} disabled={aiLoading} className="nrc-press" style={{
                        background: `${RED}10`, border: `1px solid ${RED}25`, borderRadius: 10,
                        color: aiLoading ? '#444444' : RED, fontWeight: 800, fontSize: 11, cursor: aiLoading ? 'not-allowed' : 'pointer',
                        padding: '0 14px', whiteSpace: 'nowrap', fontFamily: 'inherit', letterSpacing: 0.5,
                      }}>{aiLoading ? '···' : 'AI'}</button>
                    )}
                  </div>

                  {aiError && <ErrBox msg={aiError} />}

                  {/* Macros */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333333', textTransform: 'uppercase', marginBottom: 10 }}>Macros</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                      <MacroInp label="Protein" color={GREEN}  value={form.protein} onChange={(v) => patch({ protein: v })} />
                      <MacroInp label="Carbs"   color={ORANGE} value={form.carbs}   onChange={(v) => patch({ carbs: v })} />
                      <MacroInp label="Fat"     color={PURPLE} value={form.fat}     onChange={(v) => patch({ fat: v })} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${EDGE}`, paddingTop: 12 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#333333', textTransform: 'uppercase', flexShrink: 0 }}>Kcal</div>
                      <input type="number" value={form.calories}
                        onChange={(e) => { setForm((f) => ({ ...f, calories: e.target.value })); setFormError(''); }}
                        style={{ ...inp, flex: 1, padding: '8px 10px', fontSize: 22, fontWeight: 900, color: RED, letterSpacing: -0.5, background: 'transparent', border: 'none' }}
                        placeholder="—" />
                      <div style={{ fontSize: 9, color: '#2A2A2A', flexShrink: 0 }}>auto</div>
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
                    <button onClick={closeSheet} className="nrc-press" style={{ flex: 1, padding: 15, borderRadius: 14, border: `1px solid ${EDGE}`, background: 'none', color: '#444444', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                    <button onClick={handleAdd} disabled={submitting} className="nrc-press" style={bigBtn(submitting, RED, 2)}>
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

function MacroInp({ label, color, value, onChange }: { label: string; color: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: color, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder="0"
        style={{ width: '100%', background: SURF2, border: `1px solid ${color}30`, borderRadius: 10, color: '#FFFFFF', fontSize: 18, fontWeight: 700, padding: '10px 10px', outline: 'none', fontFamily: 'inherit' }} />
      <div style={{ fontSize: 9, color: '#333333', marginTop: 3, textAlign: 'right' }}>g</div>
    </div>
  );
}

function MealChips({ form, setForm }: { form: Form; setForm: React.Dispatch<React.SetStateAction<Form>> }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
      {MEAL_TYPES.map((m) => (
        <button key={m} onClick={() => setForm((f) => ({ ...f, meal: m }))} className="nrc-press" style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
          background: form.meal === m ? RED : '#161616',
          border: `1px solid ${form.meal === m ? RED : 'rgba(255,255,255,0.08)'}`,
          color: form.meal === m ? '#fff' : '#3A3A3A', fontWeight: 700, fontSize: 11,
          fontFamily: 'inherit',
        }}>{MEAL_LABEL[m]}</button>
      ))}
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{ color: RED, fontSize: 12, marginBottom: 12, padding: '10px 13px', background: `${RED}08`, borderRadius: 10, fontWeight: 600, border: `1px solid ${RED}20`, lineHeight: 1.5 }}>
      {msg}
    </div>
  );
}

function bigBtn(disabled: boolean, color: string, flex?: number): React.CSSProperties {
  return {
    ...(flex ? { flex } : { width: '100%' }),
    padding: '15px 0', borderRadius: 14, border: 'none',
    background: disabled ? '#161616' : color,
    color: disabled ? '#333333' : '#fff',
    fontWeight: 800, fontSize: 15, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
}

