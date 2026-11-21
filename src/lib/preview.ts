import { resizeBlob } from '../components/ui';
import { imageFromUrl } from '../components/ImagePicker';

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
export async function coverFromImageUrl(imageUrl: string): Promise<string | undefined> {
  try {
    const res = await get(`/api/image?url=${encodeURIComponent(imageUrl)}`, 9000);
    if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')) {
      return await resizeBlob(await res.blob(), 800);
    }
  } catch { /* fall through */ }
  try {
    return await imageFromUrl(imageUrl, 800);
  } catch {
    return undefined;
  }
}

// Title, site name and cover for a link, in one go.
export async function previewWithCover(url: string) {
  const p = await fetchPreview(url);
  const cover = p?.image ? await coverFromImageUrl(p.image) : undefined;
  return { title: p?.title, siteName: p?.siteName, cover };
}
