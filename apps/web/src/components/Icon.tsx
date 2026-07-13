interface P { size?: number; color?: string; sw?: number }
const svg = (children: React.ReactNode, { size = 20, color = 'currentColor', sw = 1.75 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
    style={{ display: 'block', flexShrink: 0 }}>
    {children}
  </svg>
);

export const IconMeal       = (p: P) => svg(<><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2M7 2v20M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3v7"/></>, p);
export const IconProtein    = (p: P) => svg(<><path d="M6.5 6.5h11M6.5 17.5h11"/><rect x="2" y="9" width="4" height="6" rx="1"/><rect x="18" y="9" width="4" height="6" rx="1"/><line x1="6" y1="12" x2="18" y2="12"/></>, p);
export const IconFlame      = (p: P) => svg(<><path d="M12 2c0 0-5 4-5 9a5 5 0 0010 0c0-2-1-4-2-5 0 2-1 3-2 4-1-2-1-5-1-8z"/></>, p);
export const IconDroplet    = (p: P) => svg(<><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></>, p);
export const IconMoon       = (p: P) => svg(<><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></>, p);
export const IconPill       = (p: P) => svg(<><path d="M10.5 20H4a2 2 0 01-2-2V6a2 2 0 012-2h16a2 2 0 012 2v7"/><circle cx="17" cy="17" r="5"/><path d="M14 17h6"/></>, p);
export const IconCheck      = (p: P) => svg(<><polyline points="20 6 9 17 4 12"/></>, p);
export const IconBolt       = (p: P) => svg(<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>, p);
export const IconTrophy     = (p: P) => svg(<><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></>, p);
export const IconStar       = (p: P) => svg(<><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>, p);
export const IconActivity   = (p: P) => svg(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>, p);
export const IconTarget     = (p: P) => svg(<><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>, p);
export const IconScale      = (p: P) => svg(<><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></>, p);
export const IconTrendUp    = (p: P) => svg(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>, p);
export const IconCalendar   = (p: P) => svg(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>, p);
export const IconPlus       = (p: P) => svg(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>, p);
export const IconUndo       = (p: P) => svg(<><path d="M3 7v6h6"/><path d="M3 13A9 9 0 1021 12"/></>, p);
export const IconChevronR   = (p: P) => svg(<><polyline points="9 18 15 12 9 6"/></>, p);
export const IconChevronD   = (p: P) => svg(<><polyline points="6 9 12 15 18 9"/></>, p);
export const IconUser       = (p: P) => svg(<><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></>, p);
export const IconSettings   = (p: P) => svg(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>, p);
export const IconGlow       = (p: P) => svg(<><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></>, p);
export const IconBody       = (p: P) => svg(<><circle cx="12" cy="5" r="2"/><path d="M8 14v6m4-6v6m4-6v6"/><path d="M6 10l2-2h8l2 2-2 4H8l-2-4z"/></>, p);
export const IconAscend     = (p: P) => svg(<><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></>, p);
