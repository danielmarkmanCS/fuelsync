import type { TrainingType } from '@shared/types';

const ORANGE = '#FF8000';
const YELLOW = '#F5C518';
const GREEN  = '#22C55E';
const MUTED  = '#505050';
const SURF   = '#141414';
const EDGE   = 'rgba(255,255,255,0.07)';
const TEXT   = '#F0F0F0';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; label: string; sub: string; color: string }> = [
  { value: 'rest',     label: 'REST',     sub: 'fat + recovery',   color: YELLOW  },
  { value: 'strength', label: 'LIFT',     sub: 'protein up',       color: GREEN   },
  { value: 'cardio',   label: 'RUN',      sub: 'carbs up',         color: ORANGE  },
  { value: 'hybrid',   label: 'HYBRID',   sub: 'balanced',         color: '#AAA'  },
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
              background: active ? `${color}18` : SURF,
              border: `1px solid ${active ? color : EDGE}`,
              borderBottom: active ? `3px solid ${color}` : `1px solid ${EDGE}`,
              borderRadius: 10,
              padding: '13px 0 11px',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <div style={{
              fontSize: 13, fontWeight: 900, letterSpacing: 0.5,
              color: active ? color : MUTED,
              fontFamily: "'Barlow Condensed', 'Inter', system-ui, sans-serif",
            }}>
              {label}
            </div>
            {active && (
              <div style={{ fontSize: 9, color, fontWeight: 600, marginTop: 3, opacity: 0.8 }}>
                {sub}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
