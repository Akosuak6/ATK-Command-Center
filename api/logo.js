// GET /api/logo?url=https://studio.com -> the site's logo or app icon, as image bytes with CORS.
// Prefers the large square app icon (looks right in a circle), then the share image, then the favicon.
import { fetchWithTimeout, safeUrl } from './_safe.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function candidates(html, base) {
  const out = [];
  for (const m of html.matchAll(/<link[^>]+>/gi)) {
    const tag = m[0];
    const rel = (/rel=["']([^"']+)["']/i.exec(tag) || [])[1] || '';
    const href = (/href=["']([^"']+)["']/i.exec(tag) || [])[1];
    if (!href || !/icon/i.test(rel)) continue;
    const size = Number(((/sizes=["'](\d+)x\d+["']/i.exec(tag) || [])[1]) || (/apple-touch/i.test(rel) ? 180 : 32));
    out.push({ url: new URL(href, base).href, score: (/apple-touch/i.test(rel) ? 1000 : 0) + size });
  }
  const og = /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i.exec(html);
  if (og) out.push({ url: new URL(og[1], base).href, score: 500 });
  out.push({ url: new URL('/apple-touch-icon.png', base).href, score: 100 });
  return out.sort((a, b) => b.score - a.score).map((c) => c.url);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const target = safeUrl(req.query?.url);
  if (!target) return res.status(400).end('bad url');
  try {
    const page = await fetchWithTimeout(target.href, { headers: { 'user-agent': UA, accept: 'text/html' } }, 7000);
    const html = (await page.text()).slice(0, 600000);
    for (const url of candidates(html, page.url)) {
      if (!safeUrl(url)) continue;
      try {
        const r = await fetchWithTimeout(url, { headers: { 'user-agent': UA, accept: 'image/*' } }, 6000);
        const type = r.headers.get('content-type') || '';
        if (!r.ok || !type.startsWith('image/') || /svg/.test(type)) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 400 || buf.length > 5 * 1024 * 1024) continue;
        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        return res.status(200).send(buf);
      } catch { /* try the next one */ }
    }
    return res.status(404).end('no logo found');
  } catch {
    return res.status(502).end('could not read that site');
  }
}
