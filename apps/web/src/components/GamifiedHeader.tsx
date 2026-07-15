import { useGamificationStore } from '../store/gamificationStore';
import { useAppStore } from '../store/appStore';
import AchievementToast from './AchievementToast';

export const HEADER_H = 60;

// ─── Animated XP bar ─────────────────────────────────────────────────────────

function XPBar({
  pct, gradient, glow, track,
}: {
  pct: number; gradient: [string, string]; glow: string; track: string;
}) {
  return (
    <div style={{
      height: 5, background: track, borderRadius: 99,
      overflow: 'visible', position: 'relative',
    }}>
      <div style={{
        height: '100%',
        width: `${Math.max(2, pct)}%`,
        background: `linear-gradient(90deg, ${gradient[0]}, ${gradient[1]})`,
        borderRadius: 99,
        transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
        position: 'relative',
      }}>
      </div>
    </div>
  );
}

// ─── Level badge ─────────────────────────────────────────────────────────────

function LevelBadge({ level, color, gradient, glow }: {
  level: number; color: string; gradient: [string, string]; glow: string;
}) {
  return (
    <div style={{
      width: 44, height: 44,
      borderRadius: 14,
      flexShrink: 0,
      background: `linear-gradient(145deg, ${gradient[0]}22 0%, ${color}0A 100%)`,
      border: `1px solid ${color}45`,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(135deg, ${gradient[0]}28 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <span style={{
        fontSize: 7, fontWeight: 900, color, letterSpacing: 1,
        zIndex: 1, lineHeight: 1, marginBottom: 1, opacity: 0.8,
      }}>LVL</span>
      <span style={{
        fontSize: level >= 10 ? 15 : 17,
        fontWeight: 900, color, lineHeight: 1, zIndex: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{level}</span>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  icon, value, bg, border, color, pulse,
}: {
  icon: string; value: string | number;
  bg: string; border: string; color: string; pulse?: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 3,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 99, padding: '4px 8px',
      animation: pulse ? 'pulse-streak 2.5s ease-in-out infinite' : undefined,
    }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontSize: 11, fontWeight: 800, color,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function GamifiedHeader() {
  const {
    levelInfo, gold, streakDays,
    tierColor, tierGlow, tierTrack, tierGradient,
    achievementQueue, dismissAchievement,
  } = useGamificationStore();
  const setActiveTab = useAppStore(s => s.setActiveTab);

  const streakIcon = streakDays >= 14 ? '💎' : streakDays >= 7 ? '🔥' : '⚡';

  return (
    <>
      <header style={{
        position: 'absolute',
        top: 'env(safe-area-inset-top, 0px)',
        left: 0, right: 0,
        height: HEADER_H,
        background: 'var(--surf)',
        borderBottom: '1px solid var(--edge)',
        backdropFilter: 'blur(28px) saturate(200%)',
        WebkitBackdropFilter: 'blur(28px) saturate(200%)',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 10,
        boxShadow: 'var(--shadow-md), var(--inner-glow)',
      }}>

        {/* Level badge → tap opens Game */}
        <button
          onClick={() => setActiveTab('game')}
          className="press"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}
        >
          <LevelBadge
            level={levelInfo.level}
            color={tierColor}
            gradient={tierGradient}
            glow={tierGlow}
          />
        </button>

        {/* XP section */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'baseline', marginBottom: 6,
          }}>
            <span style={{
              fontSize: 12, fontWeight: 800, color: tierColor,
              letterSpacing: 0.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {levelInfo.emoji} {levelInfo.name}
            </span>
            <span style={{
              fontSize: 10, color: 'var(--muted)',
              fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginLeft: 6,
            }}>
              {levelInfo.isMaxLevel ? 'MAX ✦' : `${levelInfo.xpToNext} XP left`}
            </span>
          </div>
          <XPBar
            pct={levelInfo.progressPct}
            gradient={tierGradient}
            glow={tierGlow}
            track={tierTrack}
          />
        </div>

        {/* Right pills */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {streakDays >= 1 && (
            <StatPill
              icon={streakIcon}
              value={streakDays}
              bg="rgba(251,191,36,0.10)"
              border="rgba(251,191,36,0.24)"
              color="#FBBF24"
              pulse={streakDays >= 7}
            />
          )}
          <StatPill
            icon="🪙"
            value={gold}
            bg="rgba(234,179,8,0.10)"
            border="rgba(234,179,8,0.24)"
            color="#EAB308"
          />
        </div>
      </header>

      {/* Achievement toast */}
      <AchievementToast
        achievement={achievementQueue[0] ?? null}
        onDismiss={dismissAchievement}
      />
    </>
  );
}
