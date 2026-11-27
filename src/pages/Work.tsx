import { useState } from 'react';
import { db, uid, useTable } from '../lib/db';
import { daysBetween, gapLabel, longDate, normalizeUrl, shortDate, titleCase, todayISO } from '../lib/format';
import type { Contact, ContactMethod, Industry } from '../lib/types';
import { Chips, EditButton, Sheet, useToast } from '../components/ui';
import { useFocusItem } from '../components/Search';
import { Avatar } from './Social';

// A small CRM: the people worth keeping warm for the next opportunity, and when you last caught up.

export const INDUSTRIES: Industry[] = ['Healthcare', 'Startups', 'Investment banking', 'Venture capital', 'Private equity', 'Consulting', 'Other'];
export const METHODS: ContactMethod[] = ['Email', 'Text', 'Call', 'LinkedIn', 'Coffee', 'Meeting', 'Event', 'Other'];
const INDUSTRY_TAG: Record<Industry, string> = {
  Healthcare: 't-health', Startups: 't-work', 'Investment banking': 't-money', 'Venture capital': 't-learn', 'Private equity': 't-social', Consulting: 't-plain', Other: 't-plain'
};
const CADENCES = [{ value: 30, label: 'Every month' }, { value: 60, label: 'Every 2 months' }, { value: 90, label: 'Every 3 months' }, { value: 180, label: 'Every 6 months' }, { value: 365, label: 'Once a year' }];
const DEFAULT_EVERY = 90;

export const fullName = (c: Contact) => `${c.first} ${c.last}`.trim();
const every = (c: Contact) => c.every || DEFAULT_EVERY;
// Days past the check in: positive means due. Someone never logged is due now.
const overdue = (c: Contact, today: string) => (c.lastContact ? daysBetween(c.lastContact, today) - every(c) : every(c));
const isDue = (c: Contact, today: string) => overdue(c, today) >= 0;

const networkQuip = (n: number) => (n === 0 ? 'Start with five people you admire' : n < 10 ? 'A tight circle to build on' : n < 50 ? 'A network taking shape' : 'A real network');
const warmQuip = (p: number, n: number) => (n === 0 ? 'Add people to see how warm they are' : p >= 80 ? 'Your network is warm' : p >= 50 ? 'Most people hear from you' : p > 0 ? 'A few could use a hello' : 'Time to say hi');
const dueQuip = (n: number, total: number) => (total === 0 ? 'Nobody to chase yet' : n === 0 ? 'Everyone is caught up' : n === 1 ? 'One hello would go a long way' : `${n} hellos would go a long way`);

type Form = {
  first: string; last: string; email: string; phone: string; linkedin: string; company: string; role: string;
  industries: Industry[]; lastContact: string; method: ContactMethod | ''; every: number; note: string;
};
const EMPTY: Form = { first: '', last: '', email: '', phone: '', linkedin: '', company: '', role: '', industries: [], lastContact: '', method: '', every: DEFAULT_EVERY, note: '' };
const toForm = (c: Contact): Form => ({
  first: c.first, last: c.last, email: c.email ?? '', phone: c.phone ?? '', linkedin: c.linkedin ?? '', company: c.company ?? '', role: c.role ?? '',
  industries: c.industries ?? [], lastContact: c.lastContact ?? '', method: c.method ?? '', every: every(c), note: c.note ?? ''
});

