import { useThemeStore, ACCENT_COLORS, type AccentKey } from '../store/themeStore';
import { useAppStore } from '../store/appStore';

// ── Section label ────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 600, color: 'var(--muted)',
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
  icon?: React.ReactNode;
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
        padding: '13px 16px',
        borderBottom: borderBottom ? '1px solid var(--edge)' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={(e) => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'var(--surf2)'; }}
      onMouseLeave={(e) => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      {icon && <div style={{ flexShrink: 0, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
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
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle"
      style={{
        width: 48, height: 28, borderRadius: 14,
        border: 'none', padding: 0, cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--edge)',
        position: 'relative',
        transition: 'background 0.25s ease',
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: on ? 23 : 3,
        width: 22, height: 22, borderRadius: 4,
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
      }} />
    </button>
  );
}

// ── SVG icon helpers ────────────────────────────────────────────────
const iconProps = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'var(--muted)', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

const SunIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);

const MoonIcon = () => (
  <svg {...iconProps}>
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
  </svg>
);

const UserIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
);

const PillIcon = () => (
  <svg {...iconProps}>
    <path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7"/>
    <circle cx="17" cy="17" r="5"/>
    <path d="M14.5 19.5l5-5"/>
  </svg>
);

const ChartIcon = () => (
  <svg {...iconProps}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const ZapIcon = () => (
  <svg {...iconProps}>
    <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);

const LockIcon = () => (
  <svg {...iconProps}>
    <rect x="3" y="11" width="18" height="11" rx="2"/>
    <path d="M7 11V7a5 5 0 0110 0v4"/>
  </svg>
);

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ color: 'var(--muted)' }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ── Accent color swatch ──────────────────────────────────────────────
function AccentSwatch({ accentKey, current, onSelect, isDark }: {
  accentKey: AccentKey; current: AccentKey; onSelect: (k: AccentKey) => void; isDark: boolean;
}) {
  const a      = ACCENT_COLORS[accentKey];
  const color  = isDark ? a.dark : a.light;
  const active = accentKey === current;
  return (
    <button
      onClick={() => onSelect(accentKey)}
      aria-label={a.label}
      style={{
        width: 40, height: 40, borderRadius: 12, border: 'none',
        background: active ? color : `${color}30`,
        cursor: 'pointer', padding: 0, position: 'relative',
        boxShadow: active ? `0 0 0 3px var(--surf), 0 0 0 5px ${color}` : `0 0 0 1.5px ${color}30`,
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        transform: active ? 'scale(1.12)' : 'scale(1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {active && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"
          strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

// ── Main screen ──────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { isDark, toggleTheme, accentKey, setAccent, units, setUnits } = useThemeStore();
  const { setActiveTab } = useAppStore();

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', paddingBottom: 32 }}>

      {/* ── Header ── */}
      <div style={{ padding: '24px 16px 16px' }}>
        <div style={{
          fontSize: 26, fontWeight: 700, color: 'var(--text)',
          letterSpacing: -0.5,
        }}>
          Settings
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          Appearance, profile &amp; preferences
        </div>
      </div>

      {/* ── Appearance ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>Appearance</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 16, overflow: 'hidden' }}>
          <SettingsRow
            icon={isDark ? <MoonIcon /> : <SunIcon />}
            label="Dark Mode"
            description={isDark ? 'Premium Dark theme active' : 'Classic Light theme active'}
            right={<ToggleSwitch on={isDark} onToggle={toggleTheme} />}
            borderBottom={true}
          />
          {/* Accent color picker */}
          <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid var(--edge)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Accent Color</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {ACCENT_COLORS[accentKey].label} · {isDark ? ACCENT_COLORS[accentKey].dark : ACCENT_COLORS[accentKey].light}
                </div>
              </div>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', flexShrink: 0 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-start' }}>
              {(Object.keys(ACCENT_COLORS) as AccentKey[]).map((k) => (
                <AccentSwatch key={k} accentKey={k} current={accentKey} onSelect={setAccent} isDark={isDark} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 6, paddingLeft: 2 }}>
              {(Object.keys(ACCENT_COLORS) as AccentKey[]).map((k) => (
                <div key={k} style={{ width: 40, fontSize: 8, fontWeight: 700, textAlign: 'center', color: k === accentKey ? 'var(--accent)' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {ACCENT_COLORS[k].label}
                </div>
              ))}
            </div>
          </div>
          {/* Units toggle */}
          <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flexShrink: 0, width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3h7v7H3zM3 14h7v7H3zM14 3h7v7h-7zM17 17h-3v3M17 17v3M20 17v3"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Units</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {units === 'metric' ? 'Metric — kg, cm' : 'Imperial — lbs, ft'}
              </div>
            </div>
            <div style={{ display: 'flex', background: 'var(--surf2)', borderRadius: 8, padding: 3, gap: 2, border: '1px solid var(--edge)' }}>
              {(['metric', 'imperial'] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnits(u)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: units === u ? 'var(--accent)' : 'transparent',
                    color: units === u ? '#fff' : 'var(--muted)',
                    fontSize: 12, fontWeight: 700, transition: 'all 0.18s',
                    letterSpacing: 0.3,
                  }}
                >
                  {u === 'metric' ? 'kg' : 'lbs'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Profile shortcut ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>Profile</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 16, overflow: 'hidden' }}>
          <SettingsRow
            icon={<UserIcon />}
            label="My Profile"
            description="Edit body stats, calorie goal, activity level"
            right={<ChevronIcon />}
            onClick={() => setActiveTab('profile')}
            borderBottom={false}
          />
        </div>
      </div>

      {/* ── Nutrition ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>Nutrition</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 16, overflow: 'hidden' }}>
          <SettingsRow
            icon={<PillIcon />}
            label="Supplements"
            description="Manage your supplement checklist"
            right={<ChevronIcon />}
            onClick={() => setActiveTab('supplements')}
            borderBottom={true}
          />
          <SettingsRow
            icon={<ChartIcon />}
            label="Progress & History"
            description="View trends, runs and workout history"
            right={<ChevronIcon />}
            onClick={() => setActiveTab('history')}
            borderBottom={false}
          />
        </div>
      </div>

      {/* ── About ── */}
      <div style={{ margin: '0 16px 16px' }}>
        <SectionLabel>About</SectionLabel>
        <div style={{ background: 'var(--surf)', borderRadius: 16, overflow: 'hidden' }}>
          <SettingsRow
            icon={<ZapIcon />}
            label="FuelSync"
            description="Hybrid athlete nutrition & training PWA"
            right={<span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>v2.0</span>}
            borderBottom={true}
          />
          <SettingsRow
            icon={<LockIcon />}
            label="Local-first & Private"
            description="All data stored on-device. No tracking."
            borderBottom={false}
          />
        </div>
      </div>

    </div>
  );
}
