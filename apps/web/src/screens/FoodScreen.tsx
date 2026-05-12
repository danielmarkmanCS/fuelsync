import { useState, useEffect, useCallback } from 'react';
import { getLogs, addLog, deleteLog, estimateByWeight, estimateByDescription } from '../api/food';
import type { FoodLog, AIEstimate } from '../api/food';
import { useNutrition } from '../hooks/useNutrition';

const RED = '#FF1C1C';
const MEAL_TYPES = ['breakfast', 'pre_workout', 'lunch', 'post_workout', 'dinner', 'snack'] as const;
type MealType = typeof MEAL_TYPES[number];
const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout',
  lunch: 'Lunch', post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snack',
};
interface Form { name: string; weightG: string; calories: string; protein: string; carbs: string; fat: string; meal: MealType; }
const EMPTY: Form = { name: '', weightG: '', calories: '', protein: '', carbs: '', fat: '', meal: 'lunch' };

function validateMacros(w: number, cal: number, pro: number, carbs: number, fat: number): string | null {
  if (pro + carbs + fat > w * 1.05) return `Macros (${Math.round(pro + carbs + fat)}g) exceed weight (${w}g).`;
  const mc = pro * 4 + carbs * 4 + fat * 9;
  if (cal > 0 && mc > 0 && Math.abs(mc - cal) / cal > 0.3) return `Calories (${Math.round(cal)}) don't match macros (~${Math.round(mc)}).`;
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

const sheetInp: React.CSSProperties = {
  background: '#0C0C0C', border: '1px solid #222',
  borderRadius: 10, color: '#fff', fontSize: 14,
  padding: '13px 14px', outline: 'none',
  fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 500,
};

export default function FoodScreen() {
  const { targets } = useNutrition();
  const today    = new Date().toISOString().split('T')[0];
  const dayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  const [logs,           setLogs]           = useState<FoodLog[]>([]);
  const [open,           setOpen]           = useState(false);
  const [form,           setForm]           = useState<Form>(EMPTY);
  const [estimate,       setEstimate]       = useState<AIEstimate | null>(null);
  const [aiMode,         setAiMode]         = useState<'weight' | 'describe'>('weight');
  const [aiLoading,      setAiLoading]      = useState(false);
  const [aiError,        setAiError]        = useState('');
  const [formError,      setFormError]      = useState('');
  const [macroWarn,      setMacroWarn]      = useState('');
  const [submitting,     setSubmitting]     = useState(false);
  const [skipValidation, setSkipValidation] = useState(false);

  const patch = (p: Partial<Form>) => { setForm((f) => ({ ...f, ...p })); setMacroWarn(''); };
  const fetchLogs = useCallback(() => { getLogs(today).then(setLogs).catch(() => {}); }, [today]);
  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleAI = async () => {
    const name = form.name.trim(); const w = parseFloat(form.weightG);
    if (!name) { setAiError('Enter a food name first.'); return; }
    if (aiMode === 'weight' && isNaN(w)) { setAiError('Enter weight in grams.'); return; }
    setAiLoading(true); setAiError('');
    try {
      const r = aiMode === 'weight' ? await estimateByWeight(name, w) : await estimateByDescription(name);
      setEstimate(r);
      setForm((f) => ({ ...f, name: r.food_name, weightG: r.estimated_weight_grams.toString(), calories: Math.round(r.calories).toString(), protein: Math.round(r.protein).toString(), carbs: Math.round(r.carbs).toString(), fat: Math.round(r.fat).toString() }));
    } catch (e: unknown) { setAiError(e instanceof Error ? e.message : 'AI failed'); }
    finally { setAiLoading(false); }
  };

  const handleAdd = async () => {
    const name = form.name.trim(); const w = parseFloat(form.weightG), cal = parseFloat(form.calories);
    const pro = parseFloat(form.protein), carbs = parseFloat(form.carbs), fat = parseFloat(form.fat);
    if (!name) { setFormError('Enter a food name.'); return; }
    if ([w, cal, pro, carbs, fat].some(isNaN)) { setFormError('Fill in all fields.'); return; }
    if (!skipValidation) { const warn = validateMacros(w, cal, pro, carbs, fat); if (warn) { setMacroWarn(warn); return; } }
    setSubmitting(true); setFormError('');
    try {
      await addLog({ food_name: name, calories: cal, protein: pro, carbs, fat, weight_grams: w, meal_type: form.meal, image_url: estimate?.imageUrl ?? undefined });
      fetchLogs(); setForm(EMPTY); setEstimate(null); setSkipValidation(false); setOpen(false);
    } catch (e: unknown) { setFormError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSubmitting(false); }
  };

  const consumed = sumMacros(logs);
  const byMeal = MEAL_TYPES.map((m) => ({ meal: m, entries: logs.filter((l) => l.meal_type === m) })).filter((g) => g.entries.length > 0);
  const calPct  = targets && targets.calories > 0 ? Math.min((consumed.calories / targets.calories) * 100, 100) : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0C0C0C', position: 'relative' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="nrc-a nrc-a1" style={{ padding: '28px 20px 0' }}>
        <div className="nrc-label" style={{ marginBottom: 6 }}>Fuel Log</div>
        <div className="nrc-hero" style={{ fontSize: 36 }}>{dayLabel}</div>
      </div>

      {/* ── HERO CALORIES ──────────────────────────────────────── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 20px 0' }}>
        <div style={{
          background: '#141414', borderRadius: 20,
          padding: '20px 20px 16px',
          position: 'relative', overflow: 'hidden',
          border: '1px solid #1E1E1E',
        }}>
          <div style={{ position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,28,28,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div className="nrc-label" style={{ marginBottom: 10 }}>Calories Consumed</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div className="nrc-hero" style={{ fontSize: 60, color: calPct >= 100 ? RED : '#fff' }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && <div style={{ fontSize: 16, fontWeight: 700, color: '#2A2A2A', paddingBottom: 8 }}>/ {Math.round(targets.calories).toLocaleString()}</div>}
          </div>
          <div style={{ marginTop: 14, height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
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
              <div key={label} className="nrc-press" style={{
                background: '#141414', borderRadius: 14,
                padding: '12px 10px 10px', border: '1px solid #1E1E1E',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
                <div className="nrc-hero" style={{ fontSize: 26, marginBottom: 8 }}>
                  {Math.round(val)}<span style={{ fontSize: 12, color: '#333', fontWeight: 600 }}>g</span>
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
          <div style={{ textAlign: 'center', padding: '56px 0' }}>
            <div className="nrc-hero" style={{ fontSize: 44, color: 'rgba(255,255,255,0.04)', marginBottom: 14 }}>EMPTY</div>
            <div style={{ color: '#333', fontSize: 13, fontWeight: 600 }}>Tap + to log your first meal</div>
          </div>
        ) : byMeal.map(({ meal, entries }) => (
          <div key={meal} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#333', textTransform: 'uppercase', marginBottom: 10 }}>
              {MEAL_LABEL[meal]}
            </div>
            {entries.map((entry) => (
              <div key={entry.id} className="nrc-press" style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#141414', borderRadius: 14,
                padding: '13px 14px', marginBottom: 8,
                border: '1px solid #1E1E1E',
              }}>
                {entry.image_url && <img src={entry.image_url} alt={entry.food_name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.food_name}</div>
                  <div style={{ color: '#333', fontSize: 11, marginTop: 3 }}>
                    P {entry.protein}g · C {entry.carbs}g · F {entry.fat}g
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: RED, letterSpacing: -0.5 }}>{Math.round(Number(entry.calories))}</div>
                  <div style={{ fontSize: 9, color: '#333', fontWeight: 700, letterSpacing: 1 }}>KCAL</div>
                </div>
                <button onClick={() => { deleteLog(entry.id).then(fetchLogs).catch(() => {}); }} style={{ background: 'none', border: 'none', color: '#2A2A2A', cursor: 'pointer', fontSize: 20, padding: '0 4px', flexShrink: 0 }}>×</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── FAB ─────────────────────────────────────────────────── */}
      <button onClick={() => setOpen(true)} className="nrc-press" style={{
        position: 'fixed', bottom: 84, right: 'max(20px, calc(50vw - 220px))',
        width: 56, height: 56, borderRadius: 28, background: RED,
        border: 'none', cursor: 'pointer', fontSize: 28, fontWeight: 900,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 20px rgba(255,28,28,0.35)',
      }}>+</button>

      {/* ── ADD SHEET ───────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', zIndex: 100,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setForm(EMPTY); setEstimate(null); setSkipValidation(false); } }}>
          <div style={{
            background: '#111', borderRadius: '24px 24px 0 0',
            padding: '26px 22px 44px',
            maxWidth: 480, width: '100%', margin: '0 auto',
            borderTop: '1px solid #1E1E1E',
            maxHeight: '90vh', overflowY: 'auto',
          }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div className="nrc-hero" style={{ fontSize: 28 }}>Add Fuel</div>
              <button onClick={() => { setOpen(false); setForm(EMPTY); setEstimate(null); }} style={{ background: '#1A1A1A', border: '1px solid #222', color: '#444', fontSize: 18, cursor: 'pointer', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* AI toggle */}
            <div style={{ display: 'flex', background: '#0C0C0C', borderRadius: 12, padding: 3, marginBottom: 14, border: '1px solid #1E1E1E' }}>
              {(['weight', 'describe'] as const).map((m) => (
                <button key={m} onClick={() => { setAiMode(m); setAiError(''); }} className="nrc-press" style={{
                  flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: aiMode === m ? RED : 'transparent',
                  color: aiMode === m ? '#fff' : '#333',
                  fontWeight: 700, fontSize: 12, letterSpacing: 1, transition: 'all 0.2s',
                }}>
                  {m === 'weight' ? 'Name + Weight' : 'Describe Meal'}
                </button>
              ))}
            </div>

            <input style={{ ...sheetInp, width: '100%', marginBottom: 10 }} value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={aiMode === 'weight' ? 'Food name (e.g. chicken breast)' : 'Describe your meal…'} autoFocus />

            {aiMode === 'weight' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input style={{ ...sheetInp, flex: 1 }} type="number" value={form.weightG} onChange={(e) => patch({ weightG: e.target.value })} placeholder="Weight (g)" />
                <button onClick={handleAI} disabled={aiLoading} className="nrc-press" style={{
                  background: 'rgba(255,28,28,0.08)', border: '1px solid rgba(255,28,28,0.25)',
                  borderRadius: 10, color: RED, fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: '0 16px', letterSpacing: 1,
                }}>
                  {aiLoading ? '…' : 'AI'}
                </button>
              </div>
            )}
            {aiMode === 'describe' && (
              <button onClick={handleAI} disabled={aiLoading} className="nrc-press" style={{
                width: '100%', padding: 14, marginBottom: 10,
                background: 'rgba(255,28,28,0.06)', border: '1px solid rgba(255,28,28,0.2)',
                borderRadius: 12, color: RED, fontWeight: 800, fontSize: 13, letterSpacing: 1, cursor: 'pointer',
              }}>
                {aiLoading ? 'Analysing…' : 'Analyse with AI →'}
              </button>
            )}

            {aiError && <div style={{ color: RED, fontSize: 13, marginBottom: 10, padding: '10px 13px', background: 'rgba(255,28,28,0.06)', borderRadius: 10, fontWeight: 600, border: '1px solid rgba(255,28,28,0.15)' }}>{aiError}</div>}

            {estimate && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, background: '#1A1A1A', borderRadius: 14, padding: 12, border: '1px solid #222' }}>
                {estimate.imageUrl && <img src={estimate.imageUrl} alt={estimate.food_name} style={{ width: 46, height: 46, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{estimate.food_name}</div>
                  <div style={{ color: '#333', fontSize: 11, marginTop: 2 }}>AI · {estimate.estimated_weight_grams}g</div>
                </div>
                <div style={{ background: `${CONF_COLOR[estimate.confidence]}10`, border: `1px solid ${CONF_COLOR[estimate.confidence]}30`, borderRadius: 8, padding: '4px 10px' }}>
                  <span style={{ color: CONF_COLOR[estimate.confidence], fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{estimate.confidence.toUpperCase()}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input style={sheetInp} type="number" value={form.calories} onChange={(e) => patch({ calories: e.target.value })} placeholder="Calories (kcal)" />
              <input style={sheetInp} type="number" value={form.weightG}  onChange={(e) => patch({ weightG: e.target.value })}  placeholder="Weight (g)" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
              <input style={{ ...sheetInp, borderColor: 'rgba(255,28,28,0.25)' }}  type="number" value={form.protein} onChange={(e) => patch({ protein: e.target.value })} placeholder="Protein g" />
              <input style={{ ...sheetInp, borderColor: 'rgba(245,158,11,0.25)' }} type="number" value={form.carbs}   onChange={(e) => patch({ carbs: e.target.value })}   placeholder="Carbs g" />
              <input style={{ ...sheetInp, borderColor: 'rgba(99,102,241,0.25)' }} type="number" value={form.fat}     onChange={(e) => patch({ fat: e.target.value })}     placeholder="Fat g" />
            </div>

            {macroWarn && (
              <div style={{ color: '#f59e0b', fontSize: 13, marginBottom: 14, padding: '12px 14px', background: 'rgba(245,158,11,0.06)', borderRadius: 12, fontWeight: 600, border: '1px solid rgba(245,158,11,0.15)' }}>
                ⚠ {macroWarn}
                <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                  <button onClick={() => setMacroWarn('')} className="nrc-press" style={{ background: 'none', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>Fix</button>
                  <button onClick={async () => { setMacroWarn(''); setSkipValidation(true); await handleAdd(); }} className="nrc-press" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>Log Anyway</button>
                </div>
              </div>
            )}

            {/* Meal chips */}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 16 }}>
              {MEAL_TYPES.map((m) => (
                <button key={m} onClick={() => patch({ meal: m })} className="nrc-press" style={{
                  flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer',
                  background: form.meal === m ? RED : '#1A1A1A',
                  border: '1px solid', borderColor: form.meal === m ? RED : '#222',
                  color: form.meal === m ? '#fff' : '#444',
                  fontWeight: 700, fontSize: 11, letterSpacing: 0.5, transition: 'all 0.15s',
                }}>{MEAL_LABEL[m]}</button>
              ))}
            </div>

            {formError && <div style={{ color: RED, fontSize: 13, marginBottom: 12, padding: '10px 13px', background: 'rgba(255,28,28,0.06)', borderRadius: 10, fontWeight: 600 }}>{formError}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setForm(EMPTY); setEstimate(null); setFormError(''); setSkipValidation(false); setOpen(false); }} className="nrc-press" style={{
                flex: 1, padding: 15, borderRadius: 14,
                border: '1px solid #1E1E1E', background: 'none', color: '#444',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleAdd} disabled={submitting} className="nrc-press" style={{
                flex: 2, padding: 15, borderRadius: 14, border: 'none',
                background: submitting ? '#1A1A1A' : RED,
                color: submitting ? '#333' : '#fff',
                fontWeight: 800, fontSize: 15, letterSpacing: 0.5,
                cursor: submitting ? 'not-allowed' : 'pointer',
              }}>{submitting ? 'Saving…' : 'Log Fuel →'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
