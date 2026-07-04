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
  const r    = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(Math.max(progress, 0), 1);
  const dash = pct * circ;
  const over = progress > 1;
  const fill = over ? '#F87171' : color;
  const cx   = size / 2;

  const glowOpacity = pct > 0.05 ? 0.25 : 0;
  const gradId = `rg-${label.replace(/\s/g, '')}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <filter id={`glow-${gradId}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* Track */}
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={`${color}1A`}
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={fill}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={0}
            transform={`rotate(-90 ${cx} ${cx})`}
            style={{
              transition: 'stroke-dasharray 0.65s cubic-bezier(0.4,0,0.2,1)',
              filter: `drop-shadow(0 0 ${size * 0.06}px ${fill}${Math.round(glowOpacity * 255).toString(16).padStart(2,'0')})`,
            }}
          />
        </svg>
        {/* Center text */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            color: over ? '#F87171' : fill,
            fontSize: size * 0.20,
            fontWeight: 800,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '-0.5px',
          }}>
            {typeof current === 'number' ? Math.round(current) : current}
          </span>
          {unit && (
            <span style={{
              color: 'var(--muted)',
              fontSize: size * 0.11,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: 1.2,
              textTransform: 'uppercase',
            }}>
              {unit}
            </span>
          )}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          color: 'var(--muted)',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}>
          {label}
        </div>
        {target !== undefined && (
          <div style={{ color: 'var(--muted2)', fontSize: 10, fontWeight: 500, marginTop: 1 }}>
            / {typeof target === 'number' ? Math.round(target) : target}{unit}
          </div>
        )}
      </div>
    </div>
  );
}
