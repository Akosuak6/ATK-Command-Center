import { useState, type CSSProperties } from 'react';
import { db, uid, useMeta, useTable } from '../lib/db';
import { hrefFor } from '../lib/router';
import { addDays, clock12, money, monthShort, normalizeUrl, parseISO, pct, shortDate, titleFromUrl, todayISO, weekdayShort } from '../lib/format';
import type { Pin, Restaurant, RestaurantList, ShowEvent, Trip } from '../lib/types';
import { Chips, EditButton, FileButton, Sheet, openDataUrl, readFileAsDataURL, resizePhoto, useToast } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { PhotoPlaceholder } from './Health';
import { IconPencil, IconTrash } from '../components/Icons';
import { TableEditor } from '../components/ListEditor';
import { useFocusItem } from '../components/Search';
import { previewWithCover } from '../lib/preview';
import { linkKind } from '../lib/links';
import { LinkMedia } from '../components/LinkMedia';
import { dayLabel } from '../lib/plan';
import { useAutoTripCovers } from '../lib/covers';

const pinLabel = (url?: string) => {
  const k = url ? linkKind(url).kind : 'other';
  return k === 'youtube' ? 'YouTube' : k === 'pinterest' ? 'Pinterest' : 'Pinned link';
};

const MAX_TICKET_BYTES = 6 * 1024 * 1024;

// Cards in a deck lean a little, each its own way, and straighten when you point at one.
const TILTS = [-1.6, 1.1, -0.8, 1.5, -1.2, 0.9];
const tilt = (i: number) => ({ '--tilt': `${TILTS[i % TILTS.length]}deg` }) as CSSProperties;

