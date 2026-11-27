import { useState } from 'react';
import { db, uid, useTable } from '../lib/db';
import { hrefFor, navigate } from '../lib/router';
import { longDate, monthYear, shortDate, todayISO } from '../lib/format';
import type { BucketCategory, BucketItem } from '../lib/types';
import { Chips, EditButton, areaClass, useToast } from '../components/ui';
import { TableEditor, type FieldDef } from '../components/ListEditor';
import { useFocusItem } from '../components/Search';
import { addFoundBooks } from '../lib/booklist';
import { BUCKET_AREA } from '../lib/plan';

export const BUCKET_CATEGORIES: BucketCategory[] = ['Travel', 'Food', 'Experiences', 'Books', 'Fitness', 'Money', 'Learning', 'Other'];

const fields: FieldDef<BucketItem>[] = [
  { key: 'title', label: 'What', wide: true },
  { key: 'category', label: 'Kind', type: 'select', options: BUCKET_CATEGORIES.map((c) => ({ value: c, label: c })) },
  { key: 'by', label: 'Done by (optional)', type: 'date' },
  { key: 'note', label: 'Note', type: 'textarea', wide: true },
  { key: 'photo', label: 'Photo', type: 'image' },
  { key: 'done', label: 'Crossed off', type: 'checkbox' },
  { key: 'doneOn', label: 'Crossed off on', type: 'date' }
];

const openQuip = (n: number) => (n === 0 ? 'Dream big, add the first one' : n < 5 ? 'A short list of big dreams' : n < 15 ? 'Plenty to look forward to' : 'A life full of plans');
const doneQuip = (n: number) => (n === 0 ? 'This could be the year' : n === 1 ? 'One down, more to go' : `${n} memories made`);

// Dated items first, soonest first, then the rest by when you added them.
const byWhen = (a: BucketItem, b: BucketItem) => (a.by && b.by ? a.by.localeCompare(b.by) : a.by ? -1 : b.by ? 1 : a.date.localeCompare(b.date));

