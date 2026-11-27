import { useEffect, useState } from 'react';
import { exportBackup, importBackup, setMeta, useMeta } from '../lib/db';
import { getSyncStatus, resetDevice, signOut, syncNow, useSyncStatus } from '../lib/sync';
import { syncText } from '../components/SyncStatus';
import { hrefFor } from '../lib/router';
import { daysBetween, longDate, shortDate, timeOfDate, todayISO } from '../lib/format';
import { Chips, FileButton, areaClass, useToast } from '../components/ui';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { CALENDAR_AREAS, addCalendar, listCalendars, removeCalendar, syncCalendars, type LinkedCalendar } from '../lib/calendars';
import type { Area } from '../lib/types';

const REMIND_AFTER_DAYS = 30;

async function downloadBackup() {
  const json = await exportBackup();
  const blob = new Blob([json], { type: 'application/json' });
  const name = `command-center-backup-${todayISO()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  // On iPhone the share sheet is the friendliest way to save to Files.
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch {
      /* fall through to a normal download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function SettingsPage() {
  const toast = useToast();
  const lastBackup = useMeta<string | null>('lastBackup', null);
  const sample = useMeta<boolean>('sampleData', false);
  const [busy, setBusy] = useState(false);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const sync = useSyncStatus();
  const syncLine = syncText(sync);

  const doExport = async () => {
    setBusy(true);
    try {
      await downloadBackup();
      await setMeta('lastBackup', new Date().toISOString());
      toast('Backup ready');
    } catch {
      toast('The backup could not be made');
    } finally {
      setBusy(false);
    }
  };
  const doImport = async (file: File) => {
    if (!confirm('Importing replaces everything with the backup, on this device and then on your other devices as it syncs. Continue?')) return;
    try {
      await importBackup(await file.text());
      void syncNow();
      toast('Backup restored. Syncing it to your other devices.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That file could not be read');
    }
  };

  return (
    <div className="grid2">
      <section className="card full" aria-labelledby="look-h">
        <h2 className="h2" id="look-h">Look</h2>
        <p className="body">Moody, the default, is near black navy with your chrome. Light is linen and navy. Your choice is saved on this device, so the phone and laptop can each have their own.</p>
        <Chips label="Look" value={theme} onChange={(t) => { setTheme(t); setThemeState(t); }} options={[{ value: 'light', label: 'Light' }, { value: 'moody', label: 'Moody' }]} />
      </section>
      <CalendarsCard />
      <section className="card" aria-labelledby="sync-h">
        <h2 className="h2" id="sync-h">Sync</h2>
        <p className="body">Everything is saved on this device first and synced to your database, so the laptop and phone stay the same and the app works without signal.</p>
        <div className="line"><span>Status</span><span style={{ fontWeight: 600 }}>{syncLine.text}</span></div>
        <button type="button" className="btn" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>{sync.state === 'syncing' ? 'Syncing' : 'Sync now'}</button>
        <button type="button" className="btn2" onClick={() => void signOut()}>Sign out of this device</button>
      </section>
      <section className="card" aria-labelledby="backup-h">
        <h2 className="h2" id="backup-h">Backups</h2>
        <p className="body">An extra copy you keep yourself, in Files or iCloud Drive. It includes photos and tickets. Importing one also brings data over from the old phone only version.</p>
        <div className="line"><span>Last backup</span><span style={{ fontWeight: 600 }}>{lastBackup ? longDate(lastBackup.slice(0, 10)) : 'Never'}</span></div>
        <button type="button" className="btn" onClick={doExport} disabled={busy}>{busy ? 'Preparing' : 'Export backup'}</button>
        <FileButton label="Import backup" accept="application/json,.json" onFile={doImport} />
      </section>
      <section className="card" aria-labelledby="phone-h">
        <h2 className="h2" id="phone-h">This device</h2>
        <p className="body">To install on iPhone, open this page in Safari, tap Share, then Add to Home Screen. It works offline except for syncing and link previews.</p>
        {sample && <p className="body">You are looking at sample data. Import your backup above, or edit each card here.</p>}
        <button
          type="button"
          className="btn2 btn-danger"
          style={{ borderColor: 'var(--rust)' }}
          onClick={async () => {
            if (!confirm('Erase this device and download everything again from your database? Your other devices keep their data.')) return;
            await syncNow().catch(() => {});
            const left = getSyncStatus().pending;
            if (left && !confirm(`${left} change${left === 1 ? ' has' : 's have'} not synced yet and will be lost. Erase anyway?`)) return;
            await resetDevice();
          }}
        >
          Erase this device and download again
        </button>
      </section>
    </div>
  );
}

const syncedLabel = (iso: string | null) => {
  if (!iso) return 'not synced yet';
  const local = new Date(iso);
  const day = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  return `synced ${day === todayISO() ? '' : shortDate(day) + ' '}${timeOfDate(iso)}`;
};

// Linked Google calendars. The secret address goes to the server once and is never shown again.
function CalendarsCard() {
  const toast = useToast();
  const [list, setList] = useState<LinkedCalendar[] | null>(null);
  const [problem, setProblem] = useState('');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [area, setArea] = useState<Area>('Social');
  const [busy, setBusy] = useState(''); // 'add', 'sync' or the id being removed

  useEffect(() => {
    let live = true;
    listCalendars()
      .then((c) => { if (live) { setList(c); setProblem(''); } })
      .catch((e) => { if (live) setProblem(navigator.onLine ? (e as Error).message : 'Calendars can be linked and checked while you are online.'); });
    return () => { live = false; };
  }, []);

  const add = async () => {
    if (!label.trim() || !url.trim()) { toast('Add a name and the secret address'); return; }
    setBusy('add');
    try {
      const r = await addCalendar({ label: label.trim(), url: url.trim(), area });
      setList(r.calendars);
      setLabel('');
      setUrl('');
      toast(`Linked ${label.trim()}, ${r.added.events} event${r.added.events === 1 ? '' : 's'}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (c: LinkedCalendar) => {
    if (!confirm(`Unlink ${c.label}? Its events leave the app on every device. Events you added by hand stay.`)) return;
    setBusy(c.id);
    try {
      setList(await removeCalendar(c.id));
      toast(`Unlinked ${c.label}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  const syncAll = async () => {
    setBusy('sync');
    try {
      const c = await syncCalendars(true);
      if (c) setList(c);
      const failed = c?.filter((x) => x.error).length ?? 0;
      toast(failed ? `${failed} calendar${failed === 1 ? '' : 's'} could not be synced` : 'Calendars synced');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="card full" aria-labelledby="cals-h">
      <div className="row"><h2 className="h2" id="cals-h">Calendars</h2><span className="sub">{list?.length ? `${list.length} linked` : ''}</span></div>
      <p className="body">Your Google calendars show on Home and on Social, on every device. Each one is linked with its secret address, which stays in your database and is never shown here again. They sync when the app opens or comes back to the front, at most every 15 minutes.</p>
      <div className="grid2">
        <div className="stack-s">
          <span className="lbl">Linked</span>
          {!list && !problem && <p className="empty">Checking your calendars</p>}
          {problem && <p className="empty">{problem}</p>}
          {list?.length === 0 && <p className="empty">No calendars linked yet. Add your personal one first, then work when you have it.</p>}
          <div>
            {list?.map((c) => (
              <div className="line" key={c.id}>
                <span className="line-main">
                  <span style={{ fontWeight: 600 }}>{c.label}</span>
                  <span className={c.error ? 'sub bad-text' : 'sub'}>
                    {c.error ?? `${c.events} event${c.events === 1 ? '' : 's'}, ${syncedLabel(c.lastSynced)}`}
                  </span>
                </span>
                <span className={areaClass(c.area)}>{c.area}</span>
                <button type="button" className="btn-text btn-danger" onClick={() => void remove(c)} disabled={busy === c.id} aria-label={`Unlink ${c.label}`}>Remove</button>
              </div>
            ))}
          </div>
          {!!list?.length && (
            <button type="button" className="btn2" style={{ marginTop: 'auto' }} onClick={() => void syncAll()} disabled={busy === 'sync'}>{busy === 'sync' ? 'Syncing calendars' : 'Sync calendars now'}</button>
          )}
        </div>
        <form className="stack-s" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <span className="lbl">Add a calendar</span>
          <div className="form-2">
            <div className="form-col">
              <label className="lbl" htmlFor="cal-label">Name</label>
              <input id="cal-label" className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Personal" maxLength={40} autoComplete="off" />
            </div>
            <div className="form-col">
              <label className="lbl" htmlFor="cal-area">Events count as</label>
              <select id="cal-area" className="field" value={area} onChange={(e) => setArea(e.target.value as Area)}>
                {CALENDAR_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="form-col">
            <label className="lbl" htmlFor="cal-url">Secret address in iCal format</label>
            <input id="cal-url" className="field" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/..." autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </div>
          <span className="sub">In Google Calendar on a computer, open Settings, pick the calendar under Settings for my calendars, choose Integrate calendar, and copy Secret address in iCal format.</span>
          <button type="submit" className="btn" disabled={busy === 'add' || !!problem}>{busy === 'add' ? 'Reading the calendar' : 'Add calendar'}</button>
        </form>
      </div>
    </section>
  );
}

export function BackupReminder() {
  const sync = useSyncStatus();
  const lastBackup = useMeta<string | null>('lastBackup', null);
  const seededAt = useMeta<string | null>('seededAt', null);
  const snoozed = useMeta<string | null>('backupSnoozedUntil', null);
  const today = todayISO();
  const since = lastBackup ?? seededAt;
  if (sync.state !== 'off') return null;
  if (!since || daysBetween(since.slice(0, 10), today) < REMIND_AFTER_DAYS) return null;
  if (snoozed && snoozed > today) return null;
  if (location.hash.startsWith('#/settings')) return null;
  return (
    <div className="card" role="status" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
      <span className="body" style={{ flex: '1 1 220px' }}>{lastBackup ? 'It has been a month since your last backup.' : 'You have not exported a backup yet.'} Your data is only on this device until a database is connected.</span>
      <a className="btn2" href={hrefFor('settings')}>Back up now</a>
      <button type="button" className="btn-text" onClick={() => {
        const d = new Date(); d.setDate(d.getDate() + 7);
        void setMeta('backupSnoozedUntil', d.toISOString().slice(0, 10));
      }}>Later</button>
    </div>
  );
}
