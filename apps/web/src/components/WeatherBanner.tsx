import type { WeatherConditions, EnvironmentAlert } from '@shared/types';

interface Props { weather: WeatherConditions; alert: EnvironmentAlert; }

const COLOR: Record<EnvironmentAlert['level'], string> = {
  none: '#4ADE80', caution: '#FACC15', danger: '#FF3B30',
};

export default function WeatherBanner({ weather, alert }: Props) {
  const c = COLOR[alert.level];
  return (
    <div style={{
      background: 'linear-gradient(145deg, #111111 0%, #0f0f0f 100%)',
      borderRadius: 16,
      padding: '16px 16px',
      border: '1px solid #222222',
      borderTop: `2px solid ${c}`,
      boxShadow: `0 4px 24px ${c}14`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <span style={{ color: '#FFFFFF', fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>{Math.round(weather.tempC)}°</span>
          <span style={{ color: '#666666', fontSize: 13, marginLeft: 8 }}>{weather.description}</span>
          <div style={{ color: '#444444', fontSize: 11, marginTop: 4 }}>
            {weather.city} · {weather.humidity}% RH · UV {weather.uvIndex}
          </div>
        </div>
        <div style={{ background: `${c}12`, border: `1px solid ${c}30`, borderRadius: 8, padding: '4px 10px' }}>
          <span style={{ color: c, fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{alert.level.toUpperCase()}</span>
        </div>
      </div>
      <p style={{ color: '#666666', fontSize: 13, lineHeight: 1.6, margin: 0 }}>{alert.message}</p>
      {alert.suggestedPivot && (
        <div style={{ marginTop: 10, background: '#181818', borderRadius: 8, padding: 10, border: '1px solid #222222' }}>
          <div style={{ color: '#FF3B30', fontSize: 11, fontWeight: 700, marginBottom: 4 }}>
            SWAP → {alert.suggestedPivot.toUpperCase()}
          </div>
          {alert.pivotReason && <div style={{ color: '#555555', fontSize: 11, lineHeight: 1.5 }}>{alert.pivotReason}</div>}
        </div>
      )}
      {alert.extraHydrationMl && (
        <div style={{ color: '#22D3EE', fontSize: 12, marginTop: 8, fontWeight: 700 }}>
          +{alert.extraHydrationMl} ml extra hydration
        </div>
      )}
    </div>
  );
}
