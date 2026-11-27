import { createHash } from 'node:crypto';
import ICAL from 'ical.js';
import type { Area, CalendarEvent } from '../lib/types';

// Turns one calendar file (iCal, as Google's secret address serves it) into the app's CalendarEvent rows:
// recurring events expanded from 30 days back to 400 days ahead, times shown in New York time,
// all day events kept as all day, moved and cancelled occurrences of a series respected.

export const HOME_ZONE = 'America/New_York';
export const DAYS_BACK = 30;
export const DAYS_AHEAD = 400;
const MAX_EVENTS = 8000; // a guard against runaway series; a busy work calendar is about 2000
const MAX_STEPS = 50_000; // occurrences walked per series, counted from its first date

type Time = InstanceType<typeof ICAL.Time>;
type Component = InstanceType<typeof ICAL.Component>;
type Event = InstanceType<typeof ICAL.Event>;

export const ALL_DAY = 'All day';

// Every event from a linked calendar has an id starting with this, so a resync replaces only that
// calendar's events and leaves events added by hand (and other calendars) alone.
export const calendarPrefix = (calendarId: string) => `ical-${calendarId}-`;

export class CalendarFileError extends Error {}

const pad = (n: number) => String(n).padStart(2, '0');

const homeParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: HOME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

// An instant as the date and time on a New York clock.
function inHome(ms: number): { date: string; time: string } {
  const p = Object.fromEntries(homeParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

export const homeToday = (now = Date.now()) => inHome(now).date;

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const zoneOk = new Map<string, boolean>();
function knownZone(tzid: string): boolean {
  if (!zoneOk.has(tzid)) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: tzid }); zoneOk.set(tzid, true); } catch { zoneOk.set(tzid, false); }
  }
  return zoneOk.get(tzid)!;
}

