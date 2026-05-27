import type { TrainingType } from '@shared/types';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; emoji: string; label: string; sub: string; color: string }> = [
  { value: 'rest',     emoji: '😴', label: 'REST',   sub: 'fat + recovery',  color: '#8B949E' },
  { value: 'strength', emoji: '🏋️', label: 'LIFT',   sub: 'protein up',      color: '#38BDF8' },
  { value: 'cardio',   emoji: '🏃', label: 'RUN',    sub: 'carbs = fuel',    color: '#22C55E' },
  { value: 'hybrid',   emoji: '⚡', label: 'HYBRID', sub: 'balanced',        color: 'var(--accent)' },
  { value: 'hiit',     emoji: '🔥', label: 'HIIT',   sub: 'max intensity',   color: '#EF4444' },
  { value: 'cycling',  emoji: '🚴', label: 'CYCLE',  sub: 'sustained carbs', color: '#F97316' },
  { value: 'yoga',     emoji: '🧘', label: 'YOGA',   sub: 'low intensity',   color: '#A78BFA' },
  { value: 'walk',     emoji: '🚶', label: 'WALK',   sub: 'active recovery', color: '#34D399' },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
      {TYPES.map(({ value, emoji, label, sub, color }) => {
        const active = selected === value;
        const isVar  = color.startsWith('var(');
        const bgColor = active
          ? isVar ? 'var(--accent-muted)' : `${color}18`
          : 'var(--surf2)';
        return (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className="press"
            style={{
              background: bgColor,
              border: `1px solid ${active ? color : 'var(--edge)'}`,
              borderTop: active ? `3px solid ${color}` : `1px solid var(--edge)`,
              borderRadius: 10,
              padding: '11px 0 9px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{ fontSize: 16, lineHeight: 1, marginBottom: 4 }}>{emoji}</div>
            <div style={{
              fontSize: 11, fontWeight: 900, letterSpacing: 0.5,
              color: active ? color : 'var(--muted)',
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 8, fontWeight: 700, marginTop: 2,
              color: active ? color : 'var(--muted2)',
              opacity: active ? 0.9 : 0.7,
            }}>
              {sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}
