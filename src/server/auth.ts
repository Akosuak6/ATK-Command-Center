import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// One password, set as APP_PASSWORD in Vercel. Signing in sets a signed, httpOnly cookie that lasts a year.
// Without APP_PASSWORD, `npm run dev` needs no sign in, and a deployed site stays locked.

export const COOKIE = 'cc_session';
export const SESSION_DAYS = 365;

export const passwordSet = () => !!process.env.APP_PASSWORD;
export const lockedOut = () => !passwordSet() && process.env.NODE_ENV === 'production';

// Changing the password signs every device out, because the signing key comes from it.
function key(): string {
  return process.env.SESSION_SECRET || createHash('sha256').update(`cc-session:${process.env.APP_PASSWORD ?? ''}:${process.env.DATABASE_URL ?? ''}`).digest('hex');
}

const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url');

function same(a: string, b: string): boolean {
  const x = createHash('sha256').update(a).digest();
  const y = createHash('sha256').update(b).digest();
  return timingSafeEqual(x, y);
}

export function makeSession(): string {
  const body = `v1.${Date.now() + SESSION_DAYS * 86_400_000}`;
  return `${body}.${sign(body)}`;
}

export function validSession(token: string | undefined): boolean {
  if (!token) return false;
  const i = token.lastIndexOf('.');
  if (i < 0) return false;
  const body = token.slice(0, i);
  const [v, exp] = body.split('.');
  return v === 'v1' && Number(exp) > Date.now() && same(token.slice(i + 1), sign(body));
}

export const passwordMatches = (given: string) => passwordSet() && same(given, process.env.APP_PASSWORD!);

// Whether a request may see the app: always while developing without a password.
export function allowed(token: string | undefined): boolean {
  if (lockedOut()) return false;
  if (!passwordSet()) return true;
  return validSession(token);
}

export function cookieFrom(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

// For route handlers: the proxy already checks, this is the second lock on the door.
export function guard(request: Request): Response | null {
  if (allowed(cookieFrom(request.headers.get('cookie')))) return null;
  return Response.json({ error: lockedOut() ? 'locked' : 'signed-out' }, { status: 401 });
}
