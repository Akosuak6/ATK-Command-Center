import { useState } from 'react';
import { exportBackup, importBackup, resetToSeed, setMeta, useMeta } from '../lib/db';
import { hrefFor } from '../lib/router';
import { daysBetween, longDate, todayISO } from '../lib/format';
import { Chips, FileButton, useToast } from '../components/ui';
import { getTheme, setTheme, type Theme } from '../lib/theme';

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
    if (!confirm('Importing replaces everything on this phone with the backup. Continue?')) return;
    try {
      await importBackup(await file.text());
      toast('Backup restored');
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
      <section className="card" aria-labelledby="backup-h">
        <h2 className="h2" id="backup-h">Backups</h2>
        <p className="body">Everything lives only on this phone. Export a backup about once a month and keep it in Files or iCloud Drive. It includes photos and tickets.</p>
        <div className="line"><span>Last backup</span><span style={{ fontWeight: 600 }}>{lastBackup ? longDate(lastBackup.slice(0, 10)) : 'Never'}</span></div>
        <button type="button" className="btn" onClick={doExport} disabled={busy}>{busy ? 'Preparing' : 'Export backup'}</button>
        <FileButton label="Import backup" accept="application/json,.json" onFile={doImport} />
      </section>
      <section className="card" aria-labelledby="phone-h">
        <h2 className="h2" id="phone-h">This phone</h2>
        <p className="body">To install, open this page in Safari, tap Share, then Add to Home Screen. It works offline except for syncing and link previews.</p>
        {sample && <p className="body">You are looking at sample data. Fill in src/data/seed.json with your real numbers before deploying, or edit each card here.</p>}
        <button
          type="button"
          className="btn2 btn-danger"
          style={{ borderColor: 'var(--rust)' }}
          onClick={() => { if (confirm('Erase everything on this phone and start again from the seed data? Export a backup first if you want to keep anything.')) void resetToSeed(); }}
        >
          Erase and start over
        </button>
      </section>
    </div>
  );
}

export function BackupReminder() {
  const lastBackup = useMeta<string | null>('lastBackup', null);
  const seededAt = useMeta<string | null>('seededAt', null);
  const snoozed = useMeta<string | null>('backupSnoozedUntil', null);
  const today = todayISO();
  const since = lastBackup ?? seededAt;
  if (!since || daysBetween(since.slice(0, 10), today) < REMIND_AFTER_DAYS) return null;
  if (snoozed && snoozed > today) return null;
  if (location.hash.startsWith('#/settings')) return null;
  return (
    <div className="card" role="status" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
      <span className="body" style={{ flex: '1 1 220px' }}>{lastBackup ? 'It has been a month since your last backup.' : 'You have not exported a backup yet.'} Your data lives only on this phone.</span>
      <a className="btn2" href={hrefFor('settings')}>Back up now</a>
      <button type="button" className="btn-text" onClick={() => {
        const d = new Date(); d.setDate(d.getDate() + 7);
        void setMeta('backupSnoozedUntil', d.toISOString().slice(0, 10));
      }}>Later</button>
    </div>
  );
}
