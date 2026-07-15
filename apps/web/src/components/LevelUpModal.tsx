import { useState, useEffect, useCallback } from 'react';
import type { LevelInfo } from '../lib/xp';
import { LEVEL_PERKS, TIER_CONFIG } from '../lib/xp';

// ─── Confetti system ──────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  '#F59E0B', '#38BDF8', '#4ADE80', '#A78BFA',
  '#F472B6', '#FB923C', '#34D399', '#F87171',
];

interface ConfettiPiece {
  id:     number;
  x:      number;   // vw %
  color:  string;
  size:   number;
  shape:  'circle' | 'square' | 'rect' | 'diamond';
  dur:    number;
  delay:  number;
  spin:   number;   // rotation degrees
}

function makePieces(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id:    i,
    x:     5 + (i / count) * 90 + (Math.random() - 0.5) * 8,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size:  5 + (i % 5) * 2,
    shape: (['circle', 'square', 'rect', 'diamond'] as const)[i % 4],
    dur:   1.1 + (i % 6) * 0.25,
    delay: (i * 0.04) % 0.8,
    spin:  360 + (i % 3) * 180,
  }));
}

const PIECES = makePieces(40);

function Confetti({ color }: { color: string }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {PIECES.map(p => {
        const borderRadius =
          p.shape === 'circle'  ? '50%' :
          p.shape === 'diamond' ? '0'   :
          p.shape === 'rect'    ? '2px' : '3px';
        const transform = p.shape === 'diamond' ? 'rotate(45deg)' : undefined;
        const w = p.shape === 'rect' ? p.size * 2.2 : p.size;
        const h = p.size;
        // Use the tier color for 1/4 of pieces, the rest use palette
        const pieceColor = p.id % 4 === 0 ? color : p.color;
        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left:  `${p.x}%`,
              top:   -20,
              width:  w,
              height: h,
              borderRadius,
              background: pieceColor,
              transform,
              boxShadow: `0 0 4px ${pieceColor}99`,
              animation: `confettiFall ${p.dur}s ${p.delay}s cubic-bezier(0.25,0.46,0.45,0.94) forwards`,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Tier badge inside modal ──────────────────────────────────────────────────

function TierBadge({ tier, color }: { tier: string; color: string }) {
  const icons: Record<string, string> = {
    Bronze: '🥉', Silver: '🥈', Gold: '🥇',
    Platinum: '💠', Diamond: '💎', Mythic: '👑',
  };
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 99,
      background: `${color}18`, border: `1px solid ${color}44`,
      fontSize: 11, fontWeight: 800, letterSpacing: 1.5,
      color, textTransform: 'uppercase', marginBottom: 16,
    }}>
      {icons[tier]} {tier}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LevelUpModal() {
  // Queue: multiple levels can be gained in one XP grant — show them in sequence
  const [queue, setQueue] = useState<LevelInfo[]>([]);
  const info = queue[0] ?? null;

  useEffect(() => {
    function onLevelUp(e: Event) {
      setQueue(prev => [...prev, (e as CustomEvent<LevelInfo>).detail]);
    }
    window.addEventListener('level-up', onLevelUp);
    return () => window.removeEventListener('level-up', onLevelUp);
  }, []);

  // Haptic feedback when a new level-up appears
  useEffect(() => {
    if (!info) return;
    try {
      if ('vibrate' in navigator) navigator.vibrate([60, 40, 120, 40, 200]);
    } catch {}
  }, [info?.level]);

  const dismiss = useCallback(() => setQueue(prev => prev.slice(1)), []);

  if (!info) return null;

  const cfg         = TIER_CONFIG[info.tier];
  const levelColor  = cfg.color;
  const glow        = cfg.glow;
  const perk        = LEVEL_PERKS[info.level] ?? '';
  const isMythic    = info.tier === 'Mythic';

  return (
    <div
      onClick={dismiss}
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         9999,
        background:     'rgba(7,8,15,0.92)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        animation:      'fadeIn 0.22s ease both',
        cursor:         'pointer',
      }}
    >
      <Confetti color={levelColor} />

      {/* Radial glow burst */}
      <div style={{
        position:    'absolute',
        width:       480,
        height:      480,
        borderRadius:'50%',
        background:  `radial-gradient(circle, ${glow} 0%, transparent 68%)`,
        filter:      'blur(40px)',
        pointerEvents: 'none',
      }} />

      {/* Card */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position:    'relative',
          zIndex:      1,
          textAlign:   'center',
          padding:     '40px 36px 32px',
          background:  'var(--surf)',
          border:      `1px solid ${levelColor}44`,
          borderRadius: 28,
          boxShadow:   `0 0 100px ${glow}, 0 24px 80px rgba(0,0,0,0.7)`,
          animation:   'levelUpPop 0.52s cubic-bezier(0.175,0.885,0.32,1.275) both',
          maxWidth:    320,
          width:       '90vw',
          overflow:    'hidden',
        }}
      >
        {/* Mythic gets a gradient shimmer line at the top */}
        {isMythic && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${cfg.gradient[0]}, ${cfg.gradient[1]}, ${cfg.gradient[0]})`,
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s linear infinite',
          }} />
        )}

        {/* "LEVEL UP!" pill */}
        <div style={{
          display:     'inline-block',
          padding:     '4px 16px',
          borderRadius: 99,
          background:  `${levelColor}1A`,
          border:      `1px solid ${levelColor}44`,
          fontSize:    10,
          fontWeight:  900,
          letterSpacing: 3,
          color:       levelColor,
          marginBottom: 14,
          textTransform: 'uppercase',
        }}>
          Level Up!
        </div>

        {/* Tier badge */}
        <div><TierBadge tier={info.tier} color={levelColor} /></div>

        {/* Emoji with pop animation */}
        <div style={{
          fontSize:   72,
          lineHeight: 1,
          marginBottom: 8,
          animation: 'emojiPop 0.65s 0.1s cubic-bezier(0.175,0.885,0.32,1.275) both',
          filter:     `drop-shadow(0 0 20px ${glow})`,
        }}>
          {info.emoji}
        </div>

        {/* Level number */}
        <div style={{
          fontSize:   60,
          fontWeight: 900,
          lineHeight: 1,
          color:      levelColor,
          textShadow: `0 0 60px ${glow}`,
          letterSpacing: -3,
          fontVariantNumeric: 'tabular-nums',
          marginBottom: 4,
        }}>
          {info.level}
        </div>

        {/* Level name */}
        <div style={{
          fontSize:   22,
          fontWeight: 800,
          color:      'var(--text)',
          marginBottom: 20,
          letterSpacing: -0.5,
        }}>
          {info.name}
        </div>

        {/* Perk unlocked */}
        {perk && (
          <div style={{
            padding:    '10px 16px',
            borderRadius: 14,
            background: `${levelColor}12`,
            border:     `1px solid ${levelColor}30`,
            fontSize:   13,
            color:      levelColor,
            fontWeight: 600,
            lineHeight: 1.45,
            marginBottom: 24,
          }}>
            🔓 {perk}
          </div>
        )}

        {/* Queue indicator */}
        {queue.length > 1 && (
          <div style={{
            fontSize: 11, color: levelColor, fontWeight: 700,
            marginBottom: 14, opacity: 0.8,
          }}>
            +{queue.length - 1} more level{queue.length > 2 ? 's' : ''}!
          </div>
        )}

        <button
          onClick={dismiss}
          style={{
            width:        '100%',
            padding:      '15px 0',
            borderRadius: 16,
            border:       'none',
            background:   isMythic
              ? `linear-gradient(135deg, ${cfg.gradient[0]}, ${cfg.gradient[1]})`
              : levelColor,
            color:        '#fff',
            fontSize:     16,
            fontWeight:   800,
            cursor:       'pointer',
            boxShadow:    `0 8px 32px ${glow}`,
            letterSpacing: 0.3,
          }}
        >
          {queue.length > 1 ? 'Next Level →' : "Let's go! 🚀"}
        </button>
      </div>
    </div>
  );
}
