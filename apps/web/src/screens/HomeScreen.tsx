import { useState, useEffect, useCallback, useRef } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useAppStore } from '../store/appStore';
import { getLogs } from '../api/localFood';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType } from '@shared/types';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';

// ── Macro palette: Apple Health colors ───────────────────────────────
const PROT = '#32ADE6';
const CARB = '#30D158';
const FAT  = '#FF9F0A';
const RED  = '#FF453A';

const MEAL_ORDER = ['breakfast','pre_workout','lunch','post_workout','dinner','snack','other'] as const;

const MEAL_META: Record<string, { label: string; short: string }> = {
  breakfast:    { label: 'Breakfast',    short: 'Breakfast' },
  pre_workout:  { label: 'Pre-Workout',  short: 'Pre-WO'    },
  lunch:        { label: 'Lunch',        short: 'Lunch'     },
  post_workout: { label: 'Post-Workout', short: 'Post-WO'   },
  dinner:       { label: 'Dinner',       short: 'Dinner'    },
  snack:        { label: 'Snacks',       short: 'Snacks'    },
  other:        { label: 'Other',        short: 'Other'     },
};

// ── Meal icons — flat SVGs, no emojis ────────────────────────────────
function MealIcon({ meal }: { meal: string }) {
  const p = {
    width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'var(--accent)', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (meal) {
    case 'breakfast':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      );
    case 'pre_workout':
      return (
        <svg {...p}>
          <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      );
    case 'lunch':
    case 'dinner':
      return (
        <svg {...p}>
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/>
          <path d="M7 2v20"/>
          <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>
        </svg>
      );
    case 'post_workout':
      return (
        <svg {...p}>
          <path d="M6.5 6.5h11M6.5 17.5h11M3 12h18"/>
          <circle cx="5" cy="12" r="2"/>
          <circle cx="19" cy="12" r="2"/>
        </svg>
      );
    case 'snack':
      return (
        <svg {...p}>
          <path d="M12 2a7 7 0 017 7c0 3-1.5 5.5-4 6.8V19a1 1 0 01-1 1h-4a1 1 0 01-1-1v-3.2C6.5 14.5 5 12 5 9a7 7 0 017-7z"/>
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M9 21V9"/>
        </svg>
      );
  }
}

// ── Training icons — flat SVGs, no emojis ────────────────────────────
function TrainingIcon({ type, size = 20 }: { type: TrainingType; size?: number }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (type) {
    case 'rest':
      return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
    case 'strength':
      return (
        <svg {...p}>
          <path d="M6.5 6.5h11M6.5 17.5h11M3 12h18"/>
          <circle cx="5" cy="12" r="2"/>
          <circle cx="19" cy="12" r="2"/>
        </svg>
      );
    case 'cardio':
      return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'hybrid':
      return <svg {...p}><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'hiit':
      return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'cycling':
      return <svg {...p}><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/></svg>;
    case 'yoga':
      return <svg {...p}><circle cx="12" cy="4" r="1"/><path d="M4 15s2-6 8-6 8 6 8 6"/><path d="M9 15l-2 6M15 15l2 6M9 15l3-4 3 4"/></svg>;
    case 'walk':
      return <svg {...p}><circle cx="12" cy="4" r="1"/><path d="M9 20l1-5-2-3 4-8"/><path d="M13 7l3 2 2 5"/><path d="M7 20h4M15 13l2 7"/></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>;
  }
}

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

function sumLogs(logs: FoodLog[]): MacroTargets {
  return logs.reduce<MacroTargets>((a, l) => ({
    calories: a.calories + +l.calories,
    proteinG: a.proteinG + +l.protein,
    carbsG:   a.carbsG   + +l.carbs,
    fatG:     a.fatG     + +l.fat,
  }), emptyMacros());
}

