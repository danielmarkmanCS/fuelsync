import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../lib/db';
import type { WorkoutExercise, WorkoutSet } from '../lib/db';
import { checkAndSetPR, getPR, getExerciseHistory } from '../lib/workoutPR';

const SURF   = 'var(--surf)';
const SURF2  = 'var(--surf2)';
const EDGE   = 'var(--edge)';
const TEXT   = 'var(--text)';
const MUTED  = 'var(--muted)';
const ACCENT = 'var(--accent)';
const RED    = '#EF4444';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';

const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core', 'Full Body'];

const DEFAULT_REST = 90; // seconds

// ── Rest Timer ───────────────────────────────────────────────────────
function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    if (remaining <= 0) {
      try { navigator.vibrate?.([200, 100, 200]); } catch {}
      return;
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, dismissed]);

  if (dismissed) return null;

  const done = remaining <= 0;
  const pct  = ((seconds - remaining) / seconds) * 100;
  const color = done ? GREEN : remaining <= 10 ? RED : ACCENT;

  return (
    <div style={{
      position: 'fixed', bottom: 72, left: 12, right: 12, zIndex: 500,
      background: 'var(--surf)', border: `1.5px solid ${color}`,
      borderRadius: 14, padding: '12px 16px',
      boxShadow: `0 4px 24px ${color}30`,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      {/* Progress ring */}
      <svg width={44} height={44} style={{ flexShrink: 0 }}>
        <circle cx={22} cy={22} r={18} fill="none" stroke={EDGE} strokeWidth={4} />
        <circle
          cx={22} cy={22} r={18}
          fill="none" stroke={color} strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * 18}`}
          strokeDashoffset={`${2 * Math.PI * 18 * (1 - pct / 100)}`}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '22px 22px', transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
        />
        <text x={22} y={27} textAnchor="middle" fill={color} fontSize={12} fontWeight={800}>
          {done ? '✓' : remaining}
        </text>
      </svg>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: done ? GREEN : TEXT }}>
          {done ? 'Rest done — next set!' : 'Resting…'}
        </div>
        <div style={{ fontSize: 11, color: MUTED }}>
          {done ? 'Tap to dismiss' : `${remaining}s remaining`}
        </div>
      </div>

      <button
        onClick={() => { setDismissed(true); onDone(); }}
        style={{ background: done ? GREEN : SURF2, border: `1px solid ${done ? GREEN : EDGE}`, borderRadius: 8, padding: '7px 14px', color: done ? '#fff' : MUTED, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
      >
        {done ? 'Next set' : 'Skip'}
      </button>
    </div>
  );
}

// ── Exercise Row ─────────────────────────────────────────────────────
function ExerciseRow({
  exercise, onAddSet, onDelete, isActive, onActivate,
}: {
  exercise: WorkoutExercise;
  onAddSet: (ex: WorkoutExercise, reps: number, weight: number) => Promise<boolean>;
  onDelete: (id: number) => void;
  isActive: boolean;
  onActivate: () => void;
}) {
  const [reps,   setReps]   = useState('');
  const [weight, setWeight] = useState('');
  const [isNew,  setIsNew]  = useState<number | null>(null); // set index that is PR
  const pr = getPR(exercise.exercise_name);

  const inp: React.CSSProperties = {
    width: 64, padding: '8px 6px', borderRadius: 8, border: `1px solid ${EDGE}`,
    background: SURF2, color: TEXT, fontSize: 15, fontWeight: 700,
    textAlign: 'center', outline: 'none',
  };

  const handleLog = async () => {
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (!r || !w) return;
    const isNewPR = await onAddSet(exercise, r, w);
    if (isNewPR) setIsNew(exercise.sets.length);
    setReps('');
  };

  return (
    <div style={{ background: SURF2, borderRadius: 10, padding: '12px 14px', marginBottom: 8, border: `1px solid ${isActive ? ACCENT + '50' : EDGE}` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: exercise.sets.length > 0 ? 10 : 0 }}>
        <button onClick={onActivate} style={{ flex: 1, background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: TEXT }}>{exercise.exercise_name}</div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
            {exercise.muscle_group}
            {pr && <span style={{ marginLeft: 6, color: AMBER }}>PR {pr.weight}kg × {pr.reps}</span>}
          </div>
        </button>
        <button onClick={() => onDelete(exercise.id!)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
      </div>

      {/* Logged sets */}
      {exercise.sets.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {exercise.sets.map((s, i) => (
            <div key={i} style={{
              padding: '4px 10px', borderRadius: 6,
              background: isNew === i ? `${AMBER}20` : `${ACCENT}12`,
              border: `1px solid ${isNew === i ? AMBER + '50' : ACCENT + '30'}`,
              fontSize: 12, fontWeight: 700,
              color: isNew === i ? AMBER : ACCENT,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {s.weight}kg × {s.reps}
              {isNew === i && <span style={{ fontSize: 10 }}>🏆 PR</span>}
            </div>
          ))}
        </div>
      )}

      {/* Log set form */}
      {isActive && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <input
              type="number" inputMode="decimal" placeholder="kg"
              value={weight} onChange={e => setWeight(e.target.value)}
              style={inp}
            />
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1 }}>WEIGHT</div>
          </div>
          <div style={{ fontSize: 18, color: MUTED, fontWeight: 300, paddingBottom: 14 }}>×</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <input
              type="number" inputMode="numeric" placeholder="reps"
              value={reps} onChange={e => setReps(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLog(); }}
              style={inp}
            />
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700, letterSpacing: 1 }}>REPS</div>
          </div>
          <button
            onClick={handleLog}
            disabled={!reps || !weight}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 8, border: 'none',
              background: reps && weight ? ACCENT : EDGE,
              color: reps && weight ? '#fff' : MUTED,
              fontSize: 13, fontWeight: 800, cursor: reps && weight ? 'pointer' : 'default',
              marginBottom: 14,
            }}
          >
            Log Set {exercise.sets.length + 1}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Add Exercise Form ────────────────────────────────────────────────
function AddExerciseForm({ onAdd, onCancel }: { onAdd: (name: string, muscle: string) => void; onCancel: () => void }) {
  const [name,   setName]   = useState('');
  const [muscle, setMuscle] = useState('Chest');
  const history = getExerciseHistory();
  const suggestions = name.length >= 2
    ? history.filter(h => h.toLowerCase().includes(name.toLowerCase())).slice(0, 4)
    : [];

  return (
    <div style={{ background: SURF, border: `1px solid ${ACCENT}40`, borderRadius: 10, padding: '14px', marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: ACCENT, marginBottom: 12, letterSpacing: 1, textTransform: 'uppercase' }}>Add Exercise</div>

      {/* Name */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          autoFocus
          value={name} onChange={e => setName(e.target.value)}
          placeholder="Exercise name…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${name ? ACCENT : EDGE}`, background: SURF2, color: TEXT, fontSize: 15, fontWeight: 700, outline: 'none' }}
        />
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: SURF, border: `1px solid ${EDGE}`, borderRadius: 8, zIndex: 10, overflow: 'hidden', marginTop: 2 }}>
            {suggestions.map(s => (
              <button key={s} onClick={() => setName(s)}
                style={{ width: '100%', padding: '9px 12px', background: 'none', border: 'none', textAlign: 'left', color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer', borderBottom: `1px solid ${EDGE}` }}
              >{s}</button>
            ))}
          </div>
        )}
      </div>

      {/* Muscle group chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {MUSCLE_GROUPS.map(m => (
          <button key={m} onClick={() => setMuscle(m)} style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: muscle === m ? `${ACCENT}18` : SURF2,
            border: `1px solid ${muscle === m ? ACCENT : EDGE}`,
            color: muscle === m ? ACCENT : MUTED,
          }}>{m}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${EDGE}`, background: SURF2, color: MUTED, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        <button
          onClick={() => { if (name.trim()) onAdd(name.trim(), muscle); }}
          disabled={!name.trim()}
          style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: name.trim() ? ACCENT : EDGE, color: name.trim() ? '#fff' : MUTED, fontWeight: 800, fontSize: 13, cursor: name.trim() ? 'pointer' : 'default' }}
        >Add Exercise</button>
      </div>
    </div>
  );
}

// ── Main WorkoutLogger ────────────────────────────────────────────────
export default function WorkoutLogger({ date }: { date: string }) {
  const [exercises,    setExercises]    = useState<WorkoutExercise[]>([]);
  const [activeEx,     setActiveEx]     = useState<number | null>(null);
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [restTimer,    setRestTimer]    = useState<{ seconds: number } | null>(null);
  const [restDuration, setRestDuration] = useState(DEFAULT_REST);

  const load = useCallback(async () => {
    const rows = await db.workout_exercises.where('date').equals(date).sortBy('order');
    setExercises(rows);
    if (rows.length > 0 && activeEx === null) setActiveEx(rows[rows.length - 1].id!);
  }, [date, activeEx]);

  useEffect(() => { load(); }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddExercise = async (name: string, muscle: string) => {
    const order = exercises.length;
    const id = await db.workout_exercises.add({
      date, exercise_name: name, muscle_group: muscle,
      sets: [], order, logged_at: new Date().toISOString(),
    });
    setShowAddForm(false);
    await load();
    setActiveEx(id as number);
  };

  const handleAddSet = async (ex: WorkoutExercise, reps: number, weight: number): Promise<boolean> => {
    const newSet: WorkoutSet = { reps, weight, logged_at: new Date().toISOString() };
    const updated = [...ex.sets, newSet];
    await db.workout_exercises.update(ex.id!, { sets: updated });
    const isNewPR = checkAndSetPR(ex.exercise_name, weight, reps, date);
    await load();
    setRestTimer({ seconds: restDuration });
    return isNewPR;
  };

  const handleDeleteExercise = async (id: number) => {
    await db.workout_exercises.delete(id);
    await load();
    if (activeEx === id) setActiveEx(null);
  };

  const totalSets   = exercises.reduce((s, e) => s + e.sets.length, 0);
  const totalVolume = exercises.reduce((s, e) => s + e.sets.reduce((sv, set) => sv + set.weight * set.reps, 0), 0);

  return (
    <div style={{ marginTop: 10 }}>
      {/* Rest Timer */}
      {restTimer && (
        <RestTimer
          seconds={restTimer.seconds}
          onDone={() => setRestTimer(null)}
        />
      )}

      {/* Stats bar */}
      {totalSets > 0 && (
        <div style={{ display: 'flex', gap: 16, padding: '8px 12px', background: `${ACCENT}10`, borderRadius: 8, marginBottom: 10, border: `1px solid ${ACCENT}25` }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: ACCENT, letterSpacing: -0.5 }}>{exercises.length}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>Exercises</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: ACCENT, letterSpacing: -0.5 }}>{totalSets}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>Sets</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: ACCENT, letterSpacing: -0.5 }}>{totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}t` : `${totalVolume}kg`}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 }}>Volume</div>
          </div>
          {/* Rest duration picker */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 9, color: MUTED, fontWeight: 700 }}>REST</div>
            {[60, 90, 120, 180].map(s => (
              <button key={s} onClick={() => setRestDuration(s)} style={{
                padding: '3px 7px', borderRadius: 5, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                background: restDuration === s ? `${ACCENT}20` : 'none',
                border: `1px solid ${restDuration === s ? ACCENT : EDGE}`,
                color: restDuration === s ? ACCENT : MUTED,
              }}>{s}s</button>
            ))}
          </div>
        </div>
      )}

      {/* Exercise list */}
      {exercises.map(ex => (
        <ExerciseRow
          key={ex.id}
          exercise={ex}
          isActive={activeEx === ex.id}
          onActivate={() => setActiveEx(ex.id!)}
          onAddSet={handleAddSet}
          onDelete={handleDeleteExercise}
        />
      ))}

      {/* Add exercise */}
      {showAddForm ? (
        <AddExerciseForm onAdd={handleAddExercise} onCancel={() => setShowAddForm(false)} />
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            width: '100%', padding: '11px', borderRadius: 10,
            border: `1.5px dashed ${ACCENT}60`, background: `${ACCENT}06`,
            color: ACCENT, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}
        >+ Add Exercise</button>
      )}
    </div>
  );
}
