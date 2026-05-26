import { useState, useEffect, useRef, useCallback } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useAppStore } from '../store/appStore';
import { useThemeStore } from '../store/themeStore';
import WeatherBanner from '../components/WeatherBanner';
import StravaCard from '../components/StravaCard';
import { getLogs } from '../api/localFood';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType } from '@shared/types';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { db } from '../lib/db';
import type { Supplement, SupplementLog } from '../lib/db';

// ── Macro palette: Protein=blue, Carbs=green, Fat=amber ──────────────
const PROT = '#38BDF8';
const CARB = '#22C55E';
const FAT  = '#F59E0B';
const RED  = '#EF4444';

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
function CalDashboard({
  consumed, targets,
}: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const goal      = targets?.calories ?? 0;
  const food      = Math.round(consumed.calories);
  const exercise  = 0;
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
      background: 'var(--surf)', borderRadius: 8, border: '1px solid var(--edge)',
      padding: '18px 18px 16px',
    }}>
      {/* ── Equation row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 18px 1fr 18px 1fr 18px 1fr',
        alignItems: 'flex-end',
        gap: 0,
        marginBottom: 18,
      }}>
        {/* Eaten (Food) — shown first */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {displayFood.toLocaleString()}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
            Eaten
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 300, color: 'var(--muted)', paddingBottom: 14 }}>of</div>

        {/* Goal (Target) — shown second */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {goal > 0 ? goal.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
            Goal
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 300, color: 'var(--muted)', paddingBottom: 14 }}>+</div>

        {/* Exercise */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {exercise}
          </div>
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
const TRAINING_TYPES: { type: TrainingType; label: string; color: string; isAccent?: boolean }[] = [
  { type: 'rest',     label: 'Rest',     color: '#8B949E'           },
  { type: 'strength', label: 'Strength', color: PROT                },
  { type: 'cardio',   label: 'Cardio',   color: CARB                },
  { type: 'hybrid',   label: 'Hybrid',   color: '#8B949E', isAccent: true },
];

// ── Supplement checklist ───────────────────────────────────────────────
function SupplementBlock() {
  const { setActiveTab } = useAppStore();
  const today  = new Date().toISOString().split('T')[0];

  const [supplements,  setSupplements]  = useState<Supplement[]>([]);
  const [logs,         setLogs]         = useState<SupplementLog[]>([]);
  const [showCongrats, setShowCongrats] = useState(false);

  const load = useCallback(async () => {
    const [all, log] = await Promise.all([
      db.supplements.toArray(),
      db.supplement_logs.where('date').equals(today).toArray(),
    ]);
    setSupplements(all.filter(s => s.active !== false));
    setLogs(log);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // ── All hooks must be called before any early return ──────────────────
  const isTaken    = (id: number) => logs.some(l => l.supplement_id === id && l.taken);
  const takenCountEarly = supplements.filter(s => isTaken(s.id!)).length;
  const allDoneEarly    = supplements.length > 0 && takenCountEarly === supplements.length;

  // Show congrats once per calendar day when all supplements are marked
  useEffect(() => {
    if (!allDoneEarly) return;
    const key = `fs_supp_congrats_${today}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      setShowCongrats(true);
    }
  }, [allDoneEarly, today]);

  if (supplements.length === 0) return (
    <div style={{
      background: 'var(--surf)', borderRadius: 8, border: '1px solid var(--edge)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7"/>
        <circle cx="17" cy="17" r="5"/><path d="M14.5 19.5l5-5"/>
      </svg>
      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>No supplements set up yet</span>
      <button
        onClick={() => setActiveTab('supplements')}
        style={{
          background: 'var(--accent-muted)',
          border: '1px solid var(--accent)',
          borderRadius: 6,
          color: 'var(--accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 12px',
          transition: 'all 0.2s ease',
        }}
      >Set up</button>
    </div>
  );

  const timePeriod = (id: number): 'M' | 'A' | 'E' | null => {
    const l = logs.find(l => l.supplement_id === id && l.taken);
    if (!l) return null;
    const h = new Date(l.logged_at).getHours();
    return h < 12 ? 'M' : h < 17 ? 'A' : 'E';
  };

  const logAtPeriod = async (supp: Supplement, period: 'M' | 'A' | 'E') => {
    const hour     = period === 'M' ? 8 : period === 'A' ? 13 : 19;
    const logTime  = new Date(); logTime.setHours(hour, 0, 0, 0);
    const id       = supp.id!;
    const existing = logs.find(l => l.supplement_id === id);
    if (existing) {
      const cur = timePeriod(id);
      await db.supplement_logs.update(existing.id!, {
        taken: !(cur === period && existing.taken),
        logged_at: logTime.toISOString(),
      });
    } else {
      await db.supplement_logs.add({ supplement_id: id, date: today, taken: true, logged_at: logTime.toISOString() });
    }
    load();
  };

  const toggleTaken = async (supp: Supplement) => {
    const id       = supp.id!;
    const existing = logs.find(l => l.supplement_id === id);
    if (existing) {
      await db.supplement_logs.update(existing.id!, { taken: !existing.taken, logged_at: new Date().toISOString() });
    } else {
      await db.supplement_logs.add({ supplement_id: id, date: today, taken: true, logged_at: new Date().toISOString() });
    }
    load();
  };

  const takenCount = takenCountEarly;
  const allDone    = allDoneEarly;

  return (
    <>
    <div style={{ background: 'var(--surf)', borderRadius: 8, border: '1px solid var(--edge)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7"/>
            <circle cx="17" cy="17" r="5"/><path d="M14.5 19.5l5-5"/>
          </svg>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Supplements
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 7px',
            color: allDone ? 'var(--accent)' : 'var(--muted)',
            background: allDone ? 'var(--accent-muted)' : 'var(--edge)',
          }}>
            {takenCount}/{supplements.length}
          </span>
        </div>
        <button
          onClick={() => setActiveTab('supplements')}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
        >Manage</button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--edge)', margin: '0 14px 4px', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 1,
          background: allDone ? 'var(--accent)' : 'var(--accent)',
          width: `${supplements.length ? (takenCount / supplements.length) * 100 : 0}%`,
          opacity: allDone ? 1 : 0.4,
          transition: 'width 0.35s ease',
        }} />
      </div>

      {/* Rows */}
      <div style={{ padding: '5px 0 8px' }}>
        {supplements.map((s, i) => {
          const taken = isTaken(s.id!);
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
              borderBottom: i < supplements.length - 1 ? '1px solid var(--edge)' : 'none',
            }}>
              <button
                onClick={() => toggleTaken(s)}
                className="nrc-press"
                style={{
                  width: 20, height: 20, borderRadius: 4, flexShrink: 0, cursor: 'pointer', padding: 0,
                  border: `2px solid ${taken ? 'var(--accent)' : 'var(--edge)'}`,
                  background: taken ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                {taken && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="2,5 4.5,7.5 8,2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 600,
                color: taken ? 'var(--muted)' : 'var(--text)',
                transition: 'color 0.2s ease',
              }}>
                {s.name}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>{s.dose} {s.unit}</span>
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                {(['M', 'A', 'E'] as const).map(p => {
                  const active = taken && timePeriod(s.id!) === p;
                  return (
                    <button
                      key={p}
                      onClick={e => { e.stopPropagation(); logAtPeriod(s, p); }}
                      className="nrc-press"
                      style={{
                        width: 22, height: 20, borderRadius: 4, flexShrink: 0, padding: 0,
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--edge)'}`,
                        background: active ? 'var(--accent-muted)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--muted)',
                        fontSize: 9, fontWeight: 800, letterSpacing: 0.3,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >{p}</button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* ── Congrats overlay ── */}
    {showCongrats && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }} onClick={() => setShowCongrats(false)}>
        <div style={{
          background: 'var(--surf)', borderRadius: 8, padding: '32px 28px',
          border: '1px solid var(--accent)',
          textAlign: 'center', maxWidth: 340, width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, marginBottom: 8 }}>
            All Done!
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.65, marginBottom: 24 }}>
            Every supplement logged today. Consistency compounds — you're building the habits that separate good athletes from elite ones.
          </div>
          <button
            onClick={() => setShowCongrats(false)}
            style={{
              width: '100%', padding: '13px', borderRadius: 8,
              background: 'var(--accent)', border: 'none',
              color: '#fff', fontSize: 14, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >Let's Go 💪</button>
        </div>
      </div>
    )}
    </>
  );
}

