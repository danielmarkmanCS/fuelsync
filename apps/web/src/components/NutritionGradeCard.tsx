import { useState } from 'react';
import { db } from '../lib/db';
import type { DiaryCompletion } from '../lib/db';

interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Targets {
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

function calcGrade(consumed: Macros, targets: Targets): { score: number; grade: string; color: string; breakdown: { label: string; score: number; color: string }[] } {
  const calTarget = targets.calories || 1;
  const pTarget   = targets.proteinG || 1;
  const cTarget   = targets.carbsG   || 1;
  const fTarget   = targets.fatG     || 1;

  const calRatio = consumed.calories / calTarget;
  // Bell-shaped: best at 1.0, penalised for over (steeper) and under
  const calScore = calRatio <= 1
    ? Math.max(0, 1 - Math.pow(1 - calRatio, 1.5))
    : Math.max(0, 1 - Math.pow(calRatio - 1, 1.2) * 2);

  const pRatio  = Math.min(consumed.protein / pTarget, 1.2);
  const pScore  = pRatio >= 1 ? 1 : Math.max(0, pRatio);

  const cRatio  = consumed.carbs / cTarget;
  const cScore  = cRatio <= 1 ? Math.max(0, cRatio * 0.85 + 0.15) : Math.max(0, 1 - (cRatio - 1) * 1.5);

  const fRatio  = consumed.fat / fTarget;
  const fScore  = fRatio <= 1.3 ? Math.max(0, 1 - Math.abs(fRatio - 1) * 0.8) : Math.max(0, 1 - (fRatio - 1) * 2);

  const score   = Math.round((calScore * 40 + pScore * 35 + cScore * 15 + fScore * 10) * 100);
  const clamp   = Math.min(100, Math.max(0, score));

  const gradeColor = (s: number) =>
    s >= 90 ? '#22C55E' : s >= 80 ? '#38BDF8' : s >= 70 ? '#F59E0B' : s >= 60 ? '#F97316' : '#EF4444';

  const letterGrade = clamp >= 90 ? 'A' : clamp >= 80 ? 'B' : clamp >= 70 ? 'C' : clamp >= 60 ? 'D' : 'F';

  return {
    score: clamp,
    grade: letterGrade,
    color: gradeColor(clamp),
    breakdown: [
      { label: 'Calories',  score: Math.round(calScore * 100), color: gradeColor(Math.round(calScore * 100)) },
      { label: 'Protein',   score: Math.round(pScore   * 100), color: gradeColor(Math.round(pScore   * 100)) },
      { label: 'Carbs',     score: Math.round(cScore   * 100), color: gradeColor(Math.round(cScore   * 100)) },
      { label: 'Fat',       score: Math.round(fScore   * 100), color: gradeColor(Math.round(fScore   * 100)) },
    ],
  };
}

interface Props {
  date: string;
  consumed: Macros;
  targets: Targets;
  existingCompletion: DiaryCompletion | null;
  onCompleted: (c: DiaryCompletion) => void;
}

export default function NutritionGradeCard({ date, consumed, targets, existingCompletion, onCompleted }: Props) {
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState(!!existingCompletion);

  const { score, grade, color, breakdown } = calcGrade(consumed, targets);

  const handleComplete = async () => {
    if (existingCompletion) { setExpanded(v => !v); return; }
    setSaving(true);
    try {
      const entry: DiaryCompletion = {
        date,
        completed_at: new Date().toISOString(),
        totalCal:     Math.round(consumed.calories),
        totalProtein: Math.round(consumed.protein),
        totalCarbs:   Math.round(consumed.carbs),
        totalFat:     Math.round(consumed.fat),
      };
      const id = await db.diary_completions.add(entry);
      onCompleted({ ...entry, id: id as number });
      setExpanded(true);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  const gradeDesc: Record<string, string> = {
    A: 'Excellent day — goals nailed!',
    B: 'Great job — nearly perfect.',
    C: 'Decent day — room to improve.',
    D: 'Below target — keep going.',
    F: 'Tough day. Tomorrow\'s a fresh start.',
  };

  return (
    <div style={{
      margin: '0 22px 16px',
      background: 'var(--surf)',
      borderRadius: 12,
      border: `1.5px solid ${existingCompletion ? color + '50' : 'var(--edge)'}`,
      overflow: 'hidden',
      boxShadow: existingCompletion ? `0 4px 20px ${color}15` : 'none',
    }}>
      {/* Header / Complete button */}
      <button onClick={handleComplete} disabled={saving} style={{
        width: '100%', padding: '14px 16px',
        background: existingCompletion ? `${color}10` : 'none',
        border: 'none', cursor: saving ? 'wait' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'inherit',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {existingCompletion ? (
            <>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: `${color}18`,
                border: `1.5px solid ${color}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>
                {grade === 'A' ? '🏆' : grade === 'B' ? '⭐' : grade === 'C' ? '✅' : grade === 'D' ? '📊' : '📉'}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: color, textTransform: 'uppercase' }}>
                  Diary Completed
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.3 }}>
                  {gradeDesc[grade]}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'var(--surf2)',
                border: '1.5px solid var(--edge)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>
                📋
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  End of Day
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', letterSpacing: -0.3 }}>
                  {saving ? 'Completing…' : 'Complete Diary'}
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {existingCompletion && (
            <div style={{
              fontSize: 32, fontWeight: 900, color,
              letterSpacing: -2, lineHeight: 1,
            }}>
              {grade}
            </div>
          )}
          {existingCompletion && (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"
              style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', flexShrink: 0 }}>
              <polyline points="2,4 6,8 10,4"/>
            </svg>
          )}
        </div>
      </button>

      {/* Expanded breakdown */}
      {existingCompletion && expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--edge)' }}>
          {/* Score bar */}
          <div style={{ paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase' }}>
                Nutrition Score
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color }}>{score}/100</div>
            </div>
            <div style={{ height: 8, background: 'var(--edge)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${score}%`,
                background: `linear-gradient(90deg, ${color}80, ${color})`,
                borderRadius: 4, transition: 'width 0.7s ease',
              }} />
            </div>
          </div>

          {/* Per-macro scores */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
            {breakdown.map(({ label, score: s, color: c }) => (
              <div key={label} style={{
                background: 'var(--surf2)', borderRadius: 10,
                padding: '10px 12px', border: `1px solid var(--edge)`,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: c, letterSpacing: -1, lineHeight: 1 }}>{s}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>/100</div>
                </div>
                <div style={{ marginTop: 6, height: 3, background: 'var(--edge)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s}%`, background: c, borderRadius: 2 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Day summary */}
          <div style={{
            marginTop: 14, padding: '12px 14px',
            background: 'var(--surf2)', borderRadius: 10,
            border: '1px solid var(--edge)',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 10 }}>
              Day Summary
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Calories', val: existingCompletion.totalCal,     unit: 'kcal', tgt: targets.calories,   color: color },
                { label: 'Protein',  val: existingCompletion.totalProtein, unit: 'g',    tgt: targets.proteinG,   color: '#38BDF8' },
                { label: 'Carbs',    val: existingCompletion.totalCarbs,   unit: 'g',    tgt: targets.carbsG,     color: '#22C55E' },
                { label: 'Fat',      val: existingCompletion.totalFat,     unit: 'g',    tgt: targets.fatG,       color: '#F59E0B' },
              ].map(({ label, val, unit, tgt, color: c }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: c, letterSpacing: -0.8, lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{unit}</div>
                  {tgt && tgt > 0 && (
                    <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 1 }}>/ {Math.round(tgt)}</div>
                  )}
                  <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--muted)', marginTop: 2, letterSpacing: 0.5 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
