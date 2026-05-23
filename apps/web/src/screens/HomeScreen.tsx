import { useState, useEffect, useRef } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import TrainingPicker from '../components/TrainingPicker';
import WeatherBanner from '../components/WeatherBanner';
import { getLogs, estimateSteps } from '../api/localFood';
import StravaCard from '../components/StravaCard';
import { computeMacros } from '@mobile/services/nutritionEngine';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType, LoggedRun } from '@shared/types';
import { getCustomTargets } from '../lib/customTargets';

const BG      = '#0A0A0A';
const SURF    = '#141414';
const SURF2   = '#1E1E1E';
const EDGE    = 'rgba(255,255,255,0.08)';
const TEXT    = '#F0F0F0';
const MUTED   = '#707070';
const MUTED2  = '#3A3A3A';
const ORANGE  = '#FF8000';
const BLUE    = '#FF8000';   // alias — protein uses orange in McLaren
const GREEN   = '#22C55E';
const YELLOW  = '#F5C518';
const RED     = '#EF4444';
const GREY    = '#707070';
const FAT_CLR = '#AAAAAA';
const CARD_SHADOW = '0 2px 16px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)';

const ACTIVITY_MULT: Record<string, number> = {
  sedentary: 0.4, light: 0.65, moderate: 1.0, very_active: 1.7, extra_active: 2.4,
};

