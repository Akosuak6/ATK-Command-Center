// The app's look: Moody (near black navy with chrome, the default) or Light (linen and navy).
// Saved on this device only; index.html applies it before the first paint.

export type Theme = 'light' | 'moody';

export function getTheme(): Theme {
  try { return localStorage.getItem('theme') === 'light' ? 'light' : 'moody'; } catch { return 'moody'; }
}

export function setTheme(theme: Theme) {
  try { localStorage.setItem('theme', theme); } catch { /* storage blocked: applies until reload */ }
  const root = document.documentElement;
  if (theme === 'moody') root.dataset.theme = 'moody';
  else delete root.dataset.theme;
  const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  const tc = meta('theme-color');
  if (tc) tc.content = theme === 'moody' ? '#070B14' : '#D8CFC1';
  const cs = meta('color-scheme');
  if (cs) cs.content = theme === 'moody' ? 'dark' : 'light only';
}
