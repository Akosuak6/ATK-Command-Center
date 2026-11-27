import { useState, type ClipboardEvent } from 'react';
import { db, uid, useMeta, useTable } from '../lib/db';
import { hostOf, normalizeUrl, shortDate, titleFromUrl, todayISO } from '../lib/format';
import { readThisYear } from '../lib/calc';
import type { Book, DumpItem, DumpType, Shelf } from '../lib/types';
import { Chips, EditButton, Sheet, StarText, Stars, resizeBlob, useToast } from '../components/ui';
import { TableEditor, type FieldDef } from '../components/ListEditor';
import { useFocusItem } from '../components/Search';
import { IconTrash } from '../components/Icons';
import { previewWithCover } from '../lib/preview';
import { bookshopSearch, lookupBook, type BookInfo } from '../lib/books';
import { linkKind } from '../lib/links';
import { LinkMedia } from '../components/LinkMedia';
import { BookListPanel, isTikTokLink, useBookList } from '../components/BookListPanel';

// YouTube links become Videos and Pinterest links become Pinterest, unless you chose otherwise.
export function typeForLink(url: string, fallback: DumpType): DumpType {
  const k = linkKind(normalizeUrl(url)).kind;
  return k === 'youtube' ? 'Video' : k === 'pinterest' ? 'Pinterest' : fallback;
}

export const DUMP_TYPES: DumpType[] = ['Article', 'Think piece', 'Substack', 'Perspective', 'Film', 'TV show', 'Video', 'Pinterest'];
export const DUMP_LABEL: Record<string, string> = { Article: 'Article', 'Think piece': 'Think piece', Substack: 'Substack', Perspective: 'New perspective', Film: 'Film', 'TV show': 'TV show', Video: 'Video', Pinterest: 'Pinterest' };
const DUMP_PLURAL: Record<string, string> = { Article: 'Articles', 'Think piece': 'Think pieces', Substack: 'Substacks', Perspective: 'New perspectives', Film: 'Films', 'TV show': 'TV shows', Video: 'Videos', Pinterest: 'Pinterest' };
export const DUMP_TAG: Record<string, string> = { Article: 't-learn', 'Think piece': 't-work', Substack: 't-money', Perspective: 't-social', Film: 't-health', 'TV show': 't-health', Video: 't-work', Pinterest: 't-social' };

export async function addDumpItem(input: { url?: string; type?: DumpType; title?: string; note?: string; photo?: string }) {
  const url = input.url ? normalizeUrl(input.url) : '';
  const given = (input.title ?? '').trim();
  const item: DumpItem = {
    id: uid(),
    type: input.type ?? (url ? typeForLink(url, 'Article') : 'Article'),
    title: given || (url ? titleFromUrl(url) : 'Untitled'),
    url,
    source: url ? hostOf(url) : 'Note',
    date: todayISO(),
    note: (input.note ?? '').trim(),
    rating: 0,
    comments: [],
    photo: input.photo
  };
  await db.dump.add(item);
  if (url) void fillFromLink(item.id, url, !given, !input.photo);
  return item;
}

// Fill in the title, site and cover from the link preview, without blocking the paste.
export async function fillFromLink(id: string, url: string, title: boolean, cover: boolean) {
  const p = await previewWithCover(url);
  const patch: Partial<DumpItem> = {};
  if (title && p.title) patch.title = p.title;
  if (title && p.siteName) patch.source = p.siteName;
  if (cover && p.cover) patch.photo = p.cover;
  if (Object.keys(patch).length) await db.dump.update(id, patch);
  return Boolean(p.cover);
}

