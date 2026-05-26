interface Props {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}

export default function MacroCard({ label, current, target, unit, color }: Props) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0;
  const over = target > 0 && current > target;
  const remaining = Math.round(target - current);

  return (
    <div style={{
      background: 'var(--surf)',
      borderRadius: 8,
      padding: '12px 14px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      <div style={{ color: 'var(--muted)', fontSize: 9, fontWeight: 700, letterSpacing: 2, marginBottom: 10 }}>
        {label}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 2 }}>
        <span style={{ color: over ? '#FF3B30' : 'var(--text)', fontSize: 26, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>
          {Math.round(current).toLocaleString()}
        </span>
        <span style={{ color: 'var(--muted2)', fontSize: 11, fontWeight: 600 }}>{unit}</span>
      </div>

      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 500, marginBottom: 14 }}>
        of {Math.round(target).toLocaleString()}{unit}
      </div>

      {/* Bar */}
      <div style={{ height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${Math.round(pct * 100)}%`,
          background: over ? '#FF3B30' : color,
          borderRadius: 2,
          transition: 'width 0.5s ease',
        }} />
      </div>

      <div style={{ marginTop: 8, color: over ? '#FF3B30' : 'var(--muted)', fontSize: 10, fontWeight: 600 }}>
        {over ? `+${Math.abs(remaining)}${unit} over` : remaining <= 0 ? 'Done' : `${remaining}${unit} left`}
      </div>
    </div>
  );
}
