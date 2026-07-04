import { useState, useEffect, useRef } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useAppStore } from '../store/appStore';
import { getLogs } from '../api/localFood';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType } from '@shared/types';
import { useEffectiveTargets } from '../hooks/useEffectiveTargets';
import { useThemeStore } from '../store/themeStore';

const PROT = '#38BDF8';
const CARB = '#4ADE80';
const FAT  = '#FBBF24';
const RED  = '#F87171';

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

const EXERCISE_KEY = 'fs_exercise_kcal_v1';
function loadExerciseKcal(date: string): number {
  try { return parseInt(JSON.parse(localStorage.getItem(EXERCISE_KEY) ?? '{}')[date] ?? '0', 10) || 0; }
  catch { return 0; }
}
function saveExerciseKcal(date: string, kcal: number): void {
  try {
    const map = JSON.parse(localStorage.getItem(EXERCISE_KEY) ?? '{}');
    map[date] = kcal;
    const keys = Object.keys(map).sort().slice(-30);
    const trimmed: Record<string, number> = {};
    keys.forEach(k => { trimmed[k] = map[k]; });
    localStorage.setItem(EXERCISE_KEY, JSON.stringify(trimmed));
  } catch {}
}

// ── Calorie ring + stats — Apple Fitness style ────────────────────────
function CalDashboard({
  consumed, targets, date, externalExercise,
}: {
  consumed: MacroTargets; targets: MacroTargets | null; date: string; externalExercise?: number;
}) {
  const goal      = targets?.calories ?? 0;
  const food      = Math.round(consumed.calories);
  const [exercise, setExercise] = useState(() => loadExerciseKcal(date));
  const [editingEx, setEditingEx] = useState(false);
  const [exInput,   setExInput]   = useState('');

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
  const displayRem = useCountUp(mounted ? (remaining !== null ? Math.abs(remaining) : 0) : 0);

  const R    = 70;
  const C    = 2 * Math.PI * R;
  const fill = goal > 0 ? Math.min(food / goal, 1) : 0;

  return (
    <div>
      {/* Big ring */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
        <div style={{ position: 'relative' }}>
          <svg width="160" height="160" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--edge)" strokeWidth="12" />
            <circle
              cx="80" cy="80" r={R}
              fill="none" stroke={ringColor} strokeWidth="12"
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
            <div style={{ fontSize: 36, fontWeight: 700, color: ringColor, letterSpacing: -1.5, lineHeight: 1 }}>
              {remaining !== null ? displayRem.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 5, fontWeight: 500 }}>
              {over ? 'kcal over' : 'kcal left'}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row: Eaten | Goal | Burned */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
        alignItems: 'center', marginBottom: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {food.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>Eaten</div>
        </div>

        <div style={{ height: 28, background: 'var(--edge)' }} />

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
            {goal > 0 ? goal.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>Goal</div>
        </div>

        <div style={{ height: 28, background: 'var(--edge)' }} />

        <div style={{ textAlign: 'center' }}>
          {editingEx ? (
            <input
              autoFocus
              type="number" min={0} max={5000}
              value={exInput}
              onChange={e => setExInput(e.target.value)}
              onBlur={() => {
                const v = Math.max(0, Math.min(5000, parseInt(exInput, 10) || 0));
                setExercise(v); saveExerciseKcal(date, v); setEditingEx(false);
              }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
              style={{
                width: 64, background: 'transparent', border: 'none',
                borderBottom: '1.5px solid var(--accent)', outline: 'none',
                color: 'var(--accent)', fontSize: 22, fontWeight: 700,
                textAlign: 'center', padding: '2px 0',
              }}
            />
          ) : (
            <div
              onClick={() => { setExInput(exercise > 0 ? String(exercise) : ''); setEditingEx(true); }}
              style={{
                fontSize: 22, fontWeight: 700, letterSpacing: -0.5, cursor: 'pointer', lineHeight: 1,
                color: exercise > 0 ? CARB : 'var(--muted)',
              }}
              title="Tap to log exercise calories"
            >
              {exercise > 0 ? exercise.toLocaleString() : '+'}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>Burned</div>
        </div>
      </div>

      {/* Thin progress bar */}
      <div style={{ height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: over ? RED : 'var(--accent)',
          width: `${pct}%`,
          transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

// ── Macros — single surface, 3 columns with hairline dividers ─────────
function MacroRow({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const macros = [
    { label: 'Carbs',   val: consumed.carbsG,   target: targets?.carbsG   ?? 0, color: CARB },
    { label: 'Fat',     val: consumed.fatG,      target: targets?.fatG     ?? 0, color: FAT  },
    { label: 'Protein', val: consumed.proteinG,  target: targets?.proteinG ?? 0, color: PROT },
  ];

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 16,
      display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
      overflow: 'hidden',
    }}>
      {macros.flatMap(({ label, val, target, color }, i) => {
        const pct  = target > 0 ? Math.min((val / target) * 100, 100) : 0;
        const over = val > target && target > 0;
        const c    = over ? RED : color;
        const cell = (
          <div key={label} style={{ padding: '14px 12px 12px' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginBottom: 5 }}>
              {label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: over ? RED : 'var(--text)', letterSpacing: -0.5, lineHeight: 1 }}>
              {Math.round(val)}<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginLeft: 1 }}>g</span>
            </div>
            {target > 0 && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, fontWeight: 400 }}>
                of {Math.round(target)}g
              </div>
            )}
            <div style={{ height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden', marginTop: 8 }}>
              <div style={{
                height: '100%', borderRadius: 2, background: c,
                width: `${pct}%`,
                transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
          </div>
        );
        return i > 0 ? [<div key={`d${i}`} style={{ background: 'var(--edge)' }} />, cell] : [cell];
      })}
    </div>
  );
}

// ── Training type definitions ──────────────────────────────────────────
const TRAINING_TYPES: {
  type: TrainingType; label: string; color: string; isAccent?: boolean;
}[] = [
  { type: 'rest',     label: 'Rest',     color: '#8B949E' },
  { type: 'strength', label: 'Strength', color: PROT },
  { type: 'cardio',   label: 'Cardio',   color: CARB },
  { type: 'hybrid',   label: 'Hybrid',   color: '#8B949E', isAccent: true },
  { type: 'hiit',     label: 'HIIT',     color: '#EF4444' },
  { type: 'cycling',  label: 'Cycling',  color: '#F97316' },
  { type: 'yoga',     label: 'Yoga',     color: '#A78BFA' },
  { type: 'walk',     label: 'Walk',     color: '#34D399' },
];

export default function HomeScreen() {
  const { user }                         = useAuthStore();
  const { setActiveTab }                 = useAppStore();
  const { todayLog, logWorkoutComplete } = useNutritionStore();
  const { logDay, setActivityModifier }  = useNutrition();

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

  void foodLogs;

  const targets          = useEffectiveTargets();
  const activityModifier = todayLog?.dailyActivityModifier ?? null;
  const goalMode         = useThemeStore((s) => s.goalMode);

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

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 40 }}>

      {/* Header — no card, no border */}
      <div style={{
        padding: '24px 20px 12px',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
            {displayName ? `${greeting},` : greeting}
          </div>
          {displayName && (
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.8, lineHeight: 1.1, marginTop: 2 }}>
              {displayName}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
          {goalMode !== 'maintain' && (
            <button
              onClick={() => setActiveTab('profile')}
              style={{
                padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
                background: goalMode === 'lose' ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)',
                border: 'none',
                fontSize: 13, fontWeight: 600,
                color: goalMode === 'lose' ? '#FF453A' : '#30D158',
              }}
            >
              {goalMode === 'lose' ? 'Cut' : 'Bulk'}
            </button>
          )}
          <button
            onClick={() => setActiveTab('profile')}
            className="nrc-press"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--surf2)', border: 'none',
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
      </div>

      {/* Calorie ring */}
      <div style={{ padding: '8px 20px 20px' }}>
        <CalDashboard consumed={consumed} targets={targets} date={todayStr} />
      </div>

      {/* Macros */}
      <div style={{ padding: '0 16px' }}>
        <MacroRow consumed={consumed} targets={targets} />
      </div>

      {/* Training */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
          Today's training
        </div>
        <div style={{ background: 'var(--surf)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--edge)' }}>
            {TRAINING_TYPES.map(({ type, label, color, isAccent }) => {
              const active       = todayLog?.trainingType === type;
              const displayColor = isAccent ? 'var(--accent)' : color;
              return (
                <button
                  key={type}
                  onClick={() => { if (!active) handleSelectType(type); }}
                  className="nrc-press"
                  style={{
                    padding: '14px 4px',
                    background: active ? (isAccent ? 'var(--accent-muted)' : `${color}18`) : 'var(--surf)',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    color: active ? displayColor : 'var(--muted)',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <TrainingIcon type={type} size={18} />
                  <div style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{label}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Daily activity level */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
          Daily activity
        </div>
        <div style={{ background: 'var(--surf)', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--edge)' }}>
            {([
              { val: 'low',    label: 'Low',    desc: 'Desk job'     },
              { val: 'normal', label: 'Normal', desc: 'Some walking' },
              { val: 'high',   label: 'High',   desc: 'On feet'      },
            ] as const).map(({ val, label, desc }) => {
              const sel = (activityModifier ?? 'normal') === val || (!activityModifier && val === 'normal');
              return (
                <button
                  key={val}
                  onClick={() => setActivityModifier(val === 'normal' ? undefined : val)}
                  className="nrc-press"
                  style={{
                    padding: '14px 4px',
                    background: sel ? 'var(--accent-muted)' : 'var(--surf)',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    transition: 'background 0.2s ease',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: sel ? 'var(--accent)' : 'var(--text)' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
