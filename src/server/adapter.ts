import { guard } from './auth';

// Runs the original Vercel style functions in src/server/handlers (written as handler(req, res))
// as App Router route handlers, so they did not need rewriting.

type LegacyReq = { method: string; url: string; headers: Record<string, string>; query: Record<string, string>; body: unknown; socket: { remoteAddress: string } };
type LegacyHandler = (req: LegacyReq, res: LegacyRes) => unknown;

interface LegacyRes {
  statusCode: number;
  headersSent: boolean;
  status(code: number): LegacyRes;
  setHeader(name: string, value: string | number): LegacyRes;
  getHeader(name: string): string | null;
  json(body: unknown): LegacyRes;
  send(body: unknown): LegacyRes;
  end(body?: unknown): LegacyRes;
}

export function route(handler: LegacyHandler) {
  return async (request: Request): Promise<Response> => {
    const denied = guard(request);
    if (denied) return denied;
    const url = new URL(request.url);
    let body: unknown;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text();
      try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
    }
    const req: LegacyReq = {
      method: request.method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(request.headers),
      query: Object.fromEntries(url.searchParams),
      body,
      socket: { remoteAddress: '' }
    };
    const headers = new Headers();
    let payload: BodyInit | null = null;
    const res: LegacyRes = {
      statusCode: 200,
      headersSent: false,
      status(code) { res.statusCode = code; return res; },
      setHeader(name, value) { headers.set(name, String(value)); return res; },
      getHeader(name) { return headers.get(name); },
      json(b) { headers.set('content-type', 'application/json'); payload = JSON.stringify(b); res.headersSent = true; return res; },
      send(b) {
        payload = typeof b === 'string' ? b : b instanceof Uint8Array ? new Uint8Array(b) : JSON.stringify(b);
        res.headersSent = true;
        return res;
      },
      end(b) { if (b !== undefined) res.send(b); res.headersSent = true; return res; }
    };
    try {
      await handler(req, res);
    } catch {
      return Response.json({ error: 'function failed' }, { status: 500 });
    }
    // Answers depend on a signed in session now, so only this browser may keep a copy.
    const cache = headers.get('cache-control');
    if (cache) headers.set('cache-control', cache.replace(/\bpublic\b/, 'private'));
    return new Response(payload, { status: res.statusCode, headers });
  };
}
