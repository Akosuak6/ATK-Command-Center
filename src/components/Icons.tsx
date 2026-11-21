import type { ReactNode } from 'react';

const Svg = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconHome = () => <Svg><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></Svg>;
export const IconDump = () => <Svg><path d="M3 13h5l2 3h4l2-3h5" /><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" /></Svg>;
export const IconMoney = () => <Svg><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M16 12.5h2M3 10h18" /></Svg>;
export const IconHealth = () => <Svg><path d="M3 12h4l2-5 4 10 2-5h6" /></Svg>;
export const IconSocial = () => <Svg><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></Svg>;
export const IconWork = () => <Svg><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18" /></Svg>;
export const IconSettings = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></Svg>;
export const IconClose = () => <Svg><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconCheck = ({ size = 12 }: { size?: number }) => <Svg size={size}><path d="M5 12l5 5 9-10" /></Svg>;
export const IconPencil = ({ size = 16 }: { size?: number }) => <Svg size={size}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></Svg>;
export const IconTrash = ({ size = 16 }: { size?: number }) => <Svg size={size}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>;
export const IconArrowUp = () => <span aria-hidden="true">↗</span>;
export const IconArrowDown = () => <span aria-hidden="true">↘</span>;
