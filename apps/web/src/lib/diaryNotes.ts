const KEY_PREFIX = 'fs_note_';

export function getNoteForDate(date: string): string {
  try { return localStorage.getItem(KEY_PREFIX + date) ?? ''; } catch { return ''; }
}

export function setNoteForDate(date: string, note: string): void {
  try {
    if (note.trim()) { localStorage.setItem(KEY_PREFIX + date, note); }
    else             { localStorage.removeItem(KEY_PREFIX + date); }
  } catch {}
}
