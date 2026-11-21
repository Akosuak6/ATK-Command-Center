import { useState } from 'react';
import { db, uid, useMeta, useTable } from '../lib/db';
import { hrefFor } from '../lib/router';
import { addDays, clock12, daysBetween, gapLabel, monthShort, normalizeUrl, parseISO, pct, titleFromUrl, todayISO, weekdayShort } from '../lib/format';
import type { Person, Pin, Restaurant, RestaurantList, ShowEvent } from '../lib/types';
import { Chips, EditButton, FileButton, Sheet, openDataUrl, readFileAsDataURL, resizePhoto, useToast } from '../components/ui';
import { ImagePicker } from '../components/ImagePicker';
import { PhotoPlaceholder } from './Health';
import { IconPencil, IconTrash } from '../components/Icons';
import { TableEditor } from '../components/ListEditor';
import { useFocusItem } from '../components/Search';
import { previewWithCover } from '../lib/preview';
import { linkKind } from '../lib/links';
import { LinkMedia } from '../components/LinkMedia';

const pinLabel = (url?: string) => {
  const k = url ? linkKind(url).kind : 'other';
  return k === 'youtube' ? 'YouTube' : k === 'pinterest' ? 'Pinterest' : 'Pinned link';
};

const MAX_TICKET_BYTES = 6 * 1024 * 1024;

export function VisionBoard({ focus }: { focus?: string }) {
  const trips = useTable(db.trips, 'date');
  const pins = useTable(db.pins, 'date', true);
  const restaurants = useTable(db.restaurants);
  const shows = useTable(db.shows, 'date');
  const headline = useMeta<[string, string]>('visionHeadline', ['2027 is for', 'more yeses']);
  const intention = useMeta<string>('intention', 'Say yes to the dinner, the trip and the last minute plan.');
  const city = useMeta<string>('city', '');
  const toast = useToast();
  const [pinDraft, setPinDraft] = useState('');
  const [rFilter, setRFilter] = useState<'All' | RestaurantList>('All');
  const [rForm, setRForm] = useState({ name: '', cuisine: '', hood: '', list: 'Want to try' as RestaurantList, photo: undefined as string | undefined });
  const [addingR, setAddingR] = useState(false);
  const [editingPin, setEditingPin] = useState<Pin | null>(null);
  const [editingR, setEditingR] = useState<Restaurant | null>(null);
  const [sForm, setSForm] = useState({ title: '', date: '', detail: '' });
  const [edit, setEdit] = useState<'' | 'shows'>('');
  useFocusItem(focus, restaurants.length > 0);

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
    if (!sForm.title.trim() || !sForm.date) { toast('Add a name and a date'); return; }
    void db.shows.add({ id: uid(), title: sForm.title.trim(), date: sForm.date, detail: sForm.detail.trim() });
    setSForm({ title: '', date: '', detail: '' });
  };
  const attachTicket = async (show: ShowEvent, file: File) => {
    if (file.size > MAX_TICKET_BYTES) { toast('That file is over 6 MB. Try a screenshot instead.'); return; }
    const data = file.type.startsWith('image/') ? await resizePhoto(file, 1200, 0.82) : await readFileAsDataURL(file);
    await db.shows.update(show.id, { ticket: { name: file.name, type: file.type, data } });
    toast('Ticket saved');
  };

  const shownR = restaurants.filter((r) => rFilter === 'All' || r.list === rFilter);
  const today = todayISO();
  const upcomingShows = shows.filter((s) => s.date >= addDays(today, -1));

  return (
    <div className="stack">
      <div className="board-head">
        <h2 className="board-title">{headline[0]} <strong>{headline[1]}</strong></h2>
        <FileButton label="Upload a photo" accept="image/*" onFile={onPhoto} />
      </div>
      <form className="inline-add" noValidate onSubmit={(e) => { e.preventDefault(); void addPin(); }}>
        <label htmlFor="pinlink" className="sr">Paste a link to pin</label>
        <input id="pinlink" type="url" inputMode="url" autoCapitalize="off" className="field" value={pinDraft} onChange={(e) => setPinDraft(e.target.value)}
          onPaste={(e) => {
            const f = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'))?.getAsFile();
            if (f) { e.preventDefault(); void onPhoto(f); }
          }}
          placeholder="Paste a link or a photo to pin" />
        <button type="submit" className="btn2">Pin</button>
      </form>

      <div className="masonry">
        {trips.map((t, i) => {
          const p = pct(t.saved, t.cost);
          return (
            <a key={t.id} href={hrefFor('money', 'trips', t.id)} className={`trip-tile${i === 0 ? ' tall' : ''}${t.photo ? ' has-photo' : ''}`}
              style={t.photo ? { backgroundImage: `linear-gradient(180deg, rgba(15,26,46,0.35) 0%, rgba(15,26,46,0.88) 75%), url("${t.photo}")` } : undefined}>
              <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span className="lbl" style={{ color: 'var(--cream-2)' }}>Travel</span>
                <span className="tag" style={{ background: 'var(--cream)', color: 'var(--navy)' }}>{t.status}</span>
              </span>
              <span className="stack-s" style={{ width: '100%' }}>
                <span className="trip-name">{t.name}</span>
                <span className="track"><span className="fill" style={{ width: `${p}%` }} /></span>
                <span style={{ fontSize: 13, color: 'var(--cream)' }}>{p}% saved · Open trip planner</span>
              </span>
            </a>
          );
        })}

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

        <section className="card" aria-labelledby="shows-h">
          <div className="row"><h3 className="h2" id="shows-h" style={{ fontSize: 20 }}>Shows and events</h3><span className="lbl">Tickets</span></div>
          {upcomingShows.map((s) => (
            <div className="ticket" key={s.id}>
              <div className="ticket-date"><span>{monthShort(s.date).toUpperCase()}</span><span>{parseISO(s.date).getDate()}</span></div>
              <div className="ticket-body">
                {s.ticket?.type.startsWith('image/') && <img className="ticket-thumb" src={s.ticket.data} alt="" />}
                <strong style={{ fontSize: 14 }}>{s.title}</strong>
                {s.detail && <span className="sub">{s.detail}</span>}
                {s.ticket ? (
                  <button type="button" className="btn-text" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => openDataUrl(s.ticket!.data)}>View ticket</button>
                ) : (
                  <FileButton className="btn-text" label="Attach a ticket" accept="image/*,.pdf,application/pdf" onFile={(f) => attachTicket(s, f)} />
                )}
              </div>
            </div>
          ))}
          {upcomingShows.length === 0 && <p className="empty">Nothing booked yet.</p>}
          <details>
            <summary className="btn-text" style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: 0 }}>Add a show or event</summary>
            <form className="stack-s" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); addShow(); }}>
              <label className="lbl" htmlFor="stitle">What</label>
              <input id="stitle" className="field" value={sForm.title} onChange={(e) => setSForm({ ...sForm, title: e.target.value })} />
              <div className="form-2">
                <div className="form-col"><label className="lbl" htmlFor="sdate">Date</label><input id="sdate" type="date" className="field" value={sForm.date} onChange={(e) => setSForm({ ...sForm, date: e.target.value })} /></div>
                <div className="form-col"><label className="lbl" htmlFor="sdetail">Seat or time</label><input id="sdetail" className="field" value={sForm.detail} onChange={(e) => setSForm({ ...sForm, detail: e.target.value })} /></div>
              </div>
              <button type="submit" className="btn2">Add event</button>
            </form>
          </details>
          <EditButton label="Edit shows and events" onClick={() => setEdit('shows')} />
        </section>

        <div className="quote"><span className="chrome-text">"{intention}"</span></div>
      </div>

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
        fields={[{ key: 'title', label: 'What', wide: true }, { key: 'date', label: 'Date', type: 'date' }, { key: 'detail', label: 'Seat or time' }]}
        itemName={(s) => s.title}
      />
    </div>
  );
}