// How far a zone is from UTC at an instant, in ms.
function zoneOffset(tzid: string, ms: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tzid, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23'
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// A wall clock time in a named zone (one the file did not define) as an instant.
function fromZone(t: Time, tzid: string): number {
  const wall = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  const first = wall - zoneOffset(tzid, wall);
  const second = wall - zoneOffset(tzid, first);
  return second;
}

type When = { allDay: true; date: string } | { allDay: false; ms: number } | { allDay: false; floating: { date: string; time: string } };

// tzid is the TZID written on the property, used when the file names a zone it does not define.
function when(t: Time, tzid: string | null): When {
  if (t.isDate) return { allDay: true, date: `${t.year}-${pad(t.month)}-${pad(t.day)}` };
  if (t.zone === ICAL.Timezone.utcTimezone || (t.zone && t.zone !== ICAL.Timezone.localTimezone)) return { allDay: false, ms: t.toUnixTime() * 1000 };
  if (tzid && knownZone(tzid)) return { allDay: false, ms: fromZone(t, tzid) };
  // Floating time (no zone at all): it means the same clock time wherever you are, so New York.
  return { allDay: false, floating: { date: `${t.year}-${pad(t.month)}-${pad(t.day)}`, time: `${pad(t.hour)}:${pad(t.minute)}` } };
}

const tzidOf = (c: Component, name: string): string | null => {
  const v = c.getFirstProperty(name)?.getParameter('tzid');
  return typeof v === 'string' ? v : null;
};

const shortHash = (s: string) => createHash('sha1').update(s).digest('base64url').slice(0, 16);

interface Built extends CalendarEvent { sortKey: string }

function build(cal: { id: string; area: Area }, key: string, item: Event, start: Time, end: Time | null, repeats = false): Built {
  const c = item.component;
  const title = (item.summary || '').replace(/\s+/g, ' ').trim().slice(0, 200) || 'No title';
  const s = when(start, tzidOf(c, 'dtstart'));
  let date: string;
  let time: string;
  let last: string | undefined;
  if (s.allDay) {
    date = s.date;
    time = ALL_DAY;
    // DTEND on an all day event is the day after it ends.
    const e = end ? when(end, null) : null;
    if (e?.allDay) {
      const through = addDaysISO(e.date, -1);
      if (through > date) last = through;
    }
  } else {
    const startAt = 'ms' in s ? inHome(s.ms) : s.floating;
    date = startAt.date;
    time = startAt.time;
    // A timed event only spans days when it lasts a day or more (a dinner that ends after midnight does not).
    const e = end ? when(end, tzidOf(c, 'dtend') ?? tzidOf(c, 'dtstart')) : null;
    if (e && !e.allDay && 'ms' in s && 'ms' in e && e.ms - s.ms >= 86_400_000) {
      const through = inHome(e.ms - 60_000).date;
      if (through > date) last = through;
    }
  }
  const row: Built = { id: calendarPrefix(cal.id) + shortHash(key), date, time, title, area: cal.area, cal: cal.id, sortKey: `${date} ${time === ALL_DAY ? '00:00' : time}` };
  if (last) row.end = last;
  if (repeats) row.repeats = true;
  return row;
}

const cancelled = (c: Component) => String(c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED';

// Google writes the calendar's own address as its name; an event that address declined is left out.
function declinedBy(c: Component, owner: string | null): boolean {
  if (!owner) return false;
  return c.getAllProperties('attendee').some((p) => {
    const v = String(p.getFirstValue() ?? '').replace(/^mailto:/i, '').toLowerCase();
    return v === owner && String(p.getParameter('partstat') ?? '').toUpperCase() === 'DECLINED';
  });
}

export function parseCalendar(text: string, cal: { id: string; area: Area }, now = Date.now()): CalendarEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new CalendarFileError('That address did not return a calendar file');
  let root: Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw new CalendarFileError('The calendar file could not be read');
  }
  const name = String(root.getFirstPropertyValue('x-wr-calname') ?? '').trim().toLowerCase();
  const owner = name.includes('@') ? name : null;

  const today = homeToday(now);
  const from = addDaysISO(today, -DAYS_BACK);
  const to = addDaysISO(today, DAYS_AHEAD);

  // Group by UID: the series itself, then its changed or cancelled occurrences (RECURRENCE-ID).
  const groups = new Map<string, { masters: Component[]; exceptions: Component[] }>();
  root.getAllSubcomponents('vevent').forEach((v, i) => {
    const uid = String(v.getFirstPropertyValue('uid') ?? '') || `no-uid-${i}`;
    const g = groups.get(uid) ?? { masters: [], exceptions: [] };
    (v.hasProperty('recurrence-id') ? g.exceptions : g.masters).push(v);
    groups.set(uid, g);
  });

  const out = new Map<string, Built>();
  const keep = (row: Built) => {
    if (row.date > to || (row.end ?? row.date) < from) return;
    if (!out.has(row.id)) out.set(row.id, row);
  };
  const single = (uid: string, key: string, c: Component) => {
    if (cancelled(c) || declinedBy(c, owner)) return;
    const e = new ICAL.Event(c);
    if (!e.startDate) return;
    keep(build(cal, `${uid}|${key}`, e, e.startDate, c.hasProperty('dtend') || c.hasProperty('duration') ? e.endDate : null));
  };

  for (const [uid, g] of groups) {
    g.masters.forEach((master, mi) => {
      const tag = mi ? `#${mi}` : '';
      const event = new ICAL.Event(master, { exceptions: mi === 0 ? g.exceptions : [] });
      if (!event.startDate) return;
      if (!event.isRecurring()) { single(uid, `once${tag}`, master); return; }
      if (cancelled(master) || declinedBy(master, owner)) return;
      const used = new Set<string>();
      const it = event.iterator();
      // Moved occurrences can land a little outside their original date, so walk a day past the window.
      const stop = addDaysISO(to, 1);
      for (let n = 0, next = it.next(); next && n < MAX_STEPS; n++, next = it.next()) {
        const day = `${next.year}-${pad(next.month)}-${pad(next.day)}`;
        if (day > stop) break;
        const rid = next.toString();
        const d = event.getOccurrenceDetails(next);
        const item = d.item;
        if (item !== event) used.add(item.recurrenceId?.toString() ?? rid);
        const ac = item.component;
        if (cancelled(ac) || declinedBy(ac, owner)) continue;
        keep(build(cal, `${uid}|${rid}${tag}`, item, d.startDate, d.endDate, true));
      }
      // Changed occurrences the series no longer produces still happen; keep them on their own.
      if (mi === 0) {
        for (const x of g.exceptions) {
          const rid = x.getFirstPropertyValue('recurrence-id');
          const key = rid ? String(rid.toString()) : '';
          if (!used.has(key)) single(uid, `x|${key}`, x);
        }
      }
    });
    // Occurrences shared without their series (an invite to one meeting of a series).
    if (!g.masters.length) for (const x of g.exceptions) single(uid, `x|${String(x.getFirstPropertyValue('recurrence-id')?.toString() ?? '')}`, x);
  }

  return [...out.values()]
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .slice(0, MAX_EVENTS)
    .map(({ sortKey: _s, ...row }) => row);
}
