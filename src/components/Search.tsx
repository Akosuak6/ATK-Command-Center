import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, useMeta, useTable } from '../lib/db';
import { feedDb } from '../lib/feed';
import { hrefFor } from '../lib/router';
import { DUMP_TAG, DUMP_LABEL } from '../pages/Dump';

interface Result { kind: string; title: string; where: string; tag: string; href: string }

export function SearchResults({ query, onDone }: { query: string; onDone: () => void }) {
  const dump = useTable(db.dump);
  const books = useTable(db.books);
  const classes = useTable(db.classes);
  const restaurants = useTable(db.restaurants);
  const trips = useTable(db.trips, 'date');
  const contacts = useTable(db.contacts);
  const bucket = useTable(db.bucket);
  const feedPulled = useLiveQuery(() => feedDb.items.orderBy('date').reverse().toArray(), []);
  const feedPosts = useTable(db.feedPosts, 'date', true);
  const feedHidden = useMeta<string[]>('feedHidden', []);
  const q = query.trim().toLowerCase();
  const has = (...parts: (string | undefined)[]) => parts.join(' ').toLowerCase().includes(q);

  const results: Result[] = [];
  dump.forEach((d) => {
    if (has(d.title, d.note, d.type, d.source, ...d.comments.map((c) => c.text))) {
      results.push({ kind: DUMP_LABEL[d.type] ?? d.type, title: d.title, where: 'Dump', tag: `tag ${DUMP_TAG[d.type] ?? 't-plain'}`, href: hrefFor('dump', 'all', d.id) });
    }
  });
  books.forEach((b) => {
    if (has(b.title, b.author, b.review)) results.push({ kind: 'Book', title: b.title, where: 'Bookshelf', tag: 'tag t-plain', href: hrefFor('dump', 'books', b.id) });
  });
  classes.forEach((c) => {
    if (has(c.name, c.type, c.studio, c.instructor, c.notes)) results.push({ kind: c.type, title: `${c.name}, ${c.studio}`, where: 'Classes', tag: 'tag t-health', href: hrefFor('health', 'classes', c.id) });
  });
  restaurants.forEach((r) => {
    if (has(r.name, r.cuisine, r.hood)) results.push({ kind: r.cuisine, title: `${r.name}, ${r.hood}`, where: 'Social calendar', tag: 'tag t-social', href: hrefFor('social', 'calendar', r.id) });
  });
  contacts.forEach((c) => {
    if (has(c.first, c.last, c.company, c.role, c.email, c.note, ...(c.industries ?? []))) results.push({ kind: 'Contact', title: `${c.first} ${c.last}`.trim() + (c.company ? `, ${c.company}` : ''), where: 'Work contacts', tag: 'tag t-work', href: hrefFor('work', 'contacts', c.id) });
  });
  bucket.forEach((b) => {
    if (has(b.title, b.note, b.category)) results.push({ kind: b.category, title: b.title, where: 'Bucket list', tag: 'tag t-plain', href: hrefFor('home', 'bucket', b.id) });
  });
  trips.forEach((t) => {
    if (has(t.name, t.status)) results.push({ kind: 'Trip', title: t.name, where: 'Trip planner', tag: 'tag t-money', href: hrefFor('money', 'trips', t.id) });
  });

  // Feed stories come last and only the latest few, so they never crowd out your own things.
  const hiddenFeed = new Set(feedHidden);
  [...feedPosts, ...(feedPulled ?? [])]
    .filter((f) => !hiddenFeed.has(f.id) && has(f.title, f.summary, f.source, f.author))
    .slice(0, 8)
    .forEach((f) => results.push({ kind: f.kind === 'linkedin' ? 'LinkedIn' : 'Story', title: f.title, where: 'Feed', tag: 'tag t-plain', href: hrefFor('dump', 'feed', f.id) }));

  return (
    <section className="card" aria-labelledby="results-title">
      <div className="row">
        <h2 className="h2" id="results-title">Results for "{query.trim()}"</h2>
        <span className="sub" aria-live="polite">{results.length} found</span>
      </div>
      {results.map((r) => (
        <a key={r.href} href={r.href} onClick={onDone} className="list-btn" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
          <span className={r.tag}>{r.kind}</span>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{r.title}</span>
          <span className="sub">{r.where}</span>
        </a>
      ))}
      {results.length === 0 && <span className="sub">Nothing matches yet. Try a title, a cuisine or a studio.</span>}
    </section>
  );
}

// Scroll to and briefly highlight the element for a search result.
export function useFocusItem(id: string | undefined, ready: boolean) {
  useEffect(() => {
    if (!id || !ready) return;
    const el = document.getElementById(`item-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }, [id, ready]);
}
