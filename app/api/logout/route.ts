import { COOKIE } from '../../../src/server/auth';

// POST /api/logout -> clears the session cookie on this device.
export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return res;
}
