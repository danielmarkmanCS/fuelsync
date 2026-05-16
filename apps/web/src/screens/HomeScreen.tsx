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

const RED    = '#FF3B30';
const PRO    = '#22C55E';
const CARB   = '#F97316';
const FAT    = '#EF4444';
const CARD   = '#141414';
const CARD2  = '#1C1C1E';
const BORD   = '#2C2C2E';

const emptyMacros = (): MacroTargets => ({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
function sumLogs(logs: FoodLog[]): MacroTargets {
  return logs.reduce<MacroTargets>((acc, l) => ({
    calories: acc.calories + parseFloat(l.calories as unknown as string),
    proteinG: acc.proteinG + parseFloat(l.protein  as unknown as string),
    carbsG:   acc.carbsG   + parseFloat(l.carbs    as unknown as string),
    fatG:     acc.fatG     + parseFloat(l.fat       as unknown as string),
  }), emptyMacros());
}

function MacroTile({ label, current, target, unit, color }: { label: string; current: number; target: number; unit: string; color: string }) {
  const pct = target > 0 ? (current / target) * 100 : 0;
  const over = current > target && target > 0;
  return (
    <div className="nrc-press" style={{
      background: CARD, borderRadius: 16,
      padding: '16px 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
      border: `1px solid ${BORD}`,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#666666', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: over ? RED : '#FFFFFF' }}>
        {Math.round(current)}<span style={{ fontSize: 14, color: '#555555', fontWeight: 600 }}>{unit}</span>
      </div>
      <div className="volt-bar-track">
        <div className="volt-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: over ? RED : color }} />
      </div>
      <div style={{ fontSize: 10, color: '#555555', fontWeight: 600 }}>of {Math.round(target)}{unit}</div>
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
  const carbWindow   = todayLog?.trainingType && todayLog.trainingType !== 'rest' && todayLog.plannedWorkoutTime
    ? getMacroBreakdown()?.targets?.carbTimingWindow ?? null
    : null;

  const addRunKm         = useNutritionStore((s) => s.addRunKm);

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

  const calPct = targets && targets.calories > 0 ? (consumed.calories / targets.calories) * 100 : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0C0C0C' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div className="nrc-a nrc-a1" style={{ padding: '28px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="nrc-label" style={{ marginBottom: 6 }}>Good {greeting}</div>
          <div className="nrc-hero" style={{ fontSize: 42 }}>
            {name.toUpperCase()}
          </div>
        </div>
        <div style={{ textAlign: 'right', paddingTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#2A2A2A', letterSpacing: 1 }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
          </div>
        </div>
      </div>

      {/* ── PROFILE ALERT ──────────────────────────────────────── */}
      {!profileComplete && (
        <div className="nrc-a nrc-a2" style={{ padding: '16px 20px 0' }}>
          <div className="nrc-press" style={{
            background: 'rgba(255,59,48,0.1)', borderRadius: 14,
            padding: '14px 18px', display: 'flex',
            alignItems: 'center', gap: 14,
            border: `1px solid rgba(255,59,48,0.2)`,
            borderLeftColor: RED,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#FFFFFF', marginBottom: 2, letterSpacing: -0.3 }}>Complete Your Profile</div>
              <div style={{ fontSize: 12, color: '#888888' }}>Unlock personalised macro targets</div>
            </div>
            <div style={{ color: RED, fontSize: 18, fontWeight: 900 }}>→</div>
          </div>
        </div>
      )}

      {/* ── HERO CALORIES ──────────────────────────────────────── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 20px 0' }}>
        <div style={{
          background: CARD, borderRadius: 20,
          padding: '22px 22px 18px',
          position: 'relative', overflow: 'hidden',
          border: `1px solid ${BORD}`,
        }}>
          {calPct > 0 && (
            <div style={{
              position: 'absolute', top: -60, right: -60,
              width: 200, height: 200, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,59,48,0.05) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
          )}

          <div className="nrc-label" style={{ marginBottom: 14 }}>Calories Today</div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div className="nrc-hero" style={{ fontSize: 76, color: calPct >= 100 ? RED : '#FFFFFF' }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && (
              <div style={{ paddingBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#BBBBBB' }}>
                  / {Math.round(targets.calories).toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: '#BBBBBB', letterSpacing: 2, fontWeight: 600 }}>KCAL</div>
              </div>
            )}
          </div>

          {targets && (
            <div style={{ marginTop: 18 }}>
              <div className="volt-bar-track">
                <div className="volt-bar-fill" style={{ width: `${Math.min(calPct, 100)}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#AAAAAA', fontWeight: 600 }}>
                  {targets.calories - consumed.calories > 0
                    ? `${Math.round(targets.calories - consumed.calories)} kcal remaining`
                    : 'Target hit'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: calPct >= 80 ? RED : '#AAAAAA' }}>
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
            <div className="nrc-press" style={{
              background: CARD, borderRadius: 16,
              padding: '16px 14px 14px',
              border: `1px solid ${BORD}`,
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#666666', textTransform: 'uppercase', marginBottom: 10 }}>Recovery</div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: weeklyLoad.recoveryScore >= 70 ? PRO : weeklyLoad.recoveryScore >= 40 ? '#f59e0b' : RED }}>
                {weeklyLoad.recoveryScore}<span style={{ fontSize: 14, color: '#555555', fontWeight: 600 }}>%</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="volt-bar-track">
                  <div className="volt-bar-fill" style={{ width: `${weeklyLoad.recoveryScore}%`, background: weeklyLoad.recoveryScore >= 70 ? '#22c55e' : weeklyLoad.recoveryScore >= 40 ? '#f59e0b' : RED }} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 600, marginTop: 10 }}>
                {weeklyLoad.recoveryScore >= 70 ? 'Ready to train' : weeklyLoad.recoveryScore >= 40 ? 'Moderate load' : 'Take it easy'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TRAINING MODE ──────────────────────────────────────── */}
      <div className="nrc-a nrc-a4" style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="nrc-label">{todayLog ? 'Training Mode' : 'Select Mode'}</div>
          {todayLog && (
            <button onClick={() => { if (window.confirm('Reset today?')) resetDay(); }} style={{
              background: 'none', border: 'none', color: '#AAAAAA',
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
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#999999', textTransform: 'uppercase' }}>Workout Time</div>
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
            background: CARD, borderRadius: 14,
            padding: '12px 16px',
            border: '1px solid rgba(245,158,11,0.25)',
            borderLeft: '3px solid #f59e0b',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ fontSize: 18 }}>⏱</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#FFFFFF', letterSpacing: -0.2 }}>
                Carb Window&nbsp;
                <span style={{ color: '#f59e0b' }}>{carbWindow.preWorkoutStart}–{carbWindow.postWorkoutEnd}</span>
              </div>
              <div style={{ fontSize: 11, color: '#AAAAAA', marginTop: 2 }}>
                Aim for <span style={{ color: '#111111', fontWeight: 700 }}>{carbWindow.windowCarbsG}g carbs</span> in this window for best performance
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGGED RUNS ────────────────────────────────────────── */}
      <div className="nrc-a nrc-a5" style={{ padding: '24px 20px 0' }}>

        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="nrc-label">Logged Runs</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: RED, letterSpacing: -1 }}>
              {weeklyLoad.totalRunKm.toFixed(1)}
              <span style={{ fontSize: 10, color: '#AAAAAA', fontWeight: 700, letterSpacing: 1, marginLeft: 3 }}>KM</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {loggedRuns.length > 0 && (
              <button
                onClick={() => { if (window.confirm('Reset all logged runs this week?')) resetWeeklyRuns(); }}
                style={{ background: 'none', border: `1px solid ${BORD}`, color: '#666666', borderRadius: 20, fontWeight: 700, fontSize: 11, letterSpacing: 1, cursor: 'pointer', padding: '4px 10px' }}
              >RESET</button>
            )}
            <button onClick={() => setShowWorkoutForm(!showWorkoutForm)} className="nrc-press" style={{
              background: 'none', border: `1px solid rgba(255,28,28,0.3)`, color: RED,
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
                  background: RED, border: 'none', borderRadius: 12, color: '#fff',
                  fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: '0 18px', letterSpacing: 1,
                }}>DONE</button>
            </div>
          </div>
        )}

        {/* Runs list — always visible */}
        <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORD}`, overflow: 'hidden' }}>
          {loggedRuns.length === 0 ? (
            <div style={{ padding: '20px 14px', textAlign: 'center', color: '#444444', fontSize: 12, fontWeight: 600 }}>
              No runs logged this week
            </div>
          ) : loggedRuns.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderTop: i === 0 ? 'none' : `1px solid ${BORD}`, gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: r.source === 'strava' ? '#FC4C02' : RED, flexShrink: 0 }} />

              {editingRunIdx === i ? (
                <input
                  autoFocus
                  value={editingRunName}
                  onChange={(e) => setEditingRunName(e.target.value)}
                  onBlur={() => { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { if (editingRunName.trim()) renameRun(i, editingRunName.trim()); setEditingRunIdx(null); } if (e.key === 'Escape') setEditingRunIdx(null); }}
                  style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#FFFFFF', border: 'none', borderBottom: `1px solid ${RED}`, outline: 'none', background: 'transparent', padding: '1px 0' }}
                />
              ) : (
                <div
                  onClick={() => { setEditingRunIdx(i); setEditingRunName(r.name); }}
                  style={{ flex: 1, fontSize: 12, color: '#E0E0E0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                  title="Tap to rename"
                >{r.name}</div>
              )}

              <div style={{ fontSize: 13, fontWeight: 900, color: r.source === 'strava' ? '#FC4C02' : RED, letterSpacing: -0.3, flexShrink: 0 }}>
                {r.km} <span style={{ fontSize: 9, color: '#BBBBBB', fontWeight: 700 }}>KM</span>
              </div>
              <button onClick={() => removeRunKm(r.km, r.name)} style={{
                background: 'none', border: 'none', color: '#CCCCCC',
                fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0,
              }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* ── RUNNING ─────────────────────────────────────────────── */}
      <div className="nrc-a nrc-a6" style={{ padding: '24px 20px 0' }}>
        <div className="nrc-label" style={{ marginBottom: 12 }}>Running</div>
        <StravaCard />
      </div>

      {/* ── CONDITIONS ──────────────────────────────────────────── */}
      {weather && environmentAlert && (
        <div style={{ padding: '24px 20px 0' }}>
          <div className="nrc-label" style={{ marginBottom: 12 }}>Conditions</div>
          <WeatherBanner weather={weather} alert={environmentAlert} />
        </div>
      )}

      <div style={{ height: 32 }} />
    </div>
  );
}
