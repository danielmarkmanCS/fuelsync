import { useState, useEffect, useRef } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useAppStore } from '../store/appStore';
import { getLogs } from '../api/localFood';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType } from '@shared/types';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { calcStreak } from '../lib/streak';
import { getXP, getLevelInfo } from '../lib/xp';
import { getWaterTotal, getWaterGoal, addWater } from '../lib/waterLog';
import { T, CARD } from '../theme';

// ── constants ──────────────────────────────────────────────────────────────

const MEAL_SECTIONS: { key: string; label: string; emoji: string }[] = [
  { key: 'breakfast',    label: 'Breakfast',   emoji: '🌅' },
  { key: 'lunch',        label: 'Lunch',        emoji: '☀️'  },
  { key: 'dinner',       label: 'Dinner',       emoji: '🌙' },
  { key: 'snack',        label: 'Snacks',       emoji: '🍎' },
  { key: 'pre_workout',  label: 'Pre-Workout',  emoji: '⚡' },
  { key: 'post_workout', label: 'Post-Workout', emoji: '💪' },
  { key: 'other',        label: 'Other',        emoji: '🍽️' },
];

const TRAINING_TYPES: { type: TrainingType; label: string }[] = [
  { type: 'rest',     label: 'Rest'     },
  { type: 'strength', label: 'Strength' },
  { type: 'cardio',   label: 'Cardio'   },
  { type: 'hybrid',   label: 'Hybrid'   },
  { type: 'hiit',     label: 'HIIT'     },
  { type: 'cycling',  label: 'Cycling'  },
  { type: 'yoga',     label: 'Yoga'     },
  { type: 'walk',     label: 'Walk'     },
];

const TRAINING_COLORS: Record<string, string> = {
  rest:     T.muted,
  strength: T.prot,
  cardio:   T.carb,
  hybrid:   T.accent,
  hiit:     T.red,
  cycling:  T.fat,
  yoga:     '#AB47BC',
  walk:     T.carb,
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
      setVal(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [to, ms]);
  return val;
}

// ── calorie ring ───────────────────────────────────────────────────────────

