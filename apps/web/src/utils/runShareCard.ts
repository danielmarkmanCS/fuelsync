import type { StravaRun } from '../api/strava';

const W      = 1080;
const H      = 1350;
const STRAVA = '#FC4C02';

// Photo zone covers top 58%, dark panel occupies bottom 42%
const SPLIT  = Math.round(H * 0.58);  // ~783px

function formatDuration(raw: string): string {
  // raw is like "1:10:23" or "42:07" — return as-is, already formatted
  return raw;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

export function generateRunCard(run: StravaRun, photo: HTMLImageElement | null = null): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // ── Photo zone (top) ────────────────────────────────────────────────────
  if (photo) {
    // Cover-fit photo into top zone
    const scale = Math.max(W / photo.naturalWidth, SPLIT / photo.naturalHeight);
    const sw = photo.naturalWidth  * scale;
    const sh = photo.naturalHeight * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, SPLIT);
    ctx.clip();
    ctx.drawImage(photo, (W - sw) / 2, (SPLIT - sh) / 2, sw, sh);
    ctx.restore();

    // Subtle dark scrim on photo for readability of top label
    const topScrim = ctx.createLinearGradient(0, 0, 0, 160);
    topScrim.addColorStop(0, 'rgba(0,0,0,0.50)');
    topScrim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = topScrim;
    ctx.fillRect(0, 0, W, 160);

    // Scrim at photo→panel seam
    const seamScrim = ctx.createLinearGradient(0, SPLIT - 120, 0, SPLIT);
    seamScrim.addColorStop(0, 'rgba(15,12,10,0)');
    seamScrim.addColorStop(1, 'rgba(15,12,10,0.85)');
    ctx.fillStyle = seamScrim;
    ctx.fillRect(0, SPLIT - 120, W, 120);
  } else {
    // No-photo: gradient photo zone
    const photoBg = ctx.createLinearGradient(0, 0, W, SPLIT);
    photoBg.addColorStop(0,   '#1A0A00');
    photoBg.addColorStop(0.5, '#280C00');
    photoBg.addColorStop(1,   '#0D0502');
    ctx.fillStyle = photoBg;
    ctx.fillRect(0, 0, W, SPLIT);

    // Grain texture
    ctx.save();
    ctx.globalAlpha = 0.025;
    for (let i = 0; i < 14000; i++) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.random() * W, Math.random() * SPLIT, 1.5, 1.5);
    }
    ctx.restore();

    // Big distance watermark in photo zone (low opacity)
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 420px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(run.distanceKm.toFixed(1), W / 2, SPLIT - 40);
    ctx.restore();
  }

  // ── Dark panel (bottom) ──────────────────────────────────────────────────
  ctx.fillStyle = '#0F0C0A';
  ctx.fillRect(0, SPLIT, W, H - SPLIT);

  // Strava orange stripe at panel top
  ctx.fillStyle = STRAVA;
  ctx.fillRect(0, SPLIT, W, 5);

  // ── Top label: FUELSYNC ─────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '700 22px Arial';
  ctx.letterSpacing = '8px';
  ctx.textAlign = 'left';
  ctx.fillText('FUELSYNC', 72, 74);

  // ── Run name in photo zone (bottom-left of photo) ───────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 34px Arial';
  ctx.letterSpacing = '1px';
  ctx.textAlign = 'left';
  const runName = run.name.length > 28 ? run.name.slice(0, 27) + '…' : run.name;
  ctx.fillText(runName, 72, SPLIT - 42);

  // ── Dark panel content ───────────────────────────────────────────────────
  const panelTop = SPLIT + 5; // below orange stripe

  // Big distance
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 180px Arial';
  ctx.letterSpacing = '-8px';
  ctx.textAlign = 'left';
  ctx.fillText(run.distanceKm.toFixed(1), 68, panelTop + 195);

  // KM label next to distance
  ctx.fillStyle = STRAVA;
  ctx.font = '900 42px Arial';
  ctx.letterSpacing = '12px';
  ctx.textAlign = 'left';
  // Measure distance text width for positioning KM label
  ctx.font = '900 180px Arial';
  ctx.letterSpacing = '-8px';
  const distText = run.distanceKm.toFixed(1);
  const distW = ctx.measureText(distText).width;
  ctx.font = '900 42px Arial';
  ctx.letterSpacing = '12px';
  ctx.fillText('KM', 68 + distW + 12, panelTop + 165);

  // ── Stats row ────────────────────────────────────────────────────────────
  const statsY = panelTop + 240;
  const stats: Array<{ value: string; label: string }> = [
    { value: run.pace,                             label: '/km' },
    { value: formatDuration(run.duration),         label: 'time' },
    { value: `${run.elevationM}m`,                 label: 'elev' },
    { value: run.hrAvg ? `${run.hrAvg}` : '—',    label: 'bpm'  },
  ];

  // Divider line above stats
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(68, statsY - 18, W - 136, 1);
  ctx.restore();

  const colW = (W - 136) / stats.length;
  stats.forEach((s, i) => {
    const x = 68 + colW * i;

    // Stat value
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '800 44px Arial';
    ctx.letterSpacing = '-1px';
    ctx.textAlign = 'left';
    ctx.fillText(s.value, x, statsY + 48);

    // Stat label
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '600 18px Arial';
    ctx.letterSpacing = '2px';
    ctx.fillText(s.label.toUpperCase(), x, statsY + 78);
  });

  // ── VIA STRAVA footer ────────────────────────────────────────────────────
  const footerY = H - 68;

  // Strava logo mark (simplified chevrons)
  ctx.fillStyle = STRAVA;
  ctx.font = '700 18px Arial';
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'left';
  ctx.fillText('▶  VIA STRAVA', 68, footerY);

  // Right side: date
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '400 18px Arial';
  ctx.letterSpacing = '1px';
  ctx.textAlign = 'right';
  ctx.fillText(
    new Date(run.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase(),
    W - 68,
    footerY,
  );

  return canvas;
}

export async function shareRunCard(run: StravaRun, photoFile?: File | null): Promise<void> {
  let photo: HTMLImageElement | null = null;
  if (photoFile) {
    try { photo = await loadImage(photoFile); } catch { /* ignore bad image */ }
  }

  const canvas = generateRunCard(run, photo);

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) { reject(new Error('Canvas export failed')); return; }

      const file = new File([blob], `fuelsync-run-${run.id}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `${run.distanceKm} km — FuelSync` });
          resolve(); return;
        } catch { /* user cancelled */ }
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
