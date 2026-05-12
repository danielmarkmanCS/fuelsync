import type { WeatherConditions, EnvironmentAlert } from '@shared/types';

interface Props { weather: WeatherConditions; alert: EnvironmentAlert; }

const COLOR: Record<EnvironmentAlert['level'], string> = {
  none: '#22c55e', caution: '#f59e0b', danger: '#FF1C1C',
};

export default function WeatherBanner({ weather, alert }: Props) {
  const c = COLOR[alert.level];
  return (
    <div style={{
      background: '#141414', borderRadius: 14,
      padding: '14px 16px',
      border: '1px solid #1E1E1E',
      borderLeft: `3px solid ${c}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <span style={{ color: '#fff', fontSize: 30, fontWeight: 900, letterSpacing: -1 }}>{Math.round(weather.tempC)}°</span>
          <span style={{ color: '#444', fontSize: 13, marginLeft: 8 }}>{weather.description}</span>
          <div style={{ color: '#333', fontSize: 11, marginTop: 4 }}>
            {weather.city} · {weather.humidity}% RH · UV {weather.uvIndex}
          </div>
        </div>
        <div style={{ background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 8, padding: '4px 10px' }}>
          <span style={{ color: c, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{alert.level.toUpperCase()}</span>
        </div>
      </div>
      <p style={{ color: '#555', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{alert.message}</p>
      {alert.suggestedPivot && (
        <div style={{ marginTop: 10, background: '#0C0C0C', borderRadius: 8, padding: 10, border: '1px solid #222' }}>
          <div style={{ color: '#FF1C1C', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
            SWAP → {alert.suggestedPivot.toUpperCase()}
          </div>
          {alert.pivotReason && <div style={{ color: '#444', fontSize: 11, lineHeight: 1.5 }}>{alert.pivotReason}</div>}
        </div>
      )}
      {alert.extraHydrationMl && (
        <div style={{ color: '#3b82f6', fontSize: 12, marginTop: 8, fontWeight: 600 }}>
          +{alert.extraHydrationMl} ml extra hydration
        </div>
      )}
    </div>
  );
}
