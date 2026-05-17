import type { TrainingType } from '@shared/types';

const SURF2 = '#E4EEFF';
const EDGE  = 'rgba(0,56,168,0.10)';
const TEXT  = '#0A1628';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; label: string; tag: string; color: string }> = [
  { value: 'rest',     label: 'Rest',     tag: 'High fat · Low carb', color: '#0288D1' },
  { value: 'strength', label: 'Strength', tag: 'High protein',         color: '#00A651' },
  { value: 'cardio',   label: 'Cardio',   tag: 'High carb',            color: '#E65100' },
  { value: 'hybrid',   label: 'Hybrid',   tag: 'Balanced',             color: '#7B1FA2' },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {TYPES.map(({ value, label, tag, color }) => {
        const active = selected === value;
        return (
          <button key={value} onClick={() => onSelect(value)} className="nrc-press" style={{
            textAlign: 'left', padding: '14px 16px 12px',
            background: active ? `${color}0C` : SURF2,
            border: '1px solid',
            borderColor: active ? color : EDGE,
            borderTop: active ? `3px solid ${color}` : `1px solid ${EDGE}`,
            boxShadow: active ? `0 4px 16px ${color}20` : '0 1px 4px rgba(0,56,168,0.06)',
            borderRadius: 16, cursor: 'pointer',
            transition: 'all 0.18s',
          }}>
            <div style={{
              fontSize: 17, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1,
              color: active ? color : TEXT,
              marginBottom: 6,
            }}>{label}</div>
            <div style={{
              fontSize: 11, fontWeight: 500,
              color: active ? color : '#6878A0',
              opacity: active ? 0.8 : 1,
            }}>{tag}</div>
          </button>
        );
      })}
    </div>
  );
}
