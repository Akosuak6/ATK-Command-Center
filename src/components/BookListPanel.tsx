import { useRef, useState } from 'react';
import type { Book } from '../lib/types';
import { addFoundBooks, NeedsKeyError, onShelf, readBookList, setClaudeKey, type BookList, type FoundBook } from '../lib/booklist';

type Input = { url?: string; images?: string[] };

export const isTikTokLink = (s: string) => /^(https?:\/\/)?([\w-]+\.)*tiktok\.com\//i.test(s.trim());
const noEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();

// Reading the books out of a TikTok (or pasted screenshots) for the Add a book search bar.
export function useBookList(shelf: Book[]) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<BookList | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [askKey, setAskKey] = useState('');
  const pending = useRef<Input | null>(null);

  const run = async (input: Input) => {
    setBusy(input.images ? `Reading ${input.images.length} screenshot${input.images.length === 1 ? '' : 's'}` : 'Reading the TikTok');
    setError('');
    setResult(null);
    setAskKey('');
    try {
      const got = await readBookList(input);
      if (!got.books.length) {
        setError(got.from.isVideo ? 'No books in this video\'s cover or caption. Paste screenshots of it into the search bar instead.' : 'No books found in that one.');
      } else {
        setResult(got);
        setPicked(new Set(got.books.map((_, i) => i).filter((i) => !onShelf(shelf, got.books[i].title))));
      }
    } catch (e) {
      if (e instanceof NeedsKeyError) {
        pending.current = input;
        setAskKey(e.message || 'Reading a TikTok uses Claude. Paste your Anthropic API key once on each device. It stays on this device only and is never part of a backup.');
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy('');
    }
  };

  const saveKey = (k: string) => {
    setClaudeKey(k);
    setAskKey('');
    if (pending.current) void run(pending.current);
  };

  const reset = () => { setBusy(''); setError(''); setResult(null); setAskKey(''); pending.current = null; };
  const active = !!(busy || result || askKey);
  return { busy, error, result, picked, setPicked, askKey, run, saveKey, reset, active };
}

export type BookListState = ReturnType<typeof useBookList>;

export function BookListPanel({ list, shelf, onAdded }: { list: BookListState; shelf: Book[]; onAdded: (n: number) => void }) {
  const [keyDraft, setKeyDraft] = useState('');
  const { result, picked, setPicked } = list;

  const toggle = (i: number) => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const add = async () => {
    if (!result) return;
    const chosen: FoundBook[] = result.books.filter((_, i) => picked.has(i));
    if (!chosen.length) return;
    list.reset();
    onAdded(chosen.length);
    await addFoundBooks(chosen, 'Want to read');
  };
  const source = result && [result.from.creator, result.from.title].map((s) => noEmoji(s)).filter(Boolean).join(': ');

  return (
    <>
      {list.busy && <span className="sub" role="status">{list.busy}. This takes about half a minute.</span>}

      {list.askKey && (
        <div className="stack-s" style={{ gap: 8 }}>
          <p className="body" style={{ fontSize: 13 }}>{list.askKey} Get one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>.</p>
          <div className="inline-add">
            <input type="password" className="field" autoComplete="off" spellCheck={false} aria-label="Anthropic API key" value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && keyDraft.trim()) { e.preventDefault(); list.saveKey(keyDraft.trim()); setKeyDraft(''); } }}
              placeholder="Paste your Anthropic API key" />
            <button type="button" className="btn2" onClick={() => { if (keyDraft.trim()) { list.saveKey(keyDraft.trim()); setKeyDraft(''); } }}>Save</button>
          </div>
        </div>
      )}

      {list.error && <p className="sub" role="alert">{list.error}</p>}

      {result && (
        <div className="stack-s" style={{ gap: 10 }}>
          <span className="sub">{result.books.length} book{result.books.length === 1 ? '' : 's'}{source ? ` from ${source}` : ''}</span>
          <ul className="found-list">
            {result.books.map((b, i) => (
              <li key={`${b.title}-${i}`}>
                <label className="found-row">
                  <input type="checkbox" checked={picked.has(i)} onChange={() => toggle(i)} />
                  <span className="stack-s" style={{ gap: 2, minWidth: 0 }}>
                    <strong className="book-title">{b.title}</strong>
                    <span className="sub">{b.author || 'Author not shown'}</span>
                  </span>
                  {onShelf(shelf, b.title) && <span className="tag t-plain">On your shelf</span>}
                </label>
              </li>
            ))}
          </ul>
          {result.from.isVideo && <span className="sub">From a video, only the cover and caption could be read. If any are missing, paste screenshots into the search bar.</span>}
          <button type="button" className="btn" onClick={() => void add()} disabled={!picked.size}>Add {picked.size} to Want to read</button>
        </div>
      )}
    </>
  );
}