export function PeoplePlans() {
  const calendar = useTable(db.calendar, 'date');
  const people = useTable(db.people, 'lastContact');
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState('');
  const today = todayISO();
  const week = calendar
    .filter((e) => e.area === 'Social' && e.date >= today && e.date <= addDays(today, 6))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  const add = () => {
    if (!name.trim()) return;
    void db.people.add({ id: uid(), name: name.trim(), lastContact: today, note: '' });
    setName('');
  };

  return (
    <div className="grid2">
      <section className="card" aria-labelledby="week-h">
        <div className="row"><h2 className="h2" id="week-h">Plans this week</h2><span className="sub">From your calendar</span></div>
        <div>
          {week.map((e) => (
            <div className="line" key={e.id}><span>{e.date === today ? 'Today' : weekdayShort(e.date)} · {e.title}</span><span className="sub">{clock12(e.time)}</span></div>
          ))}
          {week.length === 0 && <p className="empty">No social plans on the calendar this week. Maybe time to make one.</p>}
        </div>
      </section>
      <section className="card" aria-labelledby="reach-h">
        <div className="row"><h2 className="h2" id="reach-h">Reach out to</h2><span className="sub">Longest gap first</span></div>
        <div>
          {people.map((p) => {
            const gap = daysBetween(p.lastContact, today);
            return (
              <div className="line" key={p.id}>
                <Avatar name={p.name} photo={p.photo} />
                <span className="line-main"><span>{p.name}</span><span className={`sub${gap > 30 ? ' bad-text' : ''}`}>{gap > 0 ? `${gapLabel(gap)} since you talked` : 'Talked today'}</span></span>
                <button type="button" className="btn2" onClick={() => { void db.people.update(p.id, { lastContact: today }); toast(`Marked ${p.name} as caught up`); }}>Caught up</button>
              </div>
            );
          })}
          {people.length === 0 && <p className="empty">Add the people you want to keep up with.</p>}
        </div>
        <form className="inline-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <label htmlFor="pname" className="sr">Add a person</label>
          <input id="pname" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a person" />
          <button type="submit" className="btn2">Add</button>
        </form>
        <EditButton label="Edit people" onClick={() => setEdit(true)} />
      </section>
      <TableEditor<Person>
        title="Edit people" open={edit} onClose={() => setEdit(false)} table={db.people} rows={people}
        fields={[{ key: 'name', label: 'Name' }, { key: 'lastContact', label: 'Last talked', type: 'date' }, { key: 'note', label: 'Note', wide: true }, { key: 'photo', label: 'Photo', type: 'image' }]}
        itemName={(p) => p.name}
      />
    </div>
  );
}

function Avatar({ name, photo }: { name: string; photo?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return photo
    ? <img className="avatar" src={photo} alt="" />
    : <span className="avatar avatar-ph" aria-hidden="true">{initials}</span>;
}
