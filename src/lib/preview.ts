// Link previews come from one small serverless function (api/preview), added in phase 3.
// Until it is deployed, or whenever it fails, callers fall back to a title made from the URL.
export interface Preview { title?: string; siteName?: string }

export async function fetchPreview(url: string, timeoutMs = 5000): Promise<Preview | null> {
  if (!navigator.onLine) return null;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/preview?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const data = (await res.json()) as Preview;
    return data && (data.title || data.siteName) ? data : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}