function useCountUp(to: number, ms = 500): number {
  const [val, setVal] = useState(0);
  const prev  = useRef(0);
  const frame = useRef<number>();
  useEffect(() => {
    if (prev.current === to) return;
    const from = prev.current; prev.current = to;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      setVal(Math.round(from + (to - from) * (1 - (1 - p) ** 2)));
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [to, ms]);
  return val;
}

// ── Calorie Dashboard — MFP equation + ring ──────────────────────────
const EXERCISE_KEY = 'fs_exercise_kcal_v1';
function loadExerciseKcal(date: string): number {
  try { return parseInt(JSON.parse(localStorage.getItem(EXERCISE_KEY) ?? '{}')[date] ?? '0', 10) || 0; }
  catch { return 0; }
}
function saveExerciseKcal(date: string, kcal: number): void {
  try {
    const map = JSON.parse(localStorage.getItem(EXERCISE_KEY) ?? '{}');
    map[date] = kcal;
    // Keep only last 30 days
    const keys = Object.keys(map).sort().slice(-30);
    const trimmed: Record<string, number> = {};
    keys.forEach(k => { trimmed[k] = map[k]; });
    localStorage.setItem(EXERCISE_KEY, JSON.stringify(trimmed));
  } catch {}
}

function CalDashboard({
  consumed, targets, date, onOpenExerciseCalc, externalExercise,
}: { consumed: MacroTargets; targets: MacroTargets | null; date: string; onOpenExerciseCalc?: () => void; externalExercise?: number }) {
  const goal      = targets?.calories ?? 0;
  const food      = Math.round(consumed.calories);
  const [exercise, setExercise] = useState(() => loadExerciseKcal(date));
  const [editingEx, setEditingEx] = useState(false);
  const [exInput,   setExInput]   = useState('');

  // Sync from external source (exercise calc modal)
  useEffect(() => {
    if (externalExercise !== undefined) setExercise(externalExercise);
  }, [externalExercise]);
  const remaining = goal > 0 ? goal - food + exercise : null;
  const over      = remaining !== null && remaining < 0;
  const pct       = goal > 0 ? Math.min((food / goal) * 100, 100) : 0;
  const ringColor = over ? RED : 'var(--accent)';

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const displayFood = useCountUp(mounted ? food : 0);

  const R    = 56;
  const C    = 2 * Math.PI * R;
  const fill = goal > 0 ? Math.min(food / goal, 1) : 0;

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 'var(--r-md)',
      padding: '20px 20px 18px',
    }}>
      {/* ── Equation row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 20px 1fr 20px 1fr 20px 1fr',
        alignItems: 'flex-end',
        gap: 0,
        marginBottom: 20,
      }}>
        {/* Eaten (Food) — shown first */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', letterSpacing: -0.5, lineHeight: 1 }}>
            {displayFood.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', marginTop: 5 }}>
            Eaten
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 18, fontWeight: 300, color: 'var(--muted)', paddingBottom: 16 }}>of</div>

        {/* Goal (Target) — shown second */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {goal > 0 ? goal.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', marginTop: 5 }}>
            Goal
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 300, color: 'var(--muted)', paddingBottom: 14 }}>+</div>

        {/* Exercise */}
        <div style={{ textAlign: 'center' }}>
          {editingEx ? (
            <input
              autoFocus
              type="number" min={0} max={5000}
              value={exInput}
              onChange={e => setExInput(e.target.value)}
              onBlur={() => {
                const v = Math.max(0, Math.min(5000, parseInt(exInput, 10) || 0));
                setExercise(v);
                saveExerciseKcal(date, v);
                setEditingEx(false);
              }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
              style={{
                width: '100%', background: 'transparent', border: 'none',
                borderBottom: '1.5px solid var(--accent)', outline: 'none',
                color: 'var(--accent)', fontSize: 18, fontWeight: 900,
                textAlign: 'center', padding: '2px 0',
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <div
                onClick={() => { setExInput(exercise > 0 ? String(exercise) : ''); setEditingEx(true); }}
                style={{ fontSize: 20, fontWeight: 900, color: exercise > 0 ? 'var(--accent)' : 'var(--muted)', letterSpacing: -0.5, lineHeight: 1, cursor: 'pointer' }}
                title="Tap to log exercise calories"
              >
                {exercise > 0 ? exercise : '+'}
              </div>
              {onOpenExerciseCalc && (
                <button
                  onClick={onOpenExerciseCalc}
                  title="Calculate from activity"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--muted)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="21" x2="8" y2="3"/><line x1="16" y1="21" x2="16" y2="3"/><line x1="2" y1="12" x2="22" y2="12"/>
                  </svg>
                </button>
              )}
            </div>
          )}
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
            Exercise
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 300, color: 'var(--muted)', paddingBottom: 14 }}>=</div>

        {/* Remaining */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1, color: over ? RED : 'var(--accent)' }}>
            {remaining !== null ? Math.abs(remaining).toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4, color: over ? RED : 'var(--accent)', opacity: 0.7 }}>
            {over ? 'Over' : 'Left'}
          </div>
        </div>
      </div>

      {/* ── Ring centered ── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <svg width="136" height="136" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="68" cy="68" r={R} fill="none" stroke="var(--edge)" strokeWidth="10" />
            <circle
              cx="68" cy="68" r={R}
              fill="none" stroke={ringColor} strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${C}`}
              strokeDashoffset={`${C * (1 - fill)}`}
              style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: ringColor, letterSpacing: -1, lineHeight: 1 }}>
              {remaining !== null ? Math.abs(remaining).toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, marginTop: 4, textTransform: 'uppercase' }}>
              {over ? 'kcal over' : 'kcal left'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height: 4, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: over ? RED : 'var(--accent)',
          width: `${pct}%`,
          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
          {Math.round(pct)}% of daily goal
        </span>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
          {goal > 0 ? `${goal.toLocaleString()} kcal target` : '—'}
        </span>
      </div>
      {/* Calorie forecast */}
      {(() => {
        const h = new Date().getHours();
        if (food <= 0 || goal <= 0 || h < 7 || h > 21) return null;
        const fraction  = Math.max(0.1, Math.min(0.95, (h - 6) / 16));
        const projected = Math.round(food / fraction);
        const projPct   = Math.round((projected / goal) * 100);
        const projColor = projPct >= 110 ? RED : projPct >= 85 ? CARB : 'var(--muted)';
        return (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--edge)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              Day Forecast
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: projColor, letterSpacing: -0.3 }}>
              ~{projected.toLocaleString()} kcal &nbsp;
              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>({projPct}%)</span>
            </span>
          </div>
        );
      })()}
    </div>
  );
}

