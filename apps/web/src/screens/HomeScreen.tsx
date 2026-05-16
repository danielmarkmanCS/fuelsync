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

const RED   = '#FF3B30';
const PRO   = '#4ADE80';
const CARB  = '#FB923C';
const FAT   = '#F472B6';
const CARD  = '#111111';
const CARD2 = '#181818';
const BORD  = '#222222';

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
function sumLogs(logs: FoodLog[]): MacroTargets {
  return logs.reduce<MacroTargets>((acc, l) => ({
    calories: acc.calories + parseFloat(l.calories as unknown as string),
    proteinG: acc.proteinG + parseFloat(l.protein  as unknown as string),
    carbsG:   acc.carbsG   + parseFloat(l.carbs    as unknown as string),
    fatG:     acc.fatG     + parseFloat(l.fat       as unknown as string),
  }), emptyMacros());
}

function recoveryFromKm(km: number, runs: number): { label: string; color: string; sub: string; score: number } {
  if (runs === 0)   return { label: 'Fresh',      color: '#22D3EE', sub: 'No runs logged',          score: 100 };
  if (km < 15)      return { label: 'Active',     color: PRO,       sub: `${runs} run${runs>1?'s':''} · ${km.toFixed(1)} km`, score: 80 };
  if (km < 30)      return { label: 'Building',   color: '#FACC15', sub: `${runs} runs · ${km.toFixed(1)} km`,                score: 55 };
  if (km < 50)      return { label: 'Loaded',     color: CARB,      sub: `${runs} runs · ${km.toFixed(1)} km`,                score: 30 };
  return             { label: 'Overloaded', color: RED,       sub: `${runs} runs · ${km.toFixed(1)} km`,                score: 10 };
}

