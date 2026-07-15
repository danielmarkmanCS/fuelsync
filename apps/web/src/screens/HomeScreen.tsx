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
import { grantDailyXP } from '../lib/xp';
import { getWaterTotal, getWaterGoal, addWater, removeLastWater, parseWaterDescription, parseWaterAI } from '../lib/waterLog';
import { useThemeStore } from '../store/themeStore';

// ── constants ──────────────────────────────────────────────────────────────

const ACCENT = 'var(--c-today)';

const MEAL_SECTIONS: { key: string; label: string; emoji: string; color: string }[] = [
  { key: 'breakfast',    label: 'Breakfast',    emoji: '🌅', color: '#F97316' },
  { key: 'lunch',        label: 'Lunch',        emoji: '☀️', color: '#22C55E' },
  { key: 'dinner',       label: 'Dinner',       emoji: '🌙', color: '#8B5CF6' },
  { key: 'snack',        label: 'Snacks',       emoji: '🍎', color: '#6366F1' },
  { key: 'pre_workout',  label: 'Pre-Workout',  emoji: '⚡', color: '#F59E0B' },
  { key: 'post_workout', label: 'Post-Workout', emoji: '💪', color: '#10B981' },
  { key: 'other',        label: 'Other',        emoji: '🍽️', color: '#6B7280' },
];

const TRAINING_TYPES: { type: TrainingType; label: string; emoji: string; color: string }[] = [
  { type: 'rest',     label: 'Rest',     emoji: '😴', color: '#6B7280' },
  { type: 'strength', label: 'Strength', emoji: '🏋️', color: '#3B82F6' },
  { type: 'cardio',   label: 'Cardio',   emoji: '🏃', color: '#22C55E' },
  { type: 'hybrid',   label: 'Hybrid',   emoji: '⚡', color: '#6366F1' },
  { type: 'hiit',     label: 'HIIT',     emoji: '🔥', color: '#EF4444' },
  { type: 'cycling',  label: 'Cycling',  emoji: '🚴', color: '#F97316' },
  { type: 'yoga',     label: 'Yoga',     emoji: '🧘', color: '#A855F7' },
  { type: 'walk',     label: 'Walk',     emoji: '🚶', color: '#10B981' },
];

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

function sumLogs(logs: FoodLog[]): MacroTargets {
  return logs.reduce<MacroTargets>((a, l) => ({
    calories: a.calories + +l.calories,
    proteinG: a.proteinG + +l.protein,
    carbsG:   a.carbsG   + +l.carbs,
    fatG:     a.fatG     + +l.fat,
  }), emptyMacros());
}

