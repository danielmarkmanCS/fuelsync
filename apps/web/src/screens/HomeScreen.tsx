import { useState, useEffect } from 'react';
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

const BG     = '#EEF4FF';
const SURF   = '#FFFFFF';
const SURF2  = '#E4EEFF';
const EDGE   = 'rgba(0,56,168,0.10)';
const TEXT   = '#0A1628';
const MUTED  = '#6878A0';
const BLUE   = '#0038A8';
const GREEN  = '#00A651';
const ORANGE = '#E65100';
const PURPLE = '#7B1FA2';
const CYAN   = '#0288D1';
const YELLOW = '#F9A825';
const RED    = '#C62828';

// Load multiplier by activity level — higher = more load capacity before fatigue
const ACTIVITY_MULT: Record<string, number> = {
  sedentary:    0.4,
  light:        0.65,
  moderate:     1.0,
  very_active:  1.7,
  extra_active: 2.4,
};

function getThisMonday(): string {
  const d   = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  return m.toISOString().split('T')[0];
}

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

function sumLogs(logs: FoodLog[]): MacroTargets {
  return logs.reduce<MacroTargets>((acc, l) => ({
    calories: acc.calories + parseFloat(l.calories as unknown as string),
    proteinG: acc.proteinG + parseFloat(l.protein  as unknown as string),
    carbsG:   acc.carbsG   + parseFloat(l.carbs    as unknown as string),
    fatG:     acc.fatG     + parseFloat(l.fat       as unknown as string),
  }), emptyMacros());
}

// Pace factor: fast runs cost more recovery, slow runs cost less
function paceMultiplier(paceMinPerKm?: number): number {
  if (paceMinPerKm == null) return 1.0;
  if (paceMinPerKm < 4.5)  return 1.5;  // sprint / interval
  if (paceMinPerKm < 5.5)  return 1.25; // fast
  if (paceMinPerKm < 7.0)  return 1.0;  // moderate
  return 0.75;                           // easy / recovery jog
}

function fmtPace(p: number): string {
  const m = Math.floor(p);
  const s = String(Math.round((p % 1) * 60)).padStart(2, '0');
  return `${m}:${s}/km`;
}

function buildRecovery(loggedRuns: LoggedRun[], strengthSessions: number, activityLevel = 'moderate') {
  const mult = ACTIVITY_MULT[activityLevel] ?? 1.0;

  // Each km costs 1.5 load × pace multiplier — linear, no arbitrary thresholds
  const runLoad = loggedRuns.reduce((total, r) => total + r.km * 1.5 * paceMultiplier(r.paceMinPerKm), 0);
  // Each strength session costs 15 load — no artificial cap
  const strLoad = strengthSessions * 15;
  const score   = Math.max(5, Math.round(100 - Math.min(100, (runLoad + strLoad) / mult)));

  const totalKm = loggedRuns.reduce((s, r) => s + r.km, 0);
  const runs    = loggedRuns.length;
  const parts: string[] = [];
  if (runs > 0)             parts.push(`${runs} run${runs > 1 ? 's' : ''} · ${totalKm.toFixed(1)} km`);
  if (strengthSessions > 0) parts.push(`${strengthSessions} strength`);
  const sub = parts.length ? parts.join(' · ') : 'No training this week';

  if (score >= 90) return { label: 'FRESH',      color: CYAN,   sub, score };
  if (score >= 65) return { label: 'ACTIVE',     color: GREEN,  sub, score };
  if (score >= 40) return { label: 'BUILDING',   color: YELLOW, sub, score };
  if (score >= 20) return { label: 'LOADED',     color: ORANGE, sub, score };
  return             { label: 'OVERLOADED', color: RED,    sub, score };
}

