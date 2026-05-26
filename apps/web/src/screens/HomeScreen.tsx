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

// ── Static macro palette (same across themes) ────────────────────────
const PROT = '#FF6B35';
const CARB = '#38BDF8';
const FAT  = '#A78BFA';
const RED  = '#FF4444';

const MEAL_ORDER = ['breakfast','pre_workout','lunch','post_workout','dinner','snack','other'] as const;

const MEAL_META: Record<string, { icon: string; label: string; short: string }> = {
  breakfast:    { icon: '🌅', label: 'Breakfast',   short: 'Breakfast'  },
  pre_workout:  { icon: '⚡', label: 'Pre-Workout', short: 'Pre-WO'     },
  lunch:        { icon: '🥗', label: 'Lunch',        short: 'Lunch'      },
  post_workout: { icon: '💪', label: 'Post-Workout', short: 'Post-WO'   },
  dinner:       { icon: '🍽', label: 'Dinner',       short: 'Dinner'    },
  snack:        { icon: '🍎', label: 'Snacks',       short: 'Snacks'    },
  other:        { icon: '📦', label: 'Other',        short: 'Other'     },
};

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
  consumed, targets, isDark,
}: { consumed: MacroTargets; targets: MacroTargets | null; isDark: boolean }) {
  const ACCENT = isDark ? '#DFFF00' : '#0066EE';

  const goal      = targets?.calories ?? 0;
  const food      = Math.round(consumed.calories);
  const exercise  = 0;
  const remaining = goal > 0 ? goal - food + exercise : null;
  const over      = remaining !== null && remaining < 0;
  const pct       = goal > 0 ? Math.min((food / goal) * 100, 100) : 0;
  const ringColor = over ? RED : ACCENT;

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
      background: 'var(--surf)', borderRadius: 16, border: '1px solid var(--edge)',
      padding: '20px 20px 18px',
    }}>
      {/* ── Equation row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 18px 1fr 18px 1fr 18px 1fr',
        alignItems: 'flex-end',
        gap: 0,
        marginBottom: 20,
      }}>
        {/* Goal */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {goal > 0 ? goal.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
            Goal
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 300, color: 'var(--muted)', paddingBottom: 14 }}>−</div>

        {/* Food */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {displayFood.toLocaleString()}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>
            Food
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
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1, color: over ? RED : ringColor }}>
            {remaining !== null ? Math.abs(remaining).toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4, color: over ? RED : ringColor, opacity: 0.7 }}>
            {over ? 'Over' : 'Left'}
          </div>
        </div>
      </div>

      {/* ── Ring centered ── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{
          position: 'relative',
          filter: `drop-shadow(0 0 16px ${ringColor}${isDark ? '50' : '30'})`,
        }}>
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
      <div style={{ height: 6, background: 'var(--edge)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3,
          background: over ? RED : ringColor,
          width: `${pct}%`,
          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: pct > 5 ? `0 0 8px ${ringColor}45` : 'none',
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
            borderRadius: 12, padding: '12px 12px 10px',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 5 }}>
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
            <div style={{ height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
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

// ── Individual meal section card ───────────────────────────────────────
function MealSection({
  meal, items, onAddFood, isDark,
}: {
  meal: string;
  items: FoodLog[];
  onAddFood: (meal: string) => void;
  isDark: boolean;
}) {
  const ACCENT      = isDark ? '#DFFF00' : '#0066EE';
  const ACCENT_BG   = isDark ? 'rgba(223,255,0,0.07)' : 'rgba(0,102,238,0.07)';
  const ACCENT_BORDER = isDark ? 'rgba(223,255,0,0.3)' : 'rgba(0,102,238,0.3)';
  const meta        = MEAL_META[meal] ?? { icon: '📦', label: meal, short: meal };
  const mealCal     = items.reduce((s, l) => s + +l.calories, 0);

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 12, border: '1px solid var(--edge)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: items.length > 0 ? '1px solid var(--edge)' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{meta.icon}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', letterSpacing: 0.2 }}>
            {meta.label}
          </span>
        </div>
        {mealCal > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>
            {Math.round(mealCal)} kcal
          </span>
        )}
      </div>

      {/* Food items */}
      {items.map((item, i) => (
        <div key={item.id ?? i} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '9px 16px',
          borderBottom: '1px solid var(--edge)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, color: 'var(--text)', fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {item.food_name}
            </div>
            {(+item.protein > 0 || +item.carbs > 0 || +item.fat > 0) && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                P{Math.round(+item.protein)}·C{Math.round(+item.carbs)}·F{Math.round(+item.fat)}g
                {item.weight_grams ? ` · ${item.weight_grams}g` : ''}
              </div>
            )}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginLeft: 12, flexShrink: 0 }}>
            {Math.round(+item.calories)}
          </span>
        </div>
      ))}

      {/* Add food button */}
      <div style={{ padding: '10px 12px' }}>
        <button
          onClick={() => onAddFood(meal)}
          className="nrc-press"
          style={{
            width: '100%', padding: '9px 0',
            background: ACCENT_BG,
            border: `1.5px solid ${ACCENT_BORDER}`,
            borderRadius: 8,
            color: ACCENT,
            fontSize: 12, fontWeight: 800,
            cursor: 'pointer', letterSpacing: 1.2, textTransform: 'uppercase',
            transition: 'all 0.18s ease',
            fontFamily: "'Barlow Condensed', sans-serif",
          }}
        >
          + Add Food
        </button>
      </div>
    </div>
  );
}

