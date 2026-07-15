import type { WeatherConditions, EnvironmentAlert } from '@shared/types';

interface Props { weather: WeatherConditions; alert: EnvironmentAlert; }

const MUTED = '#8B909A';

// ── Weather condition → vivid color theme ─────────────────────────
function getTheme(w: WeatherConditions) {
  const d = w.description.toLowerCase();
  const t = w.tempC;
  const h = w.humidity;

  if (d.includes('thunder') || d.includes('storm'))
    return {
      bg1: '#1A0D35', bg2: '#270F50',
      border: '#9B6EE0', text: '#C8A8FF',
      glow: 'rgba(130,80,220,0.18)',
      icon: '⛈️', label: 'Storm',
    };
  if (d.includes('snow') || d.includes('blizzard') || t < 0)
    return {
      bg1: '#061828', bg2: '#0E2A40',
      border: '#70C8E8', text: '#A8DCF0',
      glow: 'rgba(90,180,220,0.18)',
      icon: '❄️', label: 'Snow',
    };
  if (d.includes('rain') || d.includes('drizzle') || d.includes('shower'))
    return {
      bg1: '#081830', bg2: '#102540',
      border: '#4A8FCC', text: '#7ABAEE',
      glow: 'rgba(60,120,200,0.18)',
      icon: '🌧️', label: 'Rain',
    };
  if (t >= 35)
    return {
      bg1: '#2A0E00', bg2: '#3D1800',
      border: '#FF7020', text: '#FF9A50',
      glow: 'rgba(255,100,20,0.22)',
      icon: '🌡️', label: 'Hot',
    };
  if (t >= 28)
    return {
      bg1: '#261400', bg2: '#361E00',
      border: '#E89020', text: '#F5B040',
      glow: 'rgba(220,140,20,0.20)',
      icon: '☀️', label: 'Warm',
    };
  if (d.includes('wind') || d.includes('breezy') || d.includes('gust'))
    return {
      bg1: '#061E28', bg2: '#0E2C3A',
      border: '#3AAAC0', text: '#60CCE0',
      glow: 'rgba(40,160,190,0.18)',
      icon: '💨', label: 'Windy',
    };
  if (t <= 5)
    return {
      bg1: '#081620', bg2: '#102430',
      border: '#2A9FCC', text: '#58C0E8',
      glow: 'rgba(30,140,200,0.20)',
      icon: '🥶', label: 'Cold',
    };
  if (t <= 15)
    return {
      bg1: '#0A1C24', bg2: '#122A34',
      border: '#3A9EAE', text: '#60C0CC',
      glow: 'rgba(50,150,170,0.18)',
      icon: '🌤️', label: 'Cool',
    };
  if (h >= 80)
    return {
      bg1: '#0A1C22', bg2: '#122830',
      border: '#3A9898', text: '#58B8B8',
      glow: 'rgba(50,140,140,0.18)',
      icon: '💧', label: 'Humid',
    };
  if (d.includes('cloud') || d.includes('overcast'))
    return {
      bg1: '#121620', bg2: '#1A1E2C',
      border: '#6070A0', text: '#8A9ABE',
      glow: 'rgba(80,100,150,0.15)',
      icon: '☁️', label: 'Cloudy',
    };

  // Default: clear / nice
  return {
    bg1: '#0A1A0C', bg2: '#142518',
    border: '#4CAA3A', text: '#70CC48',
    glow: 'rgba(60,160,50,0.18)',
    icon: '🌿', label: 'Clear',
  };
}

const ALERT_COLOR: Record<EnvironmentAlert['level'], string> = {
  none:    '#4A8A3A',
  caution: '#C8861A',
  danger:  '#A63030',
};

export default function WeatherBanner({ weather, alert }: Props) {
  const theme = getTheme(weather);
  const alertColor = ALERT_COLOR[alert.level];

  return (
    <div style={{
      backgroundImage: `linear-gradient(135deg, ${theme.bg1}, ${theme.bg2})`,
      borderRadius: 14,
      border: `1px solid ${theme.border}90`,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
    }}>

      {/* Colored top accent line */}
      <div style={{
        height: 3,
        backgroundImage: `linear-gradient(90deg, ${theme.border}, ${theme.text}80, transparent)`,
      }} />

      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>

        {/* Weather icon cube */}
        <div style={{
          width: 52, height: 52, borderRadius: 12, flexShrink: 0,
          background: `${theme.border}28`,
          border: `1px solid ${theme.border}70`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
          boxShadow: `0 0 12px ${theme.glow}`,
        }}>
          {theme.icon}
        </div>

        {/* Temp + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 30, fontWeight: 900, color: theme.text,
              letterSpacing: -1, lineHeight: 1,
              textShadow: `0 0 20px ${theme.border}80`,
            }}>
              {Math.round(weather.tempC)}°
            </span>
            <span style={{ fontSize: 11, color: MUTED, textTransform: 'capitalize', fontWeight: 500 }}>
              {weather.description}
            </span>
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontWeight: 500 }}>
            {weather.city} · {weather.humidity}% humidity · UV {weather.uvIndex}
          </div>
        </div>

        {/* Condition badge */}
        <div style={{
          background: `${theme.border}28`,
          border: `1px solid ${theme.border}70`,
          borderRadius: 8, padding: '4px 9px', flexShrink: 0,
        }}>
          <span style={{ color: theme.text, fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>
            {theme.label.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Alert strip — only if caution/danger */}
      {alert.level !== 'none' && alert.message && (
        <div style={{
          padding: '8px 14px',
          borderTop: `1px solid ${theme.border}30`,
          background: `${alertColor}12`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: alert.suggestedPivot ? 6 : 0 }}>
            <div style={{
              background: `${alertColor}28`, border: `1px solid ${alertColor}55`,
              borderRadius: 5, padding: '2px 7px',
            }}>
              <span style={{ color: alertColor, fontSize: 8, fontWeight: 800, letterSpacing: 1 }}>
                {alert.level.toUpperCase()}
              </span>
            </div>
            <p style={{ color: MUTED, fontSize: 11, lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
              {alert.message}
            </p>
          </div>

          {alert.suggestedPivot && (
            <div style={{
              background: `${theme.bg2}CC`, borderRadius: 8, padding: '7px 10px',
              border: `1px solid ${theme.border}30`,
            }}>
              <span style={{ color: theme.text, fontSize: 10, fontWeight: 700 }}>
                Swap → {alert.suggestedPivot.toUpperCase()}
              </span>
              {alert.pivotReason && (
                <span style={{ color: MUTED, fontSize: 10, marginLeft: 6 }}>{alert.pivotReason}</span>
              )}
            </div>
          )}

          {alert.extraHydrationMl && (
            <div style={{ color: '#58C0E8', fontSize: 11, marginTop: 6, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>💧</span> +{alert.extraHydrationMl} ml extra hydration
            </div>
          )}
        </div>
      )}
    </div>
  );
}
