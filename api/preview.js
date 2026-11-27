// GET /api/preview?url=... -> { title, siteName, image }
// Reads a page's title and cover image (Open Graph or Twitter card tags).
import { fetchWithTimeout, safeUrl } from './_safe.js';

const UA = 'Mozilla/5.0 (compatible; CommandCenterPreview/1.0; +link preview)';

function decode(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
}

function meta(html, keys) {
  for (const key of keys) {
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i');
    const m = re1.exec(html) || re2.exec(html);
    if (m) return decode(m[1]);
  }
  return '';
}

// YouTube, Pinterest and TikTok publish official oEmbed endpoints; they are more reliable than their pages.
function oembedFor(u) {
  const h = u.hostname.replace(/^(www|m|music)\./, '');
  if (h === 'youtu.be' || h === 'youtube.com') return { site: 'YouTube', api: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u.href)}` };
  if (h === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(h)) return { site: 'Pinterest', api: `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(u.href)}` };
  if (/(^|\.)tiktok\.com$/.test(h)) return { site: 'TikTok', api: `https://www.tiktok.com/oembed?url=${encodeURIComponent(u.href)}` };
  return null;
}
// Share links that only redirect: oEmbed wants the full address they lead to.
const isShortLink = (u) => u.hostname === 'pin.it' || /^(vm|vt)\.tiktok\.com$/.test(u.hostname) || /^www\.tiktok\.com$/.test(u.hostname) && u.pathname.startsWith('/t/');

async function tryOembed(u) {
  const o = oembedFor(u);
  if (!o) return null;
  try {
    let target = u;
    if (isShortLink(u)) {
      // Short links need resolving first; the oEmbed endpoints want the full address.
      const r = await fetchWithTimeout(u.href, { headers: { 'user-agent': UA }, redirect: 'follow' });
      target = new URL(r.url);
      r.body?.cancel?.().catch?.(() => {});
    }
    const api = target === u ? o.api : oembedFor(target)?.api;
    if (!api) return null;
    const r = await fetchWithTimeout(api, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const title = j.title || (j.author_name ? `${o.site} from ${j.author_name}` : '');
    return { title, siteName: o.site, image: j.thumbnail_url || '' };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const target = safeUrl(req.query?.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!target) return res.status(400).json({ error: 'bad url' });
  const embedded = await tryOembed(target);
  if (embedded && embedded.image) {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json(embedded);
  }
  try {
    const r = await fetchWithTimeout(target.href, { headers: { 'user-agent': UA, accept: 'text/html,*/*' } });
    const type = r.headers.get('content-type') || '';
    if (type.startsWith('image/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).json({ image: r.url });
    }
    // Only the head matters; stop reading after ~400 KB.
    const reader = r.body.getReader();
    let html = '';
    const dec = new TextDecoder();
    while (html.length < 400000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    const title = meta(html, ['og:title', 'twitter:title']) || decode((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '');
    const siteName = meta(html, ['og:site_name', 'application-name']);
    let image = meta(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
    if (image) {
      try { image = new URL(image, r.url).href; } catch { image = ''; }
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ title: title || embedded?.title || '', siteName: embedded?.siteName || siteName, image });
  } catch {
    return res.status(502).json({ error: 'could not read that page' });
  }
}
