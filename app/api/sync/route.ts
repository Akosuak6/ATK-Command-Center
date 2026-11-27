import { guard } from '../../../src/server/auth';
import { db, pullChanges, pushChanges, type Change } from '../../../src/server/store';

// GET  /api/sync?after=SEQ&device=ID -> { rows, next, more }: what changed after SEQ
// POST /api/sync { device, changes: [{ t, id, ts, data }] } -> saves them (data null = deleted)

export const maxDuration = 30;

const NO_DB = { error: 'No database yet. Add Neon in the Vercel Storage tab.' };

export async function GET(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = await db();
  if (!q) return Response.json(NO_DB, { status: 503 });
  const url = new URL(request.url);
  const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
  const device = String(url.searchParams.get('device') || '').slice(0, 64);
  return Response.json(await pullChanges(q, device, after), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const denied = guard(request);
  if (denied) return denied;
  const q = await db();
  if (!q) return Response.json(NO_DB, { status: 503 });
  const body = (await request.json().catch(() => null)) as { device?: unknown; changes?: unknown } | null;
  if (!body || !Array.isArray(body.changes)) return Response.json({ error: 'send { device, changes }' }, { status: 400 });
  const seen = new Set<string>();
  const changes: Change[] = [];
  for (const c of body.changes as Partial<Change>[]) {
    if (typeof c?.t !== 'string' || typeof c.id !== 'string' || !Number.isFinite(c.ts)) continue;
    const k = `${c.t}\u0001${c.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    changes.push({ t: c.t, id: c.id, ts: Number(c.ts), data: c.data ?? null });
  }
  if (changes.length) await pushChanges(q, String(body.device ?? '').slice(0, 64), changes);
  return Response.json({ saved: changes.length }, { headers: { 'Cache-Control': 'no-store' } });
}
