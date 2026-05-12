import type { TrainingType } from '@shared/types';

const RED = '#FF1C1C';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

const TYPES: Array<{ value: TrainingType; label: string; tag: string }> = [
  { value: 'rest',     label: 'Rest',     tag: 'High fat · Low carb' },
  { value: 'strength', label: 'Strength', tag: 'High protein' },
  { value: 'cardio',   label: 'Cardio',   tag: 'High carb' },
  { value: 'hybrid',   label: 'Hybrid',   tag: 'Balanced' },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {TYPES.map(({ value, label, tag }) => {
        const active = selected === value;
        return (
          <button key={value} onClick={() => onSelect(value)} className="nrc-press" style={{
            textAlign: 'left', padding: '14px 16px 12px',
            background: active ? '#1A1A1A' : '#141414',
            border: '1px solid', borderColor: active ? RED : '#1E1E1E',
            borderLeft: active ? `3px solid ${RED}` : '1px solid #1E1E1E',
            borderRadius: 14, cursor: 'pointer',
            transition: 'all 0.18s',
          }}>
            <div style={{
              fontSize: 17, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1,
              color: active ? '#fff' : '#444',
              marginBottom: 6,
            }}>{label}</div>
            <div style={{
              fontSize: 11, fontWeight: 500,
              color: active ? '#C0C0C0' : '#2A2A2A',
            }}>{tag}</div>
          </button>
        );
      })}
    </div>
  );
}