function CalorieRing({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const calEaten  = Math.round(consumed.calories);
  const calGoal   = targets?.calories ?? 0;
  const remaining = calGoal > 0 ? calGoal - calEaten : 0;
  const isOver    = calGoal > 0 && calEaten > calGoal;
  const pct       = calGoal > 0 ? Math.min(calEaten / calGoal, 1) : 0;

  const ringColor = isOver ? T.red : T.accent;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);

  const animRemaining = useCountUp(mounted ? Math.abs(remaining) : 0);
  const animEaten     = useCountUp(mounted ? calEaten : 0);

  const R  = 72;
  const SW = 9;
  const C  = 2 * Math.PI * R;
  const sz = (R + SW) * 2;
  const cx = sz / 2;

  return (
    <div style={{ ...CARD, padding: '20px 20px 16px', marginBottom: 12 }}>
      {/* Ring + center */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
            <circle cx={cx} cy={cx} r={R} fill="none" stroke={T.edge2} strokeWidth={SW} />
            <circle
              cx={cx} cy={cx} r={R}
              fill="none" stroke={ringColor} strokeWidth={SW} strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
              style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.3s' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: isOver ? T.red : T.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {animRemaining.toLocaleString()}
            </div>
            <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, marginTop: 3 }}>
              {isOver ? 'over' : 'left'}
            </div>
          </div>
        </div>

        {/* Right side stats */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <StatRow label="Goal"     value={calGoal > 0 ? calGoal.toLocaleString() : '—'} color={T.muted} />
          <StatRow label="Food"     value={animEaten.toLocaleString()} color={T.text} />
          <div style={{ height: 1, background: T.edge }} />
          <StatRow
            label={isOver ? 'Over' : 'Remaining'}
            value={Math.abs(remaining).toLocaleString()}
            color={isOver ? T.red : T.green}
            bold
          />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, color, bold }: { label: string; value: string; color: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ fontSize: 12, color: T.muted, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: bold ? 700 : 600, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

// ── macro bars ─────────────────────────────────────────────────────────────

function MacroCard({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const rows = [
    { label: 'Protein', eaten: Math.round(consumed.proteinG), goal: Math.round(targets?.proteinG ?? 0), color: T.prot },
    { label: 'Carbs',   eaten: Math.round(consumed.carbsG),   goal: Math.round(targets?.carbsG   ?? 0), color: T.carb },
    { label: 'Fat',     eaten: Math.round(consumed.fatG),     goal: Math.round(targets?.fatG     ?? 0), color: T.fat  },
  ];

  return (
    <div style={{ ...CARD, padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(({ label, eaten, goal, color }) => {
          const pct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{label}</div>
                <div style={{ fontSize: 12, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                  {eaten}g{goal > 0 ? ` / ${goal}g` : ''}
                </div>
              </div>
              <div style={{ height: 5, background: T.surf2, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99, background: color,
                  width: `${pct * 100}%`,
                  transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── meal section ───────────────────────────────────────────────────────────

function MealSection({
  emoji, label, logs, onAdd,
}: { emoji: string; label: string; logs: FoodLog[]; onAdd: () => void }) {
  const sectionCals = Math.round(logs.reduce((s, l) => s + +l.calories, 0));
  const [open, setOpen] = useState(logs.length > 0);

  useEffect(() => { if (logs.length > 0) setOpen(true); }, [logs.length]);

  return (
    <div style={{ borderBottom: `1px solid ${T.edge}` }}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 10,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 16 }}>{emoji}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: T.text }}>{label}</span>
        {sectionCals > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
            {sectionCals} cal
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Items + add button */}
      {open && (
        <div style={{ paddingBottom: 4 }}>
          {logs.map((log) => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 8px 42px', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.food_name}
                </div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
                  {Math.round(+log.protein)}g P · {Math.round(+log.carbs)}g C · {Math.round(+log.fat)}g F
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {Math.round(+log.calories)} cal
              </div>
            </div>
          ))}
          <button onClick={onAdd} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            margin: '4px 16px 8px 42px', padding: '6px 12px',
            background: T.accentMuted, border: `1px solid rgba(0,145,234,0.18)`,
            borderRadius: 8, cursor: 'pointer',
            fontSize: 12, fontWeight: 700, color: T.accent,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Food
          </button>
        </div>
      )}
    </div>
  );
}

// ── main screen ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user }                         = useAuthStore();
  const { setActiveTab }                 = useAppStore();
  const { todayLog, logWorkoutComplete } = useNutritionStore();
  const { logDay }                       = useNutrition();

  const todayStr = new Date().toISOString().split('T')[0];
  const [foodLogs, setFoodLogs] = useState<FoodLog[]>([]);
  const [consumed, setConsumed] = useState<MacroTargets>(emptyMacros());

  useEffect(() => {
    const load = () => {
      if (!document.hidden) {
        getLogs(todayStr).then(ls => {
          const active = ls.filter(l => !l.removed);
          setFoodLogs(active);
          setConsumed(sumLogs(active));
        });
      }
    };
    load();
    document.addEventListener('visibilitychange', load);
    return () => document.removeEventListener('visibilitychange', load);
  }, [todayStr]);

  const targets    = useEffectiveTargets();
  const activeType = todayLog?.trainingType;

  const [streak, setStreak] = useState(0);
  const [xpInfo, setXpInfo] = useState(() => getLevelInfo(getXP()));
  const [water,  setWater]  = useState(0);
  const waterGoal = getWaterGoal();

  useEffect(() => {
    calcStreak().then(s => setStreak(s.current));
    setXpInfo(getLevelInfo(getXP()));
    getWaterTotal(todayStr).then(setWater);
  }, [todayStr]);

  async function quickAddWater(ml: number) {
    await addWater(todayStr, ml);
    getWaterTotal(todayStr).then(setWater);
  }

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
  const displayName = user?.displayName ?? '';
  const dateStr     = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Group logs by meal type
  const logsByMeal = MEAL_SECTIONS.reduce<Record<string, FoodLog[]>>((acc, s) => {
    acc[s.key] = foodLogs.filter(l => (l.meal_type ?? 'other') === s.key);
    return acc;
  }, {});

  // Only show meal sections that have items OR are the 4 main ones
  const MAIN_MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
  const visibleSections = MEAL_SECTIONS.filter(s => MAIN_MEALS.has(s.key) || logsByMeal[s.key]?.length > 0);

  return (
    <div style={{ background: T.bg, minHeight: '100%', paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ background: T.surf, borderBottom: `1px solid ${T.edge}`, padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: T.muted, fontWeight: 500, marginBottom: 2 }}>
              {greeting}{displayName ? `, ${displayName}` : ''}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: -0.3 }}>
              {dateStr}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {streak > 0 && (
              <button onClick={() => setActiveTab('ascend')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 99, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', cursor: 'pointer' }}>
                <span style={{ fontSize: 12 }}>🔥</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#E65100' }}>{streak}d</span>
              </button>
            )}
            <button onClick={() => setActiveTab('profile')} className="press" style={{
              width: 36, height: 36, borderRadius: '50%',
              background: T.surf2, border: `1px solid ${T.edge}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Training chips */}
        <div style={{ overflowX: 'auto', display: 'flex', gap: 6, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {TRAINING_TYPES.map(({ type, label }) => {
            const active = activeType === type;
            const color  = TRAINING_COLORS[type] ?? T.accent;
            return (
              <button key={type} onClick={() => { if (!active) handleSelectType(type); }} className="press" style={{
                flexShrink: 0, padding: '5px 12px', borderRadius: 99,
                background: active ? color : T.surf2,
                border: `1px solid ${active ? color : T.edge}`,
                color: active ? '#fff' : T.muted,
                fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 12px 0' }}>

        {/* Calorie ring */}
        <CalorieRing consumed={consumed} targets={targets} />

        {/* Macro bars */}
        <MacroCard consumed={consumed} targets={targets} />

        {/* XP / level chip */}
        <button onClick={() => setActiveTab('ascend')} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '10px 14px',
          ...CARD, marginBottom: 12, cursor: 'pointer', textAlign: 'left',
          background: T.surf,
        }}>
          <span style={{ fontSize: 18 }}>{xpInfo.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Level {xpInfo.level} — {xpInfo.name}</div>
            <div style={{ marginTop: 4, height: 4, background: T.surf2, borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: T.accent, borderRadius: 99, width: `${xpInfo.progressPct}%`, transition: 'width 0.6s ease' }} />
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>

        {/* Water strip */}
        <div style={{ ...CARD, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.prot} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{(water / 1000).toFixed(1)}L</span>
          <span style={{ fontSize: 12, color: T.muted }}>of {(waterGoal / 1000).toFixed(1)}L</span>
          <div style={{ flex: 1, height: 4, background: T.surf2, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: T.prot, borderRadius: 99, width: `${waterGoal > 0 ? Math.min((water / waterGoal) * 100, 100) : 0}%`, transition: 'width 0.5s ease' }} />
          </div>
          {[250, 500].map(ml => (
            <button key={ml} onClick={() => quickAddWater(ml)} className="press" style={{
              padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: 'rgba(30,136,229,0.08)', border: `1px solid rgba(30,136,229,0.20)`, color: T.prot,
            }}>+{ml}ml</button>
          ))}
        </div>
      </div>

      {/* Meal sections */}
      <div style={{ ...CARD, margin: '0 12px', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Food Diary</div>
          <div style={{ fontSize: 12, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(consumed.calories)} cal logged
          </div>
        </div>
        {visibleSections.map((section) => (
          <MealSection
            key={section.key}
            emoji={section.emoji}
            label={section.label}
            logs={logsByMeal[section.key] ?? []}
            onAdd={() => setActiveTab('food')}
          />
        ))}
        {/* Totals row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: T.surf2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Total</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(consumed.calories)} cal · {Math.round(consumed.proteinG)}g P · {Math.round(consumed.carbsG)}g C · {Math.round(consumed.fatG)}g F
          </div>
        </div>
      </div>

    </div>
  );
}
