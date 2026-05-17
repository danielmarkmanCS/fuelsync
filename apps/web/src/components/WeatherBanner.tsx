import type { WeatherConditions, EnvironmentAlert } from '@shared/types';

interface Props { weather: WeatherConditions; alert: EnvironmentAlert; }

const SURF2 = '#161616';
const EDGE  = 'rgba(255,255,255,0.08)';

const COLOR: Record<EnvironmentAlert['level'], string> = {
  none:    '#30D158',
  caution: '#FFD60A',
  danger:  '#FF453A',
};

export default function WeatherBanner({ weather, alert }: Props) {
  const c = COLOR[alert.level];
  return (
    <div style={{
      background: '#0A0A0A',
      borderRadius: 16,
      padding: '16px 16px',
      border: `1px solid ${EDGE}`,
      borderTop: `2px solid ${c}`,
      boxShadow: `0 4px 24px ${c}14`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: '#FFFFFF', fontSize: 36, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{Math.round(weather.tempC)}°</span>
            <span style={{ color: '#444444', fontSize: 13, fontWeight: 500 }}>{weather.description}</span>
          </div>
          <div style={{ color: '#333333', fontSize: 11, marginTop: 5, fontWeight: 500 }}>
            {weather.city} · {weather.humidity}% RH · UV {weather.uvIndex}
          </div>
        </div>
        <div style={{ background: `${c}10`, border: `1px solid ${c}25`, borderRadius: 8, padding: '5px 10px' }}>
          <span style={{ color: c, fontSize: 9, fontWeight: 800, letterSpacing: 1.5 }}>{alert.level.toUpperCase()}</span>
        </div>
      </div>

      <p style={{ color: '#555555', fontSize: 13, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{alert.message}</p>

      {alert.suggestedPivot && (
        <div style={{ marginTop: 12, background: SURF2, borderRadius: 10, padding: '10px 12px', border: `1px solid ${EDGE}` }}>
          <div style={{ color: '#FF453A', fontSize: 11, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
            SWAP → {alert.suggestedPivot.toUpperCase()}
          </div>
          {alert.pivotReason && <div style={{ color: '#444444', fontSize: 11, lineHeight: 1.5 }}>{alert.pivotReason}</div>}
        </div>
      )}

      {alert.extraHydrationMl && (
        <div style={{ color: '#5AC8FA', fontSize: 12, marginTop: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>💧</span>
          +{alert.extraHydrationMl} ml extra hydration
        </div>
      )}
    </div>
  );
}
