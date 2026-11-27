// GET /api/placecover?q=Ethiopia landscape&n=0  ->  { image, credit, link }   (n: try the next photo)
// A freely licensed photo of a place, for a trip cover, from Openverse (Creative Commons
// photos, mostly from Wikimedia and Flickr; no key needed). The credit is kept with the photo,
// because most of these licenses ask for one.
import { fetchWithTimeout } from './_safe.js';

const UA = 'atk-command-center/1.0 (personal app)';

export default async function handler(req, res) {
  const q = String(req.query?.q || '').trim().slice(0, 120);
  if (!q) return res.status(400).json({ error: 'send q' });
  const n = Math.max(0, Math.floor(Number(req.query?.n) || 0));
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=12&aspect_ratio=wide&size=large&mature=false`;
    const r = await fetchWithTimeout(url, { headers: { 'user-agent': UA, accept: 'application/json' } }, 10000);
    if (!r.ok) return res.status(502).json({ error: 'The photo service did not answer' });
    const results = (await r.json()).results || [];
    // A landscape photo, not a thin panorama.
    const wide = (x) => x.width && x.height && x.width / x.height >= 1.2 && x.width / x.height <= 2.2;
    // Landscape photos first, the ones hosted on Wikimedia (which can be resized) ahead of the rest.
    const onWiki = (x) => /upload\.wikimedia\.org/.test(x.url || '');
    const ranked = [...results.filter((x) => wide(x) && onWiki(x)), ...results.filter((x) => wide(x) && !onWiki(x))];
    const list = ranked.length ? ranked : results;
    const pick = list.length ? list[n % list.length] : undefined;
    if (!pick) return res.status(404).json({ error: 'No photo found' });
    const title = String(pick.title || '').replace(/^File:/i, '').replace(/\.(jpe?g|png|tiff?)$/i, '').replace(/[_]+/g, ' ').trim();
    const license = pick.license ? `CC ${String(pick.license).toUpperCase()}${pick.license_version ? ` ${pick.license_version}` : ''}` : '';
    const credit = [title, pick.creator ? `by ${pick.creator}` : '', license].filter(Boolean).join(', ');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    // Wikimedia makes resized copies on request; Openverse's own thumbnails are not reliable.
    const wm = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(\w)\/(\w\w)\/([^/?#]+)$/.exec(pick.url || '');
    const image = wm && pick.width > 1280 ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${wm[1]}/${wm[2]}/${wm[3]}/1280px-${wm[3]}` : pick.url;
    return res.status(200).json({ image, credit, link: pick.foreign_landing_url || '' });
  } catch {
    return res.status(502).json({ error: 'Could not reach the photo service' });
  }
}