export function DumpAll({ focus }: { focus?: string }) {
  const dump = useTable(db.dump, 'date', true);
  const toast = useToast();
  const [form, setForm] = useState<{ url: string; type: DumpType; title: string; note: string }>({ url: '', type: 'Article', title: '', note: '' });
  const [filter, setFilter] = useState<'All' | 'Watchlist' | DumpType>('All');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingD, setEditingD] = useState<DumpItem | null>(null);
  useFocusItem(focus, dump.length > 0);

  const isScreen = (d: DumpItem) => d.type === 'Film' || d.type === 'TV show';
  const shown = dump.filter((d) => filter === 'All' || (filter === 'Watchlist' ? isScreen(d) && !d.watched : d.type === filter));
  const toWatch = dump.filter((d) => isScreen(d) && !d.watched).length;

  const submit = async () => {
    if (!form.url.trim() && !form.title.trim()) {
      toast('Paste a link or give it a title first');
      return;
    }
    setForm({ url: '', type: form.type, title: '', note: '' });
    setFilter('All');
    await addDumpItem(form);
    toast('Dumped');
  };

  const addComment = (d: DumpItem) => {
    const text = (drafts[d.id] ?? '').trim();
    if (!text) return;
    void db.dump.update(d.id, { comments: [...d.comments, { text, date: todayISO() }] });
    setDrafts({ ...drafts, [d.id]: '' });
  };

  return (
    <div className="stack">
      <form className="card" aria-labelledby="paste-h" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="row row-wrap"><h2 className="h2" id="paste-h">Paste a link</h2><span className="sub">Articles, think pieces, Substacks, films, TV, anything worth keeping</span></div>
        <label htmlFor="dlink" className="sr">Link</label>
        <input id="dlink" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" className="field" value={form.url} onChange={(e) => { const url = e.target.value; const k = linkKind(normalizeUrl(url)).kind; setForm({ ...form, url, type: k === 'other' ? form.type : typeForLink(url, form.type) }); }} placeholder="Paste any link, even YouTube or Pinterest" style={{ minHeight: 52, fontSize: 16 }} />
        {(form.url.trim() || form.title.trim() || form.note.trim()) && (<>
        <div className="form-grid">
          <div className="form-col">
            <label htmlFor="dtype" className="lbl">What is it</label>
            <select id="dtype" className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DumpType })}>
              {DUMP_TYPES.map((t) => <option key={t} value={t}>{DUMP_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="form-col">
            <label htmlFor="dtitle" className="lbl">Title (optional)</label>
            <input id="dtitle" type="text" className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Leave blank to use the link" />
          </div>
        </div>
        <label htmlFor="dnote" className="lbl">My take (optional)</label>
        <textarea id="dnote" rows={2} className="area" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What stuck with you" />
        </>)}
        <button type="submit" className="btn">Dump it</button>
      </form>

      <Chips label="Filter by type" value={filter} onChange={setFilter} options={[{ value: 'All', label: 'All' }, { value: 'Watchlist', label: `To watch (${toWatch})` }, ...DUMP_TYPES.map((t) => ({ value: t, label: DUMP_PLURAL[t] }))]} />

      {shown.length === 0 && <p className="empty">Nothing here yet.</p>}
      <div className="masonry">
        {shown.map((d) => (
          <article className={`card${d.photo || linkKind(d.url).kind === 'youtube' ? ' has-cover' : ''}`} style={{ gap: 10 }} key={d.id} id={`item-${d.id}`}>
            <LinkMedia url={d.url} cover={d.photo} title={d.title} />
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <span className={`tag ${DUMP_TAG[d.type] ?? 't-plain'}`}>{DUMP_LABEL[d.type] ?? d.type}</span>
              <span className="sub" style={{ flex: 1 }}>{d.source} · {shortDate(d.date)}</span>
              <button type="button" className="icon-btn" style={{ border: 'none', background: 'transparent', width: 36, height: 36 }} aria-label={`Delete ${d.title}`} onClick={() => { if (confirm(`Delete "${d.title}"?`)) void db.dump.delete(d.id); }}>
                <IconTrash />
              </button>
            </div>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noopener noreferrer" className="dump-title">{d.title}</a>
            ) : (
              <span className="dump-title">{d.title}</span>
            )}
            {d.note && <div className="my-take"><strong>My take:</strong> {d.note}</div>}
            {isScreen(d) && (
              <div className="row" style={{ alignItems: 'center' }}>
                <span className={`tag ${d.watched ? 't-plain' : 't-work'}`}>{d.watched ? 'Watched' : 'To watch'}</span>
                <button type="button" className="btn-text" onClick={() => db.dump.update(d.id, { watched: !d.watched })}>{d.watched ? 'Back to the watchlist' : 'Mark as watched'}</button>
              </div>
            )}
            <Stars small label={`Rating for ${d.title}`} value={d.rating} onPick={(n) => db.dump.update(d.id, { rating: n })} />
            {d.comments.map((c, i) => (
              <div className="comment" key={i}><span>{c.text}</span><span className="sub" style={{ whiteSpace: 'nowrap' }}>{shortDate(c.date)}</span></div>
            ))}
            <div className="card-actions">
              <EditButton label={`Edit ${d.title}`} onClick={() => setEditingD(d)} />
              {!d.photo && d.url && (
                <button type="button" className="btn-text" onClick={async () => {
                  toast('Looking for a cover');
                  const found = await fillFromLink(d.id, d.url, false, true);
                  toast(found ? 'Cover added' : 'No cover found. Tap Edit to paste one.');
                }}>Find a cover</button>
              )}
            </div>
            <form className="inline-add" onSubmit={(e) => { e.preventDefault(); addComment(d); }}>
              <label htmlFor={`cm-${d.id}`} className="sr">Add a thought about {d.title}</label>
              <input id={`cm-${d.id}`} type="text" className="field" value={drafts[d.id] ?? ''} onChange={(e) => setDrafts({ ...drafts, [d.id]: e.target.value })} placeholder="Add a thought" />
              <button type="submit" className="btn2">Post</button>
            </form>
          </article>
        ))}
      </div>
      <TableEditor<DumpItem>
        title="Edit item" open={!!editingD} onClose={() => setEditingD(null)} table={db.dump} rows={editingD ? [editingD] : []}
        fields={[
          { key: 'photo', label: 'Cover photo', type: 'image' },
          { key: 'title', label: 'Title', wide: true },
          { key: 'type', label: 'What is it', type: 'select', options: DUMP_TYPES.map((t) => ({ value: t, label: DUMP_LABEL[t] })) },
          { key: 'url', label: 'Link', wide: true },
          { key: 'note', label: 'My take', type: 'textarea' }
        ]}
        itemName={(x) => `"${x.title}"`}
      />
    </div>
  );
}