export function HomeBucket({ focus }: { focus?: string }) {
  const items = useTable(db.bucket, 'date');
  const trips = useTable(db.trips);
  const books = useTable(db.books);
  const restaurants = useTable(db.restaurants);
  const toast = useToast();
  const [filter, setFilter] = useState<'All' | BucketCategory>('All');
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState<BucketCategory>('Travel');
  const [editing, setEditing] = useState<BucketItem | null>(null);
  useFocusItem(focus, items.length > 0);

  const year = todayISO().slice(0, 4);
  const open = items.filter((i) => !i.done).sort(byWhen);
  const done = items.filter((i) => i.done).sort((a, b) => (b.doneOn ?? '').localeCompare(a.doneOn ?? ''));
  const doneThisYear = done.filter((i) => (i.doneOn ?? '').startsWith(year)).length;
  const nextUp = open.find((i) => i.by);
  const cats = BUCKET_CATEGORIES.filter((c) => open.some((i) => i.category === c));
  const shown = open.filter((i) => filter === 'All' || i.category === filter);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    void db.bucket.add({ id: uid(), title, category, done: false, date: todayISO() });
    setDraft('');
  };

  const crossOff = async (b: BucketItem) => {
    await db.bucket.update(b.id, b.done ? { done: false, doneOn: undefined } : { done: true, doneOn: todayISO() });
    if (!b.done) toast(`Crossed off: ${b.title}`);
  };

  // A bucket list item can become the real thing in another tab.
  const linked = (b: BucketItem) => {
    const [kind, id] = (b.link ?? '').split(':');
    if (kind === 'trip' && trips.some((t) => t.id === id)) return { label: 'Open the trip', href: hrefFor('money', 'trips', id) };
    if (kind === 'book' && books.some((x) => x.id === id)) return { label: 'On your shelf', href: hrefFor('dump', 'books', id) };
    if (kind === 'restaurant' && restaurants.some((r) => r.id === id)) return { label: 'In your restaurants', href: hrefFor('social', 'calendar', id) };
    return null;
  };
  const makeReal = async (b: BucketItem) => {
    if (b.category === 'Travel') {
      const id = uid();
      await db.trips.add({ id, name: b.title, cost: 0, saved: 0, status: 'Dreaming', date: b.by ?? '', ...(b.photo ? { photo: b.photo } : {}) });
      await db.bucket.update(b.id, { link: `trip:${id}` });
      navigate('money', 'trips', id);
    } else if (b.category === 'Books') {
      const [id] = await addFoundBooks([{ title: b.title, author: '' }], 'Want to read');
      await db.bucket.update(b.id, { link: `book:${id}` });
      toast('Added to Want to read');
    } else if (b.category === 'Food') {
      const id = uid();
      await db.restaurants.add({ id, name: b.title, cuisine: '', hood: '', list: 'Want to try', ...(b.photo ? { photo: b.photo } : {}) });
      await db.bucket.update(b.id, { link: `restaurant:${id}` });
      toast('Added to Want to try');
    }
  };
  const makeLabel: Partial<Record<BucketCategory, string>> = { Travel: 'Plan this trip', Books: 'Add to bookshelf', Food: 'Add to restaurants' };

  return (
    <div className="stack">
      <section aria-label="Bucket list" className="stats">
        <div className="stat"><span className="lbl">On your list</span><span className="num">{open.length}</span><span className="sub quip">{openQuip(open.length)}</span></div>
        <div className="stat"><span className="lbl">Crossed off in {year}</span><span className="num">{doneThisYear}</span><span className="sub quip">{doneQuip(doneThisYear)}</span></div>
        <div className="stat">
          <span className="lbl">Next up</span>
          <span className="num" style={{ fontSize: 26 }}>{nextUp ? nextUp.title : 'No dates yet'}</span>
          <span className="sub quip">{nextUp ? `By ${longDate(nextUp.by!)}` : 'Give one a date to aim for'}</span>
        </div>
      </section>

      <section className="card" aria-labelledby="bucket-add-h">
        <label htmlFor="bucket-new" className="lbl" id="bucket-add-h">Add to your bucket list</label>
        <form className="inline-add bucket-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input id="bucket-new" type="text" className="field" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Something you want to do someday" />
          <select className="field bucket-kind" aria-label="Kind" value={category} onChange={(e) => setCategory(e.target.value as BucketCategory)}>
            {BUCKET_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" className="btn">Add</button>
        </form>
      </section>

      {cats.length > 1 && (
        <Chips label="Filter by kind" value={filter} onChange={setFilter} options={[{ value: 'All' as const, label: `All (${open.length})` }, ...cats.map((c) => ({ value: c, label: c }))]} />
      )}
      {open.length === 0 && <p className="empty">Nothing on your bucket list yet.</p>}

      <div className="bucket-grid">
        {shown.map((b) => {
          const link = linked(b);
          return (
            <article className="card bucket-card" key={b.id} id={`item-${b.id}`}>
              {b.photo && <img className="bucket-photo" src={b.photo} alt="" loading="lazy" />}
              <div className="chips">
                <span className={areaClass(BUCKET_AREA[b.category])}>{b.category}</span>
                {b.by && <span className="tag t-plain">By {monthYear(b.by)}</span>}
              </div>
              <strong className="bucket-title">{b.title}</strong>
              {b.note && <p className="body bucket-note">{b.note}</p>}
              <div className="card-actions">
                <button type="button" className="btn2" onClick={() => void crossOff(b)}>Cross it off</button>
                {link
                  ? <a className="btn-text" href={link.href}>{link.label}</a>
                  : makeLabel[b.category] && <button type="button" className="btn-text" onClick={() => void makeReal(b)}>{makeLabel[b.category]}</button>}
                <EditButton label={`Edit ${b.title}`} onClick={() => setEditing(b)} />
              </div>
            </article>
          );
        })}
      </div>

      {done.length > 0 && (
        <details className="card">
          <summary className="h2" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Crossed off ({done.length})</summary>
          <div style={{ marginTop: 10 }}>
            {done.map((b) => (
              <div className="line" key={b.id}>
                <span style={{ flex: 1 }}><strong style={{ fontWeight: 600 }}>{b.title}</strong> <span className="sub">{b.doneOn ? shortDate(b.doneOn) : ''}{b.doneOn && b.doneOn.slice(0, 4) !== year ? `, ${b.doneOn.slice(0, 4)}` : ''}</span></span>
                <span className={areaClass(BUCKET_AREA[b.category])}>{b.category}</span>
                <button type="button" className="btn-text" onClick={() => void crossOff(b)}>Put it back</button>
              </div>
            ))}
          </div>
        </details>
      )}

      <TableEditor<BucketItem>
        title="Edit bucket list item"
        open={!!editing}
        onClose={() => setEditing(null)}
        table={db.bucket}
        rows={editing ? [editing] : []}
        fields={fields}
        itemName={(b) => `"${b.title}"`}
      />
    </div>
  );
}
