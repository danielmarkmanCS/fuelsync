import type { TrainingType } from '@shared/types';

const SURF2 = '#161616';
const EDGE  = 'rgba(255,255,255,0.08)';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; label: string; tag: string; color: string }> = [
  { value: 'rest',     label: 'Rest',     tag: 'High fat · Low carb', color: '#5AC8FA' },
  { value: 'strength', label: 'Strength', tag: 'High protein',         color: '#30D158' },
  { value: 'cardio',   label: 'Cardio',   tag: 'High carb',            color: '#FF9F0A' },
  { value: 'hybrid',   label: 'Hybrid',   tag: 'Balanced',             color: '#BF5AF2' },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {TYPES.map(({ value, label, tag, color }) => {
        const active = selected === value;
        return (
          <button key={value} onClick={() => onSelect(value)} className="nrc-press" style={{
            textAlign: 'left', padding: '14px 16px 12px',
            background: active ? `${color}0F` : SURF2,
            border: '1px solid',
            borderColor: active ? color : EDGE,
            borderTop: active ? `2px solid ${color}` : `1px solid ${EDGE}`,
            boxShadow: active ? `0 4px 20px ${color}18` : 'none',
            borderRadius: 16, cursor: 'pointer',
            transition: 'all 0.18s',
          }}>
            <div style={{
              fontSize: 17, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1,
              color: active ? color : '#333333',
              marginBottom: 6,
            }}>{label}</div>
            <div style={{
              fontSize: 11, fontWeight: 500,
              color: active ? `${color}99` : '#2A2A2A',
            }}>{tag}</div>
          </button>
        );
      })}
    </div>
  );
}
