import { useState, useEffect } from 'react';
import { useGamificationStore } from '../store/gamificationStore';
import { useThemeStore } from '../store/themeStore';
import type { AccentKey } from '../store/themeStore';
import { TIER_CONFIG, LEVELS, getTodayXP, DAILY_HARD_CAP } from '../lib/xp';
import DailyQuestBoard from '../components/DailyQuestBoard';
import AchievementVault from '../components/AchievementVault';

const SHOP_OWNED_KEY = 'fs_shop_owned_v1';

const SHOP_ITEMS: Array<{ key: AccentKey; name: string; cost: number; emoji: string; lightColor: string; darkColor: string }> = [
  { key: 'blue',   name: 'Indigo',  cost: 0,   emoji: '💙', lightColor: '#0091EA', darkColor: '#60AFFF' },
  { key: 'green',  name: 'Forest',  cost: 50,  emoji: '🌿', lightColor: '#16A34A', darkColor: '#4ADE80' },
  { key: 'purple', name: 'Galaxy',  cost: 75,  emoji: '🌌', lightColor: '#7C3AED', darkColor: '#9D7EFF' },
  { key: 'orange', name: 'Ember',   cost: 50,  emoji: '🔥', lightColor: '#EA580C', darkColor: '#FB923C' },
  { key: 'red',    name: 'Crimson', cost: 75,  emoji: '❤️', lightColor: '#DC2626', darkColor: '#F87171' },
  { key: 'gold',   name: 'Elite',   cost: 150, emoji: '👑', lightColor: '#CA8A04', darkColor: '#EAB308' },
];

function getOwnedThemes(): AccentKey[] {
  try {
    const raw = localStorage.getItem(SHOP_OWNED_KEY);
    const saved: AccentKey[] = raw ? JSON.parse(raw) : [];
    return [...new Set(['blue' as AccentKey, ...saved])];
  } catch { return ['blue']; }
}

function saveOwnedThemes(themes: AccentKey[]) {
  try { localStorage.setItem(SHOP_OWNED_KEY, JSON.stringify(themes)); } catch {}
}

const TIER_ICONS: Record<string, string> = {
  Bronze: '🥉', Silver: '🥈', Gold: '🥇',
  Platinum: '💠', Diamond: '💎', Mythic: '👑',
};

// ─── Hero card ────────────────────────────────────────────────────────────────