// ── Main screen ────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user }                          = useAuthStore();
  const { setActiveTab, setPendingMealType } = useAppStore();
  const { todayLog, weeklyLoad, weather, environmentAlert } = useNutritionStore();
  const { logDay, setActivityModifier }   = useNutrition();
  const { isDark }                        = useThemeStore();

  const todayStr = new Date().toISOString().split('T')[0];
  const [viewDate, setViewDate] = useState(todayStr);
  const isToday   = viewDate === todayStr;

  const [logs,     setLogs]     = useState<FoodLog[]>([]);
  const [consumed, setConsumed] = useState<MacroTargets>(emptyMacros());
  const [logTick,  setLogTick]  = useState(0);

  useEffect(() => {
    getLogs(viewDate).then(ls => {
      const active = ls.filter(l => !l.removed);
      setLogs(active);
      setConsumed(sumLogs(active));
    });
  }, [viewDate, logTick]);

  const reloadLogs = useCallback(() => setLogTick(t => t + 1), []);
  void reloadLogs;

  const targets = useEffectiveTargets();

  // Group by meal
  const byMeal = MEAL_ORDER.reduce<Record<string, FoodLog[]>>((acc, m) => { acc[m] = []; return acc; }, {});
  logs.forEach(l => {
    const key = (l.meal_type ?? 'other') as string;
    if (byMeal[key]) byMeal[key].push(l);
    else byMeal['other'].push(l);
  });

  const handleAddFood = useCallback((meal: string) => {
    setPendingMealType(meal);
    setActiveTab('food');
  }, [setActiveTab, setPendingMealType]);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type);
    if (r.blocked && !window.confirm('Heavy run load this week. Cardio today risks injury.\n\nLog anyway?')) return;
    if (r.blocked) logDay(type, undefined, undefined, true);
  };

  const activityModifier = todayLog?.dailyActivityModifier ?? null;
  const loggedRuns       = weeklyLoad.loggedRuns ?? [];

  // Date navigation helpers
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

  const dateLabel = new Date(viewDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric',
  });

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 32 }}>

      {/* ── Top bar: Date nav + settings icon ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 14px 10px',
        borderBottom: '1px solid var(--edge)',
        background: 'var(--surf)',
      }}>
        {/* Prev day */}
        <button
          onClick={goToPrev}
          className="nrc-press"
          style={{
            width: 34, height: 34, borderRadius: 6, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--surf2)', border: '1px solid var(--edge)',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text)' }}>
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Date label */}
        <div style={{ textAlign: 'center', flex: 1, padding: '0 8px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: 0.1 }}>
            {isToday ? `Today · ${dateLabel}` : dateLabel}
          </div>
          {todayLog?.trainingType && isToday && (
            <div style={{
              display: 'inline-block', marginTop: 4,
              padding: '2px 10px', borderRadius: 4,
              background: 'var(--accent-muted)',
              border: '1px solid var(--accent)',
              fontSize: 10, fontWeight: 700, color: 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: 1.5,
            }}>
              {todayLog.trainingType}
            </div>
          )}
        </div>

        {/* Next day / Settings */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={goToNext}
            className="nrc-press"
            disabled={isToday}
            style={{
              width: 34, height: 34, borderRadius: 6, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--surf2)', border: '1px solid var(--edge)',
              cursor: isToday ? 'default' : 'pointer',
              opacity: isToday ? 0.3 : 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text)' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className="nrc-press"
            style={{
              width: 34, height: 34, borderRadius: 6, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--surf2)', border: '1px solid var(--edge)',
              cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--muted)' }}>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Weather ── */}
      {weather && isToday && (
        <div style={{ padding: '10px 14px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert ?? { level: 'none', message: '' }} />
        </div>
      )}

      {/* ── Calorie dashboard ── */}
      <div style={{ margin: '10px 14px 0' }}>
        <CalDashboard consumed={consumed} targets={targets} />
      </div>

      {/* ── Macro row ── */}
      <div style={{ margin: '8px 14px 0' }}>
        <MacroRow consumed={consumed} targets={targets} />
      </div>

      {/* ── Training selector (today only) ── */}
      {isToday && (
        <div style={{
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
                  onClick={() => handleSelectType(type)}
                  className="nrc-press"
                  style={{
                    padding: '11px 4px', borderRadius: 8,
                    border: `1.5px solid ${active ? displayColor : 'var(--edge)'}`,
                    background: active
                      ? (isAccent ? 'var(--accent-muted)' : `${color}18`)
                      : 'var(--surf2)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    transition: 'border-color 0.2s ease, background 0.2s ease',
                    color: active ? displayColor : 'var(--muted)',
                  }}
                >
                  <TrainingIcon type={type} size={18} />
                  <div style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: 0.3 }}>
                    {label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* NEAT / Activity modifier */}
          {todayLog && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
                Daily Activity Level
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8, lineHeight: 1.5, opacity: 0.7 }}>
                Non-workout movement — steps, job, errands.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {([
                  { val: 'low',    label: 'Low',    desc: 'Desk · sitting'   },
                  { val: 'normal', label: 'Normal', desc: 'Some walking'     },
                  { val: 'high',   label: 'High',   desc: 'On feet all day'  },
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
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: sel ? 800 : 600, color: sel ? 'var(--accent)' : 'var(--muted)' }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 9, color: sel ? 'var(--accent)' : 'var(--muted)', textAlign: 'center', lineHeight: 1.4, opacity: sel ? 0.85 : 0.5 }}>
                        {desc}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Food Diary (compact scrollable) ── */}
      <div style={{ margin: '8px 14px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 6, paddingLeft: 2,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2 }}>
            Food Diary
          </span>
          {logs.length > 0 && (
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
              {logs.length} item{logs.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{
          background: 'var(--surf)',
          border: '1px solid var(--edge)',
          borderRadius: 8,
          overflow: 'hidden',
          /* Fixed height — scrollable inside so the page doesn't stretch */
          maxHeight: 320,
          overflowY: 'auto',
        }}>
          {MEAL_ORDER.map((meal) => {
            const items        = byMeal[meal] ?? [];
            const visibleMeals = MEAL_ORDER.filter(m => !(m === 'other' && (byMeal[m] ?? []).length === 0));
            const visIdx       = visibleMeals.indexOf(meal);
            if (meal === 'other' && items.length === 0) return null;
            return (
              <div key={meal}>
                {visIdx > 0 && (
                  <div style={{ height: 1, background: 'var(--edge)', marginLeft: 20 }} />
                )}
                <div style={{ padding: '9px 12px 8px' }}>
                  <MealSection
                    meal={meal}
                    items={items}
                    onAddFood={handleAddFood}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Supplements (today only) ── */}
      {isToday && (
        <div style={{ margin: '8px 14px 0' }}>
          <SupplementBlock />
        </div>
      )}

      {/* ── Strava ── */}
      {user && isToday && (
        <div style={{ margin: '8px 14px 0' }}>
          <StravaCard />
        </div>
      )}

      {/* ── Weekly load ── */}
      {isToday && (loggedRuns.length > 0 || weeklyLoad.totalStrengthSets > 0) && (
        <div style={{
          margin: '10px 14px 0', background: 'var(--surf)',
          borderRadius: 8, border: '1px solid var(--edge)', padding: '14px 14px 16px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>
            Weekly Load
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {weeklyLoad.totalRunKm > 0 && (
              <div style={{ flex: 1, background: 'var(--surf2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--edge)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: CARB, letterSpacing: -0.5 }}>
                  {weeklyLoad.totalRunKm.toFixed(1)}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>km</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontWeight: 500 }}>Total runs</div>
              </div>
            )}
            {weeklyLoad.totalStrengthSets > 0 && (
              <div style={{ flex: 1, background: 'var(--surf2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--edge)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: PROT, letterSpacing: -0.5 }}>
                  {weeklyLoad.totalStrengthSets}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>sessions</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontWeight: 500 }}>Strength</div>
              </div>
            )}
            <div style={{ flex: 1, background: 'var(--surf2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--edge)' }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5,
                color: weeklyLoad.recoveryScore >= 60 ? 'var(--accent)'
                     : weeklyLoad.recoveryScore >= 35 ? CARB : RED }}>
                {weeklyLoad.recoveryScore}
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontWeight: 500 }}>Recovery</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Past day notice ── */}
      {!isToday && (
        <div style={{
          margin: '14px 14px 0', padding: '12px 14px',
          background: 'var(--accent-muted)',
          border: '1px solid var(--accent)',
          borderRadius: 8, textAlign: 'center',
          opacity: 0.9,
        }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Viewing past diary entry · Training &amp; supplements shown for today only
          </div>
          <button
            onClick={() => setViewDate(todayStr)}
            style={{
              marginTop: 8, background: 'none', border: 'none',
              color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >Back to Today</button>
        </div>
      )}

    </div>
  );
}