function useCountUp(to: number, ms = 600): number {
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

// ── Hero Nutrition Card ────────────────────────────────────────────────────

function NutritionHero({ consumed, targets, activeType, trainingCalDelta }: {
  consumed: MacroTargets; targets: MacroTargets | null;
  activeType?: string; trainingCalDelta?: number;
}) {
  const calEaten  = Math.round(consumed.calories);
  const calGoal   = targets?.calories ?? 0;
  const remaining = calGoal > 0 ? calGoal - calEaten : 0;
  const isOver    = calGoal > 0 && calEaten > calGoal;
  const pct       = calGoal > 0 ? Math.min(calEaten / calGoal, 1) : 0;
  const nearGoal  = pct >= 0.85 && !isOver;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);

  const animRemaining = useCountUp(mounted ? Math.abs(remaining) : 0);
  const animEaten     = useCountUp(mounted ? calEaten : 0);

  const macros = [
    { label: 'Protein', eaten: Math.round(consumed.proteinG), goal: Math.round(targets?.proteinG ?? 0) },
    { label: 'Carbs',   eaten: Math.round(consumed.carbsG),   goal: Math.round(targets?.carbsG   ?? 0) },
    { label: 'Fat',     eaten: Math.round(consumed.fatG),     goal: Math.round(targets?.fatG     ?? 0) },
  ];

  return (
    <div>
      {/* Training badge */}
      {activeType && activeType !== 'rest' && (() => {
        const t = TRAINING_TYPES.find(x => x.type === activeType);
        return (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14,
            background: 'rgba(255,255,255,0.18)', borderRadius: 99, padding: '4px 12px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
              {t?.emoji} {t?.label} day
              {trainingCalDelta !== undefined && trainingCalDelta !== 0 &&
                <span style={{ color: 'rgba(255,255,255,0.8)' }}> · {trainingCalDelta > 0 ? '+' : ''}{trainingCalDelta} kcal</span>}
            </span>
          </div>
        );
      })()}

      {/* Big number */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
          {calGoal === 0 ? 'eaten today' : isOver ? 'over by' : nearGoal ? 'almost there ✦' : 'remaining'}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, letterSpacing: -3,
            color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {calGoal === 0 ? animEaten.toLocaleString() : animRemaining.toLocaleString()}
          </span>
          <span style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.65)', paddingBottom: 8 }}>kcal</span>
        </div>
      </div>

      {/* Progress bar */}
      {calGoal > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, background: '#fff',
              width: `${(mounted ? pct : 0) * 100}%`, transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
              {animEaten.toLocaleString()} eaten
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
              {calGoal.toLocaleString()} goal
            </span>
          </div>
        </div>
      )}

      {/* Macro pills */}
      <div style={{ display: 'flex', gap: 8 }}>
        {macros.map(({ label, eaten, goal }) => {
          const mpct = goal > 0 ? Math.min(eaten / goal, 1) : 0;
          return (
            <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {eaten}<span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 1 }}>g</span>
              </div>
              {goal > 0 && (
                <div style={{ height: 3, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden', marginTop: 6 }}>
                  <div style={{ height: '100%', width: `${mpct * 100}%`, background: '#fff', borderRadius: 99 }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Water strip ────────────────────────────────────────────────────────────

function WaterStrip({
  water, waterGoal, onAdd, onUndo,
}: {
  water: number; waterGoal: number;
  onAdd: (ml: number, label?: string) => void; onUndo: () => void;
}) {
  const pct        = waterGoal > 0 ? Math.min((water / waterGoal) * 100, 100) : 0;
  const liters     = (water / 1000).toFixed(1);
  const goalL      = (waterGoal / 1000).toFixed(1);
  const WATER_COLOR = 'var(--c-body)';
  const done       = pct >= 100;

  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const [parsed,  setParsed]  = useState<{ ml: number; label: string } | null>(null);
  const [error,   setError]   = useState('');

  async function analyze() {
    const raw = input.trim();
    if (!raw) return;
    const isNum = /^\d+$/.test(raw);
    if (isNum) {
      const ml = Math.max(1, Math.min(5000, parseInt(raw, 10)));
      onAdd(ml, `${ml}ml`);
      setInput(''); return;
    }
    const quick = parseWaterDescription(raw);
    if (quick) { setParsed(quick); return; }
    setLoading(true); setError('');
    try {
      const r = await parseWaterAI(raw);
      setParsed(r);
    } catch { setError('Could not parse — try again'); }
    finally { setLoading(false); }
  }

  function confirm() {
    if (!parsed) return;
    onAdd(parsed.ml, parsed.label);
    setInput(''); setParsed(null);
  }

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 18,
      border: `1px solid var(--edge)`,
      borderTop: done ? '3px solid #0EA5E9' : '1px solid var(--edge)',
      padding: '14px 16px', marginBottom: 12,
      boxShadow: 'var(--shadow-sm)',
      transition: 'border-top 0.3s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: done ? 'rgba(14,165,233,0.15)' : 'rgba(14,165,233,0.08)',
          border: '1px solid rgba(14,165,233,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, flexShrink: 0,
          transition: 'all 0.3s',
        }}>
          {done ? '✓' : '💧'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
            <span style={{
              fontSize: 20, fontWeight: 900, color: WATER_COLOR,
              fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5,
            }}>{liters}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>/ {goalL}L</span>
            {done && <span style={{ fontSize: 10, fontWeight: 800, color: '#0EA5E9', marginLeft: 4 }}>Goal hit!</span>}
          </div>
          <div style={{ height: 4, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden', marginTop: 4 }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: '#0EA5E9',
              width: `${pct}%`, transition: 'width 0.5s var(--ease)',
            }} />
          </div>
        </div>
        {water > 0 && (
          <button onClick={onUndo} className="press" style={{
            padding: '5px 9px', borderRadius: 8, fontSize: 11, fontWeight: 700,
            background: 'var(--surf2)', border: '1px solid var(--edge)', color: 'var(--muted)', cursor: 'pointer',
          }}>↩</button>
        )}
      </div>

      {/* Quick add */}
      <div style={{ display: 'flex', gap: 6, marginBottom: parsed || error ? 8 : 0 }}>
        {[250, 500, 750].map(ml => (
          <button key={ml} onClick={() => onAdd(ml, `${ml}ml`)} className="press" style={{
            padding: '6px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(14,165,233,0.09)', border: '1px solid rgba(14,165,233,0.22)', color: WATER_COLOR,
          }}>+{ml}ml</button>
        ))}
        <input
          type="text"
          value={input}
          onChange={e => { setInput(e.target.value); setParsed(null); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') parsed ? confirm() : analyze(); }}
          placeholder="describe what you drank…"
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 99,
            border: `1px solid ${input ? 'rgba(14,165,233,0.4)' : 'var(--edge)'}`,
            background: 'var(--surf2)', color: 'var(--text)',
            fontSize: 11, fontFamily: 'inherit', outline: 'none', minWidth: 0,
            transition: 'border-color 0.2s',
          }}
        />
        <button
          onClick={parsed ? confirm : analyze}
          disabled={loading || !input.trim()}
          className="press"
          style={{
            padding: '6px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
            background: !input.trim() ? 'var(--surf2)' : parsed ? '#0EA5E9' : WATER_COLOR,
            border: 'none', color: !input.trim() ? 'var(--muted)' : '#fff',
            cursor: !input.trim() || loading ? 'default' : 'pointer', transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >
          {loading ? '…' : parsed ? '+ Log' : 'AI'}
        </button>
      </div>

      {/* AI result preview */}
      {parsed && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', borderRadius: 10,
          background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.22)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0EA5E9' }}>{parsed.ml}ml</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{parsed.label}</div>
          </div>
          <button onClick={() => { setParsed(null); setInput(''); }} style={{
            background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, padding: '2px 4px',
          }}>×</button>
        </div>
      )}
      {error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

// ── Training chips ─────────────────────────────────────────────────────────

function TrainingChips({
  activeType, onSelect,
}: {
  activeType?: string; onSelect: (t: TrainingType) => void;
}) {
  const activeCfg = activeType ? TRAINING_TYPES.find(t => t.type === activeType) : undefined;
  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 18, border: '1px solid var(--edge)',
      padding: '12px 14px', marginBottom: 12,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'var(--muted)',
        }}>Today's training</div>
        {activeCfg && (
          <div style={{
            fontSize: 10, fontWeight: 700, color: activeCfg.color,
            display: 'flex', alignItems: 'center', gap: 4,
            background: `${activeCfg.color}12`, border: `1px solid ${activeCfg.color}28`,
            padding: '2px 8px', borderRadius: 99,
          }}>
            <span>{activeCfg.emoji}</span>
            <span>{activeCfg.label}</span>
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto', display: 'flex', gap: 6, scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
        {TRAINING_TYPES.map(({ type, label, emoji, color }) => {
          const active = activeType === type;
          return (
            <button key={type} onClick={() => { if (!active) onSelect(type); }} className="press" style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 99,
              background: active ? color : 'var(--surf2)',
              border: `1.5px solid ${active ? color : 'var(--edge)'}`,
              color: active ? '#fff' : 'var(--muted)',
              fontSize: 11, fontWeight: active ? 700 : 500, cursor: 'pointer',
              transition: 'all 0.18s ease',
              boxShadow: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ fontSize: 12 }}>{emoji}</span>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Week training log ──────────────────────────────────────────────────────

function WeekTrainingLog({ todayStr }: { todayStr: string }) {
  const days: { date: string; label: string; isToday: boolean }[] = [];
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + mondayOffset + i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({
      date: dateStr,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      isToday: dateStr === todayStr,
    });
  }

  const hist: Record<string, string> = (() => {
    try { return JSON.parse(localStorage.getItem('fs_training_type_history_v1') ?? '{}'); }
    catch { return {}; }
  })();

  const hasAny = days.some(d => hist[d.date]);
  if (!hasAny) return null;

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 18, border: '1px solid var(--edge)',
      padding: '12px 14px', marginBottom: 12, boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>
        This Week
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {days.map(({ date, label, isToday }) => {
          const type = hist[date] as TrainingType | undefined;
          const cfg = type ? TRAINING_TYPES.find(t => t.type === type) : undefined;
          const isFuture = date > todayStr;
          return (
            <div key={date} style={{
              flex: 1, textAlign: 'center',
              padding: '8px 4px',
              borderRadius: 12,
              background: isToday ? `${cfg?.color ?? 'var(--c-today)'}12` : 'transparent',
              border: `1px solid ${isToday ? (cfg?.color ?? 'var(--c-today)') + '30' : 'transparent'}`,
              opacity: isFuture && !type ? 0.35 : 1,
            }}>
              <div style={{ fontSize: 16, marginBottom: 3, lineHeight: 1 }}>
                {type ? cfg?.emoji : (isFuture ? '·' : '○')}
              </div>
              <div style={{
                fontSize: 8, fontWeight: isToday ? 800 : 600,
                color: isToday ? (cfg?.color ?? 'var(--c-today)') : 'var(--muted)',
                letterSpacing: '0.05em',
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Meal section ───────────────────────────────────────────────────────────

function MealSection({
  emoji, label, color, logs, onAdd,
}: { emoji: string; label: string; color: string; logs: FoodLog[]; onAdd: () => void }) {
  const sectionCals = Math.round(logs.reduce((s, l) => s + +l.calories, 0));
  const [open, setOpen] = useState(logs.length > 0);

  useEffect(() => { if (logs.length > 0) setOpen(true); }, [logs.length]);

  return (
    <div style={{ borderBottom: '1px solid var(--edge)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 10,
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: `${color}14`, border: `1px solid ${color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0,
        }}>{emoji}</div>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
        {sectionCals > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
            {sectionCals} kcal
          </span>
        )}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted2)" strokeWidth="2" strokeLinecap="round"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{ paddingBottom: 6 }}>
          {logs.map(log => (
            <div key={log.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 16px 7px 56px', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {log.food_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  {Math.round(+log.protein)}g P · {Math.round(+log.carbs)}g C · {Math.round(+log.fat)}g F
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {Math.round(+log.calories)}
              </div>
            </div>
          ))}
          <button onClick={onAdd} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            margin: '4px 16px 6px 56px', padding: '5px 10px',
            background: `${color}10`, border: `1px solid ${color}28`,
            borderRadius: 99, cursor: 'pointer',
            fontSize: 11, fontWeight: 700, color,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add food
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user }                         = useAuthStore();
  const { setActiveTab }                 = useAppStore();
  const { isDark, toggleTheme }          = useThemeStore();
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

  const targets         = useEffectiveTargets();
  const activeType      = todayLog?.trainingType;
  const { getMacroBreakdown } = useNutrition();
  const trainingCalDelta = (() => {
    const breakdown = getMacroBreakdown();
    if (!breakdown || !activeType || activeType === 'rest') return 0;
    const restCal = Math.round(breakdown.tdee * 0.85);
    return breakdown.targets.calories - restCal;
  })();

  const [streak, setStreak]    = useState(0);
  const [water,  setWater]     = useState(0);
  const waterGoal = getWaterGoal();

  useEffect(() => {
    calcStreak().then(s => setStreak(s.current));
    const loadWater = () => getWaterTotal(todayStr).then(setWater);
    loadWater();
    window.addEventListener('fs_water_updated', loadWater);
    return () => window.removeEventListener('fs_water_updated', loadWater);
  }, [todayStr]);

  async function quickAddWater(ml: number, label?: string) {
    await addWater(todayStr, ml, label);
    const t = await getWaterTotal(todayStr);
    setWater(t);
    window.dispatchEvent(new CustomEvent('fs_water_updated'));
    if (t >= waterGoal) grantDailyXP('HIT_WATER');
  }
  async function undoWater() {
    await removeLastWater(todayStr);
    const t = await getWaterTotal(todayStr);
    setWater(t);
    window.dispatchEvent(new CustomEvent('fs_water_updated'));
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

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const name     = user?.displayName;
  const dateStr  = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const MAIN_MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
  const logsByMeal = MEAL_SECTIONS.reduce<Record<string, FoodLog[]>>((acc, s) => {
    acc[s.key] = foodLogs.filter(l => (l.meal_type ?? 'other') === s.key);
    return acc;
  }, {});
  const visibleSections = MEAL_SECTIONS.filter(s => MAIN_MEALS.has(s.key) || logsByMeal[s.key]?.length > 0);

  const heroGrad = `linear-gradient(145deg, #4338CA 0%, #7C3AED 100%)`;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 100 }}>

      {/* ── Hero banner ── */}
      <div style={{ background: heroGrad, padding: '18px 16px 28px' }}>

        {/* Top row: greeting + actions */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: '0.02em' }}>{dateStr}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 3, letterSpacing: -0.5 }}>
              {greeting}{name ? `, ${name.split(' ')[0]}` : ''} 👋
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
            {streak > 0 && (
              <button onClick={() => setActiveTab('ascend')} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                borderRadius: 99, background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 12 }}>🔥</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{streak}d</span>
              </button>
            )}
            <button onClick={toggleTheme} className="press" title={isDark ? 'Light mode' : 'Dark mode'} style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              {isDark ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                </svg>
              )}
            </button>
            <button onClick={() => setActiveTab('profile')} className="press" style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Calorie hero — white on gradient */}
        <NutritionHero consumed={consumed} targets={targets} activeType={activeType} trainingCalDelta={trainingCalDelta} />
      </div>

      {/* Content */}
      <div style={{ padding: '12px 12px 0' }}>

        {/* Training chips */}
        <TrainingChips activeType={activeType} onSelect={handleSelectType} />
        <WeekTrainingLog todayStr={todayStr} />

        {/* Water */}
        <WaterStrip
          water={water} waterGoal={waterGoal}
          onAdd={quickAddWater} onUndo={undoWater}
        />

        {/* Daily missions snapshot */}
        {targets && targets.calories > 0 && (() => {
          const calPct  = Math.min(consumed.calories / targets.calories, 1);
          const protPct = targets.proteinG ? Math.min(consumed.proteinG / targets.proteinG, 1) : 0;
          const watPct  = waterGoal > 0 ? Math.min(water / waterGoal, 1) : 0;
          const doneCal  = calPct >= 0.85 && consumed.calories <= targets.calories * 1.05;
          const doneProt = protPct >= 1;
          const doneWat  = watPct >= 1;
          const doneCount = [doneCal, doneProt, doneWat].filter(Boolean).length;
          if (doneCount === 0 && consumed.calories === 0) return null;
          return (
            <div style={{
              display: 'flex', gap: 6, marginBottom: 12,
            }}>
              {[
                { label: 'Calories',  pct: calPct,  done: doneCal,  color: 'var(--c-today)', icon: '⚡' },
                { label: 'Protein',   pct: protPct, done: doneProt, color: 'var(--prot)',    icon: '💪' },
                { label: 'Hydration', pct: watPct,  done: doneWat,  color: 'var(--c-body)',  icon: '💧' },
              ].map(m => (
                <div key={m.label} style={{
                  flex: 1, background: 'var(--surf)', borderRadius: 12, border: `1px solid ${m.done ? m.color + '30' : 'var(--edge)'}`,
                  padding: '8px 10px', textAlign: 'center',
                  transition: 'all 0.3s',
                }}>
                  <div style={{ fontSize: 14, marginBottom: 3 }}>
                    {m.done ? '✓' : m.icon}
                  </div>
                  <div style={{ height: 4, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden', marginBottom: 4 }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: m.done ? m.color : `${m.color}80`,
                      width: `${m.pct * 100}%`, transition: 'width 0.6s var(--ease)',
                      boxShadow: 'none',
                    }} />
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: m.done ? m.color : 'var(--muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {m.done ? m.label : `${Math.round(m.pct * 100)}%`}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Food diary */}
      <div style={{ margin: '0 12px' }}>
        <div style={{
          background: 'var(--surf)', borderRadius: 20,
          border: '1px solid var(--edge)',
          boxShadow: 'var(--shadow-md), var(--inner-glow)',
          overflow: 'hidden',
        }}>
          {/* Diary header */}
          <div style={{
            padding: '14px 16px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--edge)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>📔</div>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Food Diary</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(consumed.calories)} kcal
              </span>
              <button onClick={() => setActiveTab('food')} className="press" style={{
                padding: '5px 12px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)',
                color: 'var(--c-today)', cursor: 'pointer',
              }}>+ Add</button>
            </div>
          </div>

          {/* Empty diary motivational state */}
          {consumed.calories === 0 && (
            <div style={{ padding: '24px 16px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>
                {hour < 12 ? '🌅' : hour < 17 ? '☀️' : '🌙'}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
                {hour < 12 ? 'Start your day right' : hour < 17 ? "What have you eaten?" : 'Log before you forget'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 16, maxWidth: 240, margin: '0 auto 16px' }}>
                Unlogged days make it impossible to connect what you eat to how you look and feel.
              </div>
              <button onClick={() => setActiveTab('food')} className="press" style={{
                padding: '11px 28px', borderRadius: 99, border: 'none',
                background: 'var(--c-today)', color: '#fff',
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(99,102,241,0.35)',
              }}>
                + Log a meal
              </button>
            </div>
          )}

          {visibleSections.map(section => (
            <MealSection
              key={section.key}
              emoji={section.emoji}
              label={section.label}
              color={section.color}
              logs={logsByMeal[section.key] ?? []}
              onAdd={() => setActiveTab('food')}
            />
          ))}

          {/* Total row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: 'var(--surf2)',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(consumed.calories)} kcal ·{' '}
              <span style={{ color: 'var(--prot)' }}>{Math.round(consumed.proteinG)}P</span>{' '}
              <span style={{ color: 'var(--carb)' }}>{Math.round(consumed.carbsG)}C</span>{' '}
              <span style={{ color: 'var(--fat)' }}>{Math.round(consumed.fatG)}F</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
