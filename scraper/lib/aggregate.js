// Fetch every source, read its stories, tag them with topics and your keywords, drop repeats and rank what is left.
// Plain web requests from whatever machine runs this (your laptop, or the app's own server). No AI service
// fetches anything, so blocks aimed at AI crawlers do not apply; sites see an ordinary feed reader.
import { parseFeed, feedLinksIn } from './parse.js';
import { classify, isNoise, TOPIC_BY_ID } from './topics.js';
import { sourceUrl, googleNewsUrl } from './sources.js';
import { compileKeywords, keywordQuery, matchKeywords } from './keywords.js';

const UA = 'Mozilla/5.0 (compatible; CommandCenterFeed/1.0; personal RSS reader)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.5, */*;q=0.3';
const MAX_BYTES = 3_000_000;

async function fetchText(url, { fetchImpl = fetch, timeoutMs = 7000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: ACCEPT } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!r.body?.getReader) return { text: await r.text(), url: r.url || url, type: r.headers.get('content-type') || '' };
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      if (text.length > MAX_BYTES) { reader.cancel().catch(() => {}); break; }
    }
    return { text, url: r.url || url, type: r.headers.get('content-type') || '' };
  } catch (e) {
    const cause = e?.cause?.code || e?.cause?.message;
    throw new Error(e?.name === 'AbortError' ? 'timed out' : cause ? `could not connect (${cause})` : e?.message || 'could not connect');
  } finally {
    clearTimeout(timer);
  }
}

// FNV-1a, 52 bits, as base 36: a short stable id for a story's address.
export function hashId(s) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return ((h2 & 0xfffff) * 4294967296 + h1).toString(36);
}

const TRACKING = /^(utm_\w+|fbclid|gclid|mc_cid|mc_eid|cmpid|ncid|sr_share|ref|ref_src|src|smid|mbid|_hsenc|_hsmi|itm_\w+)$/i;

export function canonicalUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const k of [...url.searchParams.keys()]) if (TRACKING.test(k)) url.searchParams.delete(k);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    let s = url.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s.replace(/^http:/, 'https:');
  } catch {
    return u;
  }
}

