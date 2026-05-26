import { useThemeStore } from '../store/themeStore';
import { useAppStore } from '../store/appStore';

// ── Section label ────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: 'var(--muted)',
      textTransform: 'uppercase', letterSpacing: 2,
      marginBottom: 8, paddingLeft: 4,
    }}>
      {children}
    </div>
  );
}

// ── Settings row ─────────────────────────────────────────────────────
function SettingsRow({
  icon, label, description, right, onClick, borderBottom = true,
}: {
  icon?: string;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  borderBottom?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px',
        borderBottom: borderBottom ? '1px solid var(--edge)' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'var(--surf2)'; }}
      onMouseLeave={(e) => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {icon && <span style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center' }}>{icon}</span>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {description && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{description}</div>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

// ── Toggle switch ────────────────────────────────────────────────────
function ToggleSwitch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const accentOn  = on ? 'var(--accent)' : 'var(--edge)';
  const thumbLeft = on ? 26 : 3;
  const thumbBg   = on ? '#000' : '#fff';

  return (
    <button
      onClick={onToggle}
      aria-label="Toggle"
      style={{
        width: 52, height: 30, borderRadius: 15,
        border: 'none', padding: 0, cursor: 'pointer',
        background: accentOn,
        position: 'relative',
        transition: 'background 0.25s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: thumbLeft,
        width: 24, height: 24, borderRadius: '50%',
        background: thumbBg,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1), background 0.25s ease',
      }} />
    </button>
  );
}

// ── Accent color swatch ──────────────────────────────────────────────
function AccentSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 14, height: 14, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { isDark, toggleTheme } = useThemeStore();
  const { setActiveTab } = useAppStore();

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 32 }}>

      {/* ── Header ── */}
      <div style={{ padding: '28px 20px 20px' }}>
        <div style={{
          fontSize: 28, fontWeight: 900, color: 'var(--text)',
          letterSpacing: -0.5, fontFamily: "'Barlow Condensed', sans-serif",
        }}>
          SETTINGS
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 3 }}>
          Appearance, profile & preferences
        </div>
      </div>

      {/* ── Appearance ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>Appearance</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 14, border: '1px solid var(--edge)', overflow: 'hidden' }}>
          <SettingsRow
            icon={isDark ? '🌙' : '☀️'}
            label="Dark Mode"
            description={isDark ? 'Using Premium Dark theme' : 'Using Classic Light theme'}
            right={<ToggleSwitch on={isDark} onToggle={toggleTheme} />}
            borderBottom={true}
          />
          <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1.5 }}>
              Active accent color
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <AccentSwatch
                color="#DFFF00"
                label={isDark ? 'Volt (active)' : 'Volt'}
              />
              <AccentSwatch
                color="#0066EE"
                label={!isDark ? 'MFP Blue (active)' : 'MFP Blue'}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, marginTop: 4 }}>
              {isDark
                ? 'Dark mode uses Volt yellow-green as the primary accent.'
                : 'Light mode uses MyFitnessPal Electric Blue as the primary accent.'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Profile shortcut ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>Profile</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 14, border: '1px solid var(--edge)', overflow: 'hidden' }}>
          <SettingsRow
            icon="👤"
            label="My Profile"
            description="Edit body stats, calorie goal, activity level"
            right={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--muted)' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            }
            onClick={() => setActiveTab('profile')}
            borderBottom={false}
          />
        </div>
      </div>

      {/* ── Nutrition ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>Nutrition</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 14, border: '1px solid var(--edge)', overflow: 'hidden' }}>
          <SettingsRow
            icon="💊"
            label="Supplements"
            description="Manage your supplement checklist"
            right={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--muted)' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            }
            onClick={() => setActiveTab('supplements')}
            borderBottom={true}
          />
          <SettingsRow
            icon="📊"
            label="Progress & History"
            description="View trends, runs and workout history"
            right={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--muted)' }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            }
            onClick={() => setActiveTab('history')}
            borderBottom={false}
          />
        </div>
      </div>

      {/* ── About ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>About</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 14, border: '1px solid var(--edge)', overflow: 'hidden' }}>
          <SettingsRow
            icon="⚡"
            label="FuelSync"
            description="Hybrid athlete nutrition & training PWA"
            right={
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>v2.0</span>
            }
            borderBottom={true}
          />
          <SettingsRow
            icon="🔒"
            label="Local-first & Private"
            description="All data stored on-device. No tracking."
            borderBottom={false}
          />
        </div>
      </div>

      {/* ── Theme preview card ── */}
      <div style={{ margin: '0 16px' }}>
        <SectionLabel>Theme Preview</SectionLabel>
        <div style={{
          background: 'var(--surf)', borderRadius: 14, border: '1px solid var(--edge)',
          padding: '18px', display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['var(--bg)', 'var(--surf)', 'var(--surf2)', 'var(--edge)'] as const).map((c, i) => (
              <div key={i} style={{ flex: 1, height: 36, borderRadius: 8, background: c, border: '1px solid var(--edge)' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['var(--accent)', '#FF6B35', '#38BDF8', '#A78BFA'] as const).map((c, i) => (
              <div key={i} style={{ flex: 1, height: 36, borderRadius: 8, background: c }} />
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
            Backgrounds (top) · Accent & macro colors (bottom)
          </div>
        </div>
      </div>

    </div>
  );
}
