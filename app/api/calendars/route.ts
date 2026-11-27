import { guard } from '../../../src/server/auth';
import { db } from '../../../src/server/store';
import { CalendarError, addCalendar, listCalendars, removeCalendar } from '../../../src/server/calendars';

// GET    /api/calendars              -> { calendars }: label, area and sync state only, never the address
// POST   /api/calendars { label, url, area } -> reads the calendar, saves it and its events
// DELETE /api/calendars?id=ID        -> unlinks it and removes its events (events added by hand stay)

export const maxDuration = 60;

const NO_DB = { error: 'No database yet. Add Neon in the Vercel Storage tab.' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = await db();
  if (!q) return json(NO_DB, 503);
  return json({ calendars: await listCalendars(q) });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = await db();
  if (!q) return json(NO_DB, 503);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'send { label, url, area }' }, 400);
  try {
    const added = await addCalendar(q, body);
    return json({ added, calendars: await listCalendars(q) });
  } catch (e) {
    if (e instanceof CalendarError) return json({ error: e.message }, 400);
    throw e;
  }
}

export async function DELETE(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = await db();
  if (!q) return json(NO_DB, 503);
  const id = String(new URL(request.url).searchParams.get('id') ?? '').slice(0, 32);
  const removed = id ? await removeCalendar(q, id) : false;
  if (!removed) return json({ error: 'That calendar is not linked' }, 404);
  return json({ calendars: await listCalendars(q) });
}
