import type { WeatherConditions, EnvironmentAlert } from '@shared/types';

interface Props { weather: WeatherConditions; alert: EnvironmentAlert; }

const COLOR: Record<EnvironmentAlert['level'], string> = {
  none: '#22c55e', caution: '#f59e0b', danger: '#FF3B30',
};

export default function WeatherBanner({ weather, alert }: Props) {
  const c = COLOR[alert.level];
  return (
    <div style={{
      background: '#141414', borderRadius: 14,
      padding: '14px 16px',
      border: '1px solid #2C2C2E',
      borderLeft: `3px solid ${c}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <span style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 900, letterSpacing: -1 }}>{Math.round(weather.tempC)}°</span>
          <span style={{ color: '#888888', fontSize: 13, marginLeft: 8 }}>{weather.description}</span>
          <div style={{ color: '#555555', fontSize: 11, marginTop: 4 }}>
            {weather.city} · {weather.humidity}% RH · UV {weather.uvIndex}
          </div>
        </div>
        <div style={{ background: `${c}18`, border: `1px solid ${c}35`, borderRadius: 8, padding: '4px 10px' }}>
          <span style={{ color: c, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{alert.level.toUpperCase()}</span>
        </div>
      </div>
      <p style={{ color: '#888888', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{alert.message}</p>
      {alert.suggestedPivot && (
        <div style={{ marginTop: 10, background: '#1C1C1E', borderRadius: 8, padding: 10, border: '1px solid #2C2C2E' }}>
          <div style={{ color: '#FF3B30', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
            SWAP → {alert.suggestedPivot.toUpperCase()}
          </div>
          {alert.pivotReason && <div style={{ color: '#666666', fontSize: 11, lineHeight: 1.5 }}>{alert.pivotReason}</div>}
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
