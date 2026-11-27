import { useEffect, useState } from 'react';
import { shortDate, timeOfDate, todayISO } from '../lib/format';
import { useSyncStatus, type SyncStatus } from '../lib/sync';

export function syncText(s: SyncStatus): { text: string; dot: '' | 'off' | 'warn' | 'bad' } {
  const when = (iso: string) => `${iso.slice(0, 10) === todayISO() ? '' : `${shortDate(iso.slice(0, 10))} `}${timeOfDate(iso)}`;
  const waiting = s.pending ? `, ${s.pending} change${s.pending === 1 ? '' : 's'} waiting` : '';
  switch (s.state) {
    case 'syncing': return { text: 'Syncing', dot: '' };
    case 'synced': return { text: s.pending ? `Saving ${s.pending} change${s.pending === 1 ? '' : 's'}` : `Synced ${when(s.lastSynced ?? new Date().toISOString())}`, dot: '' };
    case 'offline': return { text: `Offline, saved on this device${waiting}`, dot: 'warn' };
    case 'signed-out': return { text: 'Signed out, sign in to sync', dot: 'bad' };
    case 'off': return { text: 'Saved on this device, no database yet', dot: 'off' };
    case 'error': return { text: `Sync paused, will retry${waiting}`, dot: 'warn' };
    default: return { text: s.lastSynced ? `Synced ${when(s.lastSynced)}` : 'Starting', dot: 'off' };
  }
}

// The sidebar line: Synced 9:41, Offline, Signed out...
export function SyncLine() {
  const s = useSyncStatus();
  // Re-render each minute so "Synced 9:41" stays honest after midnight.
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 60_000); return () => window.clearInterval(t); }, []);
  const { text, dot } = syncText(s);
  if (s.state === 'signed-out') return <a className="status-line" href="/login"><span className={`dot ${dot}`} />{text}</a>;
  return <span className="status-line"><span className={`dot ${dot}`} />{text}</span>;
}
