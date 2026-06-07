import { useEffect, useState } from 'react';
import type { Achievement } from '../lib/achievements';

interface Props {
  achievement: Achievement | null;
  onDismiss: () => void;
}

export default function AchievementToast({ achievement, onDismiss }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!achievement) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); setTimeout(onDismiss, 300); }, 3500);
    return () => clearTimeout(t);
  }, [achievement, onDismiss]);

  if (!achievement) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 'max(56px, calc(env(safe-area-inset-top, 0px) + 56px))',
      left: '50%',
      transform: `translateX(-50%) translateY(${visible ? '0' : '-120%'})`,
      transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      zIndex: 9999,
      maxWidth: 340,
      width: 'calc(100vw - 32px)',
      pointerEvents: 'none',
    }}>
      <div style={{
        background: 'var(--surf)',
        border: `1.5px solid ${achievement.color}50`,
        borderRadius: 16,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px ${achievement.color}20`,
      }}>
        <div style={{
          width: 48, height: 48,
          borderRadius: 12,
          background: `${achievement.color}18`,
          border: `1.5px solid ${achievement.color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>
          {achievement.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: 2.5, color: achievement.color, textTransform: 'uppercase', marginBottom: 3 }}>
            Achievement Unlocked!
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.3, lineHeight: 1.2 }}>
            {achievement.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>
            {achievement.description}
          </div>
        </div>
      </div>
    </div>
  );
}
