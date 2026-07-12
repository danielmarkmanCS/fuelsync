import type React from 'react';

// MFP-style light palette — single source of truth for all inline styles
export const T = {
  bg:          '#F5F7F5',
  surf:        '#FFFFFF',
  surf2:       '#F0F2F0',
  surf3:       '#E8EAE8',
  edge:        'rgba(0,0,0,0.08)',
  edge2:       'rgba(0,0,0,0.13)',
  text:        '#1A1A1A',
  muted:       '#757575',
  muted2:      '#9E9E9E',
  accent:      '#0091EA',
  accent2:     '#0077C2',
  accentMuted: 'rgba(0,145,234,0.10)',
  prot:        '#1E88E5',
  carb:        '#43A047',
  fat:         '#FB8C00',
  red:         '#E53935',
  green:       '#43A047',
  shadow:      '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd:    '0 2px 8px rgba(0,0,0,0.09), 0 1px 3px rgba(0,0,0,0.05)',
  shadowLg:    '0 4px 16px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)',
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
  boxShadow:    `0 3px 12px rgba(0,145,234,0.28)`,
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
