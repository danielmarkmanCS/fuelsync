import { useState, useEffect, useRef, useCallback } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useAppStore } from '../store/appStore';
import WeatherBanner from '../components/WeatherBanner';
import StravaCard from '../components/StravaCard';
import { getLogs } from '../api/localFood';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType } from '@shared/types';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { db } from '../lib/db';
import type { Supplement, SupplementLog } from '../lib/db';

// ── Volt / Lando design system ─────────────────────────────────────
const BG    = '#050505';
const CARD  = '#111111';
const CARD2 = '#161616';
const EDGE  = '#2A2A2A';
const VOLT  = '#DFFF00';
const TEXT  = '#FFFFFF';
const MUTED = '#A0A0A0';
const PROT  = '#FF6B35';
const CARB  = '#38BDF8';
const FAT   = '#A78BFA';
const RED   = '#FF4444';
// alias so sub-components that use LIME still work
const LIME  = VOLT;

const MEAL_ORDER = ['breakfast','pre_workout','lunch','post_workout','dinner','snack','other'] as const;
const MEAL_LABEL: Record<string, string> = {
  breakfast: 'Breakfast', pre_workout: 'Pre-Workout', lunch: 'Lunch',
  post_workout: 'Post-Workout', dinner: 'Dinner', snack: 'Snacks', other: 'Other',
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

// ── Calorie Ring ───────────────────────────────────────────────────
function CalRing({ cal, target }: { cal: number; target: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  const display = useCountUp(mounted ? Math.round(cal) : 0);
  const R    = 58;
  const C    = 2 * Math.PI * R;
  const pct  = target > 0 ? Math.min(cal / target, 1) : 0;
  const over = cal > target && target > 0;
  const remaining  = target > 0 ? Math.round(target - cal) : null;
  const ringColor  = over ? RED : LIME;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '22px 20px 16px' }}>
      {/* Ring */}
      <div style={{ position: 'relative', flexShrink: 0, filter: `drop-shadow(0 0 14px ${ringColor}45)` }}>
        <svg width="136" height="136" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="68" cy="68" r={R} fill="none" stroke={EDGE} strokeWidth="9" />
          <circle cx="68" cy="68" r={R} fill="none" stroke={ringColor} strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${C}`}
            strokeDashoffset={`${C * (1 - pct)}`}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.3s' }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: ringColor, letterSpacing: -1.5, lineHeight: 1 }}>
            {display.toLocaleString()}
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 1.5, marginTop: 4, textTransform: 'uppercase' }}>kcal</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: `${MUTED}80`, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 }}>
            {over ? 'Over by' : 'Remaining'}
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, color: over ? RED : TEXT, letterSpacing: -1.5, lineHeight: 1 }}>
            {remaining !== null ? Math.abs(remaining).toLocaleString() : '—'}
            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginLeft: 4 }}>kcal</span>
          </div>
        </div>
        <div>
          <div style={{ width: '100%', height: 5, background: EDGE, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: over ? RED : LIME,
              width: `${Math.min(pct * 100, 100)}%`,
              transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
              boxShadow: pct > 0.05 ? `0 0 8px ${ringColor}55` : 'none',
            }} />
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 5, fontWeight: 500 }}>
            Goal: {target > 0 ? target.toLocaleString() : '—'} kcal
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Macro bars ─────────────────────────────────────────────────────
function MacroBars({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const items = [
    { label: 'Protein', val: consumed.proteinG, target: targets?.proteinG ?? 0, color: PROT },
    { label: 'Carbs',   val: consumed.carbsG,   target: targets?.carbsG   ?? 0, color: CARB },
    { label: 'Fat',     val: consumed.fatG,      target: targets?.fatG     ?? 0, color: FAT  },
  ];
  return (
    <div style={{ padding: '4px 20px 22px', display: 'flex', flexDirection: 'column', gap: 13 }}>
      {items.map(({ label, val, target, color }) => {
        const pct  = target > 0 ? Math.min((val / target) * 100, 100) : 0;
        const over = val > target && target > 0;
        const c    = over ? RED : color;
        return (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{label}</div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: over ? RED : TEXT }}>{Math.round(val)}</span>
                {target > 0 && <span style={{ color: `${MUTED}80`, fontWeight: 500 }}> / {Math.round(target)}g</span>}
              </div>
            </div>
            <div style={{ height: 6, background: EDGE, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                background: `linear-gradient(90deg, ${c}BB, ${c})`,
                width: `${pct}%`,
                transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
                boxShadow: pct > 5 ? `0 0 6px ${c}45` : 'none',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Training type definitions ──────────────────────────────────────
const TRAINING_TYPES: { type: TrainingType; label: string; icon: string; color: string }[] = [
  { type: 'rest',     label: 'Rest',     icon: '🛌', color: MUTED },
  { type: 'strength', label: 'Strength', icon: '💪', color: PROT  },
  { type: 'cardio',   label: 'Cardio',   icon: '🏃', color: CARB  },
  { type: 'hybrid',   label: 'Hybrid',   icon: '⚡', color: LIME  },
];

// ── Supplement checklist ───────────────────────────────────────────
function SupplementBlock() {
  const { setActiveTab } = useAppStore();
  const today = new Date().toISOString().split('T')[0];
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
      background: CARD, borderRadius: 16, border: `1px solid ${EDGE}`,
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontSize: 18 }}>💊</span>
      <span style={{ fontSize: 12, color: `${MUTED}70`, flex: 1 }}>No supplements set up yet</span>
      <button
        onClick={() => setActiveTab('supplements')}
        style={{
          background: `${LIME}12`, border: `1px solid ${LIME}35`, borderRadius: 8,
          color: LIME, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '5px 12px',
          transition: 'all 0.2s ease',
        }}
      >Set up →</button>
    </div>
  );

  const isTaken   = (id: number) => logs.some(l => l.supplement_id === id && l.taken);
  const takenTime = (id: number) => {
    const l = logs.find(l => l.supplement_id === id && l.taken);
    return l ? new Date(l.logged_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null;
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
    <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💊</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 }}>
            Supplements
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
            color: allDone ? LIME : MUTED,
            background: allDone ? `${LIME}18` : `${MUTED}15`,
          }}>
            {takenCount}/{supplements.length}
          </span>
        </div>
        <button
          onClick={() => setActiveTab('supplements')}
          style={{
            background: 'none', border: 'none', color: `${MUTED}80`,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0, letterSpacing: 0.3,
            transition: 'color 0.2s ease',
          }}
        >Manage →</button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: EDGE, margin: '0 16px 4px', borderRadius: 1, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 1,
          background: allDone ? LIME : `${LIME}60`,
          width: `${supplements.length ? (takenCount / supplements.length) * 100 : 0}%`,
          transition: 'width 0.35s ease',
        }} />
      </div>

      {/* Rows */}
      <div style={{ padding: '5px 0 10px' }}>
        {supplements.map((s, i) => {
          const taken = isTaken(s.id!);
          const time  = takenTime(s.id!);
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px',
              borderBottom: i < supplements.length - 1 ? `1px solid ${EDGE}50` : 'none',
            }}>
              <button
                onClick={() => toggleTaken(s)}
                className="nrc-press"
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0, cursor: 'pointer', padding: 0,
                  border: `2px solid ${taken ? LIME : EDGE}`,
                  background: taken ? LIME : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: taken ? `0 0 7px ${LIME}55` : 'none',
                }}
              >
                {taken && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <polyline points="2,5 4.5,7.5 8,2.5" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span style={{
                flex: 1, fontSize: 13, fontWeight: 600,
                color: taken ? `${MUTED}55` : TEXT,
                textDecoration: taken ? 'line-through' : 'none',
                transition: 'all 0.2s ease',
              }}>
                {s.name}
              </span>
              <span style={{ fontSize: 10, color: `${MUTED}80`, flexShrink: 0 }}>{s.dose} {s.unit}</span>
              <span style={{
                fontSize: 10, flexShrink: 0, minWidth: 36, textAlign: 'right',
                color: taken ? LIME : `${MUTED}40`,
                fontWeight: taken ? 600 : 400,
              }}>
                {taken && time ? time : s.timing !== 'anytime' ? s.timing.replace('-', '‑') : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Food diary card ────────────────────────────────────────────────
const MEAL_META: Record<string, { icon: string; color: string; short: string }> = {
  breakfast:    { icon: '🌅', color: CARB, short: 'Breakfast' },
  pre_workout:  { icon: '⚡', color: LIME, short: 'Pre-WO'    },
  lunch:        { icon: '🥗', color: PROT, short: 'Lunch'     },
  post_workout: { icon: '💪', color: LIME, short: 'Post-WO'   },
  dinner:       { icon: '🍽', color: FAT,  short: 'Dinner'    },
  snack:        { icon: '🍎', color: MUTED,short: 'Snacks'    },
  other:        { icon: '📦', color: MUTED,short: 'Other'     },
};

function FoodDiaryCube({ logs, byMeal, onAddFood }: {
  logs: FoodLog[];
  byMeal: Record<string, FoodLog[]>;
  onAddFood: () => void;
}) {
  const totalCals  = logs.reduce((s, l) => s + +l.calories, 0);
  const totalProt  = logs.reduce((s, l) => s + +l.protein, 0);
  const totalCarbs = logs.reduce((s, l) => s + +l.carbs, 0);
  const totalFat   = logs.reduce((s, l) => s + +l.fat, 0);

  return (
    <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px 11px', minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, flexShrink: 0 }}>
          Food Diary
        </span>
        {totalCals > 0 && (
          <>
            <span style={{
              fontSize: 11, fontWeight: 700, color: LIME, background: `${LIME}15`,
              borderRadius: 20, padding: '2px 9px', flexShrink: 0,
            }}>
              {Math.round(totalCals)} kcal
            </span>
            <span style={{
              fontSize: 10, color: `${MUTED}80`, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              P{Math.round(totalProt)}·C{Math.round(totalCarbs)}·F{Math.round(totalFat)}g
            </span>
          </>
        )}
      </div>
      <div style={{ height: 1, background: EDGE }} />

      {/* Meal rows */}
      <div style={{ padding: '4px 0' }}>
        {MEAL_ORDER.map((meal, i) => {
          const items   = byMeal[meal] ?? [];
          const mealCal = items.reduce((s, l) => s + +l.calories, 0);
          const meta    = MEAL_META[meal];
          const hasFood = items.length > 0;
          const isLast  = i === MEAL_ORDER.length - 1;

          return (
            <div
              key={meal}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                borderBottom: isLast ? 'none' : `1px solid ${EDGE}40`,
              }}
            >
              <span style={{ fontSize: 13, flexShrink: 0, width: 18, textAlign: 'center' }}>{meta.icon}</span>
              <span style={{
                fontSize: 11, fontWeight: 700, flexShrink: 0, width: 62,
                color: hasFood ? meta.color : `${MUTED}45`,
              }}>
                {meta.short}
              </span>
              <span style={{
                flex: 1, fontSize: 11, minWidth: 0,
                color: hasFood ? `${MUTED}CC` : `${MUTED}30`,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {hasFood ? items.map(l => l.food_name).join(', ') : '—'}
              </span>
              {hasFood && (
                <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, flexShrink: 0, marginRight: 6 }}>
                  {Math.round(mealCal)}
                </span>
              )}
              <button
                onClick={onAddFood}
                className="nrc-press"
                style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, padding: 0,
                  background: 'transparent', border: `1.5px solid ${EDGE}`,
                  color: MUTED, fontSize: 15, lineHeight: 1,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.borderColor = LIME; b.style.color = LIME; b.style.background = `${LIME}12`;
                }}
                onMouseLeave={e => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.borderColor = EDGE; b.style.color = MUTED; b.style.background = 'transparent';
                }}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuthStore();
  const { setActiveTab } = useAppStore();
  const { todayLog, weeklyLoad, weather, environmentAlert } = useNutritionStore();
  const { logDay, setActivityModifier } = useNutrition();

  const [logs,     setLogs]     = useState<FoodLog[]>([]);
  const [consumed, setConsumed] = useState<MacroTargets>(emptyMacros());
  const [logTick,  setLogTick]  = useState(0);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    getLogs(today).then(ls => {
      setLogs(ls.filter(l => !l.removed));
      setConsumed(sumLogs(ls.filter(l => !l.removed)));
    });
  }, [today, logTick]);

  const reloadLogs = useCallback(() => setLogTick(t => t + 1), []);

  const targets = useEffectiveTargets();

  const byMeal = MEAL_ORDER.reduce<Record<string, FoodLog[]>>((acc, m) => { acc[m] = []; return acc; }, {});
  logs.forEach(l => {
    const key = (l.meal_type ?? 'other') as string;
    if (byMeal[key]) byMeal[key].push(l);
    else byMeal['other'].push(l);
  });

  const handleAddFood = useCallback(() => { setActiveTab('food'); }, [setActiveTab]);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type);
    if (r.blocked && !window.confirm('Heavy run load this week. Cardio today risks injury.\n\nLog anyway?')) return;
    if (r.blocked) logDay(type, undefined, undefined, true);
  };

  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const loggedRuns = weeklyLoad.loggedRuns ?? [];
  const activityModifier = todayLog?.dailyActivityModifier ?? null;

  return (
    <div style={{ background: BG, minHeight: '100%', paddingBottom: 28 }}>

      {/* ── Header ── */}
      <div style={{ padding: '22px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: `${MUTED}70`, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 3 }}>
            Today
          </div>
          <div style={{ fontSize: 19, fontWeight: 800, color: TEXT, letterSpacing: -0.5, lineHeight: 1.1 }}>
            {dateLabel}
          </div>
        </div>
        {todayLog?.trainingType && (
          <div style={{
            padding: '6px 14px', borderRadius: 20, marginTop: 2,
            background: `${LIME}12`, border: `1px solid ${LIME}35`,
            fontSize: 11, fontWeight: 700, color: LIME,
            textTransform: 'uppercase', letterSpacing: 1.5,
          }}>
            {todayLog.trainingType}
          </div>
        )}
      </div>

      {/* ── Weather ── */}
      {weather && (
        <div style={{ padding: '14px 16px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert ?? { level: 'none', message: '' }} />
        </div>
      )}

      {/* ── Calorie + Macro card ── */}
      <div style={{ margin: '14px 16px 0', background: CARD, borderRadius: 18, border: `1px solid ${EDGE}` }}>
        <CalRing cal={consumed.calories} target={targets?.calories ?? 0} />
        {targets && <MacroBars consumed={consumed} targets={targets} />}
      </div>

      {/* ── Training selector ── */}
      <div style={{ margin: '12px 16px 0', background: CARD, borderRadius: 18, border: `1px solid ${EDGE}`, padding: '16px 16px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: `${MUTED}70`, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
          Today's Training
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {TRAINING_TYPES.map(({ type, label, icon, color }) => {
            const active = todayLog?.trainingType === type;
            return (
              <button
                key={type}
                onClick={() => handleSelectType(type)}
                className="nrc-press"
                style={{
                  padding: '13px 4px', borderRadius: 14,
                  border: `1.5px solid ${active ? color : EDGE}`,
                  background: active ? `${color}14` : CARD2,
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  transition: 'all 0.2s ease',
                  boxShadow: active ? `0 0 16px ${color}28` : 'none',
                }}
              >
                <div style={{ fontSize: 22 }}>{icon}</div>
                <div style={{ fontSize: 10, fontWeight: active ? 800 : 600, color: active ? color : MUTED, letterSpacing: 0.3 }}>
                  {label}
                </div>
              </button>
            );
          })}
        </div>

        {/* NEAT */}
        {todayLog && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: `${MUTED}60`, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>
              Daily Activity Level
            </div>
            <div style={{ fontSize: 11, color: `${MUTED}55`, marginBottom: 10, lineHeight: 1.5 }}>
              Non-workout movement — steps, job, errands. Affects your daily calories.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { val: 'low',    label: 'Low',    desc: 'Desk job · mostly sitting'      },
                { val: 'normal', label: 'Normal', desc: 'Some walking · light day'        },
                { val: 'high',   label: 'High',   desc: 'On feet all day · lots of steps' },
              ] as const).map(({ val, label, desc }) => {
                const sel = (activityModifier ?? 'normal') === val || (!activityModifier && val === 'normal');
                return (
                  <button
                    key={val}
                    onClick={() => setActivityModifier(val === 'normal' ? undefined : val)}
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 12,
                      border: `1.5px solid ${sel ? LIME : EDGE}`,
                      background: sel ? `${LIME}12` : 'transparent',
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      transition: 'all 0.2s ease',
                      boxShadow: sel ? `0 0 12px ${LIME}22` : 'none',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: sel ? 800 : 600, color: sel ? LIME : MUTED }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 9, color: sel ? `${LIME}90` : `${MUTED}50`, textAlign: 'center', lineHeight: 1.4 }}>
                      {desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Food diary ── */}
      <div style={{ margin: '12px 16px 0' }}>
        <FoodDiaryCube logs={logs} byMeal={byMeal} onAddFood={handleAddFood} />
      </div>

      {/* ── Supplements ── */}
      <div style={{ margin: '10px 16px 0' }}>
        <SupplementBlock />
      </div>

      {/* ── Strava ── */}
      {user && (
        <div style={{ margin: '10px 16px 0' }}>
          <StravaCard />
        </div>
      )}

      {/* ── Weekly load ── */}
      {(loggedRuns.length > 0 || weeklyLoad.totalStrengthSets > 0) && (
        <div style={{ margin: '12px 16px 0', background: CARD, borderRadius: 18, border: `1px solid ${EDGE}`, padding: '16px 16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: `${MUTED}70`, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 14 }}>
            Weekly Load
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {weeklyLoad.totalRunKm > 0 && (
              <div style={{ flex: 1, background: CARD2, borderRadius: 13, padding: '12px 14px', border: `1px solid ${EDGE}` }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: CARB, letterSpacing: -0.5 }}>
                  {weeklyLoad.totalRunKm.toFixed(1)}
                  <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginLeft: 3 }}>km</span>
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontWeight: 500 }}>Total runs</div>
              </div>
            )}
            {weeklyLoad.totalStrengthSets > 0 && (
              <div style={{ flex: 1, background: CARD2, borderRadius: 13, padding: '12px 14px', border: `1px solid ${EDGE}` }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: PROT, letterSpacing: -0.5 }}>
                  {weeklyLoad.totalStrengthSets}
                  <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginLeft: 3 }}>sessions</span>
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontWeight: 500 }}>Strength</div>
              </div>
            )}
            <div style={{ flex: 1, background: CARD2, borderRadius: 13, padding: '12px 14px', border: `1px solid ${EDGE}` }}>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5,
                color: weeklyLoad.recoveryScore >= 60 ? LIME : weeklyLoad.recoveryScore >= 35 ? CARB : RED }}>
                {weeklyLoad.recoveryScore}
                <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginLeft: 3 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontWeight: 500 }}>Recovery</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