const titleKey = (t) => t.toLowerCase().replace(/[‘’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 90);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

// Google News titles end in " - Publisher"; the publisher is also in <source>.
function cleanGoogleTitle(title, source) {
  if (source && title.endsWith(` - ${source}`)) return title.slice(0, -(source.length + 3)).trim();
  const i = title.lastIndexOf(' - ');
  return i > 20 ? title.slice(0, i).trim() : title;
}

function cleanLinkedInTitle(title) {
  return title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();
}

export async function readSource(src, opts = {}) {
  const url = sourceUrl(src);
  const res = await fetchText(url, opts);
  const feed = parseFeed(res.text, res.url);
  return { feed, url: res.url };
}

// One source's stories, tagged and filtered. Never throws; failures come back in status.
async function collect(src, opts) {
  const status = { id: src.id, name: src.name, ok: false, found: 0, kept: 0, error: '' };
  try {
    const { feed } = await readSource(src, opts);
    status.ok = true;
    status.found = feed.items.length;
    const now = opts.now ?? Date.now();
    const cutoff = now - (opts.maxAgeDays ?? 21) * 86400000;
    const out = [];
    for (const raw of feed.items) {
      const isGoogle = Boolean(src.google) || /news\.google\.com/.test(raw.url);
      const source = raw.source || src.name;
      let title = isGoogle ? cleanGoogleTitle(raw.title, raw.source) : raw.title;
      if (src.kind === 'linkedin' || /linkedin\.com/.test(raw.sourceUrl)) title = cleanLinkedInTitle(title);
      let summary = raw.summary;
      // Google News descriptions repeat the headline and the publisher; they add nothing.
      if (isGoogle || titleKey(summary).startsWith(titleKey(title).slice(0, 40))) summary = '';
      const time = raw.date ? Date.parse(raw.date) : now;
      if (time < cutoff || time > now + 86400000) continue;
      if (src.broad && isNoise(title)) continue;
      const text = [title, summary, raw.categories.join(' ')].join(' . ');
      const matched = classify(text, src.domain);
      // Your keywords count anywhere they appear, and on every story a keyword's own search found
      // (Google reads the whole article, so the headline may not say it).
      const keywords = matchKeywords(text, opts.compiledKeywords);
      if (src.keyword && !keywords.includes(src.keyword)) keywords.unshift(src.keyword);
      if (src.keep === 'match' && matched.length === 0 && keywords.length === 0) continue;
      const topics = matched.length ? matched : (src.topics ?? []);
      if (topics.length === 0 && keywords.length === 0) continue;
      const crosses = topics.filter((t) => TOPIC_BY_ID[t]?.cross).length;
      const rel = (src.weight ?? 1) * (1 + 0.2 * Math.min(3, Math.max(0, matched.length - 1)) + (crosses ? 0.2 : 0)) * (keywords.length ? 1.25 : 1);
      const site = raw.sourceUrl ? hostOf(raw.sourceUrl) : hostOf(raw.url);
      const kind = /linkedin\.com/.test(site) || src.kind === 'linkedin' ? 'linkedin' : src.kind === 'newsletter' || /substack\.com|beehiiv\.com/.test(site) ? 'newsletter' : 'article';
      out.push({
        id: hashId(canonicalUrl(raw.url)),
        url: raw.url,
        title,
        summary,
        source: /linkedin\.com/.test(site) ? 'LinkedIn' : source,
        site,
        sourceId: src.id,
        date: new Date(time).toISOString(),
        image: raw.image || '',
        author: raw.author || '',
        topics,
        keywords,
        rel: Math.round(rel * 1000) / 1000,
        kind
      });
    }
    out.sort((a, b) => b.date.localeCompare(a.date));
    const kept = out.slice(0, opts.perSource ?? 40);
    status.kept = kept.length;
    return { status, items: kept };
  } catch (e) {
    status.error = e?.message || 'failed';
    return { status, items: [] };
  }
}

// When several sources carry the same story, keep one copy: prefer the publisher's own link and an image.
function dedupe(items) {
  const byKey = new Map();
  const better = (a, b) => {
    const score = (x) => (/news\.google\.com/.test(x.url) ? 0 : 2) + (x.image ? 1 : 0) + (x.summary ? 0.5 : 0);
    return score(b) > score(a) ? b : a;
  };
  for (const it of items) {
    const keys = [it.id, `t:${titleKey(it.title)}`];
    const hit = keys.map((k) => byKey.get(k)).find(Boolean);
    if (!hit) {
      const entry = { ...it, also: [] };
      keys.forEach((k) => byKey.set(k, entry));
      continue;
    }
    const keep = better(hit, it);
    const other = keep === hit ? it : hit;
    const merged = {
      ...keep,
      summary: keep.summary || other.summary,
      image: keep.image || other.image,
      author: keep.author || other.author,
      topics: [...new Set([...hit.topics, ...it.topics])],
      keywords: [...new Set([...(hit.keywords ?? []), ...(it.keywords ?? [])])],
      rel: Math.max(hit.rel, it.rel),
      also: [...new Set([...hit.also, other.source])].filter((s) => s !== keep.source)
    };
    Object.assign(hit, merged);
    keys.forEach((k) => byKey.set(k, hit));
  }
  const out = [...new Set(byKey.values())];
  // A story that several outlets picked up matters a little more.
  for (const it of out) it.rel = Math.round(it.rel * (1 + Math.min(0.3, 0.1 * it.also.length)) * 1000) / 1000;
  return out;
}

export function score(item, now = Date.now()) {
  const hours = Math.max(0, (now - Date.parse(item.date)) / 3600000);
  return item.rel * Math.pow(0.5, hours / 30);
}

// One Google News search per keyword.
export function keywordSources(keywords) {
  return compileKeywords(keywords).map(({ keyword }) => ({
    id: `kw-${hashId(keyword.toLowerCase())}`,
    name: keyword,
    google: keywordQuery(keyword),
    days: 14,
    domain: '',
    keep: 'all',
    topics: [],
    group: 'keywords',
    kind: 'search',
    keyword,
    weight: 1
  }));
}

// aggregate({ sources, keywords }) -> { fetchedAt, items, sources: [status], keywords }
export async function aggregate({ sources: given, keywords: rawKeywords = [], limit = 450, concurrency = 12, ...opts }) {
  const compiledKeywords = compileKeywords(rawKeywords);
  const keywords = compiledKeywords.map((k) => k.keyword);
  const sources = [...given, ...keywordSources(keywords)];
  opts = { ...opts, compiledKeywords };
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < sources.length) {
      const i = next++;
      results[i] = await collect(sources[i], opts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));
  const items = dedupe(results.flatMap((r) => r.items));
  const now = opts.now ?? Date.now();
  items.sort((a, b) => score(b, now) - score(a, now));
  return { fetchedAt: new Date(now).toISOString(), items: items.slice(0, limit), sources: results.map((r) => r.status), keywords };
}

