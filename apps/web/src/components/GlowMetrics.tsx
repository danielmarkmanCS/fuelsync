import { useState, useEffect, useRef, useCallback } from 'react';
import { logMetricEntry, getMetricEntries } from '../lib/glowRoutine';
import type { GlowMetricEntry, BeardStage } from '../lib/db';

// ─── Photo storage via localStorage ──────────────────────────────────────────
// Photos are compressed JPEG base64 strings stored under fixed keys.
// This keeps binary data out of IndexedDB while remaining fully offline.

const PHOTO_BEFORE_KEY  = 'fuelsync_glow_photo_before';
const PHOTO_LATEST_KEY  = 'fuelsync_glow_photo_latest';

function compressImage(file: File, maxPx = 600, quality = 0.72): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width  * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = url;
  });
}

// ─── Beard stage picker ───────────────────────────────────────────────────────

const BEARD_LABELS: Record<BeardStage, string> = {
  1: 'Clean',
  2: 'Stubble',
  3: 'Short',
  4: 'Medium',
  5: 'Full',
};

function BeardPicker({ value, onChange }: { value: BeardStage | null; onChange: (v: BeardStage) => void }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 8 }}>
        BEARD STAGE
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {([1, 2, 3, 4, 5] as BeardStage[]).map(stage => {
          const active = value === stage;
          return (
            <button
              key={stage}
              onClick={() => onChange(stage)}
              className="press"
              style={{
                flex: 1, padding: '8px 4px',
                background: active ? 'rgba(251,191,36,0.12)' : 'var(--surf2)',
                border: `1px solid ${active ? 'rgba(251,191,36,0.40)' : 'var(--edge)'}`,
                borderRadius: 10, cursor: 'pointer',
                color: active ? '#FBBF24' : 'var(--muted)',
                fontWeight: 800, fontSize: 11,
                transition: 'all 0.18s var(--spring)',
                boxShadow: active ? '0 0 12px rgba(251,191,36,0.25)' : 'none',
              }}
            >
              {stage}
              <div style={{ fontSize: 8, marginTop: 2, letterSpacing: '0.04em' }}>
                {BEARD_LABELS[stage]}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Photo slot ───────────────────────────────────────────────────────────────

function PhotoSlot({
  label, storageKey, color,
}: { label: string; storageKey: string; color: string }) {
  const [src, setSrc]   = useState<string | null>(null);
  const inputRef        = useRef<HTMLInputElement>(null);

  useEffect(() => { setSrc(localStorage.getItem(storageKey)); }, [storageKey]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    localStorage.setItem(storageKey, b64);
    setSrc(b64);
    e.target.value = '';
  };

  const handleClear = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    localStorage.removeItem(storageKey);
    setSrc(null);
  };

  return (
    <div style={{ flex: 1 }}>
      <div style={{
        fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
        color, marginBottom: 6, textAlign: 'center',
      }}>
        {label}
      </div>
      <button
        onClick={() => inputRef.current?.click()}
        className="press"
        style={{
          width: '100%', aspectRatio: '1 / 1',
          background: src ? 'none' : 'var(--surf2)',
          border: `1.5px dashed ${src ? color : 'var(--edge2)'}`,
          borderRadius: 14, cursor: 'pointer', overflow: 'hidden',
          position: 'relative', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          padding: 0,
        }}
      >
        {src ? (
          <>
            <img
              src={src}
              alt={label}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.35)',
              display: 'flex', alignItems: 'flex-end',
              justifyContent: 'flex-end',
              padding: 6,
            }}>
              <span
                onClick={handleClear}
                style={{
                  fontSize: 10, fontWeight: 700, color: '#fff',
                  background: 'rgba(248,113,113,0.80)', padding: '2px 7px',
                  borderRadius: 99, cursor: 'pointer',
                }}
              >
                ✕
              </span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>📷</div>
            <div style={{ fontSize: 10, fontWeight: 700 }}>Tap to add</div>
          </div>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ entry }: { entry: GlowMetricEntry }) {
  const date = new Date(entry.date + 'T12:00:00');
  const label = date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      background: 'var(--surf)',
      borderRadius: 12,
      border: '1px solid var(--edge)',
    }}>
      <div style={{ width: 42, flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{label}</div>
      </div>
      <div style={{ display: 'flex', gap: 16, flex: 1, flexWrap: 'wrap' }}>
        {entry.weightKg != null && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#38BDF8', fontVariantNumeric: 'tabular-nums' }}>
              {entry.weightKg}
            </div>
            <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>KG</div>
          </div>
        )}
        {entry.bodyFatPct != null && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#FBBF24', fontVariantNumeric: 'tabular-nums' }}>
              {entry.bodyFatPct}%
            </div>
            <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>BODY FAT</div>
          </div>
        )}
        {entry.beardStage != null && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#F97316' }}>
              {BEARD_LABELS[entry.beardStage]}
            </div>
            <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>BEARD</div>
          </div>
        )}
      </div>
      {entry.notes && (
        <div style={{ fontSize: 11, color: 'var(--muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.notes}
        </div>
      )}
    </div>
  );
}