const COVERS = ['#0F1A2E', '#6B4A33', '#556233', '#1C2A47', '#8A6A4A'];
const coverColor = (id: string) => COVERS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COVERS.length];
const SHELF_LABEL: Record<Shelf, string> = { Read: 'Read', Reading: 'Currently reading', 'Want to read': 'Want to read' };

const bookFields: FieldDef<Book>[] = [
  { key: 'title', label: 'Title', wide: true },
  { key: 'author', label: 'Author' },
  { key: 'status', label: 'Shelf', type: 'select', options: (['Read', 'Reading', 'Want to read'] as Shelf[]).map((s) => ({ value: s, label: SHELF_LABEL[s] })) },
  { key: 'stars', label: 'Stars (0 to 5)', type: 'number' },
  { key: 'date', label: 'Finished or added', type: 'date' },
  { key: 'review', label: 'Review', type: 'textarea' },
  { key: 'cover', label: 'Cover', type: 'image' },
  { key: 'tldr', label: 'In short', type: 'textarea' },
  { key: 'description', label: 'About the book', type: 'textarea' },
  { key: 'buyUrl', label: 'Where to buy (link)', wide: true },
  { key: 'store', label: 'Store' },
  { key: 'price', label: 'Price', type: 'number' }
];

type BookForm = { title: string; author: string; status: Shelf; stars: number; review: string } & Partial<BookInfo>;