function getThisMonday(): string {
  const d = new Date(), day = d.getDay();
  const m = new Date(d);
  m.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return m.toISOString().split('T')[0];
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

interface MicroTotals {
  fiber_g: number; cholesterol_mg: number; sodium_mg: number;
  vitamin_c_mg: number; vitamin_d_mcg: number; calcium_mg: number; iron_mg: number;
}
const emptyMicros = (): MicroTotals => ({
  fiber_g: 0, cholesterol_mg: 0, sodium_mg: 0,
  vitamin_c_mg: 0, vitamin_d_mcg: 0, calcium_mg: 0, iron_mg: 0,
});
function sumMicros(logs: FoodLog[]): MicroTotals {
  return logs.reduce<MicroTotals>((a, l) => ({
    fiber_g:        a.fiber_g        + (Number(l.fiber_g)        || 0),
    cholesterol_mg: a.cholesterol_mg + (Number(l.cholesterol_mg) || 0),
    sodium_mg:      a.sodium_mg      + (Number(l.sodium_mg)      || 0),
    vitamin_c_mg:   a.vitamin_c_mg   + (Number(l.vitamin_c_mg)   || 0),
    vitamin_d_mcg:  a.vitamin_d_mcg  + (Number(l.vitamin_d_mcg)  || 0),
    calcium_mg:     a.calcium_mg     + (Number(l.calcium_mg)     || 0),
    iron_mg:        a.iron_mg        + (Number(l.iron_mg)        || 0),
  }), emptyMicros());
}
function getMicroTargets(gender: string) {
  const m = gender === 'male';
  return {
    fiber_g: m ? 38 : 25, cholesterol_mg: 300, sodium_mg: 2300,
    vitamin_c_mg: m ? 90 : 75, vitamin_d_mcg: 15, calcium_mg: 1000, iron_mg: m ? 8 : 18,
  };
}

function paceMultiplier(p?: number): number {
  if (p == null) return 1;
  if (p < 4.5) return 1.5; if (p < 5.5) return 1.25; if (p < 7) return 1;
  return 0.75;
}
function fmtPace(p: number): string {
  return `${Math.floor(p)}:${String(Math.round((p % 1) * 60)).padStart(2, '0')}/km`;
}

function buildRecovery(runs: LoggedRun[], sessions: number, act = 'moderate') {
  const mult    = ACTIVITY_MULT[act] ?? 1;
  const runLoad = runs.reduce((t, r) => t + r.km * 1.5 * paceMultiplier(r.paceMinPerKm), 0);
  const score   = Math.max(5, Math.round(100 - Math.min(100, (runLoad + sessions * 15) / mult)));
  const km      = runs.reduce((s, r) => s + r.km, 0);
  const parts   = [];
  if (runs.length) parts.push(`${runs.length}R · ${km.toFixed(1)}km`);
  if (sessions)    parts.push(`${sessions}S`);
  const sub = parts.join(' · ') || '—';
  if (score >= 90) return { label: 'FRESH',      color: YELLOW,  sub, score };
  if (score >= 65) return { label: 'ACTIVE',     color: GREEN,   sub, score };
  if (score >= 40) return { label: 'BUILDING',   color: YELLOW,  sub, score };
  if (score >= 20) return { label: 'LOADED',     color: ORANGE,  sub, score };
  return             { label: 'OVERLOADED', color: RED,     sub, score };
}

function useCountUp(to: number, ms = 600): number {
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

// ── CAL RING ──────────────────────────────────────────────────────
function CalRing({ cal, target }: { cal: number; target: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(id); }, []);
  const display = useCountUp(mounted ? Math.round(cal) : 0);
  const R   = 60;
  const C   = 2 * Math.PI * R;
  const pct = target > 0 ? Math.min(cal / target, 1) : 0;
  const over = cal > target && target > 0;
  const color = over ? RED : pct > 0.9 ? YELLOW : BLUE;
  const left  = target > 0 ? Math.round(target - cal) : null;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 16px 0' }}>
      <div style={{ position: 'relative', width: 152, height: 152 }}>
        <svg width="152" height="152" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="76" cy="76" r={R} fill="none" stroke={MUTED2} strokeWidth="10" />
          <circle cx="76" cy="76" r={R} fill="none" stroke={color} strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${C}`}
            strokeDashoffset={C * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.3s' }}
          />
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            fontFamily: "'Barlow Condensed', system-ui, sans-serif",
            fontSize: 40, fontWeight: 900, letterSpacing: -2, lineHeight: 1,
            color, transition: 'color 0.3s',
          }}>
            {display.toLocaleString()}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>kcal</div>
          {left !== null && (
            <div style={{ fontSize: 9, color: over ? RED : MUTED, fontWeight: 700, marginTop: 2 }}>
              {over ? `${Math.abs(left)} over` : `${left} left`}
            </div>
          )}
          {target > 0 && (
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 1 }}>
              of {target.toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MACRO GRID ────────────────────────────────────────────────────
function MacroGrid({ consumed, targets }: { consumed: MacroTargets; targets: MacroTargets | null }) {
  const items = [
    { key: 'P', label: 'Protein', val: consumed.proteinG, target: targets?.proteinG ?? 0, color: ORANGE  },
    { key: 'C', label: 'Carbs',   val: consumed.carbsG,   target: targets?.carbsG   ?? 0, color: YELLOW  },
    { key: 'F', label: 'Fat',     val: consumed.fatG,     target: targets?.fatG     ?? 0, color: FAT_CLR },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, padding: '8px 16px 0' }}>
      {items.map(({ key, label, val, target, color }) => {
        const pct  = target > 0 ? Math.min((val / target) * 100, 100) : 0;
        const over = val > target && target > 0;
        const c    = over ? RED : color;
        return (
          <div key={key} style={{
            background: SURF, borderRadius: 12, padding: '10px 12px 8px',
            border: `1px solid ${over ? `${RED}30` : EDGE}`,
            borderTop: `3px solid ${c}`,
            boxShadow: CARD_SHADOW,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: c, letterSpacing: 0.5 }}>{key}</div>
              <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>
                {target > 0 ? `/${Math.round(target)}` : ''}
              </div>
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontSize: 26, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: c,
            }}>
              {Math.round(val)}
            </div>
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginBottom: 7 }}>{label}</div>
            <div style={{ height: 4, background: MUTED2, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`,
                background: c, borderRadius: 2,
                transition: 'width 0.7s ease',
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WATER ─────────────────────────────────────────────────────────
function Water({ date }: { date: string }) {
  const KEY = `fs_water_${date}`;
  const [n, setN] = useState<number>(() => {
    try { return parseInt(localStorage.getItem(KEY) ?? '0', 10) || 0; } catch { return 0; }
  });
  const save = (v: number) => {
    const c = Math.max(0, Math.min(12, v)); setN(c);
    try { localStorage.setItem(KEY, String(c)); } catch { /* */ }
  };
  const done = n >= 8;
  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div style={{
        background: SURF, borderRadius: 14, padding: '14px 16px',
        border: `1px solid ${done ? `${GREEN}40` : EDGE}`,
        boxShadow: CARD_SHADOW,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', minWidth: 38 }}>
          WATER
        </div>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              onClick={() => save(i < n ? i : i + 1)}
              style={{
                flex: 1, height: 24, borderRadius: 5, cursor: 'pointer',
                background: i < n ? (done ? GREEN : BLUE) : MUTED2,
                transition: 'background 0.15s, transform 0.1s',
              }}
            />
          ))}
        </div>
        <div style={{
          fontFamily: "'Barlow Condensed', system-ui, sans-serif",
          fontSize: 22, fontWeight: 900, letterSpacing: -1,
          color: done ? GREEN : MUTED,
          minWidth: 28, textAlign: 'right',
        }}>
          {n}
        </div>
      </div>
    </div>
  );
}