function CalRing({ pct, cal, target }: { pct: number; cal: number; target: number }) {
  const S = 188, W = 10, r = (S - W * 2) / 2;
  const circ = 2 * Math.PI * r;
  const arc  = Math.min(pct / 100, 1) * circ;
  const over = pct >= 100;
  const color = over ? RED : BLUE;
  return (
    <div style={{ position: 'relative', width: S, height: S }}>
      <svg width={S} height={S} style={{ position: 'absolute', top: 0, left: 0 }}>
        <circle cx={S/2} cy={S/2} r={r} fill="none" stroke="rgba(0,56,168,0.08)" strokeWidth={W} />
        <circle cx={S/2} cy={S/2} r={r} fill="none"
          stroke={color} strokeWidth={W}
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${S/2} ${S/2})`}
          style={{ transition: 'stroke-dasharray 0.8s ease', filter: `drop-shadow(0 0 8px ${color}55)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: MUTED, marginBottom: 6, textTransform: 'uppercase' }}>Calories</div>
        <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -3, color: over ? RED : TEXT, lineHeight: 1 }}>
          {Math.round(cal).toLocaleString()}
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: MUTED, marginTop: 4, letterSpacing: 1 }}>
          of {Math.round(target).toLocaleString()} kcal
        </div>
        {pct > 0 && (
          <div style={{ fontSize: 11, fontWeight: 800, color: over ? RED : BLUE, marginTop: 6, letterSpacing: 0.5 }}>
            {Math.round(pct)}%
          </div>
        )}
      </div>
    </div>
  );
}

