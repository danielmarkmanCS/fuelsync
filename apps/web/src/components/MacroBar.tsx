interface Props {
  label: string; current: number; target: number; unit: string; color: string;
}

export default function MacroBar({ label, current, target, unit, color }: Props) {
  const pct  = target > 0 ? Math.min(current / target, 1) : 0;
  const over = target > 0 && current > target;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ color: '#888', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ color: over ? '#ef4444' : '#fff', fontSize: 12, fontWeight: 600 }}>
          {Math.round(current)}<span style={{ color: '#555' }}>/{Math.round(target)}{unit}</span>
        </span>
      </div>
      <div style={{ height: 4, background: '#222', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.round(pct * 100)}%`,
          background: over ? '#ef4444' : color, borderRadius: 2,
          transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: `0 0 8px ${over ? '#ef4444' : color}88`,
        }} />
      </div>
    </div>
  );
}
