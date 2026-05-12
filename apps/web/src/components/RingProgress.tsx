interface Props {
  size?: number;
  strokeWidth?: number;
  progress: number; // 0–1
  color: string;
  label: string;
  current: string | number;
  unit?: string;
  target?: string | number;
}

export default function RingProgress({
  size = 90,
  strokeWidth = 9,
  progress,
  color,
  label,
  current,
  unit = '',
  target,
}: Props) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(progress, 0), 1);
  const dash = pct * circ;
  const over = progress > 1;

  const cx = size / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ display: 'block' }}>
          {/* Track */}
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={`${color}22`}
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={over ? '#FF3B30' : color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        {/* Center text */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: over ? '#FF3B30' : color, fontSize: size * 0.19, fontWeight: 900, lineHeight: 1 }}>
            {typeof current === 'number' ? Math.round(current) : current}
          </span>
          {unit && (
            <span style={{ color: '#555', fontSize: size * 0.12, fontWeight: 700, letterSpacing: 0.5, lineHeight: 1.2 }}>
              {unit}
            </span>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#888', fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>{label}</div>
        {target !== undefined && (
          <div style={{ color: '#444', fontSize: 10, fontWeight: 500, marginTop: 1 }}>
            / {typeof target === 'number' ? Math.round(target) : target}{unit}
          </div>
        )}
      </div>
    </div>
  );
}
