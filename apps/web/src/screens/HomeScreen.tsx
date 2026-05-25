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

// ── Cronometer palette ─────────────────────────────────────────────
const BG    = '#1A1C22';
const SURF  = '#242830';
const SURF2 = '#2A2F3A';
const EDGE  = '#2E3340';
const TEXT  = '#FFFFFF';
const MUTED = '#8B909A';
const GREEN = '#6CBB3C';
const PROT  = '#E8634E';
const CARB  = '#F5A623';
const FAT   = '#4A90D9';
const RED   = '#E8634E';

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
  const prev = useRef(0);
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

// ── Calorie Ring (Cronometer style) ───────────────────────────────
function CalRing({ cal, target }: { cal: number; target: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  const display = useCountUp(mounted ? Math.round(cal) : 0);
  const R    = 52;
  const C    = 2 * Math.PI * R;
  const pct  = target > 0 ? Math.min(cal / target, 1) : 0;
  const over = cal > target && target > 0;
  const remaining = target > 0 ? Math.round(target - cal) : null;
  const color = over ? RED : GREEN;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '16px 20px' }}>
      {/* Ring */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="60" cy="60" r={R} fill="none" stroke={EDGE} strokeWidth="10" />
          <circle cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${C}`}
            strokeDashoffset={`${C * (1 - pct)}`}
            style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.3s' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1, lineHeight: 1 }}>
            {display.toLocaleString()}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: MUTED, letterSpacing: 0.5, marginTop: 2 }}>kcal eaten</div>
        </div>
      </div>

      {/* Stats column */}
      <div style={{ flex: 1 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginBottom: 2 }}>Remaining</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: over ? RED : TEXT, letterSpacing: -0.5 }}>
            {remaining !== null ? Math.abs(remaining).toLocaleString() : '—'}
            <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginLeft: 4 }}>kcal</span>
          </div>
          {over && <div style={{ fontSize: 10, color: RED, fontWeight: 600, marginTop: 1 }}>over target</div>}
        </div>
        <div style={{ width: '100%', height: 4, background: EDGE, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: over ? RED : GREEN,
            width: `${Math.min(pct * 100, 100)}%`,
            transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
        <div style={{ fontSize: 10, color: MUTED, marginTop: 4, fontWeight: 500 }}>
          Goal: {target > 0 ? target.toLocaleString() : '—'} kcal
        </div>
      </div>
    </div>
  );
}

// ── Macro bars (Cronometer style) ─────────────────────────────────
function MacroBars({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const items = [
    { label: 'Carbs',   val: consumed.carbsG,   target: targets?.carbsG   ?? 0, color: CARB },
    { label: 'Fat',     val: consumed.fatG,      target: targets?.fatG     ?? 0, color: FAT  },
    { label: 'Protein', val: consumed.proteinG,  target: targets?.proteinG ?? 0, color: PROT },
  ];
  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(({ label, val, target, color }) => {
        const pct  = target > 0 ? Math.min((val / target) * 100, 100) : 0;
        const over = val > target && target > 0;
        const c    = over ? RED : color;
        return (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: TEXT }}>{label}</div>
              <div style={{ fontSize: 11, color: MUTED }}>
                <span style={{ color: over ? RED : TEXT, fontWeight: 700 }}>{Math.round(val)}</span>
                {target > 0 && <span style={{ color: MUTED }}> / {Math.round(target)}g</span>}
              </div>
            </div>
            <div style={{ height: 5, background: EDGE, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, background: c,
                width: `${pct}%`, transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
              }} className="bar-ani" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Training type button ───────────────────────────────────────────
const TRAINING_TYPES: { type: TrainingType; label: string; icon: string; color: string }[] = [
  { type: 'rest',     label: 'Rest',     icon: '🛌', color: '#8B909A' },
  { type: 'strength', label: 'Strength', icon: '💪', color: PROT      },
  { type: 'cardio',   label: 'Cardio',   icon: '🏃', color: CARB      },
  { type: 'hybrid',   label: 'Hybrid',   icon: '⚡', color: GREEN     },
];

// ── Compact food diary summary card ───────────────────────────────
const MEAL_META: Record<string, { icon: string; color: string; short: string }> = {
  breakfast:    { icon: '🌅', color: CARB,  short: 'Breakfast'    },
  pre_workout:  { icon: '⚡', color: GREEN, short: 'Pre-WO'       },
  lunch:        { icon: '🥗', color: FAT,   short: 'Lunch'        },
  post_workout: { icon: '💪', color: GREEN, short: 'Post-WO'      },
  dinner:       { icon: '🍽', color: PROT,  short: 'Dinner'       },
  snack:        { icon: '🍎', color: MUTED, short: 'Snacks'       },
  other:        { icon: '📦', color: MUTED, short: 'Other'        },
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
    <div style={{ background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>

      {/* Compact header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, flexShrink: 0 }}>
            Food Diary
          </span>
          {totalCals > 0 && (
            <>
              <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, background: `${GREEN}18`, borderRadius: 20, padding: '1px 7px', flexShrink: 0 }}>
                {Math.round(totalCals)} kcal
              </span>
              <span style={{ fontSize: 9, color: `${MUTED}90`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                P{Math.round(totalProt)}g · C{Math.round(totalCarbs)}g · F{Math.round(totalFat)}g
              </span>
            </>
          )}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: EDGE }} />

      {/* Compact meal rows */}
      <div style={{ padding: '3px 0' }}>
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
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '5px 12px',
                borderBottom: isLast ? 'none' : `1px solid ${EDGE}20`,
              }}
            >
              {/* Emoji */}
              <span style={{ fontSize: 12, flexShrink: 0, width: 16, textAlign: 'center' }}>{meta.icon}</span>

              {/* Meal label */}
              <span style={{
                fontSize: 10, fontWeight: 700, flexShrink: 0, width: 56,
                color: hasFood ? meta.color : `${MUTED}70`,
              }}>
                {meta.short}
              </span>

              {/* Food names — paragraph style */}
              <span style={{
                flex: 1, fontSize: 10, minWidth: 0,
                color: hasFood ? `${MUTED}CC` : `${MUTED}35`,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {hasFood ? items.map(l => l.food_name).join(', ') : '—'}
              </span>

              {/* Kcal — only when has food */}
              {hasFood && (
                <span style={{ fontSize: 9, fontWeight: 700, color: meta.color, flexShrink: 0 }}>
                  {Math.round(mealCal)}
                </span>
              )}

              {/* + button */}
              <button
                onClick={onAddFood}
                className="nrc-press"
                style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  background: 'transparent', border: `1px solid ${EDGE}`,
                  color: MUTED, fontSize: 14, lineHeight: 1,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = GREEN; (e.currentTarget as HTMLButtonElement).style.color = GREEN; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = EDGE; (e.currentTarget as HTMLButtonElement).style.color = MUTED; }}
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

// ── Main screen ───────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuthStore();
  const { setActiveTab } = useAppStore();
  const { todayLog, weeklyLoad, weather, environmentAlert } = useNutritionStore();
  const { logDay, setActivityModifier } = useNutrition();

  const [logs,        setLogs]        = useState<FoodLog[]>([]);
  const [consumed,    setConsumed]    = useState<MacroTargets>(emptyMacros());
  const [logTick,     setLogTick]     = useState(0);

  const today = new Date().toISOString().split('T')[0];

  // Load food logs
  useEffect(() => {
    getLogs(today).then(ls => {
      setLogs(ls.filter(l => !l.removed));
      setConsumed(sumLogs(ls.filter(l => !l.removed)));
    });
  }, [today, logTick]);

  const reloadLogs = useCallback(() => setLogTick(t => t + 1), []);

  // Effective targets — shared hook applies goal-mode + custom overrides (same as FoodScreen)
  const targets = useEffectiveTargets();

  // Group logs by meal
  const byMeal = MEAL_ORDER.reduce<Record<string, FoodLog[]>>((acc, m) => { acc[m] = []; return acc; }, {});
  logs.forEach(l => {
    const key = (l.meal_type ?? 'other') as string;
    if (byMeal[key]) byMeal[key].push(l);
    else byMeal['other'].push(l);
  });

  const handleAddFood = useCallback(() => {
    setActiveTab('food');
  }, [setActiveTab]);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type);
    if (r.blocked && !window.confirm('Heavy run load this week. Cardio today risks injury.\n\nLog anyway?')) return;
    if (r.blocked) logDay(type, undefined, undefined, true);
  };

  // Date formatting
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const loggedRuns = weeklyLoad.loggedRuns ?? [];

  const activityModifier = todayLog?.dailyActivityModifier ?? null;

  return (
    <div style={{ background: BG, minHeight: '100%', paddingBottom: 16 }}>

      {/* Date header */}
      <div style={{
        padding: '16px 20px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 }}>Diary</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginTop: 2 }}>{dateLabel}</div>
        </div>
        {todayLog?.trainingType && (
          <div style={{
            padding: '5px 12px', borderRadius: 20,
            background: `${GREEN}18`, border: `1px solid ${GREEN}40`,
            fontSize: 11, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 1,
          }}>
            {todayLog.trainingType}
          </div>
        )}
      </div>

      {/* Weather — always show when data available */}
      {weather && (
        <div style={{ padding: '12px 16px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert ?? { level: 'none', message: '' }} />
        </div>
      )}

      {/* Calorie card */}
      <div style={{ margin: '12px 16px 0', background: SURF, borderRadius: 16, border: `1px solid ${EDGE}` }}>
        <CalRing cal={consumed.calories} target={targets?.calories ?? 0} />
        {targets && <MacroBars consumed={consumed} targets={targets} />}
      </div>

      {/* Training type selector */}
      <div style={{ margin: '12px 16px 0', background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
          Today's Training
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {TRAINING_TYPES.map(({ type, label, icon, color }) => {
            const active = todayLog?.trainingType === type;
            return (
              <button key={type} onClick={() => handleSelectType(type)} className="nrc-press" style={{
                padding: '10px 4px', borderRadius: 12, border: `1.5px solid ${active ? color : EDGE}`,
                background: active ? `${color}18` : SURF2, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <div style={{ fontSize: 20 }}>{icon}</div>
                <div style={{ fontSize: 10, fontWeight: active ? 700 : 600, color: active ? color : MUTED }}>{label}</div>
              </button>
            );
          })}
        </div>

        {/* Non-exercise activity (NEAT) modifier */}
        {todayLog && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 3 }}>
              Daily Activity Level
            </div>
            <div style={{ fontSize: 10, color: `${MUTED}80`, marginBottom: 7, lineHeight: 1.4 }}>
              Non-workout movement — steps, job, errands. Affects your daily calories.
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { val: 'low',    label: 'Low',    desc: 'Desk job · mostly sitting' },
                { val: 'normal', label: 'Normal', desc: 'Some walking · light day'  },
                { val: 'high',   label: 'High',   desc: 'On feet all day · lots of steps' },
              ] as const).map(({ val, label, desc }) => {
                const sel = (activityModifier ?? 'normal') === val || (!activityModifier && val === 'normal');
                return (
                  <button key={val} onClick={() => setActivityModifier(val === 'normal' ? undefined : val)} style={{
                    flex: 1, padding: '7px 4px', borderRadius: 9,
                    border: `1px solid ${sel ? GREEN : EDGE}`,
                    background: sel ? `${GREEN}15` : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: sel ? 800 : 600, color: sel ? GREEN : MUTED }}>{label}</span>
                    <span style={{ fontSize: 8, color: sel ? `${GREEN}AA` : `${MUTED}60`, textAlign: 'center', lineHeight: 1.3 }}>{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Food diary — compact JSON-style cube */}
      <div style={{ margin: '12px 16px 0' }}>
        <FoodDiaryCube logs={logs} byMeal={byMeal} onAddFood={handleAddFood} />
      </div>

      {/* Strava */}
      {user && (
        <div style={{ margin: '4px 16px 0' }}>
          <StravaCard />
        </div>
      )}

      {/* Weekly load */}
      {(loggedRuns.length > 0 || weeklyLoad.totalStrengthSets > 0) && (
        <div style={{ margin: '12px 16px 0', background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
            Weekly Load
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {weeklyLoad.totalRunKm > 0 && (
              <div style={{ flex: 1, background: SURF2, borderRadius: 10, padding: '10px 12px', border: `1px solid ${EDGE}` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: CARB }}>
                  {weeklyLoad.totalRunKm.toFixed(1)}
                  <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginLeft: 3 }}>km</span>
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Total runs</div>
              </div>
            )}
            {weeklyLoad.totalStrengthSets > 0 && (
              <div style={{ flex: 1, background: SURF2, borderRadius: 10, padding: '10px 12px', border: `1px solid ${EDGE}` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: PROT }}>
                  {weeklyLoad.totalStrengthSets}
                  <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginLeft: 3 }}>sessions</span>
                </div>
                <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Strength</div>
              </div>
            )}
            <div style={{ flex: 1, background: SURF2, borderRadius: 10, padding: '10px 12px', border: `1px solid ${EDGE}` }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: weeklyLoad.recoveryScore >= 60 ? GREEN : weeklyLoad.recoveryScore >= 35 ? CARB : RED }}>
                {weeklyLoad.recoveryScore}
                <span style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginLeft: 3 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Recovery</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