// ── Macro row — 3 column cards ────────────────────────────────────────
function MacroRow({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const macros = [
    { label: 'Carbs',   val: consumed.carbsG,   target: targets?.carbsG   ?? 0, color: CARB },
    { label: 'Fat',     val: consumed.fatG,      target: targets?.fatG     ?? 0, color: FAT  },
    { label: 'Protein', val: consumed.proteinG,  target: targets?.proteinG ?? 0, color: PROT },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      {macros.map(({ label, val, target, color }) => {
        const pct  = target > 0 ? Math.min((val / target) * 100, 100) : 0;
        const over = val > target && target > 0;
        const c    = over ? RED : color;
        return (
          <div key={label} style={{
            background: 'var(--surf)', border: '1px solid var(--edge)',
            borderRadius: 8, padding: '10px 10px 8px',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: over ? RED : 'var(--text)', letterSpacing: -0.3, lineHeight: 1 }}>
              {Math.round(val)}
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)', marginLeft: 1 }}>g</span>
            </div>
            {target > 0 && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>
                of {Math.round(target)}g
              </div>
            )}
            <div style={{ height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden', marginTop: 7 }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: c,
                width: `${pct}%`,
                transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Meal section — paragraph style with colorful macros ──────────────
function MealSection({
  meal, items, onAddFood,
}: {
  meal: string;
  items: FoodLog[];
  onAddFood: (meal: string) => void;
}) {
  const meta    = MEAL_META[meal] ?? { label: meal, short: meal };
  const mealCal = items.reduce((s, l) => s + +l.calories, 0);
  const mealP   = items.reduce((s, l) => s + +l.protein,  0);
  const mealC   = items.reduce((s, l) => s + +l.carbs,    0);
  const mealF   = items.reduce((s, l) => s + +l.fat,      0);

  return (
    <div style={{ paddingBottom: 2 }}>
      {/* Header row: icon + name + kcal + Add button */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        paddingBottom: items.length > 0 ? 5 : 0,
      }}>
        <MealIcon meal={meal} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', flex: 1 }}>
          {meta.label}
        </span>
        {mealCal > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginRight: 4 }}>
            {Math.round(mealCal)} kcal
          </span>
        )}
        <button
          onClick={() => onAddFood(meal)}
          className="nrc-press"
          style={{
            background: 'var(--accent-muted)',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            color: 'var(--accent)',
            fontSize: 10, fontWeight: 700,
            cursor: 'pointer', padding: '3px 8px',
            letterSpacing: 0.3, whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          + Add
        </button>
      </div>

      {/* Food items — paragraph style, colorful macros */}
      {items.map((item, i) => (
        <div key={item.id ?? i} style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          paddingLeft: 20, paddingBottom: 5, gap: 8,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 12, color: 'var(--text)', fontWeight: 500,
              lineHeight: 1.35, wordBreak: 'break-word',
            }}>
              {item.food_name}
            </div>
            {(+item.protein > 0 || +item.carbs > 0) && (
              <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: PROT }}>P{Math.round(+item.protein)}g</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: CARB }}>C{Math.round(+item.carbs)}g</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: FAT }}>F{Math.round(+item.fat)}g</span>
              </div>
            )}
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, paddingTop: 1 }}>
            {Math.round(+item.calories)}
          </span>
        </div>
      ))}

      {/* Meal macro total row */}
      {items.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, paddingLeft: 20, paddingTop: 4,
          borderTop: '1px solid var(--edge)', marginTop: 1,
        }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: PROT, opacity: 0.75 }}>P{Math.round(mealP)}g</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: CARB, opacity: 0.75 }}>C{Math.round(mealC)}g</span>
          <span style={{ fontSize: 9, fontWeight: 800, color: FAT,  opacity: 0.75 }}>F{Math.round(mealF)}g</span>
        </div>
      )}
    </div>
  );
}

