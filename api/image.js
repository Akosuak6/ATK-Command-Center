// GET /api/image?url=... -> the image bytes, with CORS, so the phone can resize and keep a copy.
import { fetchWithTimeout, safeUrl } from './_safe.js';

const MAX = 8 * 1024 * 1024;

export default async function handler(req, res) {
  const target = safeUrl(req.query?.url);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (!target) return res.status(400).end('bad url');
  try {
    const r = await fetchWithTimeout(target.href, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CommandCenterPreview/1.0)', accept: 'image/*' } });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return res.status(415).end('not an image');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX) return res.status(413).end('too large');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    return res.status(200).send(buf);
  } catch {
    return res.status(502).end('could not fetch image');
  }
}
