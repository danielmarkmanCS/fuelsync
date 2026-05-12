import { useState, useEffect } from 'react';
import { useNutrition } from '../hooks/useNutrition';
import { useAuthStore } from '../store/authStore';
import TrainingPicker from '../components/TrainingPicker';
import WeatherBanner from '../components/WeatherBanner';
import { getLogs } from '../api/food';
import StravaCard from '../components/StravaCard';
import type { FoodLog } from '../api/food';
import type { MacroTargets, TrainingType } from '@shared/types';

const RED = '#FF1C1C';

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
      background: '#141414', borderRadius: 16,
      padding: '16px 14px 14px',
      display: 'flex', flexDirection: 'column', gap: 10,
      border: '1px solid #1E1E1E',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: over ? RED : '#fff' }}>
        {Math.round(current)}<span style={{ fontSize: 14, color: '#333', fontWeight: 600 }}>{unit}</span>
      </div>
      <div className="volt-bar-track">
        <div className="volt-bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: over ? '#fff' : color }} />
      </div>
      <div style={{ fontSize: 10, color: '#333', fontWeight: 600 }}>of {Math.round(target)}{unit}</div>
    </div>
  );
}

export default function HomeScreen() {
  const { user } = useAuthStore();
  const name = user?.email?.split('@')[0] ?? 'Athlete';
  const profileComplete = !!(user?.weightKg && user?.heightCm && user?.age);

  const { todayLog, targets, weeklyLoad, weather, environmentAlert, logDay, refreshWeather, logWorkoutComplete, resetDay } = useNutrition();

  const [consumed,        setConsumed]        = useState<MacroTargets>(emptyMacros());
  const [workoutTime,     setWorkoutTime]     = useState(todayLog?.plannedWorkoutTime ?? '');
  const [workoutKm,       setWorkoutKm]       = useState('');
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);

  const today    = new Date().toISOString().split('T')[0];
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  useEffect(() => { getLogs(today).then((l) => setConsumed(sumLogs(l))).catch(() => {}); }, [today]);
  useEffect(() => { refreshWeather().catch(() => {}); }, []);

  const handleSelectType = (type: TrainingType) => {
    const r = logDay(type, workoutTime || undefined);
    if (r.blocked && r.message && window.confirm(`${r.message}\n\nOverride?`)) logDay(type, workoutTime || undefined);
  };

  const calPct  = targets && targets.calories > 0 ? (consumed.calories / targets.calories) * 100 : 0;
  const fatigue = weeklyLoad.legFatigueScore;

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
            background: '#141414', borderRadius: 14,
            padding: '14px 18px', display: 'flex',
            alignItems: 'center', gap: 14,
            borderLeft: `3px solid ${RED}`,
            border: '1px solid #1E1E1E',
            borderLeftColor: RED,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#fff', marginBottom: 2, letterSpacing: -0.3 }}>Complete Your Profile</div>
              <div style={{ fontSize: 12, color: '#444' }}>Unlock personalised macro targets</div>
            </div>
            <div style={{ color: RED, fontSize: 18, fontWeight: 900 }}>→</div>
          </div>
        </div>
      )}

      {/* ── HERO CALORIES ──────────────────────────────────────── */}
      <div className="nrc-a nrc-a2" style={{ padding: '16px 20px 0' }}>
        <div style={{
          background: '#141414', borderRadius: 20,
          padding: '22px 22px 18px',
          position: 'relative', overflow: 'hidden',
          border: '1px solid #1E1E1E',
        }}>
          {calPct > 0 && (
            <div style={{
              position: 'absolute', top: -60, right: -60,
              width: 200, height: 200, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,28,28,0.06) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />
          )}

          <div className="nrc-label" style={{ marginBottom: 14 }}>Calories Today</div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
            <div className="nrc-hero" style={{ fontSize: 76, color: calPct >= 100 ? RED : '#fff' }}>
              {Math.round(consumed.calories).toLocaleString()}
            </div>
            {targets && (
              <div style={{ paddingBottom: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2A2A2A' }}>
                  / {Math.round(targets.calories).toLocaleString()}
                </div>
                <div style={{ fontSize: 10, color: '#2A2A2A', letterSpacing: 2, fontWeight: 600 }}>KCAL</div>
              </div>
            )}
          </div>

          {targets && (
            <div style={{ marginTop: 18 }}>
              <div className="volt-bar-track">
                <div className="volt-bar-fill" style={{ width: `${Math.min(calPct, 100)}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#333', fontWeight: 600 }}>
                  {targets.calories - consumed.calories > 0
                    ? `${Math.round(targets.calories - consumed.calories)} kcal remaining`
                    : 'Target hit'}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: calPct >= 80 ? RED : '#333' }}>
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
            <MacroTile label="Protein"  current={consumed.proteinG} target={targets.proteinG} unit="g" color={RED} />
            <MacroTile label="Carbs"    current={consumed.carbsG}   target={targets.carbsG}   unit="g" color={RED} />
            <MacroTile label="Fat"      current={consumed.fatG}     target={targets.fatG}     unit="g" color={RED} />
            <div className="nrc-press" style={{
              background: '#141414', borderRadius: 16,
              padding: '16px 14px 14px',
              border: '1px solid #1E1E1E',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase', marginBottom: 10 }}>Recovery</div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1, color: RED }}>
                {weeklyLoad.recoveryScore}<span style={{ fontSize: 14, color: '#333', fontWeight: 600 }}>%</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="volt-bar-track">
                  <div className="volt-bar-fill" style={{ width: `${weeklyLoad.recoveryScore}%` }} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#333', fontWeight: 600, marginTop: 10 }}>This week</div>
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
              background: 'none', border: 'none', color: '#333',
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
            background: '#141414', borderRadius: 14,
            padding: '12px 18px', display: 'flex',
            alignItems: 'center', justifyContent: 'space-between',
            border: '1px solid #1E1E1E',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: '#C0C0C0', textTransform: 'uppercase' }}>Workout Time</div>
            <input type="time" value={workoutTime}
              onChange={(e) => { setWorkoutTime(e.target.value); logDay(todayLog.trainingType, e.target.value); }}
              style={{ background: 'none', border: 'none', color: RED, fontSize: 17, fontWeight: 800, outline: 'none', textAlign: 'right' }}
            />
          </div>
        </div>
      )}

      {/* ── WEEKLY STATS ───────────────────────────────────────── */}
      <div className="nrc-a nrc-a5" style={{ padding: '24px 20px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div className="nrc-label">This Week</div>
          {todayLog?.trainingType && todayLog.trainingType !== 'rest' && !todayLog?.actualWorkoutLogged && (
            <button onClick={() => setShowWorkoutForm(!showWorkoutForm)} className="nrc-press" style={{
              background: 'none', border: `1px solid rgba(255,28,28,0.3)`, color: RED,
              borderRadius: 20, fontWeight: 700, fontSize: 11, letterSpacing: 1,
              cursor: 'pointer', padding: '4px 12px',
            }}>+ LOG RUN</button>
          )}
        </div>

        {showWorkoutForm && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input type="number" value={workoutKm} placeholder="km run"
              onChange={(e) => setWorkoutKm(e.target.value)}
              style={{ flex: 1, background: '#141414', border: '1px solid #222', borderRadius: 12, color: '#fff', fontSize: 15, padding: '12px 16px', outline: 'none' }}
            />
            <button onClick={() => { logWorkoutComplete(parseFloat(workoutKm) || 0); setWorkoutKm(''); setShowWorkoutForm(false); }}
              className="nrc-press" style={{
                background: RED, border: 'none', borderRadius: 12, color: '#fff',
                fontWeight: 800, fontSize: 13, cursor: 'pointer', padding: '0 18px', letterSpacing: 1,
              }}>DONE</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {[
            { label: 'KM Run',   value: weeklyLoad.totalRunKm.toFixed(1) },
            { label: 'Sets',     value: String(weeklyLoad.totalStrengthSets) },
            { label: 'Fatigue',  value: `${fatigue}%` },
          ].map(({ label, value }) => (
            <div key={label} className="nrc-press" style={{
              background: '#141414', borderRadius: 14,
              padding: '16px 12px', border: '1px solid #1E1E1E',
            }}>
              <div className="nrc-hero" style={{ fontSize: 28, marginBottom: 6 }}>{value}</div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#333', textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        {fatigue >= 70 && (
          <div style={{
            marginTop: 10, background: '#141414', borderRadius: 12,
            padding: '10px 16px', borderLeft: `3px solid ${RED}`,
            border: '1px solid #1E1E1E', borderLeftColor: RED,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: RED, letterSpacing: 0.5 }}>High Fatigue — Take it easy</div>
          </div>
        )}
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