// ── Training type definitions ──────────────────────────────────────────
const TRAINING_TYPES: { type: TrainingType; label: string; icon: string; color: string }[] = [
  { type: 'rest',     label: 'Rest',     icon: '🛌', color: '#A0A0A0' },
  { type: 'strength', label: 'Strength', icon: '💪', color: PROT      },
  { type: 'cardio',   label: 'Cardio',   icon: '🏃', color: CARB      },
  { type: 'hybrid',   label: 'Hybrid',   icon: '⚡', color: '#DFFF00' },
];

// ── Supplement checklist ───────────────────────────────────────────────
function SupplementBlock({ isDark }: { isDark: boolean }) {
  const { setActiveTab } = useAppStore();
  const ACCENT = isDark ? '#DFFF00' : '#0066EE';
  const today  = new Date().toISOString().split('T')[0];

  const [supplements, setSupplements] = useState<Supplement[]>([]);
  const [logs,        setLogs]        = useState<SupplementLog[]>([]);

  const load = useCallback(async () => {
    const [all, log] = await Promise.all([
      db.supplements.toArray(),
      db.supplement_logs.where('date').equals(today).toArray(),
    ]);
    setSupplements(all.filter(s => s.active !== false));
    setLogs(log);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  if (supplements.length === 0) return (
    <div style={{
      background: 'var(--surf)', borderRadius: 12, border: '1px solid var(--edge)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>💊</span>
      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>No supplements set up yet</span>
      <button
        onClick={() => setActiveTab('supplements')}
        style={{
          background: isDark ? 'rgba(223,255,0,0.1)' : 'rgba(0,102,238,0.1)',
          border: `1px solid ${ACCENT}50`,
          borderRadius: 8,
          color: ACCENT, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 12px',
          transition: 'all 0.2s ease',
        }}
      >Set up →</button>
    </div>
  );

  const isTaken    = (id: number) => logs.some(l => l.supplement_id === id && l.taken);
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

  const takenCount = supplements.filter(s => isTaken(s.id!)).length;
  const allDone    = takenCount === supplements.length;

  return (
    <div style={{ background: 'var(--surf)', borderRadius: 12, border: '1px solid var(--edge)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15 }}>💊</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Supplements
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
            color: allDone ? ACCENT : 'var(--muted)',
            background: allDone
              ? (isDark ? 'rgba(223,255,0,0.15)' : 'rgba(0,102,238,0.1)')
              : 'var(--edge)',
          }}>
            {takenCount}/{supplements.length}
          </span>
        </div>
        <button
          onClick={() => setActiveTab('supplements')}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}
        >Manage →</button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'var(--edge)', margin: '0 16px 4px', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 1,
          background: allDone ? ACCENT : `${ACCENT}60`,
          width: `${supplements.length ? (takenCount / supplements.length) * 100 : 0}%`,
          transition: 'width 0.35s ease',
        }} />
      </div>

      {/* Rows */}
      <div style={{ padding: '5px 0 10px' }}>
        {supplements.map((s, i) => {
          const taken = isTaken(s.id!);
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
              borderBottom: i < supplements.length - 1 ? '1px solid var(--edge)' : 'none',
            }}>
              <button
                onClick={() => toggleTaken(s)}
                className="nrc-press"
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0, cursor: 'pointer', padding: 0,
                  border: `2px solid ${taken ? ACCENT : 'var(--edge)'}`,
                  background: taken ? ACCENT : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: taken ? `0 0 7px ${ACCENT}55` : 'none',
                }}
              >
                {taken && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="2,5 4.5,7.5 8,2.5" stroke={isDark ? '#000' : '#fff'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 600,
                color: taken ? 'var(--muted)' : 'var(--text)',
                textDecoration: taken ? 'line-through' : 'none',
                transition: 'all 0.2s ease',
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
                        border: `1px solid ${active ? ACCENT : 'var(--edge)'}`,
                        background: active ? (isDark ? 'rgba(223,255,0,0.15)' : 'rgba(0,102,238,0.1)') : 'transparent',
                        color: active ? ACCENT : 'var(--muted)',
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
  );
}

// ── Main screen ────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user }                          = useAuthStore();
  const { setActiveTab, setPendingMealType } = useAppStore();
  const { todayLog, weeklyLoad, weather, environmentAlert } = useNutritionStore();
  const { logDay, setActivityModifier }   = useNutrition();
  const { isDark }                        = useThemeStore();

  const ACCENT        = isDark ? '#DFFF00' : '#0066EE';
  const ACCENT_BORDER = isDark ? 'rgba(223,255,0,0.3)' : 'rgba(0,102,238,0.3)';

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
        padding: '18px 16px 12px',
        borderBottom: '1px solid var(--edge)',
        background: 'var(--surf)',
      }}>
        {/* Prev day */}
        <button
          onClick={goToPrev}
          className="nrc-press"
          style={{
            width: 36, height: 36, borderRadius: 10, display: 'flex',
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
              padding: '2px 10px', borderRadius: 20,
              background: isDark ? 'rgba(223,255,0,0.1)' : 'rgba(0,102,238,0.1)',
              border: `1px solid ${ACCENT_BORDER}`,
              fontSize: 10, fontWeight: 700, color: ACCENT,
              textTransform: 'uppercase', letterSpacing: 1.5,
            }}>
              {todayLog.trainingType}
            </div>
          )}
        </div>

        {/* Next day / Settings */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={goToNext}
            className="nrc-press"
            disabled={isToday}
            style={{
              width: 36, height: 36, borderRadius: 10, display: 'flex',
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
              width: 36, height: 36, borderRadius: 10, display: 'flex',
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
        <div style={{ padding: '12px 16px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert ?? { level: 'none', message: '' }} />
        </div>
      )}

      {/* ── Calorie dashboard ── */}
      <div style={{ margin: '12px 16px 0' }}>
        <CalDashboard consumed={consumed} targets={targets} isDark={isDark} />
      </div>

      {/* ── Macro row ── */}
      <div style={{ margin: '10px 16px 0' }}>
        <MacroRow consumed={consumed} targets={targets} />
      </div>

      {/* ── Meal sections (MFP style) ── */}
      <div style={{ margin: '16px 16px 0' }}>
        <div style={{
          fontSize: 10, fontWeight: 700, color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: 2, marginBottom: 10, paddingLeft: 2,
        }}>
          Food Diary
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MEAL_ORDER.map(meal => {
            const items = byMeal[meal] ?? [];
            // Hide empty 'other' section if no logs
            if (meal === 'other' && items.length === 0) return null;
            return (
              <MealSection
                key={meal}
                meal={meal}
                items={items}
                onAddFood={handleAddFood}
                isDark={isDark}
              />
            );
          })}
        </div>
      </div>

      {/* ── Training selector (today only) ── */}
      {isToday && (
        <div style={{
          margin: '16px 16px 0', background: 'var(--surf)',
          borderRadius: 12, border: '1px solid var(--edge)', padding: '16px 16px 18px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
            Today's Training
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {TRAINING_TYPES.map(({ type, label, icon, color }) => {
              const active      = todayLog?.trainingType === type;
              const activeColor = type === 'hybrid' ? (isDark ? '#DFFF00' : '#0066EE') : color;
              return (
                <button
                  key={type}
                  onClick={() => handleSelectType(type)}
                  className="nrc-press"
                  style={{
                    padding: '13px 4px', borderRadius: 12,
                    border: `1.5px solid ${active ? activeColor : 'var(--edge)'}`,
                    background: active
                      ? `${activeColor}18`
                      : 'var(--surf2)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    transition: 'all 0.2s ease',
                    boxShadow: active ? `0 0 14px ${activeColor}28` : 'none',
                  }}
                >
                  <div style={{ fontSize: 22 }}>{icon}</div>
                  <div style={{ fontSize: 10, fontWeight: active ? 800 : 600, color: active ? activeColor : 'var(--muted)', letterSpacing: 0.3 }}>
                    {label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* NEAT / Activity modifier */}
          {todayLog && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
                Daily Activity Level
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, lineHeight: 1.5, opacity: 0.7 }}>
                Non-workout movement — steps, job, errands.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  { val: 'low',    label: 'Low',    desc: 'Desk · sitting'     },
                  { val: 'normal', label: 'Normal', desc: 'Some walking'       },
                  { val: 'high',   label: 'High',   desc: 'On feet all day'    },
                ] as const).map(({ val, label, desc }) => {
                  const sel = (activityModifier ?? 'normal') === val || (!activityModifier && val === 'normal');
                  return (
                    <button
                      key={val}
                      onClick={() => setActivityModifier(val === 'normal' ? undefined : val)}
                      style={{
                        flex: 1, padding: '10px 4px', borderRadius: 10,
                        border: `1.5px solid ${sel ? ACCENT : 'var(--edge)'}`,
                        background: sel
                          ? (isDark ? 'rgba(223,255,0,0.1)' : 'rgba(0,102,238,0.1)')
                          : 'transparent',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        transition: 'all 0.2s ease',
                        boxShadow: sel ? `0 0 10px ${ACCENT}20` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: sel ? 800 : 600, color: sel ? ACCENT : 'var(--muted)' }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 9, color: sel ? ACCENT : 'var(--muted)', textAlign: 'center', lineHeight: 1.4, opacity: sel ? 0.85 : 0.5 }}>
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

      {/* ── Supplements (today only) ── */}
      {isToday && (
        <div style={{ margin: '10px 16px 0' }}>
          <SupplementBlock isDark={isDark} />
        </div>
      )}

      {/* ── Strava ── */}
      {user && isToday && (
        <div style={{ margin: '10px 16px 0' }}>
          <StravaCard />
        </div>
      )}

      {/* ── Weekly load ── */}
      {isToday && (loggedRuns.length > 0 || weeklyLoad.totalStrengthSets > 0) && (
        <div style={{
          margin: '12px 16px 0', background: 'var(--surf)',
          borderRadius: 12, border: '1px solid var(--edge)', padding: '16px 16px 18px',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
            Weekly Load
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {weeklyLoad.totalRunKm > 0 && (
              <div style={{ flex: 1, background: 'var(--surf2)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--edge)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: CARB, letterSpacing: -0.5 }}>
                  {weeklyLoad.totalRunKm.toFixed(1)}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>km</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontWeight: 500 }}>Total runs</div>
              </div>
            )}
            {weeklyLoad.totalStrengthSets > 0 && (
              <div style={{ flex: 1, background: 'var(--surf2)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--edge)' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: PROT, letterSpacing: -0.5 }}>
                  {weeklyLoad.totalStrengthSets}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginLeft: 3 }}>sessions</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, fontWeight: 500 }}>Strength</div>
              </div>
            )}
            <div style={{ flex: 1, background: 'var(--surf2)', borderRadius: 12, padding: '12px 14px', border: '1px solid var(--edge)' }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5,
                color: weeklyLoad.recoveryScore >= 60 ? (isDark ? '#DFFF00' : '#0066EE')
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
          margin: '16px 16px 0', padding: '12px 16px',
          background: isDark ? 'rgba(223,255,0,0.05)' : 'rgba(0,102,238,0.05)',
          border: `1px solid ${ACCENT_BORDER}`,
          borderRadius: 10, textAlign: 'center',
        }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Viewing past diary entry · Training & supplements shown for today only
          </div>
          <button
            onClick={() => setViewDate(todayStr)}
            style={{
              marginTop: 8, background: 'none', border: 'none',
              color: ACCENT, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >Back to Today →</button>
        </div>
      )}

    </div>
  );
}