export function WorkContacts({ focus }: { focus?: string }) {
  const contacts = useTable(db.contacts, 'first');
  const toast = useToast();
  const [filter, setFilter] = useState<'All' | Industry>('All');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Contact | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [logging, setLogging] = useState<Contact | null>(null);
  const [touch, setTouch] = useState<{ date: string; method: ContactMethod; note: string }>({ date: todayISO(), method: 'Coffee', note: '' });
  useFocusItem(focus, contacts.length > 0);

  const today = todayISO();
  const due = contacts.filter((c) => isDue(c, today)).sort((a, b) => overdue(b, today) - overdue(a, today));
  const soon = contacts.filter((c) => !isDue(c, today)).sort((a, b) => overdue(b, today) - overdue(a, today)).slice(0, 3);
  const warmPct = contacts.length ? Math.round(((contacts.length - due.length) / contacts.length) * 100) : 0;
  const recent = contacts
    .flatMap((c) => (c.log ?? []).map((t) => ({ ...t, who: c })))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  const industries = INDUSTRIES.filter((i) => contacts.some((c) => c.industries?.includes(i)));
  const needle = q.trim().toLowerCase();
  const shown = contacts.filter((c) => (filter === 'All' || c.industries?.includes(filter))
    && (!needle || [fullName(c), c.company, c.role, c.email, c.note].join(' ').toLowerCase().includes(needle)));

  const openNew = () => { setForm(EMPTY); setEditing('new'); };
  const openEdit = (c: Contact) => { setForm(toForm(c)); setEditing(c); };
  const save = async () => {
    if (!form.first.trim() && !form.last.trim()) { toast('Add a name first'); return; }
    const row = {
      first: titleCase(form.first.trim()), last: titleCase(form.last.trim()),
      email: form.email.trim() || undefined, phone: form.phone.trim() || undefined,
      linkedin: form.linkedin.trim() ? normalizeUrl(form.linkedin.trim()) : undefined,
      company: form.company.trim() || undefined, role: form.role.trim() || undefined,
      industries: form.industries.length ? form.industries : (['Other'] as Industry[]),
      lastContact: form.lastContact || undefined, method: form.method || undefined,
      every: form.every, note: form.note.trim() || undefined
    };
    if (editing === 'new') {
      const log = row.lastContact && row.method ? [{ date: row.lastContact, method: row.method }] : [];
      await db.contacts.add({ id: uid(), ...row, log, date: today });
      toast(`${`${row.first} ${row.last}`.trim()} added`);
    } else if (editing) {
      await db.contacts.update(editing.id, row);
      toast('Saved');
    }
    setEditing(null);
  };
  const remove = async () => {
    if (!editing || editing === 'new') return;
    if (!confirm(`Delete ${fullName(editing)}?`)) return;
    await db.contacts.delete(editing.id);
    setEditing(null);
  };

  const openLog = (c: Contact) => { setTouch({ date: today, method: c.method ?? 'Coffee', note: '' }); setLogging(c); };
  const saveLog = async () => {
    if (!logging) return;
    const entry = { date: touch.date || today, method: touch.method, ...(touch.note.trim() ? { note: touch.note.trim() } : {}) };
    const log = [entry, ...(logging.log ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    const latest = log[0];
    await db.contacts.update(logging.id, { log, lastContact: latest.date, method: latest.method });
    toast(`Logged a catch up with ${logging.first || fullName(logging)}`);
    setLogging(null);
  };
  const toggleIndustry = (i: Industry) => setForm((f) => ({ ...f, industries: f.industries.includes(i) ? f.industries.filter((x) => x !== i) : [...f.industries, i] }));

  const lastText = (c: Contact) => {
    if (!c.lastContact) return 'No catch up logged yet';
    const gap = daysBetween(c.lastContact, today);
    const how = c.method ? ` by ${c.method === 'Coffee' || c.method === 'Meeting' || c.method === 'Event' ? c.method.toLowerCase() : c.method}` : '';
    return gap <= 0 ? `Caught up today${how}` : `${gapLabel(gap)} since you caught up${how}`;
  };

  return (
    <div className="stack">
      <section aria-label="Your network" className="stats">
        <div className="stat"><span className="lbl">People in your network</span><span className="num">{contacts.length}</span><span className="sub quip">{networkQuip(contacts.length)}</span></div>
        <div className="stat"><span className="lbl">Warm right now</span><div><span className="num">{warmPct}</span><span className="unit">%</span></div><span className="sub quip">{warmQuip(warmPct, contacts.length)}</span></div>
        <div className="stat"><span className="lbl">Due for a hello</span><span className="num">{due.length}</span><span className="sub quip">{dueQuip(due.length, contacts.length)}</span></div>
      </section>

      <div className="grid2">
        <section className="card" aria-labelledby="wreach-h">
          <div className="row"><h2 className="h2" id="wreach-h">Reach out to</h2><span className="sub">Longest overdue first</span></div>
          <div>
            {due.map((c) => (
              <div className="line" key={c.id}>
                <Avatar name={fullName(c)} />
                <span className="line-main">
                  <span>{fullName(c)}{c.company ? <span className="sub">, {c.company}</span> : null}</span>
                  <span className="sub bad-text">{lastText(c)}</span>
                </span>
                <button type="button" className="btn2" onClick={() => openLog(c)}>Log it</button>
              </div>
            ))}
            {contacts.length > 0 && due.length === 0 && <p className="empty">Everyone is warm.</p>}
            {due.length === 0 && soon.map((c) => (
              <div className="line" key={c.id}>
                <Avatar name={fullName(c)} />
                <span className="line-main"><span>{fullName(c)}</span><span className="sub">Due in {gapLabel(-overdue(c, today))}</span></span>
              </div>
            ))}
            {contacts.length === 0 && <p className="empty">Add the people you want to keep in touch with.</p>}
          </div>
        </section>

        <section className="card" aria-labelledby="wrecent-h">
          <div className="row"><h2 className="h2" id="wrecent-h">Recent catch ups</h2><span className="sub">Latest 6</span></div>
          <div>
            {recent.map((t, i) => (
              <div className="line" key={`${t.who.id}-${t.date}-${i}`}>
                <span className="line-main">
                  <span>{fullName(t.who)}</span>
                  <span className="sub">{t.method}{t.note ? `: ${t.note}` : ''}</span>
                </span>
                <span className="sub">{shortDate(t.date)}</span>
              </div>
            ))}
            {recent.length === 0 && <p className="empty">Catch ups you log show up here.</p>}
          </div>
        </section>
      </div>

      <section aria-labelledby="contacts-h" className="stack" style={{ gap: 14 }}>
        <div className="row row-wrap" style={{ alignItems: 'center' }}>
          <h2 className="h2" id="contacts-h">Contacts</h2>
          <button type="button" className="btn" onClick={openNew}>+ Add a contact</button>
        </div>
        {contacts.length > 0 && (
          <div className="contact-tools">
            <label htmlFor="csearch" className="sr">Search contacts</label>
            <input id="csearch" type="search" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, company or note" />
            {industries.length > 1 && <Chips label="Filter by industry" value={filter} onChange={setFilter} options={[{ value: 'All' as const, label: `All (${contacts.length})` }, ...industries.map((i) => ({ value: i, label: i }))]} />}
          </div>
        )}
        {contacts.length > 0 && shown.length === 0 && <p className="empty">No one matches that.</p>}
        <div className="contact-grid">
          {shown.map((c) => (
            <article className="card contact-card" key={c.id} id={`item-${c.id}`}>
              <div className="contact-head">
                <Avatar name={fullName(c)} />
                <div className="stack-s" style={{ gap: 2, minWidth: 0 }}>
                  <strong className="contact-name">{fullName(c)}</strong>
                  {(c.role || c.company) && <span className="sub">{[c.role, c.company].filter(Boolean).join(' at ')}</span>}
                </div>
              </div>
              <div className="chips">{(c.industries ?? []).map((i) => <span key={i} className={`tag ${INDUSTRY_TAG[i]}`}>{i}</span>)}</div>
              <div className="contact-links">
                {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a>}
                {c.linkedin && <a href={c.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>}
              </div>
              <span className={`sub${isDue(c, today) ? ' bad-text' : ''}`}>{c.lastContact ? `Last: ${longDate(c.lastContact)}${c.method ? `, ${c.method}` : ''}` : 'No catch up logged yet'}</span>
              {c.note && <p className="body contact-note">{c.note}</p>}
              <div className="card-actions">
                <button type="button" className="btn2" onClick={() => openLog(c)}>Log a catch up</button>
                <EditButton label={`Edit ${fullName(c)}`} onClick={() => openEdit(c)} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <Sheet title={editing === 'new' ? 'Add a contact' : 'Edit contact'} open={!!editing} onClose={() => setEditing(null)}>
        <form className="stack-s" style={{ gap: 12 }} noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="form-2">
            <div className="form-col"><label className="lbl" htmlFor="cfirst">First name</label><input id="cfirst" className="field" autoComplete="off" value={form.first} onChange={(e) => setForm({ ...form, first: e.target.value })} /></div>
            <div className="form-col"><label className="lbl" htmlFor="clast">Last name</label><input id="clast" className="field" autoComplete="off" value={form.last} onChange={(e) => setForm({ ...form, last: e.target.value })} /></div>
          </div>
          <div className="form-2">
            <div className="form-col"><label className="lbl" htmlFor="cemail">Email</label><input id="cemail" type="email" className="field" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="form-col"><label className="lbl" htmlFor="cphone">Phone (optional)</label><input id="cphone" type="tel" className="field" autoComplete="off" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <label className="lbl" htmlFor="clinked">LinkedIn</label>
          <input id="clinked" type="url" inputMode="url" autoCapitalize="off" className="field" value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} placeholder="linkedin.com/in/their-name" />
          <div className="form-2">
            <div className="form-col"><label className="lbl" htmlFor="ccompany">Company (optional)</label><input id="ccompany" className="field" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
            <div className="form-col"><label className="lbl" htmlFor="crole">Role (optional)</label><input id="crole" className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
          </div>
          <span className="lbl" id="cind-l">Industry</span>
          <div className="chips" role="group" aria-labelledby="cind-l">
            {INDUSTRIES.map((i) => (
              <button key={i} type="button" className="chip" aria-pressed={form.industries.includes(i)} onClick={() => toggleIndustry(i)}>{i}</button>
            ))}
          </div>
          <div className="form-2">
            <div className="form-col"><label className="lbl" htmlFor="clastc">Last contact</label><input id="clastc" type="date" className="field" value={form.lastContact} onChange={(e) => setForm({ ...form, lastContact: e.target.value })} /></div>
            <div className="form-col">
              <label className="lbl" htmlFor="cmethod">How</label>
              <select id="cmethod" className="field" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as ContactMethod | '' })}>
                <option value="">Choose one</option>
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <label className="lbl" htmlFor="cevery">Check in</label>
          <select id="cevery" className="field" value={form.every} onChange={(e) => setForm({ ...form, every: Number(e.target.value) })}>
            {CADENCES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
          <label className="lbl" htmlFor="cnote">Note (optional)</label>
          <textarea id="cnote" rows={3} className="area" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="How you met, what they are working on, what to follow up on" />
          <button type="submit" className="btn">{editing === 'new' ? 'Add contact' : 'Save'}</button>
          {editing && editing !== 'new' && <button type="button" className="btn-text" onClick={() => void remove()}>Delete contact</button>}
        </form>
      </Sheet>

      <Sheet title={logging ? `Catch up with ${fullName(logging)}` : 'Log a catch up'} open={!!logging} onClose={() => setLogging(null)}>
        <form className="stack-s" style={{ gap: 12 }} onSubmit={(e) => { e.preventDefault(); void saveLog(); }}>
          <label className="lbl" htmlFor="tdate">When</label>
          <input id="tdate" type="date" className="field" value={touch.date} max={today} onChange={(e) => setTouch({ ...touch, date: e.target.value })} />
          <span className="lbl" id="tmethod-l">How</span>
          <Chips label="How you caught up" value={touch.method} onChange={(m) => setTouch({ ...touch, method: m })} options={METHODS.map((m) => ({ value: m, label: m }))} />
          <label className="lbl" htmlFor="tnote">Note (optional)</label>
          <textarea id="tnote" rows={3} className="area" value={touch.note} onChange={(e) => setTouch({ ...touch, note: e.target.value })} placeholder="What you talked about, anything to follow up on" />
          <button type="submit" className="btn">Save catch up</button>
        </form>
      </Sheet>
    </div>
  );
}