// ─── Number input ─────────────────────────────────────────────────────────────

function NumInput({
  label, value, unit, placeholder, onChange, color,
}: {
  label: string; value: string; unit: string; placeholder: string;
  onChange: (v: string) => void; color: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--surf2)', border: '1px solid var(--edge2)',
        borderRadius: 10, overflow: 'hidden',
      }}>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            padding: '10px 12px',
            fontSize: 15, fontWeight: 700, color: color,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span style={{ paddingRight: 10, fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>{unit}</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GlowMetrics() {
  const today = new Date().toISOString().split('T')[0];

  const [weight,    setWeight]    = useState('');
  const [bodyFat,   setBodyFat]   = useState('');
  const [beard,     setBeard]     = useState<BeardStage | null>(null);
  const [notes,     setNotes]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [history,   setHistory]   = useState<GlowMetricEntry[]>([]);

  const loadHistory = useCallback(async () => {
    const entries = await getMetricEntries(14);
    setHistory(entries);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleSave = async () => {
    const hasData = weight || bodyFat || beard || notes.trim();
    if (!hasData) return;
    setSaving(true);
    await logMetricEntry({
      date: today,
      weightKg:    weight   ? parseFloat(weight)   : null,
      bodyFatPct:  bodyFat  ? parseFloat(bodyFat)  : null,
      beardStage:  beard,
      notes:       notes.trim() || null,
      logged_at:   new Date().toISOString(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
    setWeight(''); setBodyFat(''); setBeard(null); setNotes('');
    loadHistory();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Log form */}
      <div className="card a a1" style={{ padding: '16px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--accent)', marginBottom: 14 }}>
          LOG TODAY'S METRICS
        </div>

        {/* Weight + Body fat */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <NumInput label="WEIGHT" value={weight} unit="kg" placeholder="80.5" onChange={setWeight} color="#38BDF8" />
          <NumInput label="BODY FAT" value={bodyFat} unit="%" placeholder="15" onChange={setBodyFat} color="#FBBF24" />
        </div>

        {/* Beard stage */}
        <div style={{ marginBottom: 14 }}>
          <BeardPicker value={beard} onChange={setBeard} />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)', marginBottom: 6 }}>
            NOTES (optional)
          </div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Skin feels better, jaw sore from mewing…"
            rows={2}
            style={{
              width: '100%', background: 'var(--surf2)',
              border: '1px solid var(--edge2)', borderRadius: 10,
              padding: '10px 12px', resize: 'none',
              fontSize: 13, color: 'var(--text)',
              outline: 'none', lineHeight: 1.5,
            }}
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="press"
          style={{
            width: '100%', padding: '13px 0',
            background: saved
              ? 'rgba(74,222,128,0.15)'
              : 'linear-gradient(135deg, var(--accent2), var(--accent))',
            border: saved ? '1px solid rgba(74,222,128,0.35)' : 'none',
            borderRadius: 12,
            fontSize: 13, fontWeight: 800, letterSpacing: '0.06em',
            color: saved ? '#4ADE80' : '#fff',
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s var(--spring)',
            boxShadow: saved ? '0 0 16px rgba(74,222,128,0.25)' : 'var(--glow-accent)',
          }}
        >
          {saved ? '✓ Logged' : saving ? 'Saving…' : 'LOG ENTRY'}
        </button>
      </div>

      {/* Photo comparison */}
      <div className="card a a2" style={{ padding: '16px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: '#F472B6', marginBottom: 14 }}>
          PROGRESS PHOTOS
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <PhotoSlot label="BEFORE"  storageKey={PHOTO_BEFORE_KEY}  color="#A78BFA" />
          <PhotoSlot label="LATEST"  storageKey={PHOTO_LATEST_KEY}  color="#4ADE80" />
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
          Photos are stored locally on your device — never uploaded.
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="a a3">
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--muted)', marginBottom: 10 }}>
            HISTORY
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(entry => (
              <HistoryRow key={entry.id ?? entry.date} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
