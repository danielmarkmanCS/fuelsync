import type { StravaRun } from '../api/strava';

const W = 1080;
const H = 1350;
const LIME = '#FF375F';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function generateRunCard(run: StravaRun): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  // Speed lines (diagonal)
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = LIME;
  ctx.lineWidth = 2;
  for (let i = -5; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 120 - 200, 0);
    ctx.lineTo(i * 120 + 200, H);
    ctx.stroke();
  }
  ctx.restore();

  // Track arc lines (bottom decoration)
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = LIME;
  for (let i = 0; i < 6; i++) {
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(W / 2, H + 100, 200 + i * 80, 120 + i * 50, 0, Math.PI, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.restore();

  // Lime top stripe
  ctx.fillStyle = LIME;
  ctx.fillRect(0, 0, W, 16);

  // Left accent stripe
  ctx.fillStyle = LIME;
  ctx.fillRect(0, 0, 8, H);

  // ── Header ───────────────────────────────────────────────────────────────
  ctx.fillStyle = LIME;
  ctx.font = '900 30px Arial';
  ctx.letterSpacing = '10px';
  ctx.textAlign = 'left';
  ctx.fillText('FUELSYNC', 80, 90);

  ctx.fillStyle = '#333';
  ctx.font = '600 18px Arial';
  ctx.letterSpacing = '5px';
  ctx.fillText('HYBRID ATHLETE OS', 80, 124);

  // Thin divider
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(80, 148, W - 160, 1);

  // ── Distance hero ────────────────────────────────────────────────────────
  ctx.textAlign = 'center';

  // Number glow
  ctx.save();
  ctx.shadowColor = LIME;
  ctx.shadowBlur  = 60;
  ctx.fillStyle   = '#fff';
  ctx.font        = '900 240px Arial';
  ctx.letterSpacing = '-12px';
  ctx.fillText(run.distanceKm.toFixed(1), W / 2, 450);
  ctx.restore();

  ctx.fillStyle = LIME;
  ctx.font = '900 54px Arial';
  ctx.letterSpacing = '12px';
  ctx.fillText('KM', W / 2, 518);

  // ── Run info ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#888';
  ctx.font = '400 34px Arial';
  ctx.letterSpacing = '0px';
  ctx.fillText(run.name, W / 2, 590);

  ctx.fillStyle = '#333';
  ctx.font = '400 26px Arial';
  ctx.fillText(formatDate(run.date), W / 2, 632);

  // ── Stats grid ───────────────────────────────────────────────────────────
  const stats: Array<{ label: string; value: string; color: string }> = [
    { label: 'PACE',      value: run.pace,                              color: '#0A84FF' },
    { label: 'TIME',      value: run.duration,                          color: '#FF9F0A' },
    { label: 'ELEV',      value: `${run.elevationM}m`,                  color: '#30D158' },
    { label: 'HR',        value: run.hrAvg ? `${run.hrAvg}` : '—',     color: '#FF375F' },
  ];

  const cellW = (W - 160) / 4;
  const sy = 690;

  ctx.fillStyle = '#0d0d0d';
  ctx.beginPath();
  (ctx as CanvasRenderingContext2D & { roundRect: (...args: unknown[]) => void })
    .roundRect(80, sy, W - 160, 220, 20);
  ctx.fill();

  stats.forEach((s, i) => {
    const cx = 80 + cellW * i + cellW / 2;

    // Colored top bar
    ctx.fillStyle = s.color;
    ctx.fillRect(80 + cellW * i + 12, sy, cellW - 24, 5);

    // Value
    ctx.save();
    ctx.shadowColor = s.color;
    ctx.shadowBlur  = 20;
    ctx.fillStyle   = s.color;
    ctx.font        = '900 46px Arial';
    ctx.letterSpacing = '-1px';
    ctx.textAlign   = 'center';
    ctx.fillText(s.value, cx, sy + 100);
    ctx.restore();

    ctx.fillStyle = '#444';
    ctx.font = '700 18px Arial';
    ctx.letterSpacing = '4px';
    ctx.fillText(s.label, cx, sy + 142);
  });

  // ── Strava badge ─────────────────────────────────────────────────────────
  ctx.fillStyle = '#FC4C02';
  ctx.font = '900 26px Arial';
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'center';
  ctx.fillText('▶  VIA STRAVA', W / 2, 1010);

  // ── Bottom bar ───────────────────────────────────────────────────────────
  // Lime bottom stripe
  ctx.fillStyle = LIME;
  ctx.fillRect(0, H - 16, W, 16);

  // Dark footer band
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, H - 110, W, 94);

  ctx.fillStyle = LIME;
  ctx.font = '900 40px Arial';
  ctx.letterSpacing = '8px';
  ctx.textAlign = 'center';
  ctx.fillText('FUELSYNC', W / 2, H - 52);

  ctx.fillStyle = '#222';
  ctx.font = '600 22px Arial';
  ctx.letterSpacing = '3px';
  ctx.fillText('HYBRID ATHLETE OS', W / 2, H - 24);

  return canvas;
}

export async function shareRunCard(run: StravaRun): Promise<void> {
  const canvas = generateRunCard(run);

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Canvas export failed')); return; }

      const file = new File([blob], `fuelsync-run-${run.id}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${run.distanceKm} km — FuelSync` });
          resolve(); return;
        } catch { /* user cancelled — fall through */ }
      }

      // Fallback: download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `fuelsync-run-${run.id}.png`; a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}
