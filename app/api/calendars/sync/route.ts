import { guard } from '../../../../src/server/auth';
import { db } from '../../../../src/server/store';
import { listCalendars, syncCalendars } from '../../../../src/server/calendars';

// POST /api/calendars/sync { force? } -> syncs each linked calendar not tried in the last 15 minutes
// (every one when force is true), then answers { synced, failed, checked, calendars }.
// The events land in the normal sync, so the device pulls them with its next /api/sync.

export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = await db();
  if (!q) return Response.json({ error: 'No database yet. Add Neon in the Vercel Storage tab.' }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { force?: unknown };
  const result = await syncCalendars(q, body?.force === true);
  return Response.json({ ...result, calendars: await listCalendars(q) }, { headers: { 'Cache-Control': 'no-store' } });
}
