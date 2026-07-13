import { useState, useEffect } from 'react';
import type { LevelInfo } from '../lib/xp';
import { LEVEL_PERKS } from '../lib/xp';

function Confetti() {
  const pieces = Array.from({ length: 24 }, (_, i) => i);
  const colors = ['#F59E0B', '#38BDF8', '#4ADE80', '#9D7EFF', '#F472B6', '#FB923C'];
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {pieces.map(i => {
        const color = colors[i % colors.length];
        const x = 10 + (i / 24) * 80;
        const delay = (i * 0.06) % 0.9;
        const size = 6 + (i % 4) * 3;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: -20,
              width: size,
              height: size,
              borderRadius: i % 3 === 0 ? '50%' : 2,
              background: color,
              animation: `confettiFall ${1.2 + (i % 5) * 0.3}s ${delay}s ease-in forwards`,
              boxShadow: `0 0 6px ${color}`,
            }}
          />
        );
      })}
    </div>
  );
}

export default function LevelUpModal() {
  const [info, setInfo] = useState<LevelInfo | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      setInfo((e as CustomEvent<LevelInfo>).detail);
    }
    window.addEventListener('level-up', handler);
    return () => window.removeEventListener('level-up', handler);
  }, []);

  if (!info) return null;

  const levelColor =
    info.level >= 8 ? '#F59E0B' :
    info.level >= 6 ? '#9D7EFF' :
    info.level >= 4 ? '#38BDF8' : '#4ADE80';
  const glow = `${levelColor}88`;
  const perk = LEVEL_PERKS[info.level] ?? '';

  return (
    <div
      onClick={() => setInfo(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(8,9,26,0.94)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(12px)',
        animation: 'fadeIn 0.25s ease',
        cursor: 'pointer',
      }}
    >
      <Confetti />

      {/* Glow burst */}
      <div style={{
        position: 'absolute',
        width: 400, height: 400, borderRadius: '50%',
        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
        filter: 'blur(60px)',
        pointerEvents: 'none',
      }} />

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', zIndex: 1,
          textAlign: 'center', padding: '44px 40px 36px',
          background: 'var(--surf)',
          border: `1px solid ${levelColor}44`,
          borderRadius: 28,
          boxShadow: `0 0 80px ${glow}, 0 24px 64px rgba(0,0,0,0.6)`,
          animation: 'levelUpPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275)',
          maxWidth: 320, width: '90%',
        }}
      >
        {/* Badge */}
        <div style={{
          display: 'inline-block', padding: '4px 14px', borderRadius: 99,
          background: `${levelColor}18`, border: `1px solid ${levelColor}44`,
          fontSize: 10, fontWeight: 800, letterSpacing: 2.5,
          color: levelColor, marginBottom: 20, textTransform: 'uppercase',
        }}>
          Level Up!
        </div>

        {/* Emoji */}
        <div style={{
          fontSize: 72, lineHeight: 1, marginBottom: 8,
          animation: 'emojiPop 0.6s 0.1s cubic-bezier(0.175,0.885,0.32,1.275) both',
        }}>
          {info.emoji}
        </div>

        {/* Level number */}
        <div style={{
          fontSize: 64, fontWeight: 900, lineHeight: 1,
          color: levelColor,
          textShadow: `0 0 48px ${glow}`,
          letterSpacing: -3, fontVariantNumeric: 'tabular-nums',
          marginBottom: 4,
        }}>
          {info.level}
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 20, letterSpacing: -0.5 }}>
          {info.name}
        </div>

        {perk && (
          <div style={{
            padding: '10px 18px', borderRadius: 14,
            background: `${levelColor}12`, border: `1px solid ${levelColor}33`,
            fontSize: 13, color: levelColor, fontWeight: 600, lineHeight: 1.4,
            marginBottom: 28,
          }}>
            🔓 {perk}
          </div>
        )}

        <button
          onClick={() => setInfo(null)}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 16,
            background: levelColor, border: 'none',
            color: '#fff', fontSize: 16, fontWeight: 800,
            cursor: 'pointer',
            boxShadow: `0 8px 32px ${glow}`,
            letterSpacing: 0.3,
          }}
        >
          Let's go! 🚀
        </button>
      </div>
    </div>
  );
}
