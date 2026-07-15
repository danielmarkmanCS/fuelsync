import { useState, useEffect, useCallback } from 'react';
import { getTodayQuests, getCompletedQuestIds, completeQuest } from '../lib/dailyQuests';
import type { DailyQuest } from '../lib/dailyQuests';
import { addXP } from '../lib/xp';
import { useGamificationStore } from '../store/gamificationStore';

// ─── Mini celebration when all 3 done ────────────────────────────────────────

function AllDoneBanner() {
  return (
    <div style={{
      marginTop: 12,
      padding: '14px 16px',
      borderRadius: 16,
      background: 'linear-gradient(135deg, rgba(74,222,128,0.12), rgba(56,189,248,0.08))',
      border: '1px solid rgba(74,222,128,0.30)',
      textAlign: 'center',
      animation: 'celebIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both',
    }}>
      <div style={{ fontSize: 28, marginBottom: 4 }}>🏆</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: '#4ADE80', letterSpacing: -0.3 }}>
        All quests complete!
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
        New quests unlock at midnight
      </div>
    </div>
  );
}

// ─── Single quest card ────────────────────────────────────────────────────────

function QuestCard({
  quest, done, onComplete,
}: {
  quest: DailyQuest;
  done: boolean;
  onComplete: (q: DailyQuest) => void;
}) {
  const [popping, setPopping] = useState(false);

  function handleTap() {
    if (done) return;
    setPopping(true);
    setTimeout(() => setPopping(false), 400);
    onComplete(quest);
  }

  return (
    <button
      onClick={handleTap}
      disabled={done}
      className="press"
      style={{
        width: '100%', textAlign: 'left', cursor: done ? 'default' : 'pointer',
        background: done
          ? `${quest.color}0A`
          : 'var(--surf)',
        border: `1px solid ${done ? quest.color + '35' : 'var(--edge)'}`,
        borderRadius: 16,
        padding: '14px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        transition: 'background 0.2s ease, border-color 0.2s ease',
        animation: popping ? 'checkPop 0.4s cubic-bezier(0.34,1.56,0.64,1) both' : undefined,
        overflow: 'hidden', position: 'relative',
      }}
    >
      {/* Glow fill on done */}
      {done && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse at left center, ${quest.color}14 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Emoji icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 13, flexShrink: 0,
        background: done ? `${quest.color}20` : 'var(--surf2)',
        border: `1px solid ${done ? quest.color + '50' : 'var(--edge)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
        transition: 'all 0.2s ease',
        boxShadow: 'none',
      }}>
        {done ? '✅' : quest.emoji}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 800,
          color: done ? 'var(--muted)' : 'var(--text)',
          textDecoration: done ? 'line-through' : 'none',
          letterSpacing: -0.2, lineHeight: 1.2, marginBottom: 3,
        }}>
          {quest.label}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--muted)',
          lineHeight: 1.4, fontWeight: 500,
        }}>
          {quest.description}
        </div>
      </div>

      {/* Rewards column */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-end', gap: 4, flexShrink: 0,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: done ? 'var(--muted)' : '#F59E0B',
          background: done ? 'transparent' : 'rgba(245,158,11,0.12)',
          border: done ? 'none' : '1px solid rgba(245,158,11,0.25)',
          borderRadius: 99, padding: done ? 0 : '2px 7px',
          opacity: done ? 0.5 : 1,
        }}>
          ⚡ +{quest.xpReward}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: done ? 'var(--muted)' : '#EAB308',
          background: done ? 'transparent' : 'rgba(234,179,8,0.12)',
          border: done ? 'none' : '1px solid rgba(234,179,8,0.25)',
          borderRadius: 99, padding: done ? 0 : '2px 7px',
          opacity: done ? 0.5 : 1,
        }}>
          🪙 +{quest.goldReward}
        </span>
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DailyQuestBoard({ compact = false }: { compact?: boolean }) {
  const quests                  = getTodayQuests();
  const [doneIds, setDoneIds]   = useState<string[]>(() => getCompletedQuestIds());
  const { _addGold }            = useGamificationStore();

  // Re-sync if a quest is completed from outside (e.g. a screen action)
  const refresh = useCallback(() => setDoneIds(getCompletedQuestIds()), []);

  useEffect(() => {
    window.addEventListener('quest-complete', refresh);
    return () => window.removeEventListener('quest-complete', refresh);
  }, [refresh]);

  function handleComplete(quest: DailyQuest) {
    const ok = completeQuest(quest.id);
    if (!ok) return;
    setDoneIds(prev => [...prev, quest.id]);
    addXP(quest.xpReward);
    _addGold(quest.goldReward);
    try {
      window.dispatchEvent(new CustomEvent('quest-complete', { detail: { id: quest.id } }));
    } catch {}
    // Haptic
    try { if ('vibrate' in navigator) navigator.vibrate(40); } catch {}
  }

  const doneCount  = quests.filter(q => doneIds.includes(q.id)).length;
  const allDone    = doneCount === quests.length;
  const pct        = Math.round((doneCount / quests.length) * 100);
  const barColor   = allDone ? '#4ADE80' : '#F59E0B';

  return (
    <div style={{ paddingBottom: compact ? 0 : 4 }}>
      {/* Header + mini progress */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--muted)', marginBottom: 2 }}>
            DAILY QUESTS
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
            {allDone ? '✦ All done for today' : `${doneCount} / ${quests.length} complete`}
          </div>
        </div>
        <div style={{
          fontSize: 13, fontWeight: 800,
          color: barColor, fontVariantNumeric: 'tabular-nums',
        }}>
          {pct}%
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        height: 4, background: 'var(--surf2)', borderRadius: 99,
        marginBottom: 14, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: barColor,
          borderRadius: 99,
          transition: 'width 0.6s var(--spring)',
        }} />
      </div>

      {/* Quest cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {quests.map(q => (
          <QuestCard
            key={q.id}
            quest={q}
            done={doneIds.includes(q.id)}
            onComplete={handleComplete}
          />
        ))}
      </div>

      {allDone && <AllDoneBanner />}
    </div>
  );
}