function MacroPill({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct  = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const over = current > target && target > 0;
  const c    = over ? RED : color;
  return (
    <div style={{
      flex: 1, background: SURF, borderRadius: 16, padding: '14px 12px 12px',
      border: `1px solid ${EDGE}`, borderTop: `3px solid ${c}`,
      boxShadow: '0 2px 12px rgba(0,56,168,0.06)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: c, marginBottom: 8, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1.5, color: TEXT, lineHeight: 1 }}>
        {Math.round(current)}<span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>g</span>
      </div>
      <div style={{ margin: '10px 0 6px', height: 3, background: 'rgba(0,56,168,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: c, borderRadius: 2, transition: 'width 0.7s ease' }} />
      </div>
      <div style={{ fontSize: 9, color: MUTED, fontWeight: 600 }}>{Math.round(target)}g</div>
    </div>
  );
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const name = user?.displayName || 'Athlete';
  const profileComplete = !!(user?.weightKg && user?.heightCm && user?.age);
  const activityLevel = user?.activityLevel ?? 'moderate';

  const weatherKeySet = !!(import.meta.env.VITE_OPENWEATHER_KEY);
  const { todayLog, targets, weeklyLoad, weather, environmentAlert, logDay, refreshWeather, resetDay, setActivityModifier, profile } = useNutrition();
  const storeSetTargets       = useNutritionStore((s) => s.setTargets);
  const storeSetModifier      = useNutritionStore((s) => s.setActivityModifier);
  const loggedRuns            = useNutritionStore((s) => s.weeklyLoad.loggedRuns ?? []);
  const removeRunKm           = useNutritionStore((s) => s.removeRunKm);
  const renameRun             = useNutritionStore((s) => s.renameRun);
  const resetWeeklyRuns       = useNutritionStore((s) => s.resetWeeklyRuns);
  const addRunKm              = useNutritionStore((s) => s.addRunKm);
  const addStrengthSession    = useNutritionStore((s) => s.addStrengthSession);
  const removeStrengthSession = useNutritionStore((s) => s.removeStrengthSession);
  const startNewWeek          = useNutritionStore((s) => s.startNewWeek);

  const [consumed,        setConsumed]        = useState<MacroTargets>(emptyMacros());
  const [stepDescription, setStepDescription] = useState('');
  const [stepEstimate,    setStepEstimate]    = useState<number | null>(null);
  const [stepLoading,     setStepLoading]     = useState(false);

  const STEPS_KEY = `fs_steps_${new Date().toISOString().slice(0, 10)}`;
  const [workoutKm,       setWorkoutKm]       = useState('');
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [workoutName,     setWorkoutName]     = useState('');
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [editingRunIdx,   setEditingRunIdx]   = useState<number | null>(null);
  const [editingRunName,  setEditingRunName]  = useState('');

  const today    = new Date().toISOString().split('T')[0];
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'EVENING';

  // Auto-reset weekly load every Monday
  useEffect(() => {
    const monday = getThisMonday();
    if (weeklyLoad.weekStart !== monday) startNewWeek(monday);
  }, []);

  useEffect(() => { getLogs(today).then((l) => setConsumed(sumLogs(l))).catch(() => {}); }, [today]);
  useEffect(() => { refreshWeather().catch(() => {}); }, []);

  // Persist steps across tab switches
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STEPS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.description) setStepDescription(saved.description);
        if (saved.estimate != null) {
          setStepEstimate(saved.estimate);
          applyStepModifier(saved.estimate < 6000 ? 'low' : saved.estimate > 10000 ? 'high' : 'normal');
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STEPS_KEY, JSON.stringify({ description: stepDescription, estimate: stepEstimate }));
    } catch { /* ignore */ }
  }, [stepDescription, stepEstimate, STEPS_KEY]);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type);
    if (r.blocked && !window.confirm(
      `Your legs are heavily loaded from this week's runs.\n\nRunning today risks injury — consider switching to upper-body strength instead.\n\nLog cardio anyway?`
    )) return;
    if (r.blocked) logDay(type);
  };

  const calPct   = targets && targets.calories > 0 ? (consumed.calories / targets.calories) * 100 : 0;
  const calLeft  = targets ? Math.round(targets.calories - consumed.calories) : 0;
  const strength = weeklyLoad.totalStrengthSets ?? 0;
  const recovery = buildRecovery(loggedRuns, strength, activityLevel);

  const manualKm = loggedRuns.filter((r) => r.source === 'manual').reduce((s, r) => s + r.km, 0);
  const stravaKm = loggedRuns.filter((r) => r.source === 'strava').reduce((s, r) => s + r.km, 0);

  const stepLabel = stepEstimate !== null
    ? stepEstimate < 6000 ? 'LOW' : stepEstimate < 10000 ? 'NORMAL' : 'HIGH'
    : todayLog?.dailyActivityModifier === 'low' ? 'LOW'
    : todayLog?.dailyActivityModifier === 'high' ? 'HIGH'
    : null;
  const stepLabelColor = stepLabel === 'LOW' ? ORANGE : stepLabel === 'HIGH' ? GREEN : BLUE;

  const applyStepModifier = (modifier: 'low' | 'normal' | 'high') => {
    storeSetModifier(modifier);
    if (profile && todayLog) {
      const updated = { ...todayLog, dailyActivityModifier: modifier };
      const breakdown = computeMacros(profile, updated, weeklyLoad);
      storeSetTargets(breakdown.targets);
    }
  };

  const handleEstimateSteps = async () => {
    const q = stepDescription.trim();
    if (!q || stepLoading) return;
    setStepLoading(true);
    try {
      const r = await estimateSteps(q);
      setStepEstimate(r.steps);
      applyStepModifier(r.label === 'high' ? 'high' : r.label === 'low' ? 'low' : 'normal');
    } catch { /* silent */ }
    setStepLoading(false);
  };

  const weatherRec = (() => {
    if (!weather || !todayLog?.trainingType || todayLog.trainingType === 'rest') return null;
    const temp    = weather.tempC;
    const desc    = weather.description.toLowerCase();
    const isStorm   = desc.includes('storm') || desc.includes('thunder');
    const isExtreme = temp > 38 || temp < -5 || isStorm;
    const isHot     = temp > 32;
    const isRainy   = desc.includes('rain') || desc.includes('drizzle');
    const isCardio  = todayLog.trainingType === 'cardio' || todayLog.trainingType === 'hybrid';
    if (isExtreme) return { text: 'Extreme conditions — strength training or rest recommended', color: RED };
    if (isCardio && (isHot || isRainy)) return { text: 'Tough outdoor conditions — indoor cardio recommended', color: ORANGE };
    if (isCardio) return { text: 'Good conditions for outdoor cardio', color: GREEN };
    return null;
  })();

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG }}>

      {/* ── HEADER ── */}
      <div style={{
        background: `linear-gradient(135deg, ${BLUE} 0%, #1565E0 100%)`,
        padding: '44px 22px 28px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
        <div className="nrc-a nrc-a1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.6)', marginBottom: 4, textTransform: 'uppercase' }}>Good {greeting}</div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -2, lineHeight: 1, color: '#FFFFFF' }}>{name.toUpperCase()}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>
              {new Date().toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1.5, color: '#FFFFFF', lineHeight: 1 }}>{new Date().getDate()}</div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* ── PROFILE ALERT ── */}
      {!profileComplete && (
        <div className="nrc-a nrc-a2" style={{ padding: '16px 22px 0' }}>
          <div style={{
            background: '#FFF3E0', borderRadius: 14, padding: '14px 18px',
            border: '1px solid rgba(230,81,0,0.2)', borderLeft: `3px solid ${ORANGE}`,
          }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 3 }}>Complete Your Profile</div>
            <div style={{ fontSize: 12, color: MUTED }}>Unlock personalised macro targets</div>
          </div>
        </div>
      )}

      {/* Extreme weather banner */}
      {environmentAlert && environmentAlert.level !== 'none' && weather && (
        <div style={{ padding: '12px 22px 0' }}>
          <WeatherBanner weather={weather} alert={environmentAlert} />
        </div>
      )}

      {/* ── STEPS ── */}
      {todayLog && (
        <div style={{ padding: '12px 22px 0' }}>
          <div style={{ background: SURF, borderRadius: 14, padding: '14px 16px', border: `1px solid ${EDGE}`, boxShadow: '0 1px 6px rgba(0,56,168,0.05)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: MUTED, textTransform: 'uppercase', marginBottom: stepEstimate !== null ? 10 : 8 }}>Daily Activity</div>

            {/* Result banner */}
            {stepEstimate !== null && (
              <div style={{
                background: `${stepLabelColor}0D`, border: `1px solid ${stepLabelColor}35`,
                borderRadius: 10, padding: '10px 14px', marginBottom: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                    <input
                      type="number"
                      value={stepEstimate}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v) && v >= 0) {
                          setStepEstimate(v);
                          applyStepModifier(v < 6000 ? 'low' : v > 10000 ? 'high' : 'normal');
                        }
                      }}
                      style={{
                        width: 90, background: 'transparent', border: 'none', outline: 'none',
                        color: stepLabelColor, fontSize: 24, fontWeight: 900, letterSpacing: -1,
                        fontFamily: 'Inter, system-ui, sans-serif', padding: 0,
                      }}
                    />
                    <span style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>steps</span>
                  </div>
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                    {stepLabel === 'LOW' ? '−13% calorie target today' : stepLabel === 'HIGH' ? '+8% calorie target today' : 'Normal calorie target'}
                  </div>
                </div>
                <div style={{
                  padding: '5px 12px', borderRadius: 20,
                  background: `${stepLabelColor}20`, color: stepLabelColor,
                  fontSize: 10, fontWeight: 800, letterSpacing: 1,
                }}>{stepLabel}</div>
              </div>
            )}

            {/* Describe day input */}
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="Desk job, 30min walk, gym session..."
                value={stepDescription}
                onChange={(e) => setStepDescription(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEstimateSteps(); }}
                style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: `1px solid ${EDGE}`, background: SURF2, color: TEXT, fontSize: 12, outline: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
              />
              <button
                onClick={handleEstimateSteps}
                disabled={stepLoading || !stepDescription.trim()}
                style={{
                  background: BLUE, border: 'none', borderRadius: 10, color: '#fff',
                  fontWeight: 800, fontSize: 11, letterSpacing: 0.5,
                  cursor: (!stepDescription.trim() || stepLoading) ? 'not-allowed' : 'pointer',
                  padding: '0 14px', whiteSpace: 'nowrap',
                  opacity: (!stepDescription.trim() || stepLoading) ? 0.5 : 1,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >{stepLoading ? '···' : stepEstimate !== null ? 'Update' : 'Estimate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CALORIE RING ── */}
      {targets ? (
        <div className="nrc-a nrc-a2" style={{ padding: '24px 22px 0', display: 'flex', justifyContent: 'center' }}>
          <div>
            {weatherRec && (
              <div style={{
                background: `${weatherRec.color}0E`, border: `1px solid ${weatherRec.color}30`,
                borderRadius: '14px 14px 0 0', padding: '8px 16px', borderBottom: 'none',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: weatherRec.color, lineHeight: 1.4 }}>{weatherRec.text}</div>
              </div>
            )}
            <div style={{ background: SURF, borderRadius: weatherRec ? '0 0 24px 24px' : 24, padding: '20px', boxShadow: '0 4px 24px rgba(0,56,168,0.10)', border: `1px solid ${EDGE}`, borderTop: weatherRec ? 'none' : undefined }}>
              <CalRing pct={calPct} cal={consumed.calories} target={targets.calories} />
              {weather && (
                <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: 0.2 }}>
                  {Math.round(weather.tempC)}°C · {weather.description}
                </div>
              )}
            </div>
            {calLeft !== 0 && (
              <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, fontWeight: 700, color: calLeft > 0 ? MUTED : RED }}>
                {calLeft > 0 ? `${calLeft.toLocaleString()} kcal remaining` : `${Math.abs(calLeft)} kcal over target`}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="nrc-a nrc-a2" style={{ padding: '24px 22px 0' }}>
          <div style={{ background: SURF, borderRadius: 20, padding: '28px 22px', border: `1px solid ${EDGE}`, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,56,168,0.06)' }}>
            <div style={{ fontSize: 80, fontWeight: 900, letterSpacing: -4, color: TEXT, lineHeight: 1 }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 3, marginTop: 8 }}>CALORIES TODAY</div>
            {profileComplete && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: `${BLUE}08`, borderRadius: 12, border: `1px solid ${BLUE}18` }}>
                <div style={{ fontSize: 12, color: BLUE, fontWeight: 700 }}>Pick a training mode below</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>to unlock your personalised macro targets</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MACRO ROW ── */}
      {targets && (
        <div className="nrc-a nrc-a3" style={{ padding: '14px 22px 0', display: 'flex', gap: 10 }}>
          <MacroPill label="Protein" current={consumed.proteinG} target={targets.proteinG} color={GREEN} />
          <MacroPill label="Carbs"   current={consumed.carbsG}   target={targets.carbsG}   color={ORANGE} />
          <MacroPill label="Fat"     current={consumed.fatG}     target={targets.fatG}     color={PURPLE} />
        </div>
      )}

      {/* ── RECOVERY BANNER ── */}
      {targets && (
        <div className="nrc-a nrc-a3" style={{ padding: '10px 22px 0' }}>
          <div style={{
            background: SURF, borderRadius: 16, padding: '16px 18px',
            border: `1px solid ${EDGE}`, borderLeft: `4px solid ${recovery.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 2px 12px rgba(0,56,168,0.06)',
          }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, marginBottom: 4, textTransform: 'uppercase' }}>Recovery</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: recovery.color }}>{recovery.label}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontWeight: 500 }}>{recovery.sub}</div>
            </div>
            <div style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${recovery.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${recovery.color}10` }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: recovery.color }}>{recovery.score}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAINING MODE ── */}
      <div className="nrc-a nrc-a4" style={{ padding: '24px 22px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>
            {todayLog ? 'Training Mode' : 'Select Mode'}
          </div>
          {todayLog && (
            <button onClick={() => { if (window.confirm('Reset today?')) resetDay(); }} style={{
              background: 'none', border: 'none', color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            }}>RESET</button>
          )}
        </div>
        <TrainingPicker selected={todayLog?.trainingType ?? null} onSelect={handleSelectType} />
      </div>

      {/* ── WEEKLY LOAD TABLE ── */}
      <div className="nrc-a nrc-a5" style={{ padding: '16px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 8 }}>Weekly Load</div>
        <div style={{ background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,56,168,0.05)' }}>

          {/* Runs row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${EDGE}` }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, marginRight: 12, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Running</div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginTop: 2 }}>
                {manualKm > 0 && <span>{manualKm.toFixed(1)} km manual</span>}
                {manualKm > 0 && stravaKm > 0 && <span style={{ margin: '0 4px' }}>·</span>}
                {stravaKm > 0 && <span style={{ color: '#FC4C02' }}>{stravaKm.toFixed(1)} km Strava</span>}
                {manualKm === 0 && stravaKm === 0 && <span>No runs this week</span>}
              </div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: weeklyLoad.totalRunKm > 0 ? GREEN : MUTED, letterSpacing: -0.5 }}>
              {weeklyLoad.totalRunKm.toFixed(1)}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginLeft: 2 }}>KM</span>
            </div>
          </div>

          {/* Strength row */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: PURPLE, marginRight: 12, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT }}>Strength</div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 500, marginTop: 2 }}>
                {strength > 0 ? `${strength} session${strength > 1 ? 's' : ''} this week` : 'No sessions this week'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {strength > 0 && (
                <button onClick={() => removeStrengthSession()} className="nrc-press" style={{
                  width: 26, height: 26, borderRadius: 8, border: `1px solid ${EDGE}`,
                  background: SURF2, color: MUTED, fontWeight: 900, fontSize: 16, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                }}>−</button>
              )}
              <div style={{ fontSize: 16, fontWeight: 900, color: strength > 0 ? PURPLE : MUTED, minWidth: 18, textAlign: 'center' }}>
                {strength}
              </div>
              <button onClick={() => addStrengthSession()} className="nrc-press" style={{
                background: `${PURPLE}14`, border: `1px solid ${PURPLE}35`, color: PURPLE,
                borderRadius: 8, fontWeight: 700, fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                padding: '4px 8px', whiteSpace: 'nowrap',
              }}>+ LOG</button>
            </div>
          </div>

        </div>
      </div>

      {/* ── LOGGED RUNS ── */}
      <div className="nrc-a nrc-a5" style={{ padding: '16px 22px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>Logged Runs</div>
            {weeklyLoad.totalRunKm > 0 && (
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -1, color: GREEN, lineHeight: 1 }}>
                {weeklyLoad.totalRunKm.toFixed(1)}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1, marginLeft: 2 }}>KM</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {loggedRuns.length > 0 && (
              <button onClick={() => { if (window.confirm('Reset all logged runs?')) resetWeeklyRuns(); }}
                style={{ background: 'none', border: `1px solid ${EDGE}`, color: MUTED, borderRadius: 20, fontWeight: 700, fontSize: 10, letterSpacing: 1, cursor: 'pointer', padding: '4px 10px' }}>
                RESET
              </button>
            )}
            <button onClick={() => setShowWorkoutForm(!showWorkoutForm)} className="nrc-press" style={{
              background: `${GREEN}14`, border: `1px solid ${GREEN}35`, color: GREEN,
              borderRadius: 20, fontWeight: 700, fontSize: 10, letterSpacing: 1, cursor: 'pointer', padding: '4px 12px',
            }}>+ LOG</button>
          </div>
        </div>

        {showWorkoutForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            <input type="text" value={workoutName} placeholder="Run name (optional)"
              onChange={(e) => setWorkoutName(e.target.value)}
              style={{ background: SURF, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, padding: '10px 14px', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={workoutKm} placeholder="Distance (km)" min={0}
                onChange={(e) => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setWorkoutKm(v); }}
                style={{ flex: 1, background: SURF, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, padding: '10px 14px', outline: 'none' }}
              />
              <input type="number" value={workoutDuration} placeholder="Duration (min)" min={0}
                onChange={(e) => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setWorkoutDuration(v); }}
                style={{ flex: 1, background: SURF, border: `1px solid ${EDGE}`, borderRadius: 10, color: TEXT, fontSize: 14, padding: '10px 14px', outline: 'none' }}
              />
            </div>
            {workoutKm && workoutDuration && parseFloat(workoutKm) > 0 && parseFloat(workoutDuration) > 0 && (
              <div style={{ fontSize: 11, color: BLUE, fontWeight: 700, padding: '0 2px' }}>
                Pace: {fmtPace(parseFloat(workoutDuration) / parseFloat(workoutKm))}
              </div>
            )}
            <button onClick={() => {
              const km  = parseFloat(workoutKm);
              const dur = parseFloat(workoutDuration);
              if (!km || km <= 0) return;
              const durationMin   = dur > 0 ? dur : undefined;
              const paceMinPerKm  = durationMin ? durationMin / km : undefined;
              addRunKm(km, workoutName.trim() || 'Run', 'manual', durationMin, paceMinPerKm);
              setWorkoutKm(''); setWorkoutDuration(''); setWorkoutName(''); setShowWorkoutForm(false);
            }} className="nrc-press" style={{
              background: GREEN, border: 'none', borderRadius: 10, color: '#fff',
              fontWeight: 900, fontSize: 13, cursor: 'pointer', padding: '12px 0',
            }}>DONE</button>
          </div>
        )}

        <div style={{ background: SURF, borderRadius: 14, border: `1px solid ${EDGE}`, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,56,168,0.05)' }}>
          {loggedRuns.length === 0 ? (
            <div style={{ padding: '18px 14px', textAlign: 'center', color: MUTED, fontSize: 12, fontWeight: 600 }}>
              No runs logged this week
            </div>
          ) : loggedRuns.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderTop: i === 0 ? 'none' : `1px solid ${EDGE}`, gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: r.source === 'strava' ? '#FC4C02' : GREEN }} />
              {editingRunIdx === i ? (
                <input autoFocus value={editingRunName}
                  onChange={(e) => setEditingRunName(e.target.value)}
                  onBlur={() => { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); }
                    if (e.key === 'Escape') setEditingRunIdx(null);
                  }}
                  style={{ flex: 1, fontSize: 12, fontWeight: 600, color: TEXT, border: 'none', borderBottom: `1px solid ${GREEN}`, outline: 'none', background: 'transparent', padding: '1px 0' }}
                />
              ) : (
                <div onClick={() => { setEditingRunIdx(i); setEditingRunName(r.name); }}
                  style={{ flex: 1, fontSize: 12, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  title="Tap to rename">{r.name}</div>
              )}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: r.source === 'strava' ? '#FC4C02' : GREEN, letterSpacing: -0.5 }}>
                  {r.km}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginLeft: 2 }}>KM</span>
                </div>
                {r.paceMinPerKm && (
                  <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginTop: 1 }}>{fmtPace(r.paceMinPerKm)}</div>
                )}
              </div>
              <button onClick={() => removeRunKm(r.km, r.name)} style={{
                background: 'none', border: 'none', color: MUTED, fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0,
              }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── RUNNING (STRAVA) ── */}
      <div className="nrc-a nrc-a6" style={{ padding: '20px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>Running</div>
        <StravaCard />
      </div>


      <div style={{ height: 36 }} />
    </div>
  );
}