// Coming trips first by date, then the ones still being dreamed up, then the ones you have been on.
function tripOrder(trips: Trip[], today: string) {
  const ahead = trips.filter((t) => t.date && (t.endDate ?? t.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  const undated = trips.filter((t) => !t.date);
  const past = trips.filter((t) => t.date && (t.endDate ?? t.date) < today).sort((a, b) => b.date.localeCompare(a.date));
  return [...ahead, ...undated, ...past];
}

const tripSpan = (t: Trip) => {
  if (!t.date) return 'No dates yet';
  if (!t.endDate || t.endDate === t.date) return shortDate(t.date);
  return t.date.slice(5, 7) === t.endDate.slice(5, 7) ? `${shortDate(t.date)} to ${parseISO(t.endDate).getDate()}` : `${shortDate(t.date)} to ${shortDate(t.endDate)}`;
};

export function SocialCalendar({ focus }: { focus?: string }) {
  const trips = useTable(db.trips, 'date');
  const pins = useTable(db.pins, 'date', true);
  const restaurants = useTable(db.restaurants);
  const shows = useTable(db.shows, 'date');
  const calendar = useTable(db.calendar, 'date');
  const intention = useMeta<string>('intention', '');
  const city = useMeta<string>('city', '');
  const toast = useToast();
  const [pinDraft, setPinDraft] = useState('');
  const [rFilter, setRFilter] = useState<'All' | RestaurantList>('All');
  const [rForm, setRForm] = useState({ name: '', cuisine: '', hood: '', list: 'Want to try' as RestaurantList, photo: undefined as string | undefined });
  const [addingR, setAddingR] = useState(false);
  const [editingPin, setEditingPin] = useState<Pin | null>(null);
  const [editingR, setEditingR] = useState<Restaurant | null>(null);
  const [sForm, setSForm] = useState({ title: '', date: '', detail: '', season: '' });
  const [edit, setEdit] = useState<'' | 'shows'>('');
  useFocusItem(focus, restaurants.length > 0);
  useAutoTripCovers(trips);

  const today = todayISO();
  const week = calendar
    .filter((e) => e.area === 'Social' && e.date >= today && e.date <= addDays(today, 6))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const deckTrips = tripOrder(trips, today);
  const upcomingShows = [...shows.filter((x) => x.date && x.date >= addDays(today, -1)), ...shows.filter((x) => !x.date && x.season)];
  const shownR = restaurants.filter((r) => rFilter === 'All' || r.list === rFilter);

  const onPhoto = async (file: File) => {
    try {
      const src = await resizePhoto(file);
      await db.pins.add({ id: uid(), kind: 'photo', src, date: new Date().toISOString() });
      toast('Photo pinned');
    } catch {
      toast('That photo could not be read');
    }
  };
  const addPin = async () => {
    const raw = pinDraft.trim();
    if (!raw) return;
    const url = normalizeUrl(raw);
    const id = uid();
    setPinDraft('');
    await db.pins.add({ id, kind: 'link', url, title: titleFromUrl(url), date: new Date().toISOString() });
    const p = await previewWithCover(url);
    if (p.title || p.cover) await db.pins.update(id, { ...(p.title ? { title: p.title } : {}), ...(p.cover ? { cover: p.cover } : {}) });
  };
  const addRestaurant = () => {
    if (!rForm.name.trim()) { toast('Add a name first'); return; }
    void db.restaurants.add({ id: uid(), name: rForm.name.trim(), cuisine: rForm.cuisine.trim() || 'Restaurant', hood: rForm.hood.trim(), list: rForm.list, photo: rForm.photo });
    setRForm({ name: '', cuisine: '', hood: '', list: rForm.list, photo: undefined });
    setAddingR(false);
  };
  const addShow = () => {
    if (!sForm.title.trim() || (!sForm.date && !sForm.season)) { toast('Add a name, and a date or a season'); return; }
    void db.shows.add({ id: uid(), title: sForm.title.trim(), date: sForm.date, detail: sForm.detail.trim(), ...(sForm.season && !sForm.date ? { season: sForm.season } : {}) });
    setSForm({ title: '', date: '', detail: '', season: '' });
  };
  const attachTicket = async (show: ShowEvent, file: File) => {
    if (file.size > MAX_TICKET_BYTES) { toast('That file is over 6 MB. Try a screenshot instead.'); return; }
    const data = file.type.startsWith('image/') ? await resizePhoto(file, 1200, 0.82) : await readFileAsDataURL(file);
    await db.shows.update(show.id, { ticket: { name: file.name, type: file.type, data } });
    toast('Ticket saved');
  };

  return (
    <div className="stack">
      <div className="grid2">
        <section className="card full" aria-labelledby="week-h">
          <div className="row"><h2 className="h2" id="week-h">Plans this week</h2><span className="sub">From your calendar</span></div>
          <div>
            {week.map((e) => (
              <div className="line" key={e.id}><span>{e.date === today ? 'Today' : weekdayShort(e.date)} · {e.title}</span><span className="sub">{clock12(e.time)}</span></div>
            ))}
            {week.length === 0 && <p className="empty">No social plans on the calendar this week. Maybe time to make one.</p>}
          </div>
        </section>
      </div>

      <section aria-labelledby="travel-h" className="stack" style={{ gap: 6 }}>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="travel-h">Travel</h2>
          <a className="btn-text" href={hrefFor('money', 'trips')}>Open the trip planner</a>
        </div>
        {deckTrips.length === 0 && <p className="empty">No trips yet. Add one in the trip planner.</p>}
        <div className="deck" role="list" aria-label="Trips">
          {deckTrips.map((t, i) => {
            const p = pct(t.saved, t.cost);
            const past = !!t.date && (t.endDate ?? t.date) < today;
            return (
              <a key={t.id} role="listitem" href={hrefFor('money', 'trips', t.id)} style={tilt(i)}
                className={`deck-card deck-trip${t.photo ? ' has-photo' : ''}${past ? ' is-past' : ''}`}
                aria-label={`${t.name}, ${tripSpan(t)}, ${t.status}`}>
                {t.photo && <img className="deck-trip-photo" src={t.photo} alt="" loading="lazy" />}
                <span className="deck-trip-top">
                  <span className="tag deck-trip-tag">{past ? 'Been' : t.status}</span>
                  {t.date && !past && <span className="deck-trip-when">{dayLabel(t.date, today)}</span>}
                </span>
                <span className="deck-trip-bottom">
                  <span className="trip-name">{t.name}</span>
                  <span className="deck-trip-dates">{tripSpan(t)}</span>
                  {t.photoCredit && <span className="deck-trip-credit" title={t.photoCredit}>Photo: {t.photoCredit}</span>}
                  {t.cost > 0 && !past && <span className="deck-trip-saved">{p >= 100 ? 'Paid for' : `${money(t.cost)} trip`}</span>}
                </span>
              </a>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="shows-h" className="stack" style={{ gap: 6 }}>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="shows-h">Shows and events</h2>
          <EditButton label="Edit shows and events" onClick={() => setEdit('shows')} />
        </div>
        {upcomingShows.length === 0 && <p className="empty">Nothing booked yet.</p>}
        <div className="deck" role="list" aria-label="Shows and events">
          {upcomingShows.map((x, i) => (
            <article className="deck-card ticket-card" role="listitem" key={x.id} style={tilt(i + 2)}>
              {x.date
                ? <div className="ticket-date"><span>{monthShort(x.date).toUpperCase()}</span><span>{parseISO(x.date).getDate()}</span></div>
                : <div className="ticket-date season"><span>EVERY</span><span>{(x.season ?? '').toUpperCase()}</span></div>}
              <div className="ticket-body">
                {x.ticket?.type.startsWith('image/') && <img className="ticket-thumb" src={x.ticket.data} alt="" />}
                <strong className="ticket-title">{x.title}</strong>
                {x.detail && <span className="sub">{x.detail}</span>}
                {x.date && <span className="sub">{dayLabel(x.date, today)}</span>}
                {x.ticket ? (
                  <button type="button" className="btn-text" style={{ alignSelf: 'flex-start', paddingLeft: 0, marginTop: 'auto' }} onClick={() => openDataUrl(x.ticket!.data)}>View ticket</button>
                ) : (
                  <FileButton className="btn-text ticket-attach" label="Attach a ticket" accept="image/*,.pdf,application/pdf" onFile={(file) => attachTicket(x, file)} />
                )}
              </div>
            </article>
          ))}
        </div>
        <details className="card add-show">
          <summary className="btn-text" style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: 0 }}>Add a show or event</summary>
          <form className="stack-s" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); addShow(); }}>
            <label className="lbl" htmlFor="stitle">What</label>
            <input id="stitle" className="field" value={sForm.title} onChange={(e) => setSForm({ ...sForm, title: e.target.value })} />
            <div className="form-2">
              <div className="form-col"><label className="lbl" htmlFor="sdate">Date</label><input id="sdate" type="date" className="field" value={sForm.date} onChange={(e) => setSForm({ ...sForm, date: e.target.value })} /></div>
              <div className="form-col"><label className="lbl" htmlFor="sdetail">Seat or time</label><input id="sdetail" className="field" value={sForm.detail} onChange={(e) => setSForm({ ...sForm, detail: e.target.value })} /></div>
            </div>
            <label className="lbl" htmlFor="sseason">No date yet? Every year in</label>
            <select id="sseason" className="field" value={sForm.season} onChange={(e) => setSForm({ ...sForm, season: e.target.value })}>
              <option value="">Not seasonal</option>
              {['Winter', 'Spring', 'Summer', 'Fall'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button type="submit" className="btn2">Add event</button>
          </form>
        </details>
      </section>

      <section aria-labelledby="rest-h" className="stack" style={{ gap: 14 }}>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="rest-h">Restaurants{city ? ` in ${city}` : ''}</h2>
          <button type="button" className="btn2" onClick={() => setAddingR(true)}>+ Add a restaurant</button>
        </div>
        <Chips label="Filter restaurants" value={rFilter} onChange={setRFilter} options={[{ value: 'All', label: 'All' }, { value: 'Want to try', label: 'Want to try' }, { value: 'Been, loved it', label: 'Been, loved it' }]} />
        {shownR.length === 0 && <p className="empty">Nothing on this list yet.</p>}
        <div className="photo-grid">
          {shownR.map((r) => (
            <div className="photo-card" key={r.id} id={`item-${r.id}`}>
              <button type="button" className="photo-media" onClick={() => setEditingR(r)} aria-label={`${r.name}. Tap to edit or add a photo`}>
                {r.photo ? <img src={r.photo} alt="" loading="lazy" /> : <PhotoPlaceholder word={r.cuisine} seed={r.id} />}
                <span className="photo-pill top">{r.list === 'Want to try' ? 'Want to try' : 'Been, loved it'}</span>
              </button>
              <span className="photo-cap">
                <strong>{r.name}</strong>
                <span className="chips"><span className="tag t-social">{r.cuisine}</span>{r.hood && <span className="tag t-plain">{r.hood}</span>}</span>
                <button type="button" className="btn-text" style={{ alignSelf: 'flex-start', marginLeft: -8 }}
                  onClick={() => db.restaurants.update(r.id, { list: r.list === 'Want to try' ? 'Been, loved it' : 'Want to try' })}>
                  {r.list === 'Want to try' ? 'Mark as been' : 'Move to want to try'}
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>


      <section aria-labelledby="pins-h" className="stack" style={{ gap: 14 }}>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="pins-h">Pinned</h2>
          <FileButton label="Upload a photo" accept="image/*" onFile={onPhoto} />
        </div>
        <form className="inline-add" noValidate onSubmit={(e) => { e.preventDefault(); void addPin(); }}>
          <label htmlFor="pinlink" className="sr">Paste a link to pin</label>
          <input id="pinlink" type="url" inputMode="url" autoCapitalize="off" className="field" value={pinDraft} onChange={(e) => setPinDraft(e.target.value)}
            onPaste={(e) => {
              const file = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))?.getAsFile();
              if (file) { e.preventDefault(); void onPhoto(file); }
            }}
            placeholder="Paste a link or a photo to pin" />
          <button type="submit" className="btn2">Pin</button>
        </form>
        {pins.length === 0 && !intention && <p className="empty">Pin photos and links you want to remember.</p>}
        <div className="masonry">
          {pins.map((p) => (
            <div className="card pin-card" key={p.id}>
              {p.kind === 'photo' ? (
                <img src={p.src} alt="Pinned photo" loading="lazy" />
              ) : (
                <div className="pin-link-wrap">
                  <LinkMedia url={p.url ?? ''} cover={p.cover} title={p.title ?? 'Pinned link'} className="pin-cover" />
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="pin-link">
                    <span className="lbl">{pinLabel(p.url)}</span>
                    <span style={{ fontFamily: 'var(--serif)', fontSize: 20, paddingRight: p.cover ? 0 : 76 }}>{p.title}</span>
                  </a>
                </div>
              )}
              {p.kind === 'link' && (
                <button type="button" className="icon-btn pin-edit" style={{ border: 'none' }} aria-label={`Edit ${p.title}`} onClick={() => setEditingPin(p)}>
                  <IconPencil />
                </button>
              )}
              <button type="button" className="icon-btn pin-remove" style={{ border: 'none' }} aria-label={p.kind === 'photo' ? 'Remove photo' : `Remove ${p.title}`} onClick={() => { if (confirm('Remove this pin?')) void db.pins.delete(p.id); }}>
                <IconTrash />
              </button>
            </div>
          ))}
          {intention && <div className="quote"><span className="chrome-text">"{intention}"</span></div>}
        </div>
      </section>

      <Sheet title="Add a restaurant" open={addingR} onClose={() => setAddingR(false)}>
        <form className="stack-s" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); addRestaurant(); }}>
          <label className="lbl" htmlFor="rname">Name</label>
          <input id="rname" className="field" value={rForm.name} onChange={(e) => setRForm({ ...rForm, name: e.target.value })} />
          <div className="form-2">
            <div className="form-col"><label className="lbl" htmlFor="rcuisine">Cuisine</label><input id="rcuisine" className="field" value={rForm.cuisine} onChange={(e) => setRForm({ ...rForm, cuisine: e.target.value })} /></div>
            <div className="form-col"><label className="lbl" htmlFor="rhood">Neighborhood</label><input id="rhood" className="field" value={rForm.hood} onChange={(e) => setRForm({ ...rForm, hood: e.target.value })} /></div>
          </div>
          <label className="lbl" htmlFor="rlist">List</label>
          <select id="rlist" className="field" value={rForm.list} onChange={(e) => setRForm({ ...rForm, list: e.target.value as RestaurantList })}>
            <option value="Want to try">Want to try</option>
            <option value="Been, loved it">Been, loved it</option>
          </select>
          <ImagePicker id="rphoto" label="Photo (optional)" value={rForm.photo} onChange={(src) => setRForm({ ...rForm, photo: src })} />
          <button type="submit" className="btn">Add restaurant</button>
        </form>
      </Sheet>

      <TableEditor<Pin>
        title="Edit pinned link" open={!!editingPin} onClose={() => setEditingPin(null)} table={db.pins} rows={editingPin ? [editingPin] : []}
        fields={[{ key: 'cover', label: 'Cover photo', type: 'image' }, { key: 'title', label: 'Title', wide: true }, { key: 'url', label: 'Link', wide: true }]}
        itemName={() => 'this pin'}
      />
      <TableEditor<Restaurant>
        title="Edit restaurant" open={!!editingR} onClose={() => setEditingR(null)} table={db.restaurants} rows={editingR ? [editingR] : []}
        fields={[{ key: 'name', label: 'Name', wide: true }, { key: 'cuisine', label: 'Cuisine' }, { key: 'hood', label: 'Neighborhood' }, { key: 'list', label: 'List', type: 'select', options: [{ value: 'Want to try', label: 'Want to try' }, { value: 'Been, loved it', label: 'Been, loved it' }] }, { key: 'photo', label: 'Photo', type: 'image' }]}
        itemName={(r) => r.name}
      />
      <TableEditor<ShowEvent>
        title="Edit shows and events" open={edit === 'shows'} onClose={() => setEdit('')} table={db.shows} rows={shows}
        fields={[{ key: 'title', label: 'What', wide: true }, { key: 'date', label: 'Date', type: 'date' }, { key: 'detail', label: 'Seat or time' }, { key: 'season', label: 'Every year in (when there is no date)', type: 'select', options: [{ value: '', label: 'Not seasonal' }, ...['Winter', 'Spring', 'Summer', 'Fall'].map((x) => ({ value: x, label: x }))] }]}
        itemName={(s) => s.title}
      />
    </div>
  );
}

export function Avatar({ name, photo }: { name: string; photo?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return photo
    ? <img className="avatar" src={photo} alt="" />
    : <span className="avatar avatar-ph" aria-hidden="true">{initials}</span>;
}
