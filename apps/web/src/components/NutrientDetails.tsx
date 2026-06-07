interface Nutrients {
  fiber_g?: number | null;
  sodium_mg?: number | null;
  cholesterol_mg?: number | null;
  vitamin_c_mg?: number | null;
  vitamin_d_mcg?: number | null;
  calcium_mg?: number | null;
  iron_mg?: number | null;
}

interface DV {
  fiber: number;
  sodium: number;
  cholesterol: number;
  vitamin_c: number;
  vitamin_d: number;
  calcium: number;
  iron: number;
}

const DAILY_VALUES: DV = {
  fiber:       25,
  sodium:      2300,
  cholesterol: 300,
  vitamin_c:   90,
  vitamin_d:   20,
  calcium:     1300,
  iron:        18,
};

function NutrientRow({ label, value, unit, dv, color }: { label: string; value: number; unit: string; dv?: number; color?: string }) {
  const pct = dv && dv > 0 ? Math.min((value / dv) * 100, 100) : 0;
  const over = dv ? value > dv : false;
  const clr = color ?? (over ? '#EF4444' : 'var(--accent)');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: over ? '#EF4444' : 'var(--text)' }}>
          {value % 1 === 0 ? value : value.toFixed(1)}{unit}
          {dv && <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--muted)' }}> / {dv}{unit}</span>}
        </span>
      </div>
      {dv && (
        <div style={{ height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: clr, borderRadius: 2, transition: 'width 0.4s ease' }} />
        </div>
      )}
    </div>
  );
}

interface Props extends Nutrients {
  compact?: boolean;
}

export default function NutrientDetails({ fiber_g, sodium_mg, cholesterol_mg, vitamin_c_mg, vitamin_d_mcg, calcium_mg, iron_mg, compact = false }: Props) {
  const rows = [
    { label: 'Fiber',       value: fiber_g,         unit: 'g',   dv: DAILY_VALUES.fiber,       color: '#22C55E' },
    { label: 'Sodium',      value: sodium_mg,        unit: 'mg',  dv: DAILY_VALUES.sodium,      color: '#F59E0B' },
    { label: 'Cholesterol', value: cholesterol_mg,   unit: 'mg',  dv: DAILY_VALUES.cholesterol, color: '#F97316' },
    { label: 'Vitamin C',   value: vitamin_c_mg,     unit: 'mg',  dv: DAILY_VALUES.vitamin_c,   color: '#FBBF24' },
    { label: 'Vitamin D',   value: vitamin_d_mcg,    unit: 'mcg', dv: DAILY_VALUES.vitamin_d,   color: '#A78BFA' },
    { label: 'Calcium',     value: calcium_mg,       unit: 'mg',  dv: DAILY_VALUES.calcium,     color: '#38BDF8' },
    { label: 'Iron',        value: iron_mg,          unit: 'mg',  dv: DAILY_VALUES.iron,        color: '#EF4444' },
  ].filter(r => r.value != null && r.value > 0) as { label: string; value: number; unit: string; dv: number; color: string }[];

  if (rows.length === 0) return null;

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {rows.map(r => (
          <div key={r.label} style={{
            padding: '4px 8px', borderRadius: 6, background: 'var(--edge)',
            fontSize: 10, fontWeight: 700, color: 'var(--muted)',
          }}>
            <span style={{ color: r.color }}>{r.label} </span>
            {r.value % 1 === 0 ? r.value : r.value.toFixed(1)}{r.unit}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--surf2)', borderRadius: 8, padding: '12px 14px',
      border: '1px solid var(--edge)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
        Nutrients
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => (
          <NutrientRow key={r.label} label={r.label} value={r.value} unit={r.unit} dv={r.dv} color={r.color} />
        ))}
      </div>
    </div>
  );
}