// ── STEPS ─────────────────────────────────────────────────────────
function Steps({ todayLog, profile, weeklyLoad }: { todayLog: ReturnType<typeof useNutrition>['todayLog']; profile: ReturnType<typeof useNutrition>['profile']; weeklyLoad: ReturnType<typeof useNutrition>['weeklyLoad'] }) {
  const storeSetTargets  = useNutritionStore((s) => s.setTargets);
  const storeSetModifier = useNutritionStore((s) => s.setActivityModifier);
  const today = new Date().toISOString().slice(0, 10);
  const KEY   = `fs_steps_${today}`;

  const [desc,       setDesc]       = useState('');
  const [steps,      setSteps]      = useState<number | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [stepsError, setStepsError] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.description) setDesc(s.description);
      if (s.estimate != null) { setSteps(s.estimate); apply(s.estimate); }
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ description: desc, estimate: steps })); } catch { /* */ }
  }, [desc, steps, KEY]);

  const apply = (v: number) => {
    const mod = v < 6000 ? 'low' : v > 10000 ? 'high' : 'normal';
    storeSetModifier(mod as 'low' | 'normal' | 'high');
    if (profile && todayLog) {
      const updated = { ...todayLog, dailyActivityModifier: mod as 'low' | 'normal' | 'high' };
      const bd = computeMacros(profile, updated, weeklyLoad);
      storeSetTargets(bd.targets);
    }
  };

  const estimate = async () => {
    if (!desc.trim() || loading) return;
    setLoading(true);
    setStepsError('');
    try {
      const r = await estimateSteps(desc.trim());
      setSteps(r.steps); apply(r.steps);
    } catch { setStepsError('Could not estimate — try again'); }
    setLoading(false);
  };

  if (!todayLog) return null;

  const label = steps !== null
    ? steps < 6000 ? 'LOW' : steps > 10000 ? 'HIGH' : 'OK'
    : null;
  const lc = label === 'LOW' ? '#F97316' : label === 'HIGH' ? GREEN : MUTED;

  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div style={{
        background: SURF, borderRadius: 14, padding: '13px 15px',
        border: `1px solid ${EDGE}`, boxShadow: CARD_SHADOW,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: steps !== null ? 8 : 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
            STEPS
          </div>
          {label && (
            <div style={{ fontSize: 9, fontWeight: 800, color: lc, letterSpacing: 1 }}>{label}</div>
          )}
          {steps !== null && (
            <div style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontSize: 20, fontWeight: 900, letterSpacing: -1, color: lc, marginLeft: 'auto',
            }}>
              {steps.toLocaleString()}
            </div>
          )}
        </div>

        {steps !== null && (
          <div style={{ height: 4, background: MUTED2, borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (steps / 10000) * 100)}%`,
              background: lc, borderRadius: 2,
              transition: 'width 0.6s ease',
            }} />
          </div>
        )}

        {stepsError && (
          <div style={{ fontSize: 11, color: RED, fontWeight: 700, marginBottom: 6 }}>{stepsError}</div>
        )}
        <div style={{ display: 'flex', gap: 7 }}>
          <input
            type="text"
            placeholder="describe your day..."
            value={desc}
            onChange={(e) => { setDesc(e.target.value); setStepsError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') estimate(); }}
            style={{
              flex: 1, background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 8,
              color: TEXT, fontSize: 12, padding: '8px 11px', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={estimate}
            disabled={loading || !desc.trim()}
            style={{
              background: BLUE, border: 'none', borderRadius: 8,
              color: '#fff', fontWeight: 800, fontSize: 11, padding: '0 13px',
              cursor: !desc.trim() || loading ? 'not-allowed' : 'pointer',
              opacity: !desc.trim() || loading ? 0.5 : 1,
              fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}
          >
            {loading ? '···' : steps !== null ? 'update' : 'go'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MICROS ────────────────────────────────────────────────────────
function Micros({ consumed, targets, hasData }: {
  consumed: MicroTotals; targets: ReturnType<typeof getMicroTargets>; hasData: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rows = [
    { k: 'fiber_g'        as keyof MicroTotals, label: 'Fiber',   unit: 'g',   limit: false, color: GREEN  },
    { k: 'cholesterol_mg' as keyof MicroTotals, label: 'Chol',    unit: 'mg',  limit: true,  color: YELLOW },
    { k: 'sodium_mg'      as keyof MicroTotals, label: 'Sodium',  unit: 'mg',  limit: true,  color: YELLOW },
    { k: 'vitamin_c_mg'   as keyof MicroTotals, label: 'Vit C',   unit: 'mg',  limit: false, color: BLUE   },
    { k: 'vitamin_d_mcg'  as keyof MicroTotals, label: 'Vit D',   unit: 'mcg', limit: false, color: BLUE   },
    { k: 'calcium_mg'     as keyof MicroTotals, label: 'Ca',      unit: 'mg',  limit: false, color: BLUE   },
    { k: 'iron_mg'        as keyof MicroTotals, label: 'Iron',    unit: 'mg',  limit: false, color: RED    },
  ];
  return (
    <div style={{ padding: '12px 16px 0' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', background: SURF, border: `1px solid ${EDGE}`,
          borderRadius: open ? '14px 14px 0 0' : 14,
          padding: '12px 15px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'inherit', boxShadow: open ? 'none' : CARD_SHADOW,
        }}
      >
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
          MICROS {!hasData && !open && <span style={{ color: GREY, fontWeight: 500, letterSpacing: 0 }}>· log food to track</span>}
        </div>
        <div style={{ color: MUTED, fontSize: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</div>
      </button>

      {open && (
        <div style={{
          background: SURF, border: `1px solid ${EDGE}`, borderTop: 'none',
          borderRadius: '0 0 14px 14px', padding: '12px 15px 14px',
          boxShadow: CARD_SHADOW,
        }}>
          {rows.map(({ k, label, unit, limit, color }) => {
            const val  = Math.round(consumed[k] * 10) / 10;
            const tgt  = targets[k];
            const pct  = tgt > 0 ? Math.min(100, (val / tgt) * 100) : 0;
            const over = val > tgt && tgt > 0;
            const bc   = limit ? (over ? RED : GREEN) : pct >= 80 ? GREEN : pct >= 40 ? BLUE : RED;
            return (
              <div key={k} style={{ marginBottom: 9, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ fontSize: 11, fontWeight: 700, color: TEXT, minWidth: 44 }}>{label}</div>
                <div style={{ flex: 1, height: 3, background: MUTED2, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: bc, borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize: 10, color: bc, fontWeight: 700, minWidth: 70, textAlign: 'right' }}>
                  {val}{unit}<span style={{ color: MUTED, fontWeight: 400 }}>/{tgt}{unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── INSIGHT ───────────────────────────────────────────────────────
const TIPS: Record<string, string[]> = {
  rest:     ['Rest is when you grow. Keep protein high, sleep hard.', 'Active recovery beats the couch — light walk or stretch.', 'Meal prep on rest days sets up the whole week.'],
  strength: ['30g protein within 30min of session. Don\'t skip it.', 'Beat last week by one rep. That\'s all you need.', 'Creatine + carbs post-lift. Actually works.'],
  cardio:   ['Complex carbs 2h before. Not right before.', 'Electrolytes — sodium, potassium, magnesium. All three.', 'Even an easy run moves the needle on heart efficiency.'],
  hybrid:   ['Balanced macros = balanced recovery. Good call.', 'Hybrid builds both systems at once. Hard but worth it.', 'Keep protein elevated — two types of damage to repair.'],
};

function Insight({ type }: { type?: string }) {
  const tips = TIPS[type ?? 'rest'] ?? TIPS.rest;
  const tip  = tips[Math.floor(Date.now() / 86400000) % tips.length];
  const c    = type === 'strength' ? GREEN : type === 'cardio' ? ORANGE : type === 'hybrid' ? GREY : YELLOW;
  return (
    <div style={{ padding: '10px 16px 0' }}>
      <div style={{
        padding: '13px 15px', borderRadius: 12,
        background: `${c}10`, borderLeft: `3px solid ${c}`,
        border: `1px solid ${c}20`,
      }}>
        <div style={{ fontSize: 12, color: TEXT, lineHeight: 1.6, fontWeight: 700 }}>{tip}</div>
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user } = useAuthStore();
  const name     = (user?.displayName || 'athlete').toUpperCase();
  const profileComplete = !!(user?.weightKg && user?.heightCm && user?.age);
  const activityLevel   = user?.activityLevel ?? 'moderate';

  const { todayLog, targets, weeklyLoad, weather, environmentAlert, logDay, refreshWeather, resetDay, setActivityModifier, profile } = useNutrition();
  const storeSetTargets       = useNutritionStore((s) => s.setTargets);
  const loggedRuns            = useNutritionStore((s) => s.weeklyLoad.loggedRuns ?? []);
  const removeRunKm           = useNutritionStore((s) => s.removeRunKm);
  const renameRun             = useNutritionStore((s) => s.renameRun);
  const resetWeeklyRuns       = useNutritionStore((s) => s.resetWeeklyRuns);
  const addRunKm              = useNutritionStore((s) => s.addRunKm);
  const addStrengthSession    = useNutritionStore((s) => s.addStrengthSession);
  const removeStrengthSession = useNutritionStore((s) => s.removeStrengthSession);
  const startNewWeek          = useNutritionStore((s) => s.startNewWeek);

  const [consumed,       setConsumed]       = useState<MacroTargets>(emptyMacros());
  const [consumedMicros, setConsumedMicros] = useState<MicroTotals>(emptyMicros());
  const [showRunForm,    setShowRunForm]    = useState(false);
  const [runKm,          setRunKm]          = useState('');
  const [runDur,         setRunDur]         = useState('');
  const [runName,        setRunName]        = useState('');
  const [editIdx,        setEditIdx]        = useState<number | null>(null);
  const [editName,       setEditName]       = useState('');

  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '').toUpperCase();

  useEffect(() => {
    const monday = getThisMonday();
    if (weeklyLoad.weekStart !== monday) startNewWeek(monday);
  }, []);// eslint-disable-line

  useEffect(() => {
    getLogs(today)
      .then((l) => { setConsumed(sumLogs(l)); setConsumedMicros(sumMicros(l)); })
      .catch(() => {});
  }, [today]);

  useEffect(() => { refreshWeather().catch(() => {}); }, []);// eslint-disable-line

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type);
    if (r.blocked && !window.confirm(
      'Heavy run load this week. Cardio today risks injury.\n\nLog anyway?'
    )) return;
    if (r.blocked) logDay(type, undefined, undefined, true);
  };

  const customTargets = getCustomTargets();
  const goalMode = (() => {
    try { return (localStorage.getItem('fs_goal_mode_v1') ?? 'maintain') as 'lose' | 'maintain' | 'gain'; }
    catch { return 'maintain' as const; }
  })();
  const goalAdj: Record<'lose' | 'maintain' | 'gain', number> = { lose: -500, maintain: 0, gain: 300 };
  const effectiveTargets = customTargets.enabled && targets
    ? { ...targets, calories: customTargets.calories, proteinG: customTargets.proteinG, carbsG: customTargets.carbsG, fatG: customTargets.fatG }
    : targets
      ? { ...targets, calories: Math.max(1200, targets.calories + goalAdj[goalMode]) }
      : targets;

  const strength = weeklyLoad.totalStrengthSets ?? 0;
  const recovery = buildRecovery(loggedRuns, strength, activityLevel);
  const manualKm = loggedRuns.filter(r => r.source === 'manual').reduce((s, r) => s + r.km, 0);
  const stravaKm = loggedRuns.filter(r => r.source === 'strava').reduce((s, r) => s + r.km, 0);
  const hasMicros = Object.values(consumedMicros).some(v => v > 0);

  const weatherRec = (() => {
    if (!weather || !todayLog?.trainingType || todayLog.trainingType === 'rest') return null;
    const t = weather.tempC, d = weather.description.toLowerCase();
    if (t > 38 || t < -5 || d.includes('storm')) return { text: 'Extreme conditions — stay inside', color: RED };
    if (t > 32 || d.includes('rain')) return { text: 'Tough outdoor conditions today', color: '#F97316' };
    return { text: 'Good conditions', color: GREEN };
  })();

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG }}>

      {/* ── HEADER ── */}
      <div style={{
        padding: '30px 16px 12px',
        background: `linear-gradient(180deg, #1A1A1A 0%, ${BG} 100%)`,
        borderBottom: `1px solid ${EDGE}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontSize: 42, fontWeight: 900, letterSpacing: -2, lineHeight: 1, color: ORANGE,
            }}>
              {name}
            </div>
            {weather && (
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginTop: 5 }}>
                {Math.round(weather.tempC)}° · {weather.description}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', paddingTop: 3 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: MUTED }}>{dateLabel}</div>
            {recovery.label && (
              <div style={{
                marginTop: 6, display: 'inline-block',
                background: `${ORANGE}20`, borderRadius: 20,
                padding: '3px 10px',
                fontSize: 10, fontWeight: 800,
                color: ORANGE, letterSpacing: 0.5,
              }}>
                {recovery.label} · {recovery.score}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PROFILE ALERT ── */}
      {!profileComplete && (
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{
            background: `${BLUE}0F`, border: `1px solid ${BLUE}25`,
            borderLeft: `3px solid ${BLUE}`, borderRadius: 12,
            padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1, fontSize: 12, color: TEXT, fontWeight: 700 }}>
              Set up your profile to unlock macro targets
            </div>
            <div style={{ color: BLUE, fontWeight: 900, fontSize: 16 }}>→</div>
          </div>
        </div>
      )}

      {/* ── WEATHER BANNER ── */}
      {environmentAlert && environmentAlert.level !== 'none' && weather && (
        <div style={{ padding: '12px 16px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert} />
        </div>
      )}

      {/* ── TODAY'S PLAN ── */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
            {todayLog ? `TODAY — ${todayLog.trainingType === 'strength' ? 'LIFT' : todayLog.trainingType?.toUpperCase()}` : "TODAY'S PLAN"}
          </div>
          {todayLog && (
            <button
              onClick={() => { if (window.confirm('Reset today?')) resetDay(); }}
              style={{
                background: 'none', border: 'none', color: MUTED,
                fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
              }}
            >
              RESET
            </button>
          )}
        </div>

        {!todayLog && !profileComplete && (
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>
            complete profile first, or pick a type to log calories only
          </div>
        )}

        <TrainingPicker selected={todayLog?.trainingType ?? null} onSelect={handleSelectType} />
      </div>

      {/* ── CALORIES ── */}
      <CalRing
        cal={consumed.calories}
        target={effectiveTargets?.calories ?? 0}
      />

      {!effectiveTargets && profileComplete && (
        <div style={{ padding: '10px 16px 0' }}>
          <div style={{ fontSize: 12, color: MUTED }}>pick a training type above to unlock targets</div>
        </div>
      )}

      {/* ── MACROS ── */}
      {effectiveTargets ? (
        <MacroGrid consumed={consumed} targets={effectiveTargets} />
      ) : consumed.calories > 0 ? (
        <MacroGrid consumed={consumed} targets={null} />
      ) : null}

      {/* Weather rec */}
      {weatherRec && (
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: weatherRec.color,
            padding: '9px 13px', background: `${weatherRec.color}0F`,
            border: `1px solid ${weatherRec.color}25`, borderRadius: 10,
          }}>
            {weatherRec.text}
          </div>
        </div>
      )}

      {/* ── INSIGHT ── */}
      {todayLog?.trainingType && <Insight type={todayLog.trainingType} />}

      {/* ── WATER ── */}
      <Water date={today} />

      {/* ── STEPS ── */}
      <Steps todayLog={todayLog} profile={profile} weeklyLoad={weeklyLoad} />

      {/* ── THIS WEEK ── */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>
          THIS WEEK
        </div>
        <div style={{
          background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`,
          boxShadow: CARD_SHADOW,
          display: 'grid', gridTemplateColumns: '1fr 1fr',
        }}>
          {/* Running */}
          <div style={{
            padding: '16px 16px', borderRight: `1px solid ${EDGE}`,
            borderBottom: loggedRuns.length > 0 ? `1px solid ${EDGE}` : undefined,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>
              RUNS
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontSize: 36, fontWeight: 900, letterSpacing: -2, lineHeight: 1,
              color: weeklyLoad.totalRunKm > 0 ? GREEN : MUTED2,
            }}>
              {weeklyLoad.totalRunKm.toFixed(1)}
            </div>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, marginTop: 2 }}>km total</div>
            {(manualKm > 0 || stravaKm > 0) && (
              <div style={{ fontSize: 9, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>
                {manualKm > 0 && <span>{manualKm.toFixed(1)} manual</span>}
                {manualKm > 0 && stravaKm > 0 && ' · '}
                {stravaKm > 0 && <span style={{ color: '#FC4C02' }}>{stravaKm.toFixed(1)} strava</span>}
              </div>
            )}
          </div>

          {/* Strength */}
          <div style={{ padding: '16px 16px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>
              SESSIONS
            </div>
            <div style={{
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
              fontSize: 36, fontWeight: 900, letterSpacing: -2, lineHeight: 1,
              color: strength > 0 ? BLUE : MUTED2,
            }}>
              {strength}
            </div>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, marginTop: 2 }}>strength</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {strength > 0 && (
                <button onClick={() => removeStrengthSession()} className="press" style={{
                  width: 28, height: 28, borderRadius: 8, border: `1px solid ${EDGE}`,
                  background: SURF2, color: MUTED, fontWeight: 900, fontSize: 14,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>−</button>
              )}
              <button onClick={() => addStrengthSession()} className="press" style={{
                flex: 1, height: 28, borderRadius: 8, border: `1px solid ${BLUE}30`,
                background: `${BLUE}10`, color: BLUE,
                fontWeight: 700, fontSize: 10, cursor: 'pointer',
              }}>
                + LOG
              </button>
            </div>
          </div>

          {/* Logged runs list */}
          {loggedRuns.length > 0 && (
            <div style={{
              gridColumn: '1 / -1',
              borderTop: `1px solid ${EDGE}`, padding: '10px 16px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase' }}>
                  RUNS LOG
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { if (window.confirm('Clear all runs?')) resetWeeklyRuns(); }}
                    style={{ background: 'none', border: 'none', color: MUTED, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}
                  >
                    CLEAR
                  </button>
                  <button
                    onClick={() => setShowRunForm(!showRunForm)}
                    className="press"
                    style={{
                      background: `${GREEN}15`, border: `1px solid ${GREEN}30`, color: GREEN,
                      borderRadius: 20, fontWeight: 700, fontSize: 10, cursor: 'pointer', padding: '3px 11px',
                    }}
                  >
                    + LOG
                  </button>
                </div>
              </div>

              {loggedRuns.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 0',
                  borderTop: i > 0 ? `1px solid ${MUTED2}` : 'none',
                }}>
                  <div style={{ width: 3, height: 3, borderRadius: '50%', background: r.source === 'strava' ? '#FC4C02' : GREEN, flexShrink: 0 }} />
                  {editIdx === i ? (
                    <input autoFocus value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => { if (editName.trim()) renameRun(i, editName.trim()); setEditIdx(null); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { if (editName.trim()) renameRun(i, editName.trim()); setEditIdx(null); }
                        if (e.key === 'Escape') setEditIdx(null);
                      }}
                      style={{
                        flex: 1, fontSize: 12, fontWeight: 700, color: TEXT,
                        background: 'transparent', border: 'none',
                        borderBottom: `1px solid ${GREEN}`, outline: 'none', padding: '1px 0',
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => { setEditIdx(i); setEditName(r.name); }}
                      style={{ flex: 1, fontSize: 12, color: TEXT, fontWeight: 700, cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {r.name}
                    </div>
                  )}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{
                      fontFamily: "'Barlow Condensed', system-ui, sans-serif",
                      fontSize: 16, fontWeight: 900, color: r.source === 'strava' ? '#FC4C02' : GREEN, letterSpacing: -0.5,
                    }}>
                      {r.km}km
                    </span>
                    {r.paceMinPerKm && (
                      <span style={{ fontSize: 9, color: MUTED, fontWeight: 600, marginLeft: 5 }}>{fmtPace(r.paceMinPerKm)}</span>
                    )}
                  </div>
                  <button onClick={() => removeRunKm(r.km, r.name)} style={{
                    background: 'none', border: 'none', color: MUTED, fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1,
                  }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* No runs prompt */}
        {loggedRuns.length === 0 && !showRunForm && (
          <button onClick={() => setShowRunForm(true)} className="press" style={{
            width: '100%', marginTop: 8, padding: '14px 0',
            background: `${GREEN}12`, border: `1.5px dashed ${GREEN}50`, borderRadius: 12,
            color: GREEN, fontWeight: 900, fontSize: 13, cursor: 'pointer', letterSpacing: 0.5,
          }}>
            + LOG YOUR FIRST RUN
          </button>
        )}

        {/* Run log form */}
        {showRunForm && (
          <div style={{
            background: SURF, borderRadius: 14, padding: '14px 14px 14px',
            border: `1px solid ${EDGE}`, marginTop: 8, boxShadow: CARD_SHADOW,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: TEXT, textTransform: 'uppercase' }}>
                LOG A RUN
              </div>
              <button
                onClick={() => { setShowRunForm(false); setRunKm(''); setRunDur(''); setRunName(''); }}
                style={{ background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 8, color: MUTED, fontSize: 16, cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
              >×</button>
            </div>
            <input type="text" value={runName} placeholder="Run name (optional)"
              onChange={(e) => setRunName(e.target.value)}
              style={{ width: '100%', background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, fontWeight: 700, padding: '11px 13px', outline: 'none', marginBottom: 8, boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="number" value={runKm} placeholder="Distance (km)" min={0}
                onChange={(e) => { if (e.target.value === '' || +e.target.value >= 0) setRunKm(e.target.value); }}
                style={{ flex: 1, background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, fontWeight: 700, padding: '11px 13px', outline: 'none', fontFamily: 'inherit' }}
              />
              <input type="number" value={runDur} placeholder="Time (min)" min={0}
                onChange={(e) => { if (e.target.value === '' || +e.target.value >= 0) setRunDur(e.target.value); }}
                style={{ flex: 1, background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, fontWeight: 700, padding: '11px 13px', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
            {runKm && runDur && +runKm > 0 && +runDur > 0 && (
              <div style={{ fontSize: 13, color: BLUE, fontWeight: 900, marginBottom: 10, textAlign: 'center' }}>
                {fmtPace(+runDur / +runKm)} avg pace
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowRunForm(false); setRunKm(''); setRunDur(''); setRunName(''); }}
                className="press" style={{
                  flex: 1, background: SURF2, border: `1px solid ${EDGE}`, borderRadius: 10, color: MUTED,
                  fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: '13px 0', fontFamily: 'inherit',
                }}>
                CANCEL
              </button>
              <button onClick={() => {
                const km = +runKm; if (!km || km <= 0) return;
                const dur = +runDur || 0;
                addRunKm(km, runName.trim() || 'Run', 'manual', dur || undefined, dur ? dur / km : undefined);
                setRunKm(''); setRunDur(''); setRunName(''); setShowRunForm(false);
              }} className="press" style={{
                flex: 2, background: GREEN, border: 'none', borderRadius: 10, color: '#fff',
                fontWeight: 900, fontSize: 14, cursor: 'pointer', padding: '13px 0', fontFamily: 'inherit',
                opacity: !runKm || +runKm <= 0 ? 0.5 : 1,
              }}>
                SAVE RUN
              </button>
            </div>
          </div>
        )}

        {loggedRuns.length > 0 && !showRunForm && (
          <button onClick={() => setShowRunForm(true)} className="press" style={{
            width: '100%', marginTop: 8, padding: '10px 0',
            background: `${GREEN}10`, border: `1px solid ${GREEN}25`, borderRadius: 10,
            color: GREEN, fontWeight: 900, fontSize: 12, cursor: 'pointer', letterSpacing: 0.5,
          }}>
            + ADD RUN
          </button>
        )}
      </div>

      {/* ── MICROS ── */}
      <Micros consumed={consumedMicros} targets={getMicroTargets(user?.gender ?? 'male')} hasData={hasMicros} />

      {/* ── STRAVA ── */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: 12 }}>
          STRAVA
        </div>
        <StravaCard />
      </div>

      <div style={{ height: 36 }} />
    </div>
  );
}
