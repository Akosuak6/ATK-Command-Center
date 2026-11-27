// The feed: healthcare and fashion stories pulled by api/feed.js, kept on the phone in the feed table.
import { db, getMeta, setMeta } from './db';
import { hostOf, normalizeUrl, shortDate, titleFromUrl } from './format';
import { coverFromImageUrl, fetchPreview } from './preview';
import { addDumpItem } from '../pages/Dump';
import { classify, TOPIC_BY_ID, TOPICS } from '../../scraper/lib/topics.js';
import { compileKeywords, matchKeywords, normalizeKeywords } from '../../scraper/lib/keywords.js';
import type { DumpType, FeedItem, FeedSettings, FeedSourceStatus } from './types';

export const DEFAULT_FEED_SETTINGS: FeedSettings = { skip: [], custom: [], mutedTopics: [], keywords: [] };
export const STALE_AFTER_MS = 2 * 3600 * 1000; // refresh on open when older than this
const KEEP_DAYS = 30;
const MAX_ITEMS = 800;

export interface RefreshResult { ok: boolean; added?: number; answered?: number; total?: number; message?: string }

function base64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getJson<T>(path: string, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { signal: ctrl.signal });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

export function feedQuery(settings: FeedSettings, fresh = false) {
  const params = new URLSearchParams();
  const keywords = normalizeKeywords(settings.keywords ?? []);
  if (keywords.length) params.set('kw', keywords.join('|'));
  if (settings.skip.length) params.set('skip', [...settings.skip].sort().join(','));
  if (settings.custom.length) {
    params.set('extra', base64url(JSON.stringify(settings.custom.map((c) => ({ i: c.id, n: c.name, u: c.url, q: c.query, d: c.domain, k: c.keep, t: c.topics })))));
  }
  // A manual refresh skips the shared cache; opening the page is happy with a result up to 20 minutes old.
  if (fresh) params.set('fresh', String(Date.now()));
  return `/api/feed?${params}`;
}

type Incoming = Omit<FeedItem, 'firstSeen'>;

// One refresh at a time: opening the page and tapping Refresh share the same request.
let inFlight: Promise<RefreshResult> | null = null;
export function refreshFeed(fresh = false): Promise<RefreshResult> {
  if (!inFlight) inFlight = doRefresh(fresh).finally(() => { inFlight = null; });
  return inFlight;
}

async function doRefresh(fresh: boolean): Promise<RefreshResult> {
  if (!navigator.onLine) return { ok: false, message: 'You are offline. The feed refreshes when you are back online.' };
  const settings = await getMeta<FeedSettings>('feedSettings', DEFAULT_FEED_SETTINGS);
  const data = await getJson<{ fetchedAt: string; items: Incoming[]; sources: FeedSourceStatus[] }>(feedQuery(settings, fresh), 30000);
  if (!data || !Array.isArray(data.items)) {
    return { ok: false, message: 'Could not reach the feed service. It runs on the deployed app, or on your laptop with npm run dev.' };
  }
  const added = await mergeItems(data.items);
  await setMeta('feedRefreshedAt', data.fetchedAt || new Date().toISOString());
  await setMeta('feedStatus', data.sources);
  await prune();
  return { ok: true, added, answered: data.sources.filter((s) => s.ok).length, total: data.sources.length };
}

async function mergeItems(incoming: Incoming[]) {
  if (!incoming.length) return 0;
  const now = new Date().toISOString();
  const existing = await db.feed.bulkGet(incoming.map((i) => i.id));
  const rows: FeedItem[] = incoming.map((it, n) => {
    const ex = existing[n];
    return {
      ...it,
      image: it.image || ex?.image || undefined,
      topics: ex?.manual ? [...new Set([...ex.topics, ...it.topics])] : it.topics,
      keywords: [...new Set([...(it.keywords ?? []), ...(ex?.keywords ?? [])])],
      firstSeen: ex?.firstSeen ?? now,
      saved: ex?.saved,
      hidden: ex?.hidden,
      read: ex?.read,
      manual: ex?.manual
    };
  });
  await db.feed.bulkPut(rows);
  return existing.filter((e) => !e).length;
}

