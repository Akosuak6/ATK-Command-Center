import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, allowed, lockedOut } from './src/server/auth';

// Every page and API call needs a signed in session, except the sign in page itself and the files a
// phone fetches without cookies (icons, launch screens, the manifest and the service worker).
export function proxy(request: NextRequest) {
  if (allowed(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return Response.json({ error: lockedOut() ? 'locked' : 'signed-out' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|icons/|splash/|favicon\\.svg|manifest\\.webmanifest|sw\\.js|login|api/login).*)']
};
