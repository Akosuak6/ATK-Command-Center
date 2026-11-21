// Recognize links that deserve special handling: YouTube videos and Pinterest pins or boards.
// Covers the share links the iPhone apps produce (youtu.be, Shorts, pin.it).

export type LinkKind =
  | { kind: 'youtube'; id: string }
  | { kind: 'pinterest'; pinId?: string }
  | { kind: 'other' };

export function linkKind(raw: string): LinkKind {
  let u: URL;
  try { u = new URL(raw); } catch { return { kind: 'other' }; }
  const host = u.hostname.replace(/^(www|m|music)\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.split('/')[1];
    if (validId(id)) return { kind: 'youtube', id };
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v');
    if (v && validId(v)) return { kind: 'youtube', id: v };
    const m = /^\/(shorts|embed|live|v)\/([\w-]{11})/.exec(u.pathname);
    if (m) return { kind: 'youtube', id: m[2] };
  }
  if (host === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(host)) {
    const m = /\/pin\/(?:[^/]*--)?(\d+)/.exec(u.pathname);
    return { kind: 'pinterest', pinId: m?.[1] };
  }
  return { kind: 'other' };
}

const validId = (id?: string) => !!id && /^[\w-]{11}$/.test(id);

export const youtubeEmbed = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;

// Best first. hq720 is sharp 16:9 when it exists; mqdefault always exists.
export const youtubeThumbs = (id: string) => [
  `https://i.ytimg.com/vi/${id}/hq720.jpg`,
  `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
];