function HeroCard() {
  const { levelInfo, gold, streakDays, tierColor, tierGlow, tierTrack, tierGradient } = useGamificationStore();
  const todayXP   = getTodayXP();
  const nextLevel = LEVELS.find(l => l.level === levelInfo.level + 1);

  return (
    <div style={{
      background: `linear-gradient(145deg, ${tierGradient[0]}, ${tierGradient[1]})`,
      padding: '18px 16px 24px',
      marginBottom: 0,
    }}>

      {/* Tier badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderRadius: 99,
        background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)',
        fontSize: 10, fontWeight: 900, letterSpacing: '0.15em',
        color: '#fff', textTransform: 'uppercase', marginBottom: 16,
      }}>
        {TIER_ICONS[levelInfo.tier]} {levelInfo.tier}
      </div>

      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: 'rgba(255,255,255,0.18)',
          border: '2px solid rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 38, flexShrink: 0,
        }}>
          {levelInfo.emoji}
        </div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: -1.2, lineHeight: 1 }}>
            {levelInfo.name}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginTop: 4 }}>
            Level {levelInfo.level}
            {nextLevel && <span style={{ color: 'rgba(255,255,255,0.55)' }}> · Next: {nextLevel.name}</span>}
          </div>
        </div>
      </div>

      {/* XP bar */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>
            {levelInfo.xpInLevel} / {levelInfo.xpSpanLevel} XP
          </span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>
            {levelInfo.isMaxLevel ? 'MAX ✦' : `${levelInfo.xpToNext} to Lv.${levelInfo.level + 1}`}
          </span>
        </div>
        <div style={{ height: 10, background: 'rgba(255,255,255,0.2)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${levelInfo.progressPct}%`,
            background: '#fff', borderRadius: 99,
            transition: 'width 0.9s cubic-bezier(0.34,1.56,0.64,1)',
          }} />
        </div>
      </div>

      {/* Stat row */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        {[
          { icon: '🪙', label: 'Gold',   value: gold        },
          { icon: '🔥', label: 'Streak', value: `${streakDays}d` },
          { icon: '⚡', label: 'Today',  value: `${todayXP}/${DAILY_HARD_CAP}` },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1,
            background: 'rgba(255,255,255,0.14)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 14,
            padding: '12px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Level roadmap ────────────────────────────────────────────────────────────

function LevelRoadmap() {
  const { levelInfo } = useGamificationStore();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? LEVELS : LEVELS.slice(0, 5);

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 22,
      border: '1px solid var(--edge)', padding: '16px 16px 12px',
      marginBottom: 14, boxShadow: 'var(--inner-glow)',
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.14em',
        color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12,
      }}>
        Level Roadmap
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {visible.map(lv => {
          const cfg    = TIER_CONFIG[lv.tier];
          const isCur  = lv.level === levelInfo.level;
          const isPast = lv.level < levelInfo.level;
          const isFut  = lv.level > levelInfo.level;
          return (
            <div key={lv.level} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 14,
              background: isCur ? `${cfg.color}12` : 'transparent',
              border: `1px solid ${isCur ? cfg.color + '35' : 'transparent'}`,
              opacity: isFut ? 0.45 : 1,
              boxShadow: 'none',
              transition: 'all 0.2s ease',
            }}>
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
                {isPast ? '✅' : isCur ? lv.emoji : '🔒'}
              </span>
              <div style={{ flex: 1 }}>
                <span style={{
                  fontSize: 13, fontWeight: 800,
                  color: isCur ? cfg.color : isPast ? '#4ADE80' : 'var(--muted)',
                }}>
                  Lv.{lv.level} — {lv.name}
                </span>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 800, color: cfg.color,
                opacity: isFut ? 0.5 : 0.8, letterSpacing: '0.1em',
              }}>
                {lv.tier.toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          marginTop: 10, width: '100%', background: 'none', border: 'none',
          fontSize: 11, fontWeight: 700, color: 'var(--muted)',
          cursor: 'pointer', padding: '7px 0',
        }}
      >
        {expanded ? 'Show less ▲' : 'Show all levels ▼'}
      </button>
    </div>
  );
}

// ─── Gold shop ────────────────────────────────────────────────────────────────

function GoldShop() {
  const { gold, spendGold } = useGamificationStore();
  const { accentKey, isDark, setAccent } = useThemeStore();
  const [owned, setOwned] = useState<AccentKey[]>(() => getOwnedThemes());
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function buy(item: typeof SHOP_ITEMS[0]) {
    if (item.cost === 0 || owned.includes(item.key)) {
      setAccent(item.key);
      setToast(`✦ ${item.name} theme equipped`);
      return;
    }
    if (!spendGold(item.cost)) { setToast('Not enough gold'); return; }
    const next = [...owned, item.key];
    setOwned(next);
    saveOwnedThemes(next);
    setAccent(item.key);
    setToast(`✦ ${item.name} unlocked & equipped!`);
  }

  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 22,
      border: '1px solid var(--edge)', padding: '16px',
      marginBottom: 14, boxShadow: 'var(--inner-glow)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--muted)', textTransform: 'uppercase' }}>
            Accent Shop
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2 }}>
            Unlock app color themes with gold
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.28)',
          borderRadius: 99, padding: '4px 10px',
        }}>
          <span style={{ fontSize: 12 }}>🪙</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#EAB308' }}>{gold}</span>
        </div>
      </div>

      {toast && (
        <div style={{
          marginBottom: 12, padding: '8px 12px', borderRadius: 10,
          background: toast.startsWith('Not') ? 'rgba(239,68,68,0.12)' : 'rgba(74,222,128,0.12)',
          border: `1px solid ${toast.startsWith('Not') ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`,
          fontSize: 12, fontWeight: 700,
          color: toast.startsWith('Not') ? 'var(--red)' : '#4ADE80',
          textAlign: 'center',
        }}>{toast}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {SHOP_ITEMS.map(item => {
          const isOwned  = owned.includes(item.key);
          const isActive = accentKey === item.key;
          const canAfford = gold >= item.cost;
          const color = isDark ? item.darkColor : item.lightColor;

          return (
            <button
              key={item.key}
              onClick={() => buy(item)}
              className="press"
              style={{
                background: isActive ? `${color}18` : isOwned ? `${color}08` : canAfford ? `${color}06` : 'var(--surf2)',
                border: `1.5px solid ${isActive ? color + '60' : isOwned ? color + '30' : canAfford ? color + '22' : 'var(--edge)'}`,
                borderRadius: 16, padding: '14px 8px 12px',
                textAlign: 'center',
                opacity: (!isOwned && !canAfford) ? 0.45 : 1,
                transition: 'all 0.2s ease',
                boxShadow: 'none',
                cursor: 'pointer', position: 'relative', overflow: 'hidden',
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', top: 5, right: 6,
                  fontSize: 8, fontWeight: 900, color, letterSpacing: '0.05em',
                }}>✓</div>
              )}
              <div style={{ fontSize: 24, marginBottom: 5 }}>{item.emoji}</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: isActive || isOwned ? color : 'var(--muted)', marginBottom: 6 }}>
                {item.name}
              </div>
              {isActive ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: `${color}20`, borderRadius: 99, padding: '3px 8px',
                  fontSize: 9, fontWeight: 800, color,
                }}>Active</div>
              ) : isOwned ? (
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: `${color}14`, borderRadius: 99, padding: '3px 8px',
                  fontSize: 9, fontWeight: 700, color,
                }}>Equip</div>
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  background: canAfford ? 'rgba(234,179,8,0.14)' : 'var(--edge)',
                  borderRadius: 99, padding: '3px 7px',
                }}>
                  {item.cost === 0 ? (
                    <span style={{ fontSize: 9, fontWeight: 800, color }}>Free</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 9 }}>🪙</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: canAfford ? '#EAB308' : 'var(--muted)' }}>{item.cost}</span>
                    </>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: 'var(--muted2)', textAlign: 'center' }}>
        Earn gold by completing quests & leveling up
      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surf)', borderRadius: 22,
      border: '1px solid var(--edge)', padding: '16px',
      marginBottom: 14, boxShadow: 'var(--inner-glow)',
    }}>
      {children}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function GameScreen() {
  return (
    <div style={{ padding: '16px 14px 24px', background: 'var(--bg)', minHeight: '100%' }}>
      <HeroCard />
      <Section>
        <DailyQuestBoard />
      </Section>
      <LevelRoadmap />
      <Section>
        <AchievementVault />
      </Section>
      <GoldShop />
    </div>
  );
}
