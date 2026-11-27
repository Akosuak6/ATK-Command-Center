import { COOKIE, SESSION_DAYS, lockedOut, makeSession, passwordMatches, passwordSet } from '../../../src/server/auth';
import { db, recentLoginFailures, recordLoginFailure } from '../../../src/server/store';

// POST /api/login { password } -> sets the session cookie.
// After 10 wrong passwords in 15 minutes, sign in pauses for 15 minutes.

const g = globalThis as typeof globalThis & { __ccFails?: number[] };
const fifteen = 15 * 60 * 1000;

async function failures(): Promise<number> {
  const q = await db().catch(() => null);
  if (q) return recentLoginFailures(q);
  g.__ccFails = (g.__ccFails ?? []).filter((t) => t > Date.now() - fifteen);
  return g.__ccFails.length;
}

async function fail() {
  const q = await db().catch(() => null);
  if (q) await recordLoginFailure(q);
  else (g.__ccFails ??= []).push(Date.now());
}

export async function POST(request: Request) {
  if (lockedOut()) return Response.json({ error: 'This site has no password yet. Add APP_PASSWORD in Vercel, then redeploy.' }, { status: 503 });
  if (passwordSet()) {
    if ((await failures()) >= 10) return Response.json({ error: 'Too many tries. Wait 15 minutes, then try again.' }, { status: 429 });
    const body = (await request.json().catch(() => ({}))) as { password?: unknown };
    if (!passwordMatches(String(body.password ?? ''))) {
      await fail();
      await new Promise((r) => setTimeout(r, 400));
      return Response.json({ error: 'That password is not right' }, { status: 401 });
    }
  }
  const res = Response.json({ ok: true });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.headers.append('Set-Cookie', `${COOKIE}=${makeSession()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure}`);
  return res;
}
