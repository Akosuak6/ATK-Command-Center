import { resizeBlob } from '../components/ui';
import { imageFromUrl } from '../components/ImagePicker';
import { linkKind, youtubeThumbs } from './links';

// Link previews come from two small serverless functions in api/ (preview and image).
// When they are not deployed, or fail, callers fall back to a title made from the URL and no cover.
export interface Preview { title?: string; siteName?: string; image?: string }

async function get(path: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(path, { signal: ctrl.signal });
  } finally {
    window.clearTimeout(t);
  }
}

export async function fetchPreview(url: string, timeoutMs = 7000): Promise<Preview | null> {
  if (!navigator.onLine) return null;
  try {
    const res = await get(`/api/preview?url=${encodeURIComponent(url)}`, timeoutMs);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const data = (await res.json()) as Preview;
    return data && (data.title || data.siteName || data.image) ? data : null;
  } catch {
    return null;
  }
}

// Keep a resized copy of a cover on the phone so it shows offline.
// minWidth skips tiny placeholder images (YouTube serves a 120px one for missing sizes).
export async function coverFromImageUrl(imageUrl: string, minWidth = 1): Promise<string | undefined> {
  try {
    const res = await get(`/api/image?url=${encodeURIComponent(imageUrl)}`, 9000);
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
      const blob = await res.blob();
      const src = await resizeBlob(blob, 800);
      if (minWidth <= 1 || (await widthOf(src)) >= Math.min(minWidth, 800)) return src;
      return undefined;
    }
  } catch { /* fall through */ }
  try {
    return await imageFromUrl(imageUrl, 800, minWidth);
  } catch {
    return undefined;
  }
}

function widthOf(src: string) {
  return new Promise<number>((resolve) => {
    const i = new Image();
    i.onload = () => resolve(i.naturalWidth);
    i.onerror = () => resolve(0);
    i.src = src;
  });
}

// Title, site name and cover for a link, in one go.
export async function previewWithCover(url: string) {
  const kind = linkKind(url);
  const p = await fetchPreview(url);
  let cover: string | undefined;
  if (kind.kind === 'youtube') {
    // YouTube thumbnails live at known addresses, so a cover works even without the preview function.
    for (const t of youtubeThumbs(kind.id)) {
      cover = await coverFromImageUrl(t, 300);
      if (cover) break;
    }
    return { title: p?.title || undefined, siteName: 'YouTube', cover };
  }
  cover = p?.image ? await coverFromImageUrl(p.image) : undefined;
  const siteName = kind.kind === 'pinterest' ? 'Pinterest' : p?.siteName;
  return { title: p?.title, siteName, cover };
}
