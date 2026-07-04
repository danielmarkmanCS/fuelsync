interface Props {
  label: string; current: number; target: number; unit: string; color: string;
}

const GLOW: Record<string, string> = {
  '#38BDF8': 'rgba(56,189,248,0.30)',
  '#4ADE80': 'rgba(74,222,128,0.30)',
  '#FBBF24': 'rgba(251,191,36,0.30)',
};

export default function MacroBar({ label, current, target, unit, color }: Props) {
  const pct   = target > 0 ? Math.min(current / target, 1) : 0;
  const over  = target > 0 && current > target;
  const c     = over ? '#F87171' : color;
  const glow  = over ? 'rgba(248,113,113,0.28)' : (GLOW[color] ?? `${color}44`);
  const pcNum = Math.round(pct * 100);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8,
      }}>
        <span style={{
          color: 'var(--muted)', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.8px', textTransform: 'uppercase',
        }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            color: over ? '#F87171' : 'var(--text)',
            fontSize: 13, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {Math.round(current)}
          </span>
          <span style={{ color: 'var(--muted2)', fontSize: 11, fontWeight: 500 }}>
            /{Math.round(target)}{unit}
          </span>
          {target > 0 && (
            <span style={{
              color: over ? '#F87171' : c,
              fontSize: 10, fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              marginLeft: 2,
            }}>
              {pcNum}%
            </span>
          )}
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--edge2)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.round(pct * 100)}%`,
          borderRadius: 99,
          background: `linear-gradient(90deg, ${c}, ${c}CC)`,
          boxShadow: `0 0 10px ${glow}`,
          transition: 'width 0.65s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}
