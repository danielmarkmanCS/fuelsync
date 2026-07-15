import { useState, useEffect } from 'react';
import { ALL_ACHIEVEMENTS, getUnlocked } from '../lib/achievements';

// ─── Single achievement tile ──────────────────────────────────────────────────

function AchievementTile({ id, icon, label, description, color, unlocked }: {
  id: string; icon: string; label: string;
  description: string; color: string; unlocked: boolean;
}) {
  const [tooltip, setTooltip] = useState(false);

  return (
    <button
      onClick={() => setTooltip(t => !t)}
      style={{
        background: unlocked ? `${color}10` : 'var(--surf2)',
        border: `1.5px solid ${unlocked ? color + '40' : 'var(--edge)'}`,
        borderRadius: 16,
        padding: '14px 10px 12px',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: 6,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: unlocked ? `0 0 16px ${color}28` : 'none',
        animation: unlocked ? 'fadeIn 0.4s ease both' : undefined,
        position: 'relative', overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      {/* Shimmer for unlocked */}
      {unlocked && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${color}80, transparent)`,
        }} />
      )}

      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: unlocked ? `${color}18` : 'var(--edge)',
        border: `1.5px solid ${unlocked ? color + '45' : 'var(--edge2)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        filter: unlocked ? 'none' : 'grayscale(1) opacity(0.3)',
        transition: 'all 0.2s ease',
      }}>
        {unlocked ? icon : '🔒'}
      </div>

      {/* Label */}
      <div style={{
        fontSize: 10, fontWeight: 800,
        color: unlocked ? color : 'var(--muted)',
        letterSpacing: 0.2, lineHeight: 1.2,
        opacity: unlocked ? 1 : 0.5,
      }}>
        {unlocked ? label : '???'}
      </div>

      {/* Tooltip on tap */}
      {tooltip && (
        <div style={{
          position: 'absolute', inset: 0,
          background: unlocked ? `${color}EE` : 'rgba(15,17,28,0.92)',
          borderRadius: 14,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '8px',
          animation: 'fadeIn 0.15s ease both',
          backdropFilter: 'blur(4px)',
          zIndex: 2,
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#fff', lineHeight: 1.4, textAlign: 'center' }}>
            {unlocked ? description : 'Keep going to unlock!'}
          </div>
        </div>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AchievementVault() {
  const [unlocked, setUnlocked] = useState<string[]>(() => getUnlocked());

  useEffect(() => {
    function onUnlock() { setUnlocked(getUnlocked()); }
    window.addEventListener('achievement-unlocked', onUnlock);
    return () => window.removeEventListener('achievement-unlocked', onUnlock);
  }, []);

  const totalUnlocked = unlocked.length;
  const total         = ALL_ACHIEVEMENTS.length;
  const pct           = Math.round((totalUnlocked / total) * 100);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: 2 }}>
            ACHIEVEMENT VAULT
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {totalUnlocked} / {total} unlocked
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B' }}>{pct}%</span>
      </div>

      {/* Progress */}
      <div style={{
        height: 4, background: 'var(--surf2)', borderRadius: 99,
        marginBottom: 14, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, #F59E0B99, #F59E0B)',
          borderRadius: 99, transition: 'width 0.7s var(--spring)',
          boxShadow: '0 0 8px rgba(245,158,11,0.5)',
        }} />
      </div>

      {/* Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 8,
      }}>
        {ALL_ACHIEVEMENTS.map(a => (
          <AchievementTile
            key={a.id}
            id={a.id}
            icon={a.icon}
            label={a.label}
            description={a.description}
            color={a.color}
            unlocked={unlocked.includes(a.id)}
          />
        ))}
      </div>

      {totalUnlocked === total && (
        <div style={{
          marginTop: 16, padding: '14px', borderRadius: 14, textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(234,179,8,0.08))',
          border: '1px solid rgba(245,158,11,0.30)',
          animation: 'celebIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>👑</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#F59E0B' }}>
            100% Complete — True Champion
          </div>
        </div>
      )}
    </div>
  );
}
