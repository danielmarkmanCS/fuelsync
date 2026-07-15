import type React from 'react';

// All values reference CSS variables defined in index.css.
// body[data-theme="dark"] overrides those variables — so every
// component using T.* automatically gets dark-mode colours.
export const T = {
  bg:          'var(--bg)',
  surf:        'var(--surf)',
  surf2:       'var(--surf2)',
  surf3:       'var(--surf3)',
  edge:        'var(--edge)',
  edge2:       'var(--edge2)',
  text:        'var(--text)',
  muted:       'var(--muted)',
  muted2:      'var(--muted2)',
  accent:      'var(--accent)',
  accent2:     'var(--accent2)',
  accentMuted: 'var(--accent-muted)',
  prot:        'var(--prot)',
  carb:        'var(--carb)',
  fat:         'var(--fat)',
  red:         'var(--red)',
  green:       'var(--green)',
  shadow:      'var(--shadow-md)',
  shadowMd:    'var(--shadow-lg)',
  shadowLg:    'var(--shadow-lg)',
} as const;

export const CARD: React.CSSProperties = {
  background:   T.surf,
  borderRadius: 12,
  boxShadow:    T.shadow,
  border:       `1px solid ${T.edge}`,
};

export const CARD_LG: React.CSSProperties = {
  ...CARD,
  borderRadius: 16,
};

export const INPUT: React.CSSProperties = {
  width:        '100%',
  background:   T.surf2,
  border:       `1px solid ${T.edge}`,
  borderRadius: 10,
  color:        T.text,
  fontSize:     15,
  padding:      '13px 14px',
  outline:      'none',
  fontFamily:   'inherit',
  fontWeight:   500,
  boxSizing:    'border-box',
};

export const BTN_PRIMARY: React.CSSProperties = {
  width:        '100%',
  padding:      '15px 0',
  borderRadius: 12,
  border:       'none',
  background:   T.accent,
  color:        '#FFFFFF',
  fontWeight:   700,
  fontSize:     15,
  cursor:       'pointer',
  boxShadow:    'var(--glow-accent)',
};

export const BTN_GHOST: React.CSSProperties = {
  background: 'none',
  border:     'none',
  color:      T.muted,
  fontSize:   13,
  fontWeight: 600,
  cursor:     'pointer',
  padding:    '10px 0',
};

// Macro colors as a lookup
export const MACRO_COLOR: Record<string, string> = {
  protein: T.prot,
  carbs:   T.carb,
  fat:     T.fat,
};
