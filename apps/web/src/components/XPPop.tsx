import { useEffect, useRef, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Pop {
  id:     number;
  amount: number;
  x:      number;   // vw %
  y:      number;   // vh %
  color:  string;
  size:   number;
  delay:  number;
}

// ─── Palette — cycles through tier colors for visual variety ─────────────────

const COLORS = [
  '#F59E0B',  // amber
  '#38BDF8',  // sky
  '#4ADE80',  // green
  '#A78BFA',  // violet
  '#FB923C',  // orange
  '#F472B6',  // pink
  '#34D399',  // emerald
];

let _id = 0;

// ─── Component ───────────────────────────────────────────────────────────────

export default function XPPop() {
  const [pops, setPops] = useState<Pop[]>([]);
  // Track last pointer/touch position in vw/vh percentages
  const ptr = useRef({ x: 50, y: 60 });

  useEffect(() => {
    const track = (e: PointerEvent) => {
      ptr.current = {
        x: (e.clientX / window.innerWidth)  * 100,
        y: (e.clientY / window.innerHeight) * 100,
      };
    };
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerdown', track, { passive: true });
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerdown', track);
    };
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const { amount } = (e as CustomEvent<{ amount: number }>).detail;
      if (!amount) return;

      // Clamp spawn point away from extreme edges
      const x = Math.min(82, Math.max(18, ptr.current.x));
      const y = Math.min(78, Math.max(12, ptr.current.y));

      const color = COLORS[++_id % COLORS.length];
      // Scale font based on XP amount: small (1–4), medium (5–19), large (20+)
      const size  = amount >= 20 ? 18 : amount >= 5 ? 15 : 13;

      const newPop: Pop = { id: _id, amount, x, y, color, size, delay: 0 };

      // For large XP grants (≥20), emit a second smaller "echo" particle slightly offset
      const extras: Pop[] = amount >= 20
        ? [{
            id: ++_id,
            amount: 0,  // 0 means we render "✦" not "+X XP" for the echo
            x: x + (Math.random() * 8 - 4),
            y: y + (Math.random() * 6 - 3),
            color, size: 10, delay: 80,
          }]
        : [];

      setPops(prev => [...prev, newPop, ...extras]);
      const ttl = 1800;
      const ids  = [newPop.id, ...extras.map(p => p.id)];
      setTimeout(() => setPops(prev => prev.filter(p => !ids.includes(p.id))), ttl + 200);
    }

    window.addEventListener('xp-earned', handler);
    return () => window.removeEventListener('xp-earned', handler);
  }, []);

  if (pops.length === 0) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9100 }}>
      {pops.map(pop => (
        <div
          key={pop.id}
          style={{
            position:  'absolute',
            left:      `${pop.x}%`,
            top:       `${pop.y}%`,
            transform: 'translate(-50%, -50%)',
            animationDelay: `${pop.delay}ms`,
            animation: 'xpPop 1.8s cubic-bezier(0.22,1,0.36,1) forwards',
            fontSize:  pop.size,
            fontWeight: 900,
            color:     pop.color,
            textShadow: `0 0 20px ${pop.color}CC, 0 2px 8px rgba(0,0,0,0.55)`,
            letterSpacing: 0.4,
            whiteSpace: 'nowrap',
            userSelect: 'none',
          }}
        >
          {pop.amount === 0 ? '✦' : `⚡ +${pop.amount} XP`}
        </div>
      ))}
    </div>
  );
}
