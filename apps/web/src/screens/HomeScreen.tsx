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

const PROT = '#38BDF8';
const CARB = '#4ADE80';
const RED  = '#F87171';

const MEAL_COLORS: Record<string, string> = {
  breakfast:    '#F97316',
  lunch:        '#38BDF8',
  dinner:       '#A78BFA',
  pre_workout:  '#4ADE80',
  post_workout: '#34D399',
  snack:        '#FBBF24',
  other:        '#8B949E',
};

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

function TrainingIcon({ type, size = 16 }: { type: TrainingType; size?: number }) {
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

function ProteinHero({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const protEaten = Math.round(consumed.proteinG);
  const protGoal  = targets?.proteinG ?? 0;
  const calEaten  = Math.round(consumed.calories);
  const calGoal   = targets?.calories ?? 0;

  const pct    = protGoal > 0 ? Math.min(protEaten / protGoal, 1) : 0;
  const done   = protGoal > 0 && pct >= 1;
  const ring   = done ? CARB : 'var(--accent)';
  const glow   = done ? 'rgba(74,222,128,0.45)' : 'rgba(157,126,255,0.45)';
  const calPct = calGoal > 0 ? Math.min(calEaten / calGoal, 1) : 0;
  const calOver = calGoal > 0 && calEaten > calGoal;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const animProt = useCountUp(mounted ? protEaten : 0);
  const animCal  = useCountUp(mounted ? calEaten  : 0);

  const R  = 84;
  const SW = 13;
  const C  = 2 * Math.PI * R;
  const sz = (R + SW) * 2;
  const cx = sz / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0 24px' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute',
          width: sz * 0.8, height: sz * 0.8,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
          filter: 'blur(22px)',
          transition: 'background 0.5s ease',
          pointerEvents: 'none',
        }} />

        <svg width={sz} height={sz} style={{ transform: 'rotate(-90deg)', overflow: 'visible', display: 'block' }}>
          <circle cx={cx} cy={cx} r={R} fill="none" stroke="var(--edge2)" strokeWidth={SW} opacity={0.5} />
          <circle
            cx={cx} cy={cx} r={R}
            fill="none"
            stroke={ring}
            strokeWidth={SW}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
            style={{
              transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease',
              filter: `drop-shadow(0 0 14px ${glow})`,
            }}
          />
        </svg>

        {/* Center label */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            fontSize: 52, fontWeight: 900, lineHeight: 1, letterSpacing: -2,
            color: ring,
            textShadow: `0 0 28px ${glow}`,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {animProt}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 5, letterSpacing: 0.3 }}>
            {protGoal > 0 ? `of ${Math.round(protGoal)}g protein` : 'g protein'}
          </div>
        </div>
      </div>

      {/* Calories row */}
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 18, fontWeight: 800,
          color: calOver ? RED : 'var(--text)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {animCal.toLocaleString()}
        </span>
        <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
          {calGoal > 0 ? `/ ${calGoal.toLocaleString()} kcal` : 'kcal'}
        </span>
        {calGoal > 0 && (
          <div style={{ width: 72, height: 4, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              background: calOver ? RED : PROT,
              width: `${Math.min(calPct * 100, 100)}%`,
              transition: 'width 0.75s cubic-bezier(0.4,0,0.2,1)',
            }} />
          </div>
        )}
      </div>
    </div>
  );
}

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

  const targets     = useEffectiveTargets();
  const activeType  = todayLog?.trainingType;

  const [streak,  setStreak]  = useState(0);
  const [xpInfo,  setXpInfo]  = useState(() => getLevelInfo(getXP()));
  const [water,   setWater]   = useState(0);
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
  const displayName = user?.displayName || '';
  const dateChip    = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div style={{ position: 'relative', background: 'var(--bg)', minHeight: '100%', paddingBottom: 100, overflow: 'hidden' }}>

      {/* Background orbs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ padding: '28px 20px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div className="a a1">
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.3, marginBottom: 2 }}>
              {greeting}{displayName ? ',' : ''}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', letterSpacing: -1, lineHeight: 1 }}>
              {displayName || 'Athlete'}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {streak > 0 && (
                <button onClick={() => setActiveTab('ascend')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}>
                  <span style={{ fontSize: 12 }}>🔥</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B' }}>{streak}d</span>
                </button>
              )}
              <button onClick={() => setActiveTab('ascend')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 99, background: 'rgba(157,126,255,0.15)', border: '1px solid rgba(157,126,255,0.3)', cursor: 'pointer' }}>
                <span style={{ fontSize: 11 }}>{xpInfo.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9D7EFF' }}>Lv.{xpInfo.level} {xpInfo.name}</span>
              </button>
            </div>
          </div>
          <button onClick={() => setActiveTab('profile')} className="nrc-press" style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--surf2)', border: '1px solid var(--edge2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, marginTop: 4,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
          </button>
        </div>

        {/* Training chips */}
        <div className="a a2" style={{
          padding: '0 16px 20px',
          overflowX: 'auto', display: 'flex', gap: 8,
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}>
          {TRAINING_TYPES.map(({ type, label }) => {
            const active = activeType === type;
            const color  = TRAINING_COLORS[type] ?? 'var(--accent)';
            return (
              <button
                key={type}
                onClick={() => { if (!active) handleSelectType(type); }}
                className="nrc-press"
                style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 99,
                  background: active ? `${color}22` : 'var(--surf)',
                  border: active ? `1px solid ${color}55` : '1px solid var(--edge)',
                  color: active ? color : 'var(--muted)',
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: active ? `0 0 12px ${color}30` : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                <TrainingIcon type={type} size={14} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Protein hero */}
        <div className="a a3" style={{ padding: '0 20px' }}>
          <ProteinHero consumed={consumed} targets={targets} />
        </div>

        {/* Log Food CTA */}
        <div className="a a4" style={{ padding: '0 16px 24px' }}>
          <button onClick={() => setActiveTab('food')} className="press" style={{
            width: '100%', padding: '18px 0',
            background: 'var(--accent)', border: 'none', borderRadius: 20,
            color: '#fff', fontSize: 16, fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 24px rgba(157,126,255,0.40)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Log Food
          </button>
        </div>

        {/* Water quick-strip */}
        <div className="a a5" style={{ padding: '0 16px 16px' }}>
          <div style={{
            background: 'var(--surf)', borderRadius: 16, border: '1px solid var(--edge)',
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <button onClick={() => setActiveTab('body')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>
              </svg>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#38BDF8', fontVariantNumeric: 'tabular-nums' }}>{(water/1000).toFixed(1)}L</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>/ {(waterGoal/1000).toFixed(1)}L</span>
            </button>
            {/* Mini progress */}
            <div style={{ flex: 1, height: 4, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99, background: '#38BDF8',
                width: `${waterGoal > 0 ? Math.min((water/waterGoal)*100, 100) : 0}%`,
                transition: 'width 0.5s ease',
              }} />
            </div>
            {/* Quick add */}
            {[250, 500].map(ml => (
              <button key={ml} onClick={() => quickAddWater(ml)} style={{
                padding: '5px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', color: '#38BDF8',
              }}>+{ml < 1000 ? `${ml}ml` : '1L'}</button>
            ))}
          </div>
        </div>

        {/* Today's log */}
        {foodLogs.length > 0 && (
          <div className="a a5" style={{ padding: '0 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div className="sec-label">Today</div>
              <button onClick={() => setActiveTab('food')} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.3,
              }}>
                See all →
              </button>
            </div>
            <div style={{ background: 'var(--surf)', borderRadius: 20, border: '1px solid var(--edge)', overflow: 'hidden' }}>
              {foodLogs.slice(0, 4).map((log, i) => {
                const mealColor = MEAL_COLORS[log.meal_type ?? 'other'] ?? '#8B949E';
                const timeStr   = new Date(log.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                return (
                  <div key={log.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '13px 16px',
                    borderBottom: i < Math.min(foodLogs.length, 4) - 1 ? '1px solid var(--edge)' : 'none',
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: mealColor, flexShrink: 0,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.food_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {Math.round(+log.protein)}g protein · {timeStr}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, color: 'var(--text)',
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    }}>
                      {Math.round(+log.calories)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {foodLogs.length === 0 && (
          <div style={{ padding: '0 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
              Nothing logged yet
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
