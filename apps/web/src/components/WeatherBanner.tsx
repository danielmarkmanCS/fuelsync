import type { WeatherConditions, EnvironmentAlert } from '@shared/types';

interface Props { weather: WeatherConditions; alert: EnvironmentAlert; }

const SURF  = '#FFFFFF';
const SURF2 = '#E4EEFF';
const EDGE  = 'rgba(0,56,168,0.10)';
const TEXT  = '#0A1628';
const MUTED = '#6878A0';
const BLUE  = '#0038A8';

const COLOR: Record<EnvironmentAlert['level'], string> = {
  none:    '#00A651',
  caution: '#F9A825',
  danger:  '#C62828',
};

export default function WeatherBanner({ weather, alert }: Props) {
  const c = COLOR[alert.level];
  return (
    <div style={{
      background: SURF,
      borderRadius: 16,
      padding: '16px 16px',
      border: `1px solid ${EDGE}`,
      borderTop: `3px solid ${c}`,
      boxShadow: `0 4px 20px rgba(0,56,168,0.08)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: TEXT, fontSize: 36, fontWeight: 900, letterSpacing: -1.5, lineHeight: 1 }}>{Math.round(weather.tempC)}°</span>
            <span style={{ color: MUTED, fontSize: 13, fontWeight: 500 }}>{weather.description}</span>
          </div>
          <div style={{ color: MUTED, fontSize: 11, marginTop: 5, fontWeight: 500 }}>
            {weather.city} · {weather.humidity}% RH · UV {weather.uvIndex}
          </div>
        </div>
        <div style={{ background: `${c}10`, border: `1px solid ${c}30`, borderRadius: 8, padding: '5px 10px' }}>
          <span style={{ color: c, fontSize: 9, fontWeight: 800, letterSpacing: 1.5 }}>{alert.level.toUpperCase()}</span>
        </div>
      </div>

      <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>{alert.message}</p>

      {alert.suggestedPivot && (
        <div style={{ marginTop: 12, background: SURF2, borderRadius: 10, padding: '10px 12px', border: `1px solid ${EDGE}` }}>
          <div style={{ color: BLUE, fontSize: 11, fontWeight: 700, marginBottom: 4, letterSpacing: 0.5 }}>
            SWAP → {alert.suggestedPivot.toUpperCase()}
          </div>
          {alert.pivotReason && <div style={{ color: MUTED, fontSize: 11, lineHeight: 1.5 }}>{alert.pivotReason}</div>}
        </div>
      )}

      {alert.extraHydrationMl && (
        <div style={{ color: '#0288D1', fontSize: 12, marginTop: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>💧</span>
          +{alert.extraHydrationMl} ml extra hydration
        </div>
      )}
    </div>
  );
}