// Custom sources from the app arrive as a compact list. Validate them before fetching anything.
export function customSources(list, safeUrl) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list.slice(0, 20)) {
    if (!c || typeof c !== 'object') continue;
    const domain = ['health', 'fashion', 'both'].includes(c.d) ? c.d : '';
    const topics = Array.isArray(c.t) ? c.t.filter((t) => TOPIC_BY_ID[t]).slice(0, 4) : [];
    const name = String(c.n || '').slice(0, 80) || 'Your source';
    const id = `c-${String(c.i || hashId(String(c.u || c.q || name))).replace(/[^\w-]/g, '').slice(0, 24)}`;
    if (c.q) {
      out.push({ id, name, google: String(c.q).slice(0, 200), domain, keep: c.k === 'match' ? 'match' : 'all', topics, group: 'custom', kind: 'search', weight: 1.05 });
    } else if (c.u && safeUrl(c.u)) {
      out.push({ id, name, url: safeUrl(c.u).href, domain, keep: c.k === 'match' ? 'match' : 'all', topics, group: 'custom', kind: c.nl ? 'newsletter' : 'news', weight: 1.1 });
    }
  }
  return out;
}

// Find the feed behind a page: the page itself, a feed it advertises, or a usual address like /feed.
export async function discoverFeed(pageUrl, opts = {}) {
  const u = new URL(pageUrl);
  if (/(^|\.)linkedin\.com$/i.test(u.hostname)) return { error: 'linkedin' };
  const tryFeed = async (url) => {
    try {
      const res = await fetchText(url, opts);
      const feed = parseFeed(res.text, res.url);
      if (feed.items.length) return { url: res.url, title: feed.title || hostOf(res.url), items: feed.items.length };
    } catch { /* not a feed */ }
    return null;
  };
  let page;
  try {
    page = await fetchText(u.href, opts);
  } catch (e) {
    return { error: e?.message || 'could not open that page' };
  }
  try {
    const feed = parseFeed(page.text, page.url);
    if (feed.items.length) return { url: page.url, title: feed.title || hostOf(page.url), items: feed.items.length };
  } catch { /* a web page, keep looking */ }
  for (const link of feedLinksIn(page.text.split(/<\/head>/i)[0], page.url).slice(0, 3)) {
    const hit = await tryFeed(link.url);
    if (hit) return hit;
  }
  const origin = new URL(page.url).origin;
  for (const path of ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml']) {
    const hit = await tryFeed(origin + path);
    if (hit) return hit;
  }
  return { error: 'no feed found' };
}

export { googleNewsUrl };
