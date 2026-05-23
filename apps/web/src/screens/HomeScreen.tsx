import { useState, useEffect, useRef, useCallback } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import { useAppStore } from '../store/appStore';
import WeatherBanner from '../components/WeatherBanner';
import StravaCard from '../components/StravaCard';
import { getLogs, deleteLog } from '../api/localFood';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType, LoggedRun } from '@shared/types';
import { getCustomTargets } from '../lib/customTargets';

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

// ── Food item row ──────────────────────────────────────────────────
function FoodRow({ item, onDelete }: { item: FoodLog; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 10,
      borderBottom: `1px solid ${EDGE}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.food_name}
        </div>
        {item.weight_grams && (
          <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{item.weight_grams}g</div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{Math.round(item.calories)}</div>
        <div style={{ fontSize: 10, color: MUTED }}>kcal</div>
      </div>
      {confirm ? (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button onClick={onDelete} style={{ padding: '4px 8px', borderRadius: 6, background: RED, border: 'none', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Del</button>
          <button onClick={() => setConfirm(false)} style={{ padding: '4px 8px', borderRadius: 6, background: EDGE, border: 'none', color: MUTED, fontSize: 11, cursor: 'pointer' }}>✕</button>
        </div>
      ) : (
        <button onClick={() => setConfirm(true)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 16, padding: '0 4px', flexShrink: 0, lineHeight: 1 }}>⋯</button>
      )}
    </div>
  );
}

// ── Meal section ──────────────────────────────────────────────────
function MealSection({
  mealKey, logs, onAddFood, onLogsChanged,
}: {
  mealKey: string;
  logs: FoodLog[];
  onAddFood: (meal: string) => void;
  onLogsChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const total = logs.reduce((s, l) => s + +l.calories, 0);

  const handleDelete = useCallback(async (log: FoodLog) => {
    if (log.id) { await deleteLog(log.id); onLogsChanged(); }
  }, [onLogsChanged]);

  return (
    <div style={{ background: SURF, borderRadius: 14, marginBottom: 10, border: `1px solid ${EDGE}`, overflow: 'hidden' }}>
      {/* Section header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>
            {MEAL_LABEL[mealKey] ?? mealKey}
          </span>
          {logs.length > 0 && (
            <span style={{ fontSize: 12, color: MUTED, marginLeft: 8 }}>
              {Math.round(total)} kcal
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onAddFood(mealKey); }}
          style={{
            width: 28, height: 28, borderRadius: 8, background: `${GREEN}20`,
            border: `1px solid ${GREEN}50`, color: GREEN,
            fontSize: 18, fontWeight: 700, cursor: 'pointer', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >+</button>
        <div style={{ color: MUTED, fontSize: 12, marginLeft: 8, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</div>
      </div>

      {/* Food items */}
      {expanded && logs.length > 0 && (
        <div>
          {logs.map(l => (
            <FoodRow key={l.id ?? l.food_name} item={l} onDelete={() => handleDelete(l)} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {expanded && logs.length === 0 && (
        <div style={{ padding: '8px 16px 14px', fontSize: 12, color: MUTED, fontStyle: 'italic' }}>
          No foods logged yet
        </div>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuthStore();
  const { setActiveTab, setPendingMealType } = useAppStore();
  const { todayLog, targets: rawTargets, weeklyLoad, weather, environmentAlert } = useNutritionStore();
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

  // Effective targets (with goal mode adjustment)
  const customTargets = getCustomTargets();
  const goalMode = (() => {
    try { return (localStorage.getItem('fs_goal_mode_v1') ?? 'maintain') as 'lose' | 'maintain' | 'gain'; }
    catch { return 'maintain' as const; }
  })();
  const goalAdj: Record<'lose' | 'maintain' | 'gain', number> = { lose: -500, maintain: 0, gain: 300 };
  const targets = customTargets.enabled && rawTargets
    ? { ...rawTargets, calories: customTargets.calories, proteinG: customTargets.proteinG, carbsG: customTargets.carbsG, fatG: customTargets.fatG }
    : rawTargets ? (() => {
        const adjCal = Math.max(1200, rawTargets.calories + goalAdj[goalMode]);
        const scale  = adjCal / rawTargets.calories;
        return { ...rawTargets, calories: adjCal, proteinG: Math.round(rawTargets.proteinG * scale), carbsG: Math.round(rawTargets.carbsG * scale), fatG: Math.round(rawTargets.fatG * scale) };
      })()
    : rawTargets;

  // Group logs by meal
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

      {/* Weather */}
      {weather && environmentAlert && (
        <div style={{ padding: '12px 16px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert} />
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

        {/* Activity modifier */}
        {todayLog && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {(['low', 'normal', 'high'] as const).map(m => {
              const sel = (activityModifier ?? 'normal') === m || (!activityModifier && m === 'normal');
              return (
                <button key={m} onClick={() => setActivityModifier(m === 'normal' ? undefined : m)} style={{
                  flex: 1, padding: '6px', borderRadius: 8,
                  border: `1px solid ${sel ? GREEN : EDGE}`,
                  background: sel ? `${GREEN}15` : 'transparent',
                  color: sel ? GREEN : MUTED, fontSize: 11, fontWeight: sel ? 700 : 500,
                  cursor: 'pointer', textTransform: 'capitalize',
                }}>{m}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* Meal diary */}
      <div style={{ margin: '12px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>
          Food Diary
        </div>
        {MEAL_ORDER.map(meal => (
          <MealSection
            key={meal}
            mealKey={meal}
            logs={byMeal[meal] ?? []}
            onAddFood={handleAddFood}
            onLogsChanged={reloadLogs}
          />
        ))}
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
