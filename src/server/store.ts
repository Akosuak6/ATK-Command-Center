import { neon } from '@neondatabase/serverless';

// The command center's rows in Postgres: Neon when DATABASE_URL is set (Vercel's Neon integration
// sets it), or PGlite, an in-process Postgres saved under private/pglite, while developing without one.
//
// One table holds every row of every store, as JSON, so the app's data shape can change without
// database migrations. `ts` is when the row was last edited on a device (last write wins);
// `seq` goes up on every change so devices can ask for "everything after seq N".

export type Row = Record<string, unknown>;
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;

const SCHEMA = [
  'create sequence if not exists cc_rows_seq',
  `create table if not exists cc_rows (
    tbl text not null,
    id text not null,
    data jsonb,
    deleted boolean not null default false,
    ts bigint not null,
    device text not null default '',
    seq bigint not null default nextval('cc_rows_seq'),
    primary key (tbl, id)
  )`,
  'create index if not exists cc_rows_seq_idx on cc_rows (seq)',
  'create table if not exists cc_login_failures (at timestamptz not null default now())',
  // Linked calendars. The address is a secret (anyone holding it can read the calendar), so it stays
  // here on the server: it is never synced to devices or sent back to the app, only the label is.
  `create table if not exists cc_calendars (
    id text primary key,
    label text not null,
    url text not null,
    area text not null,
    added timestamptz not null default now(),
    tried_at timestamptz,
    synced_at timestamptz,
    error text,
    events integer not null default 0
  )`
];

const g = globalThis as typeof globalThis & { __ccQuery?: Promise<Query | null> };

async function connect(): Promise<Query | null> {
  let q: Query | null = null;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const sql = neon(url);
    q = async (text, params = []) => (await sql.query(text, params)) as Row[];
  } else if (process.env.NODE_ENV === 'development') {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite('./private/pglite');
    await db.waitReady;
    q = async (text, params = []) => (await db.query<Row>(text, params)).rows;
  }
  if (!q) return null;
  for (const s of SCHEMA) await q(s);
  return q;
}

// One connection per server process (dev reloads modules, so it lives on globalThis).
export function db(): Promise<Query | null> {
  g.__ccQuery ??= connect().catch((e) => { g.__ccQuery = undefined; throw e; });
  return g.__ccQuery;
}

export interface Change { t: string; id: string; ts: number; data: unknown }
export interface PulledRow { t: string; id: string; ts: number; deleted: boolean; data: unknown; mine: boolean }

const MAX_PAGE_BYTES = 3_500_000; // Vercel answers up to 4.5MB

export async function pushChanges(q: Query, device: string, changes: Change[]) {
  const rows = changes.map((c) => ({ tbl: c.t, id: c.id, ts: Math.round(c.ts), deleted: c.data == null, data: c.data ?? null }));
  await q(
    `insert into cc_rows (tbl, id, data, deleted, ts, device)
     select x.tbl, x.id, x.data, x.deleted, x.ts, $2 from jsonb_to_recordset($1::jsonb) as x(tbl text, id text, data jsonb, deleted boolean, ts bigint)
     on conflict (tbl, id) do update
       set data = excluded.data, deleted = excluded.deleted, ts = excluded.ts, device = excluded.device, seq = nextval('cc_rows_seq')
       where cc_rows.ts <= excluded.ts`,
    [JSON.stringify(rows), device]
  );
}

// Rows changed after `after`, oldest first, in pages that fit one response.
// A device's own rows come back without their data, since it already has them.
export async function pullChanges(q: Query, device: string, after: number) {
  const sizes = await q(
    `select seq, octet_length(coalesce(data::text, '')) as size from cc_rows where seq > $1 order by seq limit 1000`,
    [after]
  );
  if (!sizes.length) return { rows: [] as PulledRow[], next: after, more: false };
  let total = 0;
  let last = Number(sizes[0].seq);
  for (const s of sizes) {
    total += Number(s.size);
    if (total > MAX_PAGE_BYTES && Number(s.seq) !== Number(sizes[0].seq)) break;
    last = Number(s.seq);
  }
  const rows = await q(
    `select tbl, id, ts, deleted, device = $3 as mine, case when device = $3 then null else data end as data
     from cc_rows where seq > $1 and seq <= $2 order by seq`,
    [after, last, device]
  );
  return {
    rows: rows.map((r) => ({ t: String(r.tbl), id: String(r.id), ts: Number(r.ts), deleted: !!r.deleted, mine: !!r.mine, data: r.data ?? null })),
    next: last,
    more: last !== Number(sizes[sizes.length - 1].seq) || sizes.length === 1000
  };
}

export async function recentLoginFailures(q: Query): Promise<number> {
  const r = await q(`select count(*) as n from cc_login_failures where at > now() - interval '15 minutes'`);
  return Number(r[0]?.n ?? 0);
}

export async function recordLoginFailure(q: Query) {
  await q('insert into cc_login_failures default values');
  await q(`delete from cc_login_failures where at < now() - interval '1 day'`);
}
