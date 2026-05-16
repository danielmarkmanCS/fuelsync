import type { TrainingType } from '@shared/types';

const RED   = '#FF3B30';
const CARD2 = '#181818';
const BORD  = '#222222';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; label: string; tag: string; color: string }> = [
  { value: 'rest',     label: 'Rest',     tag: 'High fat · Low carb', color: '#22D3EE' },
  { value: 'strength', label: 'Strength', tag: 'High protein',         color: '#4ADE80' },
  { value: 'cardio',   label: 'Cardio',   tag: 'High carb',            color: '#FB923C' },
  { value: 'hybrid',   label: 'Hybrid',   tag: 'Balanced',             color: '#F472B6' },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {TYPES.map(({ value, label, tag, color }) => {
        const active = selected === value;
        return (
          <button key={value} onClick={() => onSelect(value)} className="nrc-press" style={{
            textAlign: 'left', padding: '14px 16px 12px',
            background: active ? `${color}0F` : CARD2,
            border: '1px solid',
            borderColor: active ? color : BORD,
            borderTop: active ? `2px solid ${color}` : `1px solid ${BORD}`,
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
