import { coverFromImageUrl } from './preview';
import { normalizeUrl } from './format';

// Find a book's cover, author, price, where to buy it and description, from a link or a title.
// Uses the api/book function when it is deployed; otherwise asks Open Library and Google Books
// straight from the phone (both allow that, no key needed).

export interface BookInfo {
  title: string;
  author: string;
  cover?: string;
  description?: string;
  tldr?: string;
  price?: number;
  currency?: string;
  store?: string;
  buyUrl?: string;
  isbn?: string;
}

const looksLikeUrl = (s: string) => /^(https?:\/\/)?[\w-]+(\.[\w-]+)+\/\S*/i.test(s.trim());

async function getJSON<T>(url: string, ms = 8000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

const strip = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

// A short version without any AI: the opening sentence or two, about 220 characters.
export function shortVersion(text = ''): string {
  const clean = strip(text).replace(/\(\[source\].*$/i, '');
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [clean];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).length > 240) break;
    out += s;
    if (out.length >= 110) break;
  }
  out = out.trim();
  return out.length > 260 ? `${out.slice(0, 250).replace(/\s+\S*$/, '')}...` : out;
}

function isbnFromUrl(u: string) {
  const m = /(97[89]\d{10})/.exec(u) || /\/dp\/(\d{9}[\dX])\b/i.exec(u);
  return m ? m[1] : '';
}

function titleFromBookUrl(u: string) {
  try {
    const parts = new URL(u).pathname.split('/').filter(Boolean);
    const slug = parts.find((p) => /[a-z]-[a-z]/i.test(p) && !/^(p|books?|dp|w|show)$/i.test(p)) ?? '';
    return slug.replace(/^\d+[-.]/, '').replace(/[-_]+/g, ' ').replace(/\b97[89]\d{10}\b/, '').trim();
  } catch {
    return '';
  }
}

interface OLEdition { title?: string; cover_i?: number; isbn?: string[]; language?: string[] }
interface OLSearch { docs?: { key?: string; title?: string; author_name?: string[]; cover_i?: number; isbn?: string[]; editions?: { docs?: OLEdition[] } }[] }
// Open Library sometimes keeps a translated book's blurb in another language. English text is full of these words.
const COMMON = new Set(['the', 'and', 'of', 'to', 'is', 'her', 'his', 'she', 'he', 'that', 'with', 'for', 'it', 'as', 'this', 'by', 'an', 'from', 'their', 'who']);
const english = (t: string) => { const w = String(t || '').toLowerCase().match(/[a-z']+/g) || []; return w.length < 8 || w.filter((x) => COMMON.has(x)).length / w.length >= 0.1; };
const latin = (s = '') => !!s && !/[^\u0000-\u024F\s]/.test(s);
interface OLWork { description?: string | { value?: string } }
interface GBResult { items?: { volumeInfo?: { title?: string; authors?: string[]; description?: string; imageLinks?: { thumbnail?: string } }; saleInfo?: { retailPrice?: { amount?: number; currencyCode?: string }; buyLink?: string } }[] }

async function fromDatabases(q: string, isbn: string): Promise<BookInfo | null> {
  const query = isbn ? `isbn:${isbn}` : q;
  const [ol, gb] = await Promise.all([
    getJSON<OLSearch>(`https://openlibrary.org/search.json?q=${encodeURIComponent(isbn || q)}&limit=1&lang=en&fields=key,title,author_name,cover_i,isbn,editions,editions.title,editions.cover_i,editions.isbn,editions.language`),
    getJSON<GBResult>(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&printType=books${isbn ? '' : '&langRestrict=en'}`)
  ]);
  const d = ol?.docs?.[0];
  const v = gb?.items?.[0];
  // A translated book is listed under its original title; this is the English edition Open Library matched.
  const e = d?.editions?.docs?.[0];
  const en = e && (!e.language || e.language.includes('eng')) ? e : undefined;
  const olAuthor = latin(d?.author_name?.[0]) ? d?.author_name?.[0] : '';
  if (!d && !v) return null;
  const work = d?.key ? await getJSON<OLWork>(`https://openlibrary.org${d.key}.json`) : null;
  const olRaw = typeof work?.description === 'string' ? work.description : work?.description?.value ?? '';
  const olDesc = english(olRaw) ? olRaw : '';
  const gbImg = v?.volumeInfo?.imageLinks?.thumbnail?.replace(/^http:/, 'https:').replace(/zoom=\d/, 'zoom=2');
  const price = v?.saleInfo?.retailPrice;
  return {
    title: en?.title || d?.title || v?.volumeInfo?.title || q,
    author: olAuthor || v?.volumeInfo?.authors?.[0] || d?.author_name?.[0] || '',
    cover: en?.cover_i || d?.cover_i ? `https://covers.openlibrary.org/b/id/${en?.cover_i || d?.cover_i}-L.jpg` : gbImg,
    description: strip(olDesc || v?.volumeInfo?.description || ''),
    price: price?.amount,
    currency: price?.currencyCode,
    buyUrl: v?.saleInfo?.buyLink,
    store: v?.saleInfo?.buyLink ? 'Google Books' : undefined,
    isbn: isbn || [...(en?.isbn ?? []), ...(d?.isbn ?? [])].find((x) => /^97[89]/.test(x))
  };
}

export async function lookupBook(input: string): Promise<BookInfo | null> {
  const raw = input.trim();
  if (!raw) return null;
  const isUrl = looksLikeUrl(raw);
  const url = isUrl ? normalizeUrl(raw) : '';
  let info = await getJSON<BookInfo>(`/api/book?en=1&${isUrl ? `url=${encodeURIComponent(url)}` : `q=${encodeURIComponent(raw)}`}`, 12000);
  if (!info?.title) {
    info = await fromDatabases(isUrl ? titleFromBookUrl(url) : raw, isUrl ? isbnFromUrl(url) : '');
    if (info && isUrl) {
      info.buyUrl = url;
      info.store = storeName(url);
    }
  }
  if (!info?.title) return null;
  const cover = info.cover ? await coverFromImageUrl(info.cover) : undefined;
  return { ...info, cover, tldr: shortVersion(info.description) };
}

export function storeName(u: string) {
  const h = (() => { try { return new URL(u).hostname; } catch { return ''; } })();
  return /bookshop/.test(h) ? 'Bookshop.org' : /amazon/.test(h) ? 'Amazon' : /barnesandnoble/.test(h) ? 'Barnes & Noble' : /goodreads/.test(h) ? 'Goodreads' : h.replace(/^www\./, '');
}

export const bookshopSearch = (title: string, author = '') => `https://bookshop.org/search?keywords=${encodeURIComponent(`${title} ${author}`.trim())}`;