function MacroTile({ label, current, target, unit, color }: {
  label: string; current: number; target: number; unit: string; color: string;
}) {
  const pct  = target > 0 ? (current / target) * 100 : 0;
  const over = current > target && target > 0;
  const c    = over ? RED : color;
  return (
    <div className="nrc-press" style={{
      background: CARD, borderRadius: 18,
      padding: '16px 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
      border: `1px solid ${BORD}`,
      borderTop: `2px solid ${c}`,
      boxShadow: `0 4px 24px ${c}1A`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3, color: c, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: '#FFFFFF' }}>
        {Math.round(current)}<span style={{ fontSize: 13, color: '#444444', fontWeight: 600 }}>{unit}</span>
      </div>
      <div className="volt-bar-track">
        <div className="volt-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: c }} />
      </div>
      <div style={{ fontSize: 10, color: '#444444', fontWeight: 600 }}>of {Math.round(target)}{unit}</div>
    </div>
  );
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const name = user?.displayName || 'Athlete';
  const profileComplete = !!(user?.weightKg && user?.heightCm && user?.age);

  const { todayLog, targets, weeklyLoad, weather, environmentAlert, logDay, refreshWeather, logWorkoutComplete, resetDay, getMacroBreakdown } = useNutrition();
  const loggedRuns      = useNutritionStore((s) => s.weeklyLoad.loggedRuns ?? []);
  const removeRunKm     = useNutritionStore((s) => s.removeRunKm);
  const renameRun       = useNutritionStore((s) => s.renameRun);
  const resetWeeklyRuns = useNutritionStore((s) => s.resetWeeklyRuns);
  const addRunKm        = useNutritionStore((s) => s.addRunKm);

  const carbWindow = todayLog?.trainingType && todayLog.trainingType !== 'rest' && todayLog.plannedWorkoutTime
    ? getMacroBreakdown()?.targets?.carbTimingWindow ?? null
    : null;

  const [consumed,        setConsumed]        = useState<MacroTargets>(emptyMacros());
  const [workoutTime,     setWorkoutTime]     = useState(todayLog?.plannedWorkoutTime ?? '');
  const [workoutKm,       setWorkoutKm]       = useState('');
  const [workoutName,     setWorkoutName]     = useState('');
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [editingRunIdx,   setEditingRunIdx]   = useState<number | null>(null);
  const [editingRunName,  setEditingRunName]  = useState('');

  const today    = new Date().toISOString().split('T')[0];
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  useEffect(() => { getLogs(today).then((l) => setConsumed(sumLogs(l))).catch(() => {}); }, [today]);
  useEffect(() => { refreshWeather().catch(() => {}); }, []);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type, workoutTime || undefined);
    if (r.blocked && r.message && window.confirm(`${r.message}\n\nOverride?`)) logDay(type, workoutTime || undefined);
  };

  const calPct     = targets && targets.calories > 0 ? (consumed.calories / targets.calories) * 100 : 0;
  const calRemain  = targets ? Math.round(targets.calories - consumed.calories) : 0;
  const recovery   = recoveryFromKm(weeklyLoad.totalRunKm, loggedRuns.length);

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0C0C0C', backgroundImage: 'linear-gradient(180deg, rgba(255,59,48,0.05) 0%, transparent 260px)' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="nrc-a nrc-a1" style={{ padding: '32px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="nrc-label" style={{ marginBottom: 6 }}>Good {greeting}</div>
          <div className="nrc-hero" style={{ fontSize: 40 }}>{name.toUpperCase()}</div>
        </div>
        <div style={{ textAlign: 'right', paddingTop: 6, background: CARD, borderRadius: 10, padding: '6px 12px', border: `1px solid ${BORD}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#555555', letterSpacing: 1 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', letterSpacing: -1, lineHeight: 1 }}>
            {new Date().getDate()}
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#555555', letterSpacing: 1 }}>
            {new Date().toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── PROFILE ALERT ──────────────────────────────────────── */}
      {!profileComplete && (
        <div className="nrc-a nrc-a2" style={{ padding: '16px 20px 0' }}>
          <div className="nrc-press" style={{
            background: 'rgba(255,59,48,0.08)', borderRadius: 14,
            padding: '14px 18px', display: 'flex',
            alignItems: 'center', gap: 14,
            border: `1px solid rgba(255,59,48,0.18)`,
            borderLeft: `3px solid ${RED}`,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#FFFFFF', marginBottom: 2, letterSpacing: -0.3 }}>Complete Your Profile</div>
              <div style={{ fontSize: 12, color: '#666666' }}>Unlock personalised macro targets</div>
            </div>
            <div style={{ color: RED, fontSize: 18, fontWeight: 900 }}>→</div>
          </div>
        </div>
      )}

      {/* ── HERO CALORIES ──────────────────────────────────────── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 20px 0' }}>
        <div style={{
          background: 'linear-gradient(145deg, #141414 0%, #1a0906 100%)',
          borderRadius: 22,
          padding: '24px 22px 20px',
          position: 'relative', overflow: 'hidden',
          border: `1px solid ${BORD}`,
          boxShadow: calPct > 10 ? `0 8px 40px rgba(255,59,48,0.10)` : 'none',
        }}>
          <div style={{
            position: 'absolute', top: -80, right: -80,
            width: 260, height: 260, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,59,48,0.07) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div className="nrc-label" style={{ marginBottom: 16 }}>Calories Today</div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div className="nrc-hero" style={{ fontSize: 80, color: calPct >= 100 ? RED : '#FFFFFF', lineHeight: 1 }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && (
              <div style={{ paddingBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#444444' }}>
                  / {Math.round(targets.calories).toLocaleString()}
                </div>
                <div style={{ fontSize: 9, color: '#444444', letterSpacing: 2, fontWeight: 700 }}>KCAL</div>
              </div>
            )}
          </div>

          {targets && (
            <div style={{ marginTop: 20 }}>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(calPct, 100)}%`, background: calPct >= 100 ? RED : `linear-gradient(90deg, ${RED}88, ${RED})`, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#555555', fontWeight: 600 }}>
                  {calRemain > 0 ? `${calRemain.toLocaleString()} kcal left` : calRemain < 0 ? `${Math.abs(calRemain)} kcal over` : 'Target hit ✓'}
                </div>
                <div style={{ fontSize: 13, fontWeight: 900, color: calPct >= 100 ? RED : calPct >= 80 ? '#FACC15' : '#555555', letterSpacing: -0.3 }}>
                  {Math.round(calPct)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MACRO GRID ─────────────────────────────────────────── */}
      {targets && (
        <div className="nrc-a nrc-a3" style={{ padding: '10px 20px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MacroTile label="Protein"  current={consumed.proteinG} target={targets.proteinG} unit="g" color={PRO} />
            <MacroTile label="Carbs"    current={consumed.carbsG}   target={targets.carbsG}   unit="g" color={CARB} />
            <MacroTile label="Fat"      current={consumed.fatG}     target={targets.fatG}     unit="g" color={FAT} />

            {/* Recovery tile — dynamic from logged km */}
            <div className="nrc-press" style={{
              background: CARD, borderRadius: 18,
              padding: '16px 14px 14px',
              border: `1px solid ${BORD}`,
              borderTop: `2px solid ${recovery.color}`,
              boxShadow: `0 4px 24px ${recovery.color}1A`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3, color: recovery.color, textTransform: 'uppercase' }}>Recovery</div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: '#FFFFFF' }}>
                {recovery.label}
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${recovery.score}%`, background: recovery.color, borderRadius: 2, transition: 'width 0.6s ease' }} />
              </div>
              <div style={{ fontSize: 10, color: '#444444', fontWeight: 600 }}>{recovery.sub}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAINING MODE ──────────────────────────────────────── */}
      <div className="nrc-a nrc-a4" style={{ padding: '28px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div className="nrc-label">{todayLog ? 'Training Mode' : 'Select Mode'}</div>
          {todayLog && (
            <button onClick={() => { if (window.confirm('Reset today?')) resetDay(); }} style={{
              background: 'none', border: 'none', color: '#555555',
              fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            }}>RESET</button>
          )}
        </div>
        <TrainingPicker selected={todayLog?.trainingType ?? null} onSelect={handleSelectType} />
      </div>

      {/* Workout time */}
      {todayLog?.trainingType && todayLog.trainingType !== 'rest' && (
        <div style={{ padding: '10px 20px 0' }}>
          <div style={{
            background: CARD, borderRadius: 14,
            padding: '12px 18px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            border: `1px solid ${BORD}`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#555555', textTransform: 'uppercase' }}>Workout Time</div>
            <input type="time" value={workoutTime}
              onChange={(e) => { setWorkoutTime(e.target.value); logDay(todayLog.trainingType, e.target.value); }}
              style={{ background: 'none', border: 'none', color: RED, fontSize: 17, fontWeight: 800, outline: 'none', textAlign: 'right' }}
            />
          </div>
        </div>
      )}

      {/* ── CARB WINDOW BANNER ─────────────────────────────────── */}
      {carbWindow && (
        <div style={{ padding: '10px 20px 0' }}>
          <div style={{
            background: 'rgba(250,204,21,0.04)',
            borderRadius: 14,
            padding: '14px 16px',
            border: '1px solid rgba(250,204,21,0.15)',
            borderLeft: '3px solid #FACC15',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 18 }}>⏱</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', letterSpacing: -0.2 }}>
                Carb Window&nbsp;
                <span style={{ color: '#FACC15' }}>{carbWindow.preWorkoutStart}–{carbWindow.postWorkoutEnd}</span>
              </div>
              <div style={{ fontSize: 11, color: '#666666', marginTop: 2 }}>
                Aim for <span style={{ color: CARB, fontWeight: 700 }}>{carbWindow.windowCarbsG}g carbs</span> in this window
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGGED RUNS ────────────────────────────────────────── */}
      <div className="nrc-a nrc-a5" style={{ padding: '28px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div className="nrc-label">Logged Runs</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: PRO, letterSpacing: -1 }}>
              {weeklyLoad.totalRunKm.toFixed(1)}
              <span style={{ fontSize: 9, color: '#555555', fontWeight: 700, letterSpacing: 1, marginLeft: 3 }}>KM</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {loggedRuns.length > 0 && (
              <button
                onClick={() => { if (window.confirm('Reset all logged runs this week?')) resetWeeklyRuns(); }}
                style={{ background: 'none', border: `1px solid ${BORD}`, color: '#555555', borderRadius: 20, fontWeight: 700, fontSize: 11, letterSpacing: 1, cursor: 'pointer', padding: '4px 10px' }}
              >RESET</button>
            )}
            <button onClick={() => setShowWorkoutForm(!showWorkoutForm)} className="nrc-press" style={{
              background: 'none', border: `1px solid rgba(74,222,128,0.3)`, color: PRO,
              borderRadius: 20, fontWeight: 700, fontSize: 11, letterSpacing: 1,
              cursor: 'pointer', padding: '4px 12px',
            }}>+ LOG RUN</button>
          </div>
        </div>

        {/* Log run form */}
        {showWorkoutForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <input
              type="text" value={workoutName} placeholder="Run name (e.g. Morning Run)"
              onChange={(e) => setWorkoutName(e.target.value)}
              style={{ background: CARD2, border: `1px solid ${BORD}`, borderRadius: 12, color: '#FFFFFF', fontSize: 15, padding: '12px 16px', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" value={workoutKm} placeholder="Distance (km)" min={0}
                onChange={(e) => { const v = e.target.value; if (v === '' || parseFloat(v) >= 0) setWorkoutKm(v); }}
                style={{ flex: 1, background: CARD2, border: `1px solid ${BORD}`, borderRadius: 12, color: '#FFFFFF', fontSize: 15, padding: '12px 16px', outline: 'none' }}
              />
              <button
                onClick={() => {
                  const km = parseFloat(workoutKm);
                  if (!km || km <= 0) return;
                  addRunKm(km, workoutName.trim() || 'Run', 'manual');
                  setWorkoutKm(''); setWorkoutName(''); setShowWorkoutForm(false);
                }}
                className="nrc-press" style={{
                  background: PRO, border: 'none', borderRadius: 12, color: '#000',
                  fontWeight: 900, fontSize: 13, cursor: 'pointer', padding: '0 18px', letterSpacing: 1,
                }}>DONE</button>
            </div>
          </div>
        )}

        {/* Runs list */}
        <div style={{ background: CARD, borderRadius: 16, border: `1px solid ${BORD}`, overflow: 'hidden' }}>
          {loggedRuns.length === 0 ? (
            <div style={{ padding: '22px 14px', textAlign: 'center', color: '#333333', fontSize: 12, fontWeight: 600 }}>
              No runs logged this week
            </div>
          ) : loggedRuns.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', borderTop: i === 0 ? 'none' : `1px solid ${BORD}`, gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: r.source === 'strava' ? '#FC4C02' : PRO, flexShrink: 0, boxShadow: `0 0 6px ${r.source === 'strava' ? '#FC4C02' : PRO}80` }} />

              {editingRunIdx === i ? (
                <input
                  autoFocus
                  value={editingRunName}
                  onChange={(e) => setEditingRunName(e.target.value)}
                  onBlur={() => { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); } if (e.key === 'Escape') setEditingRunIdx(null); }}
                  style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#FFFFFF', border: 'none', borderBottom: `1px solid ${PRO}`, outline: 'none', background: 'transparent', padding: '1px 0' }}
                />
              ) : (
                <div
                  onClick={() => { setEditingRunIdx(i); setEditingRunName(r.name); }}
                  style={{ flex: 1, fontSize: 12, color: '#CCCCCC', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  title="Tap to rename"
                >{r.name}</div>
              )}

              <div style={{ fontSize: 14, fontWeight: 900, color: r.source === 'strava' ? '#FC4C02' : PRO, letterSpacing: -0.3, flexShrink: 0 }}>
                {r.km} <span style={{ fontSize: 9, color: '#444444', fontWeight: 700 }}>KM</span>
              </div>
              <button onClick={() => removeRunKm(r.km, r.name)} style={{
                background: 'none', border: 'none', color: '#333333',
                fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0,
              }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── RUNNING ─────────────────────────────────────────────── */}
      <div className="nrc-a nrc-a6" style={{ padding: '28px 20px 0' }}>
        <div className="nrc-label" style={{ marginBottom: 14 }}>Running</div>
        <StravaCard />
      </div>

      {/* ── CONDITIONS ──────────────────────────────────────────── */}
      {weather && environmentAlert && (
        <div style={{ padding: '28px 20px 0' }}>
          <div className="nrc-label" style={{ marginBottom: 14 }}>Conditions</div>
          <WeatherBanner weather={weather} alert={environmentAlert} />
        </div>
      )}

      <div style={{ height: 36 }} />
    </div>
  );
}
