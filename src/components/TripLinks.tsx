import { useState } from 'react';
import { db, uid } from '../lib/db';
import { previewWithCover } from '../lib/preview';
import type { Trip, TripLink } from '../lib/types';
import { IconTrash } from './Icons';

// TikToks, articles and anything else saved about a trip's destination.
// Each link gets its title and cover from the preview function when it can.
export function TripLinks({ trip }: { trip: Trip }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const links = trip.links ?? [];
  const save = (next: TripLink[]) => db.trips.update(trip.id, { links: next });

  const add = async () => {
    let raw = url.trim();
    if (!raw) return;
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
    try { new URL(raw); } catch { return; }
    const id = uid();
    setUrl('');
    // Save straight away so nothing is lost offline, then fill in the title and cover.
    await save([{ id, url: raw }, ...links]);
    setBusy(true);
    try {
      const p = await previewWithCover(raw);
      const fresh = (await db.trips.get(trip.id))?.links ?? [];
      await save(fresh.map((l) => (l.id === id ? { ...l, title: p.title || undefined, site: p.siteName || undefined, cover: p.cover } : l)));
    } finally {
      setBusy(false);
    }
  };

  const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

  return (
    <div className="stack-s" style={{ gap: 10 }}>
      <span className="lbl">Saved about this trip</span>
      <form className="inline-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <label htmlFor={`trip-link-${trip.id}`} className="sr">Paste a TikTok or article link</label>
        <input id={`trip-link-${trip.id}`} className="field" type="url" inputMode="url" placeholder="Paste a TikTok or article link" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" className="btn2" disabled={!url.trim()}>Add</button>
      </form>
      {busy && <span className="sub" aria-live="polite">Getting the title and cover</span>}
      {links.length === 0 && <p className="empty">Nothing saved yet. Add TikToks, guides or restaurant lists for this place.</p>}
      {links.length > 0 && (
        <ul className="trip-links">
          {links.map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noreferrer" className="trip-link">
                {l.cover ? <img src={l.cover} alt="" /> : <span className="trip-link-ph" aria-hidden="true">{(l.site || host(l.url)).charAt(0).toUpperCase()}</span>}
                <span className="trip-link-text"><strong>{l.title || host(l.url)}</strong><span className="sub">{l.site || host(l.url)}</span></span>
              </a>
              <button type="button" className="icon-btn" aria-label={`Remove ${l.title || host(l.url)}`} onClick={() => void save(links.filter((x) => x.id !== l.id))}><IconTrash /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
