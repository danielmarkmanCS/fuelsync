const PROT  = '#38BDF8';
const CARB  = '#22C55E';
const FAT   = '#F59E0B';

interface Props {
  protein: number;
  carbs: number;
  fat: number;
  size?: number;
}

function slice(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= 360) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx - r + 0.001} ${cy} Z`;
  }
  const s = ((start - 90) * Math.PI) / 180;
  const e = ((end   - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(s);
  const y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e);
  const y2 = cy + r * Math.sin(e);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export default function MacroPie({ protein, carbs, fat, size = 72 }: Props) {
  const cal = protein * 4 + carbs * 4 + fat * 9;
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;

  if (cal <= 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--edge)" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={r / 2} fill="none" stroke="var(--edge)" strokeWidth={1} />
      </svg>
    );
  }

  const pPct = (protein * 4) / cal;
  const cPct = (carbs   * 4) / cal;
  const fPct = (fat     * 9) / cal;

  const slices = [
    { pct: pPct, color: PROT },
    { pct: cPct, color: CARB },
    { pct: fPct, color: FAT  },
  ];

  let angle = 0;
  const paths = slices
    .filter(s => s.pct > 0.005)
    .map(s => {
      const start = angle;
      const end   = angle + s.pct * 360;
      angle = end;
      return { d: slice(cx, cy, r, start, end), color: s.color };
    });

  const ir = r * 0.52;

  return (
    <svg width={size} height={size}>
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.color} opacity={0.85} />
      ))}
      <circle cx={cx} cy={cy} r={ir} fill="var(--surf)" />
    </svg>
  );
}

export function MacroPieLegend({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const cal = protein * 4 + carbs * 4 + fat * 9;
  const fmt = (n: number) => cal > 0 ? Math.round((n / cal) * 100) + '%' : '—';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center' }}>
      {[
        { label: 'Protein', val: protein, color: PROT, calPer: 4 },
        { label: 'Carbs',   val: carbs,   color: CARB, calPer: 4 },
        { label: 'Fat',     val: fat,     color: FAT,  calPer: 9 },
      ].map(({ label, val, color, calPer }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, flex: 1 }}>{label}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{Math.round(val)}g</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', minWidth: 30, textAlign: 'right' }}>{fmt(val * calPer)}</span>
        </div>
      ))}
    </div>
  );
}
