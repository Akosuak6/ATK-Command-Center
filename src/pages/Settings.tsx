import { useState } from 'react';
import { exportBackup, importBackup, setMeta, useMeta } from '../lib/db';
import { getSyncStatus, resetDevice, signOut, syncNow, useSyncStatus } from '../lib/sync';
import { syncText } from '../components/SyncStatus';
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
