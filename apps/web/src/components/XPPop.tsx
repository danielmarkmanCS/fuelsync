import { useState, useEffect } from 'react';

interface Pop {
  id: number;
  amount: number;
  x: number;
}

let _id = 0;

export default function XPPop() {
  const [pops, setPops] = useState<Pop[]>([]);

  useEffect(() => {
    function handler(e: Event) {
      const { amount } = (e as CustomEvent<{ amount: number }>).detail;
      const id = ++_id;
      const x = 25 + Math.random() * 50;
      setPops(prev => [...prev, { id, amount, x }]);
      setTimeout(() => setPops(prev => prev.filter(p => p.id !== id)), 1600);
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
            position: 'absolute',
            left: `${pop.x}%`,
            bottom: 90,
            transform: 'translateX(-50%)',
            animation: 'xpPop 1.6s cubic-bezier(0.22,1,0.36,1) forwards',
            fontSize: 16,
            fontWeight: 900,
            color: '#F59E0B',
            textShadow: '0 0 24px rgba(245,158,11,0.9), 0 2px 8px rgba(0,0,0,0.6)',
            letterSpacing: 0.5,
            whiteSpace: 'nowrap',
          }}
        >
          ⚡ +{pop.amount} XP
        </div>
      ))}
    </div>
  );
}
