const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}

export function money(n: number): string {
  const v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
}

export function shortDate(iso?: string): string {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function longDate(iso: string): string {
  const d = parseISO(iso);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function monthYear(iso: string): string {
  const d = parseISO(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthName(d = new Date()): string {
  return d.toLocaleString('en-US', { month: 'long' });
}

export function monthShort(iso: string): string {
  return MONTHS[parseISO(iso).getMonth()];
}

export function weekday(iso: string): string {
  return DAYS[parseISO(iso).getDay()];
}

export function weekdayShort(iso: string): string {
  return DAYS[parseISO(iso).getDay()].slice(0, 3);
}

export function bannerDate(d = new Date()): string {
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function sameMonth(iso: string, ref = todayISO()): boolean {
  return iso.slice(0, 7) === ref.slice(0, 7);
}

export function daysLeftInMonth(d = new Date()): number {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return last - d.getDate() + 1;
}

export function monthsUntil(iso: string, from = todayISO()): number {
  const a = parseISO(from);
  const b = parseISO(iso);
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

// "19:00" -> "7:00"
export function clock12(hhmm: string): string {
  if (!/^\d{1,2}:\d{2}/.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)}`;
}

export function clock12ampm(hhmm: string): string {
  if (!/^\d{1,2}:\d{2}/.test(hhmm)) return hhmm;
  const h = Number(hhmm.split(':')[0]);
  return `${clock12(hhmm)} ${h < 12 ? 'AM' : 'PM'}`;
}

export function timeOfDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return clock12ampm(`${d.getHours()}:${pad(d.getMinutes())}`);
}

export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

export function gapLabel(days: number): string {
  if (days < 1) return 'Today';
  if (days < 14) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 56) return `${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'}`;
}

export function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return 'Link';
  }
}

// Fallback title when no title and no preview: a cleaned up URL path.
export function titleFromUrl(u: string): string {
  try {
    let p = new URL(u).pathname.split('/').filter(Boolean).pop() || '';
    p = decodeURIComponent(p).replace(/\.\w+$/, '').replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^[0-9a-f\s]{8,}$/i.test(p) || /^\d+$/.test(p)) p = '';
    return p ? p.charAt(0).toUpperCase() + p.slice(1) : hostOf(u);
  } catch {
    return u || 'Untitled';
  }
}

export function normalizeUrl(u: string): string {
  const t = u.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const pct = (a: number, b: number) => (b ? clamp(Math.round((a / b) * 100), 0, 100) : 0);
