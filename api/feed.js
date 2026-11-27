// GET /api/feed                     -> { fetchedAt, items, sources, keywords }
//   ?kw=quiet luxury|Oura            your keywords, separated by |
//   &skip=id,id                      built-in sources to leave out
//   &extra=<base64url JSON>          your own sources: [{ n: name, u: feed url | q: Google News search, d: domain, k: 'all'|'match', t: topics }]
// GET /api/feed?discover=<page url> -> { url, title, items } or { error }
// A thin wrapper around the scraper in scraper/, which also runs on its own from the command line.
import { safeUrl } from './_safe.js';
import { SOURCES } from '../scraper/lib/sources.js';
import { aggregate, customSources, discoverFeed } from '../scraper/lib/aggregate.js';

function decodeExtra(raw) {
  if (!raw) return [];
  try {
    const b64 = String(raw).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = req.query ?? {};

  if (q.discover) {
    const target = safeUrl(q.discover);
    if (!target) return res.status(400).json({ error: 'bad url' });
    const found = await discoverFeed(target.href, { timeoutMs: 6000 });
    res.setHeader('Cache-Control', found.error ? 'no-store' : 'public, max-age=3600');
    return res.status(found.error ? 404 : 200).json(found);
  }

  const skip = new Set(String(q.skip || '').split(',').map((s) => s.trim()).filter(Boolean));
  const sources = [...SOURCES.filter((s) => !skip.has(s.id)), ...customSources(decodeExtra(q.extra), safeUrl)];
  // Every source at once, each with its own time limit, so one slow site cannot hold up the rest.
  const keywords = String(q.kw || '').split('|');
  // Each source gets 6 seconds, so the whole refresh fits inside a serverless function's default time limit.
  const out = await aggregate({ sources, keywords, timeoutMs: 6000, concurrency: sources.length + 30 });
  // Shared caches can keep the result for 20 minutes, so a quick reload costs nothing.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1200, stale-while-revalidate=3600');
  return res.status(200).json(out);
}
