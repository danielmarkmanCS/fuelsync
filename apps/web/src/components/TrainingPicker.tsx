import type { TrainingType } from '@shared/types';

const ORANGE = '#FF8000';
const GREEN  = '#22C55E';
const YELLOW = '#F5C518';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; label: string; sub: string; color: string }> = [
  { value: 'rest',     label: 'REST',   sub: 'fat + recovery', color: YELLOW  },
  { value: 'strength', label: 'LIFT',   sub: 'protein up',     color: ORANGE  },
  { value: 'cardio',   label: 'RUN',    sub: 'carbs = fuel',   color: GREEN   },
  { value: 'hybrid',   label: 'HYBRID', sub: 'balanced',       color: 'var(--muted)' },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6 }}>
      {TYPES.map(({ value, label, sub, color }) => {
        const active = selected === value;
        return (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className="press"
            style={{
              background: active ? `${color === 'var(--muted)' ? 'var(--accent-muted)' : color + '15'}` : 'var(--surf2)',
              border: `1px solid ${active ? color : 'var(--edge)'}`,
              borderTop: active ? `3px solid ${color}` : `1px solid var(--edge)`,
              borderRadius: 10,
              padding: '13px 0 11px',
              cursor: 'pointer',
              textAlign: 'center',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{
              fontSize: 13, fontWeight: 900, letterSpacing: 0.5,
              color: active ? color : 'var(--muted)',
              fontFamily: "'Barlow Condensed', system-ui, sans-serif",
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 9, fontWeight: 700, marginTop: 3,
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