// Old stories leave after a month, unless you saved them or pasted them yourself.
async function prune() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
  const all = await db.feed.toArray();
  const keep = (i: FeedItem) => i.manual || i.saved;
  const old = all.filter((i) => !keep(i) && i.date < cutoff).map((i) => i.id);
  const rest = all.filter((i) => !keep(i) && i.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  const over = rest.slice(MAX_ITEMS).map((i) => i.id);
  if (old.length || over.length) await db.feed.bulkDelete([...old, ...over]);
}

// Ranking: newer and more on topic first, with a gentle limit on how many in a row come from one outlet.
export function rankFeed(items: FeedItem[], now = Date.now()) {
  const scored = items.map((i) => {
    const hours = Math.max(0, (now - Date.parse(i.date)) / 3600000);
    return { i, s: (i.rel || 1) * Math.pow(0.5, hours / 30) };
  });
  scored.sort((a, b) => b.s - a.s);
  const perSource = new Map<string, number>();
  for (const x of scored) {
    const n = perSource.get(x.i.source) ?? 0;
    x.s *= Math.pow(0.85, n);
    perSource.set(x.i.source, n + 1);
  }
  return scored.sort((a, b) => b.s - a.s).map((x) => x.i);
}

// Your keywords, stored with the feed settings.
export async function setKeywords(next: string[]) {
  const settings = await getMeta<FeedSettings>('feedSettings', DEFAULT_FEED_SETTINGS);
  const keywords = normalizeKeywords(next);
  await setMeta('feedSettings', { ...settings, keywords });
  await retagKeywords(keywords);
  return keywords;
}

// Tag the stories already on the phone with a new keyword at once, before the next refresh brings more.
// Tags a keyword's own search added stay while the keyword does.
export async function retagKeywords(keywords: string[]) {
  const compiled = compileKeywords(keywords);
  const current = new Set(keywords.map((k) => k.toLowerCase()));
  const all = await db.feed.toArray();
  const changed: FeedItem[] = [];
  for (const i of all) {
    const kept = (i.keywords ?? []).filter((k) => current.has(k.toLowerCase()));
    const found = matchKeywords(`${i.title} . ${i.summary} . ${i.author ?? ''}`, compiled);
    const next = [...new Set([...kept, ...found])];
    const before = i.keywords ?? [];
    if (next.length !== before.length || next.some((k, n) => k !== before[n])) changed.push({ ...i, keywords: next });
  }
  if (changed.length) await db.feed.bulkPut(changed);
}

// The keywords of a story that you still follow.
export function liveKeywords(item: FeedItem, keywords: string[]) {
  if (!item.keywords?.length || !keywords.length) return [];
  const byLower = new Map(keywords.map((k) => [k.toLowerCase(), k]));
  return [...new Set(item.keywords.map((k) => byLower.get(k.toLowerCase())).filter((k): k is string => Boolean(k)))];
}

export function topicLabel(id: string) {
  return TOPIC_BY_ID[id]?.label ?? id;
}

export function topicTagClass(id: string) {
  const t = TOPIC_BY_ID[id];
  if (!t) return 'tag t-plain';
  if (t.cross === 'ai') return 'tag t-learn';
  if (t.cross === 'consumer') return 'tag t-money';
  return t.group === 'health' ? 'tag t-health' : 'tag t-social';
}

// The intersections first (they are the rarer, more specific tags), then the rest in topic order.
export function orderedTopics(ids: string[]) {
  const order = (id: string) => (TOPIC_BY_ID[id]?.cross ? 0 : 1) * 100 + TOPICS.findIndex((t) => t.id === id);
  return [...ids].filter((id) => TOPIC_BY_ID[id]).sort((a, b) => order(a) - order(b));
}

export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.round((now - Date.parse(iso)) / 60000);
  if (min < 2) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return d === 1 ? 'Yesterday' : `${d} days ago`;
  return shortDate(iso.slice(0, 10));
}

export async function saveToDump(item: FeedItem) {
  if (item.saved && (await db.dump.get(item.saved))) return item.saved;
  const type: DumpType = item.kind === 'linkedin' ? 'Perspective' : item.kind === 'newsletter' ? 'Substack' : 'Article';
  const d = await addDumpItem({ url: item.url, type, title: item.title });
  await db.dump.update(d.id, { source: item.source });
  await db.feed.update(item.id, { saved: d.id });
  // The feed already knows the story's image; keep a resized copy so the Dump card has a cover offline.
  if (item.image) {
    void coverFromImageUrl(item.image).then((photo) => { if (photo) void db.dump.update(d.id, { photo }); });
  }
  return d.id;
}

