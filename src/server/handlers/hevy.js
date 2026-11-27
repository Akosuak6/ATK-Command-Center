// GET /api/hevy?page=1  (header x-hevy-key: your Hevy API key, or HEVY_API_KEY in Vercel)
// -> Hevy's own reply for that page of workouts: { page, page_count, workouts: [...] }
// Hevy does not answer browsers directly, so this passes the request along.
// The key comes from the device with each request, or from HEVY_API_KEY when the device has none.
import { fetchWithTimeout } from './_safe.js';

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const key = String(req.headers['x-hevy-key'] || process.env.HEVY_API_KEY || '').trim();
  if (!KEY.test(key)) return res.status(400).json({ error: 'That does not look like a Hevy API key' });
  const page = Math.max(1, Math.min(100, Number.parseInt(String(req.query?.page || '1'), 10) || 1));
  try {
    const r = await fetchWithTimeout(
      `https://api.hevyapp.com/v1/workouts?page=${page}&pageSize=10`,
      { headers: { 'api-key': key, accept: 'application/json' } },
      10000
    );
    if (r.status === 401 || r.status === 403) return res.status(401).json({ error: 'Hevy did not accept that key' });
    if (r.status === 404) return res.status(200).json({ page, page_count: 0, workouts: [] });
    if (!r.ok) return res.status(502).json({ error: `Hevy answered ${r.status}` });
    return res.status(200).json(await r.json());
  } catch {
    return res.status(502).json({ error: 'Could not reach Hevy' });
  }
}
