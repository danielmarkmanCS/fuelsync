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

// Per-meal vivid colors
const MEAL_COLORS: Record<string, string> = {
  breakfast:    '#F97316',
  lunch:        '#38BDF8',
  dinner:       '#A78BFA',
  pre_workout:  '#4ADE80',
  post_workout: '#34D399',
  snack:        '#FBBF24',
  other:        '#8B949E',
};

// Per-training vivid colors
const TRAINING_COLORS: Record<string, string> = {
  rest:     '#64748B',
  strength: '#38BDF8',
  cardio:   '#4ADE80',
  hybrid:   '#9D7EFF',
  hiit:     '#F87171',
  cycling:  '#F97316',
  yoga:     '#A78BFA',
  walk:     '#34D399',
};

function MealIcon({ type, color, size = 20 }: { type: string; color: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'breakfast': return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;
    case 'lunch':     return <svg {...p}><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>;
    case 'dinner':    return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
    case 'pre_workout':
    case 'post_workout': return <svg {...p}><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'snack':     return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/></svg>;
    default:          return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>;
  }
}

function TrainingIcon({ type, size = 20 }: { type: TrainingType; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'rest':     return <svg {...p}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
    case 'strength': return <svg {...p}><path d="M6.5 6.5h11M6.5 17.5h11M3 12h18"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>;
    case 'cardio':   return <svg {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
    case 'hybrid':   return <svg {...p}><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'hiit':     return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'cycling':  return <svg {...p}><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h3"/></svg>;
    case 'yoga':     return <svg {...p}><circle cx="12" cy="4" r="1"/><path d="M4 15s2-6 8-6 8 6 8 6"/><path d="M9 15l-2 6M15 15l2 6M9 15l3-4 3 4"/></svg>;
    case 'walk':     return <svg {...p}><circle cx="12" cy="4" r="1"/><path d="M9 20l1-5-2-3 4-8"/><path d="M13 7l3 2 2 5"/><path d="M7 20h4M15 13l2 7"/></svg>;
    default:         return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>;
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

// ── Calorie ring + stats ──────────────────────────────────────────────────
function CalDashboard({ consumed, targets, date, externalExercise }: {
  consumed: MacroTargets; targets: MacroTargets | null; date: string; externalExercise?: number;
}) {
  const goal     = targets?.calories ?? 0;
  const food     = Math.round(consumed.calories);
  const [exercise,  setExercise]  = useState(() => loadExerciseKcal(date));
  const [editingEx, setEditingEx] = useState(false);
  const [exInput,   setExInput]   = useState('');
  const [ringReady, setRingReady] = useState(false);

  useEffect(() => { if (externalExercise !== undefined) setExercise(externalExercise); }, [externalExercise]);
  useEffect(() => { const id = setTimeout(() => setRingReady(true), 500); return () => clearTimeout(id); }, []);

  const remaining = goal > 0 ? goal - food + exercise : null;
  const over      = remaining !== null && remaining < 0;
  const complete  = remaining !== null && remaining === 0;
  const pct       = goal > 0 ? Math.min((food / goal) * 100, 100) : 0;

  const ringStroke = over ? RED : complete ? CARB : 'var(--accent)';
  const ringGlowColor = over ? 'rgba(248,113,113,0.45)' : complete ? 'rgba(74,222,128,0.45)' : 'rgba(157,126,255,0.45)';

  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  const displayRem  = useCountUp(mounted ? (remaining !== null ? Math.abs(remaining) : 0) : 0);
  const displayFood = useCountUp(food);

  const R   = 88;
  const SW  = 14;
  const C   = 2 * Math.PI * R;
  const fill = goal > 0 ? Math.min(food / goal, 1) : 0;
  const sz  = (R + SW) * 2;
  const cx  = sz / 2;
  const gradId = 'ringGrad';

  return (
    <div>
      {/* ── Ring ── */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24, position: 'relative' }}>
        {/* Ambient glow behind ring */}
        <div style={{
          position: 'absolute', width: sz * 0.8, height: sz * 0.8,
          borderRadius: '50%', top: '10%', left: '50%', transform: 'translateX(-50%)',
          background: `radial-gradient(circle, ${ringGlowColor} 0%, transparent 70%)`,
          filter: 'blur(20px)',
          transition: 'background 0.5s ease',
          opacity: ringReady ? 1 : 0,
          pointerEvents: 'none', zIndex: 0,
        }} />

        <div className="ring-enter" style={{ position: 'relative', width: sz, height: sz, zIndex: 1 }}>
          <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', overflow: 'visible', display: 'block' }}>
            <defs>
              <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={over ? RED : complete ? '#34D399' : '#9D7EFF'} />
                <stop offset="100%" stopColor={over ? '#FF9F9F' : complete ? CARB : '#38BDF8'} />
              </linearGradient>
            </defs>
            {/* Outer halo */}
            <circle cx={cx} cy={cx} r={R + SW * 0.6} fill="none" stroke="var(--edge)" strokeWidth={SW + 8} opacity={0.3} />
            {/* Track */}
            <circle cx={cx} cy={cx} r={R} fill="none" stroke="var(--edge2)" strokeWidth={SW} opacity={0.6} />
            {/* Fill arc with gradient */}
            <circle
              cx={cx} cy={cx} r={R}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth={SW}
              strokeLinecap="round"
              strokeDasharray={`${C}`}
              strokeDashoffset={`${C * (1 - fill)}`}
              style={{
                transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)',
                filter: `drop-shadow(0 0 14px ${ringGlowColor})`,
              }}
            />
          </svg>

          {/* Center number */}
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <div className={`tabnum ${ringReady ? 'ring-breath' : ''}`} style={{
              fontSize: 48, fontWeight: 900, lineHeight: 1,
              letterSpacing: '-2px',
              color: ringStroke,
              textShadow: `0 0 30px ${ringGlowColor}`,
            }}>
              {remaining !== null ? displayRem.toLocaleString() : '—'}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '1px',
              textTransform: 'uppercase', color: 'var(--muted)', marginTop: 6,
            }}>
              {over ? 'kcal over' : 'kcal left'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Stats row: Eaten | Goal | Burned ── */}
      <div style={{
        background: 'var(--surf)', borderRadius: 20,
        border: '1px solid var(--edge)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
        display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
        alignItems: 'stretch', marginBottom: 16, overflow: 'hidden',
      }}>
        {/* Eaten */}
        <div style={{ textAlign: 'center', padding: '16px 8px' }}>
          <div className="tabnum" style={{
            fontSize: 26, fontWeight: 900, letterSpacing: -1, lineHeight: 1,
            color: food > 0 ? (over ? RED : CARB) : 'var(--text)',
            textShadow: food > 0 ? `0 0 16px ${over ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}` : 'none',
            transition: 'color 0.3s ease',
          }}>
            {displayFood.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Eaten</div>
        </div>

        <div style={{ background: 'var(--edge)', minHeight: 40, alignSelf: 'center', height: 36 }} />

        {/* Goal */}
        <div style={{ textAlign: 'center', padding: '16px 8px' }}>
          <div className="tabnum" style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, lineHeight: 1, color: 'var(--text)' }}>
            {goal > 0 ? goal.toLocaleString() : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Goal</div>
        </div>

        <div style={{ background: 'var(--edge)', alignSelf: 'center', height: 36 }} />

        {/* Burned */}
        <div style={{ textAlign: 'center', padding: '16px 8px' }}>
          {editingEx ? (
            <input
              autoFocus type="number" min={0} max={5000} value={exInput}
              onChange={e => setExInput(e.target.value)}
              onBlur={() => { const v = Math.max(0, Math.min(5000, parseInt(exInput, 10) || 0)); setExercise(v); saveExerciseKcal(date, v); setEditingEx(false); }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
              style={{ width: 64, background: 'transparent', border: 'none', borderBottom: '1.5px solid var(--accent)', outline: 'none', color: 'var(--accent)', fontSize: 26, fontWeight: 900, textAlign: 'center', padding: '2px 0', fontVariantNumeric: 'tabular-nums' }}
            />
          ) : (
            <div onClick={() => { setExInput(exercise > 0 ? String(exercise) : ''); setEditingEx(true); }}
              className="tabnum"
              style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, cursor: 'pointer', lineHeight: 1, color: exercise > 0 ? '#F97316' : 'var(--muted2)', transition: 'color 0.2s ease' }}
              title="Tap to log exercise calories"
            >
              {exercise > 0 ? exercise.toLocaleString() : '+'}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Burned</div>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div style={{ height: 6, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          background: over
            ? `linear-gradient(90deg, ${RED}, #FF9F9F)`
            : `linear-gradient(90deg, var(--accent), #38BDF8)`,
          boxShadow: over ? `0 0 10px rgba(248,113,113,0.5)` : '0 0 10px rgba(157,126,255,0.45)',
          width: `${pct}%`,
          transition: 'width 0.9s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

// ── Macro row — vivid color tiles with count-up ───────────────────────────
function MacroRow({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const protVal = useCountUp(Math.round(consumed.proteinG), 700);
  const carbVal = useCountUp(Math.round(consumed.carbsG),   700);
  const fatVal  = useCountUp(Math.round(consumed.fatG),     700);

  const macros = [
    { label: 'Protein', val: protVal, raw: consumed.proteinG, target: targets?.proteinG ?? 0, color: PROT, glow: '0 0 12px rgba(56,189,248,0.35)' },
    { label: 'Carbs',   val: carbVal, raw: consumed.carbsG,   target: targets?.carbsG   ?? 0, color: CARB, glow: '0 0 12px rgba(74,222,128,0.35)' },
    { label: 'Fat',     val: fatVal,  raw: consumed.fatG,      target: targets?.fatG     ?? 0, color: FAT,  glow: '0 0 12px rgba(251,191,36,0.35)' },
  ];

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 20,
      border: '1px solid var(--edge)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
      overflow: 'hidden',
    }}>
      {macros.flatMap(({ label, val, raw, target, color, glow }, i) => {
        const pct  = target > 0 ? Math.min((raw / target) * 100, 100) : 0;
        const over = raw > target && target > 0;
        const c    = over ? RED : color;

        const cell = (
          <div key={label} style={{
            padding: '16px 12px 14px',
            borderTop: `3px solid ${c}`,
            background: `linear-gradient(180deg, ${c}08 0%, transparent 50%)`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 8 }}>
              {label}
            </div>
            <div className="tabnum" style={{
              fontSize: 24, fontWeight: 900, color: c,
              letterSpacing: -0.8, lineHeight: 1,
              textShadow: val > 0 ? glow : 'none',
            }}>
              {val}<span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, marginLeft: 1 }}>g</span>
            </div>
            {target > 0 && (
              <div style={{ fontSize: 10, color: 'var(--muted2)', marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                of {Math.round(target)}g
              </div>
            )}
            {/* Bar */}
            <div style={{ height: 6, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden', marginTop: 10 }}>
              <div className="bar-enter" style={{
                height: '100%', borderRadius: 99,
                background: `linear-gradient(90deg, ${c}, ${c}BB)`,
                boxShadow: over ? `0 0 10px rgba(248,113,113,0.4)` : glow,
                width: `${pct}%`,
                transition: 'width 0.75s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
            {/* Pct label */}
            {target > 0 && (
              <div style={{ fontSize: 10, color: c, fontWeight: 700, marginTop: 5, fontVariantNumeric: 'tabular-nums', opacity: 0.9 }}>
                {Math.round(pct)}%
              </div>
            )}
          </div>
        );
        return i > 0 ? [<div key={`d${i}`} style={{ background: 'var(--edge)' }} />, cell] : [cell];
      })}
    </div>
  );
}

// ── Training types ────────────────────────────────────────────────────────
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
  const dateChip    = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div style={{ position: 'relative', background: 'var(--bg)', minHeight: '100%', paddingBottom: 100, overflow: 'hidden' }}>

      {/* ── Animated gradient mesh background ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ── */}
        <div style={{ padding: '28px 20px 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <span className="chip a a1">{dateChip}</span>
            <div style={{ marginTop: 10 }} className="a a2">
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.3px', marginBottom: 2 }}>
                {greeting}{displayName ? ',' : ''}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', letterSpacing: -1, lineHeight: 1 }}>
                {displayName || 'Athlete'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 28 }}>
            {goalMode !== 'maintain' && (
              <button onClick={() => setActiveTab('profile')} className="press" style={{
                padding: '5px 13px', borderRadius: 20, cursor: 'pointer',
                background: goalMode === 'lose' ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)',
                border: `1px solid ${goalMode === 'lose' ? 'rgba(248,113,113,0.3)' : 'rgba(74,222,128,0.3)'}`,
                fontSize: 12, fontWeight: 700,
                color: goalMode === 'lose' ? RED : CARB,
                boxShadow: goalMode === 'lose' ? '0 0 10px rgba(248,113,113,0.2)' : '0 0 10px rgba(74,222,128,0.2)',
              }}>
                {goalMode === 'lose' ? '↓ Cut' : '↑ Bulk'}
              </button>
            )}
            <button onClick={() => setActiveTab('profile')} className="nrc-press" style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'var(--surf2)', border: '1px solid var(--edge2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Calorie ring ── */}
        <div style={{ padding: '16px 20px 20px' }} className="a a3">
          <CalDashboard consumed={consumed} targets={targets} date={todayStr} />
        </div>

        {/* ── Macros ── */}
        <div style={{ padding: '0 16px' }} className="a a4">
          <MacroRow consumed={consumed} targets={targets} />
        </div>

        {/* ── Training picker ── */}
        <div style={{ padding: '20px 16px 0' }} className="a a5">
          <div className="sec-label" style={{ marginBottom: 10 }}>Today's Training</div>
          <div style={{
            background: 'var(--surf)', borderRadius: 20,
            border: '1px solid var(--edge)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--edge)' }}>
              {TRAINING_TYPES.map(({ type, label }) => {
                const active = todayLog?.trainingType === type;
                const color  = TRAINING_COLORS[type] ?? 'var(--accent)';
                return (
                  <button
                    key={type}
                    onClick={() => { if (!active) handleSelectType(type); }}
                    className="nrc-press"
                    style={{
                      padding: '16px 4px 13px',
                      background: active ? `${color}18` : 'var(--surf)',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                      color: active ? color : 'var(--muted2)',
                      transition: 'background 0.2s ease, color 0.2s ease',
                      borderTop: active ? `3px solid ${color}` : '3px solid transparent',
                      boxShadow: active ? `inset 0 -2px 8px ${color}15` : 'none',
                    }}
                  >
                    <TrainingIcon type={type} size={20} />
                    <div style={{ fontSize: 10, fontWeight: active ? 800 : 500, letterSpacing: active ? '0.3px' : 0, textShadow: active ? `0 0 8px ${color}60` : 'none' }}>
                      {label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Daily activity ── */}
        <div style={{ padding: '16px 16px 0' }} className="a a6">
          <div className="sec-label" style={{ marginBottom: 10 }}>Daily Activity</div>
          <div style={{
            background: 'var(--surf)', borderRadius: 20,
            border: '1px solid var(--edge)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--edge)' }}>
              {([
                { val: 'low',    label: 'Low',    desc: 'Desk job',     emoji: '🪑' },
                { val: 'normal', label: 'Active', desc: 'Some walking', emoji: '🚶' },
                { val: 'high',   label: 'High',   desc: 'On feet',      emoji: '⚡' },
              ] as const).map(({ val, label, desc, emoji }) => {
                const sel = (activityModifier ?? 'normal') === val || (!activityModifier && val === 'normal');
                return (
                  <button key={val} onClick={() => setActivityModifier(val === 'normal' ? undefined : val)}
                    className="nrc-press"
                    style={{
                      padding: '14px 8px 12px',
                      background: sel ? 'var(--accent-muted)' : 'var(--surf)',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      transition: 'background 0.2s ease',
                      borderTop: sel ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: sel ? 800 : 500, color: sel ? 'var(--accent)' : 'var(--text)', transition: 'color 0.2s ease' }}>{label}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted2)', fontWeight: 400 }}>{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Today's Log ── */}
        {foodLogs.length > 0 && (
          <div style={{ padding: '20px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="sec-label">Today's Log</div>
              <button onClick={() => setActiveTab('food')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.3 }}>
                See all →
              </button>
            </div>
            <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              {foodLogs.slice(0, 5).map((log, i) => {
                const mealColor = MEAL_COLORS[log.meal_type ?? 'other'] ?? '#8B949E';
                const timeStr = new Date(log.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                return (
                  <div key={log.id} className="row-in card-lift"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '12px 16px', minHeight: 68,
                      borderBottom: i < Math.min(foodLogs.length, 5) - 1 ? '1px solid var(--edge)' : 'none',
                      animationDelay: `${i * 30}ms`,
                      background: i === 0 ? `linear-gradient(90deg, ${mealColor}06, transparent)` : 'transparent',
                    }}
                  >
                    {/* Icon tile */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                      background: `${mealColor}20`,
                      border: `1px solid ${mealColor}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: `0 0 10px ${mealColor}20`,
                    }}>
                      <MealIcon type={log.meal_type ?? 'other'} color={mealColor} size={20} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.food_name}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        {[
                          { color: PROT, val: Math.round(+log.protein), label: 'P' },
                          { color: CARB, val: Math.round(+log.carbs),   label: 'C' },
                          { color: FAT,  val: Math.round(+log.fat),     label: 'F' },
                        ].map(({ color, val, label }) => (
                          <span key={label} style={{
                            fontSize: 10, fontWeight: 700, color,
                            background: `${color}14`,
                            borderRadius: 6, padding: '2px 6px',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {label} {val}g
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Calories + time */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <div className="tabnum" style={{ fontSize: 16, fontWeight: 800, color: mealColor }}>
                        {Math.round(+log.calories)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>{timeStr}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ── */}
        {foodLogs.length === 0 && (
          <div style={{ padding: '28px 16px 0', textAlign: 'center' }}>
            <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', padding: '32px 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Nothing logged yet</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.6 }}>Tap the + button to log your first meal today</div>
              <button onClick={() => setActiveTab('food')} className="press" style={{
                background: 'var(--accent)', border: 'none', borderRadius: 14,
                color: '#fff', fontSize: 14, fontWeight: 700, padding: '12px 28px',
                cursor: 'pointer', boxShadow: 'var(--glow-accent)',
              }}>
                Log Food
              </button>
            </div>
          </div>
        )}

      </div>{/* /relative z-1 */}

      {/* ── Quick-add FAB ── */}
      <button onClick={() => setActiveTab('food')} className="press fab-float"
        style={{
          position: 'fixed', bottom: 84, right: 20,
          width: 58, height: 58, borderRadius: 18,
          background: 'var(--accent)',
          boxShadow: '0 4px 20px rgba(157,126,255,0.50), 0 0 0 1px rgba(157,126,255,0.2)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 40,
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

    </div>
  );
}