// A short stable id for pasted links, so pasting the same post twice finds the first one.
function pastedId(url: string) {
  let h = 2166136261;
  const s = url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return `p-${h.toString(36)}`;
}

const isLinkedInHost = (host: string) => /(^|\.)linkedin\.com$/.test(host) || host === 'lnkd.in';

// "Jane Doe on LinkedIn: Text of the post | 12 comments" and "Title | LinkedIn".
export function parseLinkedInTitle(raw: string) {
  const s = raw
    .replace(/\s*\|\s*[\d,.]+\s*(comments?|reactions?)\s*$/i, '')
    .replace(/\s*[|·]\s*LinkedIn\s*$/i, '')
    .replace(/\s+-\s+LinkedIn\s*$/i, '')
    .trim();
  let m = /^(.{2,80}?) on LinkedIn:\s*([\s\S]*)$/i.exec(s);
  if (m) return { author: m[1].trim(), text: m[2].trim() };
  m = /^(.{2,80}?)['’]s Post$/i.exec(s);
  if (m) return { author: m[1].trim(), text: '' };
  return { author: '', text: s };
}

// linkedin.com/posts/jane-doe-4b2a1c_some-words-here-activity-7290000000000-AbCd
export function linkedInFromUrl(url: string) {
  const m = /\/posts\/([^_/]+)_([^/?#]*?)-(?:activity|ugcPost|share)-\d+/i.exec(url);
  if (!m) return { author: '', text: '' };
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const author = decodeURIComponent(m[1]).replace(/-[a-z0-9]*\d[a-z0-9]*$/i, '').split('-').filter(Boolean).map(cap).join(' ');
  const text = decodeURIComponent(m[2]).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return { author, text: text ? cap(text) : '' };
}

const trimTo = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

// Add a LinkedIn post (or any article) to the feed by pasting its link.
export async function addPasted(raw: string, topic?: string): Promise<{ item: FeedItem; existed: boolean }> {
  const url = normalizeUrl(raw);
  const id = pastedId(url);
  const existing = await db.feed.get(id);
  if (existing) {
    if (existing.hidden) await db.feed.update(id, { hidden: false });
    return { item: existing, existed: true };
  }
  const host = hostOf(url);
  const linkedIn = isLinkedInHost(host);
  const p = await fetchPreview(url, 9000);
  const description = (p?.description ?? '').trim();
  let title = (p?.title ?? '').trim();
  let author = '';
  let summary = description;
  if (linkedIn) {
    const fromUrl = linkedInFromUrl(url);
    const parsed = parseLinkedInTitle(title);
    author = parsed.author || fromUrl.author;
    title = parsed.text || description || fromUrl.text || (author ? `Post by ${author}` : 'LinkedIn post');
  }
  if (!title) title = titleFromUrl(url);
  if (summary && summary.slice(0, 60) === title.slice(0, 60)) summary = '';
  const topics = topic ? [topic] : classify(`${title} . ${summary}`, '');
  const settings = await getMeta<FeedSettings>('feedSettings', DEFAULT_FEED_SETTINGS);
  const keywords = matchKeywords(`${title} . ${summary} . ${author}`, compileKeywords(settings.keywords ?? []));
  const now = new Date().toISOString();
  const item: FeedItem = {
    id,
    url,
    title: trimTo(title, 180),
    summary: trimTo(summary, 400),
    source: linkedIn ? 'LinkedIn' : p?.siteName || host,
    site: host,
    sourceId: 'pasted',
    date: now,
    image: p?.image || undefined,
    author,
    topics,
    keywords,
    rel: 1.3,
    kind: linkedIn ? 'linkedin' : 'article',
    firstSeen: now,
    manual: true
  };
  await db.feed.put(item);
  return { item, existed: false };
}

export async function discoverFeed(url: string): Promise<{ url?: string; title?: string; items?: number; error?: string }> {
  const r = await getJson<{ url?: string; title?: string; items?: number; error?: string }>(`/api/feed?discover=${encodeURIComponent(normalizeUrl(url))}`, 20000);
  return r ?? { error: 'Could not reach the feed service' };
}
