import type { TrainingType } from '@shared/types';

const SURF2 = '#1D2333';
const EDGE  = 'rgba(255,255,255,0.07)';
const TEXT  = '#DCE6FF';
const MUTED = '#5A6990';

interface Props { selected: TrainingType | null; onSelect: (t: TrainingType) => void; }

function RestIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function StrengthIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5"  cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
      <line x1="6.8" y1="12" x2="9.5" y2="12" />
      <line x1="14.5" y1="12" x2="17.2" y2="12" />
      <rect x="9.5" y="9" width="5" height="6" rx="1.2" />
    </svg>
  );
}
function CardioIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={color}>
      <path d="M13 2L4.09 12.76A1 1 0 005 14.5h6L10 22l9.91-10.76A1 1 0 0019 9.5H13.5L13 2z" />
    </svg>
  );
}
function HybridIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

const TYPES: Array<{
  value: TrainingType;
  label: string;
  tag: string;
  impact: string;
  color: string;
  Icon: React.FC<{ color: string }>;
}> = [
  { value: 'rest',     label: 'Rest',     tag: 'High fat · Low carb', impact: '−8% carbs',   color: '#00BDD0', Icon: RestIcon     },
  { value: 'strength', label: 'Strength', tag: 'High protein',         impact: '+15% protein', color: '#05C56B', Icon: StrengthIcon },
  { value: 'cardio',   label: 'Cardio',   tag: 'High carb',            impact: '+20% carbs',  color: '#FF8B00', Icon: CardioIcon   },
  { value: 'hybrid',   label: 'Hybrid',   tag: 'Balanced',             impact: 'Balanced',    color: '#8034E0', Icon: HybridIcon   },
];

export default function TrainingPicker({ selected, onSelect }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {TYPES.map(({ value, label, tag, impact, color, Icon }) => {
        const active = selected === value;
        return (
          <button
            key={value}
            onClick={() => onSelect(value)}
            className="nrc-press"
            style={{
              textAlign: 'left',
              padding: '14px 15px 13px',
              background: active
                ? `linear-gradient(135deg, ${color}14 0%, ${color}08 100%)`
                : SURF2,
              border: `1px solid ${active ? color : EDGE}`,
              borderTop: active ? `3px solid ${color}` : `1px solid ${EDGE}`,
              borderRadius: 16,
              cursor: 'pointer',
              transition: 'all 0.18s cubic-bezier(0.34,1.56,0.64,1)',
              boxShadow: active
                ? `0 6px 20px ${color}22, 0 2px 6px ${color}10`
                : '0 1px 4px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ marginBottom: 9, color: active ? color : MUTED, transition: 'color 0.15s' }}>
              <Icon color={active ? color : MUTED} />
            </div>
            <div style={{
              fontSize: 16, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1,
              color: active ? color : TEXT, marginBottom: 5, transition: 'color 0.15s',
            }}>
              {label}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 600,
              color: active ? color : MUTED, opacity: active ? 0.85 : 1,
              marginBottom: active ? 6 : 0, transition: 'all 0.15s',
            }}>
              {tag}
            </div>
            {active && (
              <div style={{
                display: 'inline-block',
                background: `${color}18`, border: `1px solid ${color}30`,
                borderRadius: 20, padding: '2px 8px',
                fontSize: 9, fontWeight: 800, color, letterSpacing: 0.5,
              }}>
                {impact}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
