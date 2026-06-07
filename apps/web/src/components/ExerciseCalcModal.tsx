import { useState } from 'react';

// MET values for common activities
const ACTIVITIES = [
  { id: 'running',      label: 'Running',          met: 9.8  },
  { id: 'cycling',      label: 'Cycling',          met: 7.5  },
  { id: 'walking',      label: 'Walking',          met: 3.5  },
  { id: 'strength',     label: 'Strength Training', met: 5.0  },
  { id: 'hiit',         label: 'HIIT',             met: 10.0 },
  { id: 'swimming',     label: 'Swimming',         met: 8.0  },
  { id: 'yoga',         label: 'Yoga / Stretching', met: 2.5  },
  { id: 'elliptical',   label: 'Elliptical',       met: 5.5  },
  { id: 'rowing',       label: 'Rowing',           met: 7.0  },
  { id: 'basketball',   label: 'Basketball',       met: 7.5  },
  { id: 'soccer',       label: 'Soccer',           met: 9.0  },
  { id: 'jump_rope',    label: 'Jump Rope',        met: 11.0 },
  { id: 'stair',        label: 'Stair Climbing',   met: 9.0  },
  { id: 'dancing',      label: 'Dancing',          met: 6.0  },
  { id: 'martial_arts', label: 'Martial Arts',     met: 8.0  },
];

interface Props {
  weightKg: number;
  onAdd: (kcal: number, label: string) => void;
  onClose: () => void;
}

export default function ExerciseCalcModal({ weightKg, onAdd, onClose }: Props) {
  const [activity, setActivity] = useState(ACTIVITIES[0].id);
  const [minutes,  setMinutes]  = useState('30');

  const selected = ACTIVITIES.find(a => a.id === activity) ?? ACTIVITIES[0];
  const wkg = weightKg > 0 ? weightKg : 75;
  const min = parseInt(minutes, 10) || 0;
  const kcal = Math.round((selected.met * wkg * (min / 60)));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surf)', borderRadius: '12px 12px 0 0',
        padding: '20px 20px 32px', width: '100%', maxWidth: 480,
        border: '1px solid var(--edge)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.3 }}>
            Exercise Calories
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>

        {/* Activity selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Activity</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {ACTIVITIES.map(a => (
              <button
                key={a.id}
                onClick={() => setActivity(a.id)}
                style={{
                  padding: '8px 6px', borderRadius: 8, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
                  border: `1.5px solid ${a.id === activity ? 'var(--accent)' : 'var(--edge)'}`,
                  background: a.id === activity ? 'var(--accent-muted)' : 'var(--surf2)',
                  color: a.id === activity ? 'var(--accent)' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >{a.label}</button>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Duration</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[15, 30, 45, 60, 90].map(m => (
              <button
                key={m}
                onClick={() => setMinutes(String(m))}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  border: `1.5px solid ${minutes === String(m) ? 'var(--accent)' : 'var(--edge)'}`,
                  background: minutes === String(m) ? 'var(--accent-muted)' : 'var(--surf2)',
                  color: minutes === String(m) ? 'var(--accent)' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >{m}m</button>
            ))}
            <input
              type="number" min={1} max={300} value={minutes}
              onChange={e => setMinutes(e.target.value)}
              style={{
                width: 60, padding: '9px 8px', borderRadius: 8, textAlign: 'center',
                background: 'var(--surf2)', border: '1.5px solid var(--edge)',
                color: 'var(--text)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Result */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderRadius: 8,
          background: 'var(--accent-muted)', border: '1px solid var(--accent)',
          marginBottom: 14,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
              {selected.label} · {min} min · {wkg}kg
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              MET {selected.met} × {wkg}kg × {(min / 60).toFixed(2)}h
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)', letterSpacing: -1, lineHeight: 1 }}>{kcal}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>kcal burned</div>
          </div>
        </div>

        {weightKg <= 0 && (
          <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 10, lineHeight: 1.5 }}>
            Using 75kg estimate — add your weight in Profile for accuracy.
          </div>
        )}

        <button
          onClick={() => {
            if (kcal > 0) onAdd(kcal, `${selected.label} ${min}min`);
          }}
          style={{
            width: '100%', padding: '14px', borderRadius: 8, border: 'none',
            background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 800,
            cursor: kcal > 0 ? 'pointer' : 'not-allowed', opacity: kcal > 0 ? 1 : 0.4,
          }}
        >+ Add {kcal} kcal Burned</button>
      </div>
    </div>
  );
}
