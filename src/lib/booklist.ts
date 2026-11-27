import { db, uid } from './db';
import { lookupBook } from './books';
import { todayISO } from './format';
import type { Book, Shelf } from './types';

// Books from a TikTok, a book list page, or screenshots, read by Claude through api/booklist.js.
// The Anthropic key stays in this browser only (localStorage), like the Hevy key: never in a backup or the repo.

export interface FoundBook { title: string; author: string }
export interface BookList {
  books: FoundBook[];
  from: { title: string; creator: string; slides: number; isVideo: boolean };
}

const KEY_STORE = 'anthropicApiKey';

export function getClaudeKey(): string {
  try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
}
export function setClaudeKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key.trim());
    else localStorage.removeItem(KEY_STORE);
  } catch { /* storage blocked: the key just will not be remembered */ }
}

export class NeedsKeyError extends Error {}

export async function readBookList(input: { url?: string; images?: string[] }): Promise<BookList> {
  const key = getClaudeKey();
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 120000);
  try {
    const r = await fetch('/api/booklist', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-anthropic-key': key } : {}) },
      body: JSON.stringify(input),
      signal: ctrl.signal
    });
    const body = (await r.json().catch(() => ({}))) as Partial<BookList> & { error?: string };
    if (r.status === 401) {
      if (body.error === 'bad-key') setClaudeKey('');
      throw new NeedsKeyError(body.error === 'bad-key' ? 'That key did not work. Paste it again.' : '');
    }
    if (!r.ok) throw new Error(body.error || 'Could not read that post');
    return { books: body.books ?? [], from: body.from ?? { title: '', creator: '', slides: 0, isVideo: false } };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('That took too long. Try again.');
    if (e instanceof TypeError) throw new Error('Could not reach the app server');
    throw e;
  } finally {
    window.clearTimeout(t);
  }
}

// Same book if the titles match once case, punctuation, a leading "The" and any subtitle are set aside.
const norm = (s: string) => s.toLowerCase().replace(/[:(].*$/, '').replace(/^(the|a|an)\s+/, '').replace(/[^a-z0-9]/g, '');
export const sameTitle = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x));
};
export const onShelf = (shelf: Book[], title: string) => shelf.some((b) => sameTitle(b.title, title));

// Adds the books right away, then fills in each cover and description in the background.
// A lookup that comes back with a different title (another edition, another language) is left out.
export async function addFoundBooks(found: FoundBook[], status: Shelf): Promise<void> {
  const date = todayISO();
  const rows: Book[] = found.map((f) => ({ id: uid(), title: f.title, author: f.author || 'Unknown author', status, stars: 0, review: '', date }));
  await db.books.bulkAdd(rows);
  for (const row of rows) {
    const info = await lookupBook(`${row.title} ${row.author === 'Unknown author' ? '' : row.author}`.trim()).catch(() => null);
    if (!info || !sameTitle(info.title, row.title)) continue;
    const details = { cover: info.cover, description: info.description, tldr: info.tldr, isbn: info.isbn, price: info.price, currency: info.currency, store: info.store, buyUrl: info.buyUrl };
    await db.books.update(row.id, {
      ...Object.fromEntries(Object.entries(details).filter(([, v]) => v !== undefined && v !== '' && v !== 0)),
      ...(row.author === 'Unknown author' && info.author ? { author: info.author } : {})
    });
  }
}
