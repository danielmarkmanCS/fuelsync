import type { TrainingType } from '@shared/types';

const BLUE   = '#2563EB';
const GREEN  = '#16A34A';
const YELLOW = '#D97706';
const MUTED  = '#64748B';
const SURF   = '#FFFFFF';
const EDGE   = 'rgba(37, 99, 235, 0.12)';
const TEXT   = '#0F172A';
const MUTED2 = '#E2EAF4';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; label: string; sub: string; color: string }> = [
  { value: 'rest',     label: 'REST',   sub: 'fat + recovery', color: YELLOW },
  { value: 'strength', label: 'LIFT',   sub: 'protein up',     color: BLUE   },
  { value: 'cardio',   label: 'RUN',    sub: 'carbs = fuel',   color: GREEN  },
  { value: 'hybrid',   label: 'HYBRID', sub: 'balanced',       color: '#64748B' },
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
              background: active ? `${color}12` : SURF,
              border: `1px solid ${active ? color : EDGE}`,
              borderTop: active ? `3px solid ${color}` : `1px solid ${EDGE}`,
              borderRadius: 12,
              padding: '13px 0 11px',
              cursor: 'pointer',
              textAlign: 'center',
              boxShadow: active
                ? `0 4px 14px ${color}25`
                : '0 1px 4px rgba(37,99,235,0.06)',
              transition: 'all 0.18s ease',
            }}
          >
            <div style={{
              fontSize: 13, fontWeight: 900, letterSpacing: 0.5,
              color: active ? color : MUTED,
              fontFamily: "'Barlow Condensed', 'Inter', system-ui, sans-serif",
            }}>
              {label}
            </div>
            <div style={{ fontSize: 9, color: active ? color : MUTED2, fontWeight: 700, marginTop: 3, opacity: active ? 0.9 : 0.7 }}>
              {sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}
