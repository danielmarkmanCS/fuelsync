import { useState, useEffect } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import { useNutritionStore } from '../store/nutritionStore';
import TrainingPicker from '../components/TrainingPicker';
import WeatherBanner from '../components/WeatherBanner';
import { getLogs } from '../api/localFood';
import StravaCard from '../components/StravaCard';
import type { FoodLog } from '../api/localFood';
import type { MacroTargets, TrainingType } from '@shared/types';

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

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

function sumLogs(logs: FoodLog[]): MacroTargets {
  return logs.reduce<MacroTargets>((acc, l) => ({
    calories: acc.calories + parseFloat(l.calories as unknown as string),
    proteinG: acc.proteinG + parseFloat(l.protein  as unknown as string),
    carbsG:   acc.carbsG   + parseFloat(l.carbs    as unknown as string),
    fatG:     acc.fatG     + parseFloat(l.fat       as unknown as string),
  }), emptyMacros());
}

function recoveryFromKm(km: number, runs: number) {
  if (runs === 0)  return { label: 'FRESH',      color: CYAN,   sub: 'No runs this week',                                  score: 100 };
  if (km < 15)     return { label: 'ACTIVE',     color: GREEN,  sub: `${runs} run${runs > 1 ? 's' : ''} · ${km.toFixed(1)} km`, score: 78  };
  if (km < 30)     return { label: 'BUILDING',   color: YELLOW, sub: `${runs} runs · ${km.toFixed(1)} km`,                 score: 52  };
  if (km < 50)     return { label: 'LOADED',     color: ORANGE, sub: `${runs} runs · ${km.toFixed(1)} km`,                 score: 28  };
  return            { label: 'OVERLOADED', color: RED,    sub: `${runs} runs · ${km.toFixed(1)} km`,                 score: 10  };
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
        <circle cx={S/2} cy={S/2} r={r} fill="none"
          stroke="rgba(0,56,168,0.08)" strokeWidth={W} />
        <circle cx={S/2} cy={S/2} r={r} fill="none"
          stroke={color} strokeWidth={W}
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${S/2} ${S/2})`}
          style={{ transition: 'stroke-dasharray 0.8s ease', filter: `drop-shadow(0 0 8px ${color}55)` }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, color: MUTED, marginBottom: 6, textTransform: 'uppercase' }}>
          Calories
        </div>
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
      border: `1px solid ${EDGE}`,
      borderTop: `3px solid ${c}`,
      boxShadow: `0 2px 12px rgba(0,56,168,0.06), 0 0 0 0 transparent`,
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

  const weatherKeySet = !!(import.meta.env.VITE_OPENWEATHER_KEY);
  const { todayLog, targets, weeklyLoad, weather, environmentAlert, logDay, refreshWeather, resetDay, getMacroBreakdown, setActivityModifier } = useNutrition();
  const loggedRuns      = useNutritionStore((s) => s.weeklyLoad.loggedRuns ?? []);
  const removeRunKm     = useNutritionStore((s) => s.removeRunKm);
  const renameRun       = useNutritionStore((s) => s.renameRun);
  const resetWeeklyRuns = useNutritionStore((s) => s.resetWeeklyRuns);
  const addRunKm        = useNutritionStore((s) => s.addRunKm);

  const carbWindow = todayLog?.trainingType && todayLog.trainingType !== 'rest' && todayLog.plannedWorkoutTime
    ? getMacroBreakdown()?.targets?.carbTimingWindow ?? null : null;

  const [consumed,        setConsumed]        = useState<MacroTargets>(emptyMacros());
  const [workoutTime,     setWorkoutTime]     = useState(todayLog?.plannedWorkoutTime ?? '');
  const [workoutKm,       setWorkoutKm]       = useState('');
  const [workoutName,     setWorkoutName]     = useState('');
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [editingRunIdx,   setEditingRunIdx]   = useState<number | null>(null);
  const [editingRunName,  setEditingRunName]  = useState('');

  const today    = new Date().toISOString().split('T')[0];
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'MORNING' : hour < 18 ? 'AFTERNOON' : 'EVENING';

  useEffect(() => { getLogs(today).then((l) => setConsumed(sumLogs(l))).catch(() => {}); }, [today]);
  useEffect(() => { refreshWeather().catch(() => {}); }, []);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type, workoutTime || undefined);
    if (r.blocked && window.confirm(
      `Your legs are heavily loaded from this week's runs.\n\nRunning today risks injury — consider switching to upper-body strength instead.\n\nLog cardio anyway?`
    )) logDay(type, workoutTime || undefined);
  };

  const calPct    = targets && targets.calories > 0 ? (consumed.calories / targets.calories) * 100 : 0;
  const calLeft   = targets ? Math.round(targets.calories - consumed.calories) : 0;
  const recovery  = recoveryFromKm(weeklyLoad.totalRunKm, loggedRuns.length);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: BG }}>

      {/* ── HEADER GRADIENT BAND ── */}
      <div style={{
        background: `linear-gradient(135deg, ${BLUE} 0%, #1565E0 100%)`,
        padding: '44px 22px 28px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

        <div className="nrc-a nrc-a1" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 4, color: 'rgba(255,255,255,0.6)', marginBottom: 4, textTransform: 'uppercase' }}>
              Good {greeting}
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -2, lineHeight: 1, color: '#FFFFFF' }}>
              {name.toUpperCase()}
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>
              {new Date().toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1.5, color: '#FFFFFF', lineHeight: 1 }}>
              {new Date().getDate()}
            </div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.7)', letterSpacing: 1 }}>
              {new Date().toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* ── PROFILE ALERT ── */}
      {!profileComplete && (
        <div className="nrc-a nrc-a2" style={{ padding: '16px 22px 0' }}>
          <div className="nrc-press" style={{
            background: '#FFF3E0', borderRadius: 14,
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
            border: '1px solid rgba(230,81,0,0.2)', borderLeft: `3px solid ${ORANGE}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: TEXT, marginBottom: 3 }}>Complete Your Profile</div>
              <div style={{ fontSize: 12, color: MUTED }}>Unlock personalised macro targets →</div>
            </div>
          </div>
        </div>
      )}

      {/* ── CALORIE RING ── */}
      {targets ? (
        <div className="nrc-a nrc-a2" style={{ padding: '24px 22px 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ background: SURF, borderRadius: 24, padding: '20px', boxShadow: '0 4px 24px rgba(0,56,168,0.10)', border: `1px solid ${EDGE}` }}>
              <CalRing pct={calPct} cal={consumed.calories} target={targets.calories} />
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
            background: SURF,
            borderRadius: 16, padding: '16px 18px',
            border: `1px solid ${EDGE}`,
            borderLeft: `4px solid ${recovery.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 2px 12px rgba(0,56,168,0.06)',
          }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, marginBottom: 4, textTransform: 'uppercase' }}>Recovery</div>
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: recovery.color }}>{recovery.label}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2, fontWeight: 500 }}>{recovery.sub}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', border: `3px solid ${recovery.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${recovery.color}10` }}>
                <span style={{ fontSize: 14, fontWeight: 900, color: recovery.color }}>{recovery.score}%</span>
              </div>
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

      {/* Daily activity modifier */}
      {todayLog && (
        <div style={{ padding: '10px 22px 0' }}>
          <div style={{ background: SURF, borderRadius: 14, padding: '12px 16px', border: `1px solid ${EDGE}`, boxShadow: '0 2px 8px rgba(0,56,168,0.05)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Today's Steps</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['low', 'normal', 'high'] as const).map((m) => {
                const active = (todayLog.dailyActivityModifier ?? 'normal') === m;
                const labels = { low: 'Low  <6k', normal: 'Normal  6–10k', high: 'High  10k+' };
                return (
                  <button key={m} onClick={() => setActivityModifier(m)} className="nrc-press" style={{
                    flex: 1, padding: '8px 4px', borderRadius: 10, border: `1px solid ${active ? BLUE : EDGE}`,
                    background: active ? `${BLUE}0E` : SURF2, cursor: 'pointer',
                    color: active ? BLUE : MUTED, fontSize: 10, fontWeight: 700, lineHeight: 1.3,
                  }}>{labels[m]}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Workout time */}
      {todayLog?.trainingType && todayLog.trainingType !== 'rest' && (
        <div style={{ padding: '10px 22px 0' }}>
          <div style={{
            background: SURF, borderRadius: 14, padding: '14px 18px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: `1px solid ${EDGE}`, boxShadow: '0 2px 8px rgba(0,56,168,0.05)',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>Workout Time</div>
            <input type="time" value={workoutTime}
              onChange={(e) => { setWorkoutTime(e.target.value); logDay(todayLog.trainingType, e.target.value); }}
              style={{ background: 'none', border: 'none', color: BLUE, fontSize: 18, fontWeight: 900, outline: 'none', textAlign: 'right', letterSpacing: -0.5 }}
            />
          </div>
        </div>
      )}

      {/* ── CARB WINDOW ── */}
      {carbWindow && (
        <div style={{ padding: '10px 22px 0' }}>
          <div style={{
            background: '#FFFBEB',
            borderRadius: 14, padding: '14px 16px',
            border: '1px solid rgba(249,168,37,0.25)',
            borderLeft: `3px solid ${YELLOW}`,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 20 }}>⏱</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: TEXT }}>
                Carb Window <span style={{ color: YELLOW }}>{carbWindow.preWorkoutStart}–{carbWindow.postWorkoutEnd}</span>
              </div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                Aim for <span style={{ color: ORANGE, fontWeight: 700 }}>{carbWindow.windowCarbsG}g carbs</span> in this window
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGGED RUNS ── */}
      <div className="nrc-a nrc-a5" style={{ padding: '24px 22px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase' }}>Logged Runs</div>
            {weeklyLoad.totalRunKm > 0 && (
              <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, color: GREEN, lineHeight: 1 }}>
                {weeklyLoad.totalRunKm.toFixed(1)}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1, marginLeft: 3 }}>KM</span>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <input type="text" value={workoutName} placeholder="Run name"
              onChange={(e) => setWorkoutName(e.target.value)}
              style={{ background: SURF, border: `1px solid ${EDGE}`, borderRadius: 12, color: TEXT, fontSize: 15, padding: '12px 16px', outline: 'none', boxShadow: '0 1px 4px rgba(0,56,168,0.06)' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" value={workoutKm} placeholder="Distance (km)" min={0}
                onChange={(e) => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setWorkoutKm(v); }}
                style={{ flex: 1, background: SURF, border: `1px solid ${EDGE}`, borderRadius: 12, color: TEXT, fontSize: 15, padding: '12px 16px', outline: 'none' }}
              />
              <button onClick={() => {
                const km = parseFloat(workoutKm);
                if (!km || km <= 0) return;
                addRunKm(km, workoutName.trim() || 'Run', 'manual');
                setWorkoutKm(''); setWorkoutName(''); setShowWorkoutForm(false);
              }} className="nrc-press" style={{
                background: GREEN, border: 'none', borderRadius: 12, color: '#fff',
                fontWeight: 900, fontSize: 13, cursor: 'pointer', padding: '0 20px', letterSpacing: 1,
              }}>DONE</button>
            </div>
          </div>
        )}

        <div style={{ background: SURF, borderRadius: 16, border: `1px solid ${EDGE}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,56,168,0.06)' }}>
          {loggedRuns.length === 0 ? (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: MUTED, fontSize: 12, fontWeight: 600 }}>
              No runs logged this week
            </div>
          ) : loggedRuns.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', borderTop: i === 0 ? 'none' : `1px solid ${EDGE}`, gap: 12 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: r.source === 'strava' ? '#FC4C02' : GREEN }} />
              {editingRunIdx === i ? (
                <input autoFocus value={editingRunName}
                  onChange={(e) => setEditingRunName(e.target.value)}
                  onBlur={() => { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); } if (e.key === 'Escape') setEditingRunIdx(null); }}
                  style={{ flex: 1, fontSize: 13, fontWeight: 600, color: TEXT, border: 'none', borderBottom: `1px solid ${GREEN}`, outline: 'none', background: 'transparent', padding: '1px 0' }} />
              ) : (
                <div onClick={() => { setEditingRunIdx(i); setEditingRunName(r.name); }}
                  style={{ flex: 1, fontSize: 13, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  title="Tap to rename">{r.name}</div>
              )}
              <div style={{ fontSize: 15, fontWeight: 900, color: r.source === 'strava' ? '#FC4C02' : GREEN, letterSpacing: -0.5, flexShrink: 0 }}>
                {r.km}<span style={{ fontSize: 9, color: MUTED, fontWeight: 700, marginLeft: 2 }}>KM</span>
              </div>
              <button onClick={() => removeRunKm(r.km, r.name)} style={{
                background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0,
              }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── RUNNING ── */}
      <div className="nrc-a nrc-a6" style={{ padding: '24px 22px 0' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>Running</div>
        <StravaCard />
      </div>

      {/* ── CONDITIONS ── */}
      {weather && environmentAlert ? (
        <div style={{ padding: '24px 22px 0' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 14 }}>Conditions</div>
          <WeatherBanner weather={weather} alert={environmentAlert} />
        </div>
      ) : !weatherKeySet ? null : (
        <div style={{ padding: '24px 22px 0' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>Conditions</div>
          <div style={{ fontSize: 12, color: MUTED, background: SURF, borderRadius: 12, padding: '10px 14px', border: `1px solid ${EDGE}` }}>
            Location access required to show weather conditions.
          </div>
        </div>
      )}

      <div style={{ height: 36 }} />
    </div>
  );
}