export function Bookshelf({ focus }: { focus?: string }) {
  const books = useTable(db.books, 'date', true);
  const goal = useMeta<number>('readingGoal', 20);
  const toast = useToast();
  const empty: BookForm = { title: '', author: '', status: 'Want to read', stars: 0, review: '' };
  const [form, setForm] = useState<BookForm>(empty);
  const [lookup, setLookup] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'All' | Shelf>('All');
  const [editing, setEditing] = useState<Book | null>(null);
  const [adding, setAdding] = useState(false);
  const [finding, setFinding] = useState<string | null>(null);
  const list = useBookList(books);
  useFocusItem(focus, books.length > 0);

  const read = readThisYear(books).length;
  const shown = books.filter((b) => filter === 'All' || b.status === filter);

  const find = async (raw = lookup) => {
    if (!raw.trim()) { toast('Type a title or paste a link first'); return; }
    if (isTikTokLink(raw)) { void list.run({ url: /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}` }); return; }
    list.reset();
    setBusy(true);
    const info = await lookupBook(raw);
    setBusy(false);
    if (!info) { toast('Could not find that one. Fill in the details by hand.'); setForm((f) => ({ ...f, title: f.title || (/^https?:/.test(raw) ? '' : raw) })); return; }
    setForm((f) => ({ ...f, ...info, title: info.title, author: info.author || f.author }));
  };

  const add = () => {
    if (!form.title.trim()) { toast('Add a title first'); return; }
    const { title, author, status, stars, review, ...details } = form;
    void db.books.add({ id: uid(), title: title.trim(), author: author.trim() || 'Unknown author', status, stars, review: review.trim(), date: todayISO(), ...clean(details) });
    setForm(empty);
    setLookup('');
    setAdding(false);
    toast('Added to your shelf');
  };

  const onPaste = async (e: ClipboardEvent<HTMLInputElement>) => {
    const imgs = Array.from(e.clipboardData.files).filter((x) => x.type.startsWith('image/')).slice(0, 12);
    if (imgs.length) {
      e.preventDefault();
      try { void list.run({ images: await Promise.all(imgs.map((x) => resizeBlob(x, 1400, 0.85))) }); } catch (err) { toast((err as Error).message); }
      return;
    }
    const text = e.clipboardData.getData('text').trim();
    if (isTikTokLink(text)) { e.preventDefault(); setLookup(text); void find(text); }
  };

  // For books added before covers existed: look up by title and author, keep your review and rating.
  const fillIn = async (b: Book) => {
    setFinding(b.id);
    const info = await lookupBook(`${b.title} ${b.author === 'Unknown author' ? '' : b.author}`.trim());
    setFinding(null);
    if (!info) { toast('No cover found. Tap Edit to paste one.'); return; }
    await db.books.update(b.id, clean({ cover: info.cover, description: info.description, tldr: info.tldr, price: info.price, currency: info.currency, store: info.store, buyUrl: info.buyUrl, isbn: info.isbn }));
    toast('Cover and details added');
  };

  return (
    <div className="stack">
      <section className="card" aria-label="Reading goal" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
        <div className="stack-s" style={{ gap: 4, flex: '1 1 220px' }}>
          <span className="lbl">Reading goal this year</span>
          <div><span className="num" style={{ fontSize: 44 }}>{read}</span><span className="unit">of {goal} books</span></div>
          <span className="sub">{read >= goal ? 'Goal reached. Keep going.' : `${goal - read} to go this year`}</span>
        </div>
        <div className="spines" aria-hidden="true">
          {Array.from({ length: goal }, (_, i) => <span key={i} className={`spine${i < read ? ' on' : ''}`} />)}
        </div>
      </section>

      <Sheet title="Add a book" open={adding} onClose={() => setAdding(false)}>
        <form className="stack-s" style={{ gap: 12 }} noValidate onSubmit={(e) => { e.preventDefault(); add(); }}>
          <label htmlFor="blookup" className="lbl">Search a title, or paste a link or TikTok</label>
          <div className="inline-add">
            <input id="blookup" type="text" autoCapitalize="off" className="field" value={lookup} onChange={(e) => setLookup(e.target.value)}
              onPaste={(e) => void onPaste(e)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void find(); } }}
              placeholder="Title, Bookshop or Amazon link, or a TikTok" />
            <button type="button" className="btn2" onClick={() => void find()} disabled={busy || !!list.busy}>{busy || list.busy ? 'Looking' : 'Look it up'}</button>
          </div>
          <BookListPanel list={list} shelf={books} onAdded={(n) => { setAdding(false); setLookup(''); toast(`${n} book${n === 1 ? '' : 's'} added to Want to read`); }} />
          {!list.active && (form.cover || form.tldr || form.price) && (
            <div className="book-found">
              {form.cover && <img src={form.cover} alt="" />}
              <div className="stack-s" style={{ gap: 4, minWidth: 0 }}>
                <strong className="book-title">{form.title}</strong>
                {form.author && <span className="sub">{form.author}</span>}
                {form.price ? <span className="sub">{price(form.price, form.currency)}{form.store ? ` at ${form.store}` : ''}</span> : null}
                {form.tldr && <span className="body" style={{ fontSize: 13 }}>{form.tldr}</span>}
              </div>
            </div>
          )}
          {!list.active && <>
          <label htmlFor="btitle" className="lbl">Title</label>
          <input id="btitle" type="text" className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title" />
          <label htmlFor="bauthor" className="lbl">Author</label>
          <input id="bauthor" type="text" className="field" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Author" />
          <label htmlFor="bstatus" className="lbl">Shelf</label>
          <select id="bstatus" className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Shelf })}>
            <option value="Want to read">Want to read</option>
            <option value="Reading">Currently reading</option>
            <option value="Read">Read</option>
          </select>
          <span className="lbl">Rating</span>
          <Stars label="Rating" value={form.stars} onPick={(n) => setForm({ ...form, stars: n })} />
          <label htmlFor="breview" className="lbl">My review (optional)</label>
          <textarea id="breview" rows={3} className="area" value={form.review} onChange={(e) => setForm({ ...form, review: e.target.value })} placeholder="A few lines: what stuck with you, who should read it" />
          <button type="submit" className="btn">Add to shelf</button>
          </>}
        </form>
      </Sheet>

      <section aria-labelledby="shelf-h" className="stack" style={{ gap: 14 }}>
        <div className="trend-head">
          <h2 className="h2" id="shelf-h">Bookshelf</h2>
          <button type="button" className="btn" onClick={() => { setForm(empty); setLookup(''); list.reset(); setAdding(true); }}>+ Add a book</button>
        </div>
        <Chips label="Filter by shelf" value={filter} onChange={setFilter} options={[{ value: 'All', label: `All (${books.length})` }, { value: 'Read', label: 'Read' }, { value: 'Reading', label: 'Reading' }, { value: 'Want to read', label: 'Want to read' }]} />
        {shown.length === 0 && <p className="empty">No books on this shelf yet.</p>}
        <div className="book-grid">
          {shown.map((b) => (
            <article className="card book" key={b.id} id={`item-${b.id}`}>
              {b.cover
                ? <img className="cover-img" src={b.cover} alt={`Cover of ${b.title}`} loading="lazy" />
                : <div className="cover-tile" style={{ background: coverColor(b.id) }} aria-hidden="true"><span>{b.title}</span></div>}
              <div className="stack-s" style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <strong className="book-title">{b.title}</strong>
                <span className="sub">{b.author}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  {b.stars > 0 && <StarText value={b.stars} />}
                  <span className="tag t-plain">{SHELF_LABEL[b.status]}</span>
                </div>
                {b.review && <p className="review">{b.review}</p>}
                {b.tldr && <p className="body" style={{ fontSize: 13 }}><strong>In short:</strong> {b.tldr}</p>}
                {b.description && b.description !== b.tldr && (
                  <details className="book-more"><summary>About the book</summary><p className="body" style={{ fontSize: 13 }}>{b.description}</p></details>
                )}
                <div className="card-actions" style={{ marginBottom: -10 }}>
                  {b.buyUrl
                    ? <a className="btn-text" href={b.buyUrl} target="_blank" rel="noopener noreferrer">{b.price ? `${price(b.price, b.currency)} at ${b.store ?? 'the store'}` : `Buy at ${b.store ?? 'the store'}`}</a>
                    : <a className="btn-text" href={bookshopSearch(b.title, b.author)} target="_blank" rel="noopener noreferrer">Find it on Bookshop.org</a>}
                  {!b.cover && <button type="button" className="btn-text" onClick={() => void fillIn(b)} disabled={finding === b.id}>{finding === b.id ? 'Looking' : 'Find cover'}</button>}
                  <EditButton label={`Edit ${b.title}`} onClick={() => setEditing(b)} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <TableEditor<Book>
        title="Edit book"
        open={!!editing}
        onClose={() => setEditing(null)}
        table={db.books}
        rows={editing ? [editing] : []}
        fields={bookFields}
        itemName={(b) => `"${b.title}"`}
      />
    </div>
  );
}

function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== 0)) as Partial<T>;
}

const price = (n: number, currency = 'USD') => (currency && currency !== 'USD' ? `${n.toFixed(2)} ${currency}` : `$${n.toFixed(2)}`);