// ── Training type definitions ──────────────────────────────────────────
const TRAINING_TYPES: {
  type: TrainingType; label: string; color: string; isAccent?: boolean;
  desc: string; macroTip: string;
}[] = [
  { type: 'rest',     label: 'Rest',     color: '#8B949E',
    desc: 'Recovery day — low carb, high fat',
    macroTip: 'High fat · low carb · moderate protein' },
  { type: 'strength', label: 'Strength', color: PROT,
    desc: 'Muscle building — high protein day',
    macroTip: 'High protein · moderate carb · low fat' },
  { type: 'cardio',   label: 'Cardio',   color: CARB,
    desc: 'Endurance session — fuel with carbs',
    macroTip: 'High carb · moderate protein · low fat' },
  { type: 'hybrid',   label: 'Hybrid',   color: '#8B949E', isAccent: true,
    desc: 'Mixed training — balanced macros',
    macroTip: 'Balanced protein · carb · fat split' },
  { type: 'hiit',     label: 'HIIT',     color: '#EF4444',
    desc: 'Max intensity intervals — high carbs + protein',
    macroTip: 'High carb · high protein · low fat' },
  { type: 'cycling',  label: 'Cycling',  color: '#F97316',
    desc: 'Sustained aerobic work — carb-forward',
    macroTip: 'High carb · moderate protein · moderate fat' },
  { type: 'yoga',     label: 'Yoga',     color: '#A78BFA',
    desc: 'Mobility + mindfulness — active recovery',
    macroTip: 'Moderate fat · balanced protein · low carb' },
  { type: 'walk',     label: 'Walk',     color: '#34D399',
    desc: 'Light movement — fat-burning zone',
    macroTip: 'High fat · low carb · moderate protein' },
];

export default function HomeScreen() {
  const { user }                             = useAuthStore();
  const { setActiveTab, setPendingMealType } = useAppStore();
  const { todayLog, logWorkoutComplete }     = useNutritionStore();
  const { logDay, setActivityModifier }      = useNutrition();

  const todayStr = new Date().toISOString().split('T')[0];

  const [viewDate, setViewDate]   = useState(todayStr);
  const [foodLogs, setFoodLogs]   = useState<FoodLog[]>([]);
  const [consumed, setConsumed]   = useState<MacroTargets>(emptyMacros());
  const [logTick,  setLogTick]    = useState(0);
  const [expandedTraining, setExpandedTraining] = useState<TrainingType | null>(null);

  const isToday = viewDate === todayStr;

  const goToPrev = () => {
    const d = new Date(viewDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setViewDate(d.toISOString().split('T')[0]);
  };
  const goToNext = () => {
    if (isToday) return;
    const d = new Date(viewDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setViewDate(d.toISOString().split('T')[0]);
  };

  const reloadLogs = useCallback(() => setLogTick(t => t + 1), []);

  useEffect(() => {
    getLogs(viewDate).then(ls => {
      const active = ls.filter(l => !l.removed);
      setFoodLogs(active);
      setConsumed(sumLogs(active));
    });
  }, [viewDate, logTick]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) reloadLogs(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reloadLogs]);

  const targets          = useEffectiveTargets();
  const activityModifier = todayLog?.dailyActivityModifier ?? null;

  const byMeal = MEAL_ORDER.reduce<Record<string, FoodLog[]>>((acc, m) => { acc[m] = []; return acc; }, {});
  foodLogs.forEach(l => {
    const key = (l.meal_type ?? 'other') as string;
    if (byMeal[key]) byMeal[key].push(l);
    else byMeal['other'].push(l);
  });

  const handleAddFood = useCallback((meal: string) => {
    setPendingMealType(meal);
    setActiveTab('food');
  }, [setActiveTab, setPendingMealType]);

  const handleSelectType = (type: TrainingType) => {
    try {
      const hist = JSON.parse(localStorage.getItem('fs_training_type_history_v1') ?? '{}');
      hist[todayStr] = type;
      const keys = Object.keys(hist).sort().slice(-60);
      const trimmed: Record<string, string> = {};
      keys.forEach(k => { trimmed[k] = hist[k]; });
      localStorage.setItem('fs_training_type_history_v1', JSON.stringify(trimmed));
    } catch {}
    const r = logDay(type);
    if (r.blocked && !window.confirm('Heavy run load this week. Cardio today risks injury.\n\nLog anyway?')) return;
    if (r.blocked) logDay(type, undefined, undefined, true);
    if ((type === 'strength' || type === 'hybrid') && !todayLog?.actualWorkoutLogged) {
      logWorkoutComplete(0, 1, type.charAt(0).toUpperCase() + type.slice(1));
    }
  };

  const hour        = new Date().getHours();
  const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = user?.displayName || '';
  const dateLabel   = new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric',
  });

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 32 }}>

      {/* Greeting header */}
      <div style={{
        padding: '12px 16px 10px', background: 'var(--surf)',
        borderBottom: '1px solid var(--edge)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          {displayName ? (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>{greeting},</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1.1 }}>{displayName}</div>
            </>
          ) : (
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5 }}>TODAY</div>
          )}
        </div>
        {todayLog?.trainingType && (
          <div style={{
            padding: '4px 10px', borderRadius: 6,
            background: 'var(--accent-muted)', border: '1px solid var(--accent)',
            fontSize: 11, fontWeight: 800, color: 'var(--accent)',
            textTransform: 'uppercase', letterSpacing: 1.5,
          }}>
            {todayLog.trainingType}
          </div>
        )}
        <button
          onClick={() => setActiveTab('profile')}
          className="nrc-press"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--surf2)', border: '1px solid var(--edge)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        </button>
      </div>

      {/* Date nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 0',
      }}>
        <button onClick={goToPrev} className="nrc-press" style={{
          width: 34, height: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surf)', border: '1px solid var(--edge)', cursor: 'pointer',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            {isToday ? `Today · ${dateLabel}` : dateLabel}
          </div>
        </div>
        <button onClick={goToNext} className="nrc-press" disabled={isToday} style={{
          width: 34, height: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surf)', border: '1px solid var(--edge)',
          cursor: isToday ? 'default' : 'pointer', opacity: isToday ? 0.3 : 1,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Calorie dashboard */}
      <div style={{ margin: '10px 14px 0' }}>
        <CalDashboard consumed={consumed} targets={targets} date={viewDate} />
      </div>

      {/* Macro row */}
      <div style={{ margin: '8px 14px 0' }}>
        <MacroRow consumed={consumed} targets={targets} />
      </div>

      {/* Training selector + NEAT (today only) */}
      {isToday && <div style={{
        margin: '10px 14px 0', background: 'var(--surf)',
        borderRadius: 8, border: '1px solid var(--edge)', padding: '14px 14px 16px',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>
          Today's Training
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {TRAINING_TYPES.map(({ type, label, color, isAccent }) => {
            const active       = todayLog?.trainingType === type;
            const displayColor = isAccent ? 'var(--accent)' : color;
            return (
              <button
                key={type}
                onClick={() => {
                  if (!active) handleSelectType(type);
                  setExpandedTraining(expandedTraining === type ? null : type);
                }}
                className="nrc-press"
                style={{
                  padding: '11px 4px', borderRadius: 8,
                  border: `1.5px solid ${active ? displayColor : 'var(--edge)'}`,
                  background: active ? (isAccent ? 'var(--accent-muted)' : `${color}18`) : 'var(--surf2)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                  color: active ? displayColor : 'var(--muted)',
                }}
              >
                <TrainingIcon type={type} size={18} />
                <div style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: 0.3 }}>{label}</div>
              </button>
            );
          })}
        </div>

        {expandedTraining && (() => {
          const t = TRAINING_TYPES.find(x => x.type === expandedTraining);
          if (!t) return null;
          const displayColor = t.isAccent ? 'var(--accent)' : t.color;
          return (
            <div style={{
              marginTop: 10, padding: '12px', borderRadius: 8,
              background: t.isAccent ? 'var(--accent-muted)' : `${t.color}10`,
              border: `1px solid ${displayColor}40`,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <TrainingIcon type={expandedTraining} size={16} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: displayColor, marginBottom: 2 }}>{t.label} Day</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>{t.desc}</div>
                  <div style={{ fontSize: 10, color: displayColor, marginTop: 3, fontWeight: 700, opacity: 0.85 }}>→ {t.macroTip}</div>
                </div>
                <button
                  onClick={() => setExpandedTraining(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 16, cursor: 'pointer', padding: 0, flexShrink: 0 }}
                >×</button>
              </div>
            </div>
          );
        })()}

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
            Daily Activity Level
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5, opacity: 0.7 }}>
            Non-workout movement — steps, job, errands.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { val: 'low',    label: 'Low',    desc: 'Desk · sitting'  },
              { val: 'normal', label: 'Normal', desc: 'Some walking'    },
              { val: 'high',   label: 'High',   desc: 'On feet all day' },
            ] as const).map(({ val, label, desc }) => {
              const sel = (activityModifier ?? 'normal') === val || (!activityModifier && val === 'normal');
              return (
                <button
                  key={val}
                  onClick={() => setActivityModifier(val === 'normal' ? undefined : val)}
                  style={{
                    flex: 1, padding: '9px 4px', borderRadius: 8,
                    border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--edge)'}`,
                    background: sel ? 'var(--accent-muted)' : 'transparent',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: sel ? 800 : 600, color: sel ? 'var(--accent)' : 'var(--muted)' }}>{label}</span>
                  <span style={{ fontSize: 9, color: sel ? 'var(--accent)' : 'var(--muted)', textAlign: 'center', lineHeight: 1.4, opacity: sel ? 0.85 : 0.5 }}>{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>}

      {/* Food diary */}
      <div style={{ margin: '8px 14px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6, paddingLeft: 2,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2 }}>
            Food Diary
          </span>
          {foodLogs.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
              {foodLogs.length} item{foodLogs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {foodLogs.length === 0 ? (
          <div style={{
            background: 'var(--surf)', border: '1px solid var(--edge)',
            borderRadius: 8, padding: '28px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <div style={{ fontSize: 32 }}>🍽️</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.3 }}>Nothing logged yet</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.6, maxWidth: 220 }}>
              {isToday ? 'Start tracking your meals to hit your daily targets.' : 'No food was logged on this day.'}
            </div>
            {isToday && (
              <button
                onClick={() => handleAddFood('breakfast')}
                className="nrc-press"
                style={{
                  marginTop: 4, padding: '11px 28px', borderRadius: 8,
                  background: 'var(--accent)', border: 'none',
                  color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                }}
              >
                + Log First Meal
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: 'var(--surf)', border: '1px solid var(--edge)', borderRadius: 8, overflow: 'hidden' }}>
            {MEAL_ORDER.map((meal) => {
              const items        = byMeal[meal] ?? [];
              const visibleMeals = MEAL_ORDER.filter(m => !(m === 'other' && (byMeal[m] ?? []).length === 0));
              const visIdx       = visibleMeals.indexOf(meal);
              if (meal === 'other' && items.length === 0) return null;
              return (
                <div key={meal}>
                  {visIdx > 0 && <div style={{ height: 1, background: 'var(--edge)', marginLeft: 20 }} />}
                  <div style={{ padding: '9px 12px 8px' }}>
                    <MealSection meal={meal} items={items} onAddFood={handleAddFood} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past day notice */}
      {!isToday && (
        <div style={{
          margin: '12px 14px 0', padding: '10px 14px', borderRadius: 8,
          background: 'var(--surf)', border: '1px solid var(--edge)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Viewing past entry</span>
          <button
            onClick={() => setViewDate(todayStr)}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}
          >Back to Today</button>
        </div>
      )}

    </div>
  );
}
