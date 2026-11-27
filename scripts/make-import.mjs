// npm run make-import
// Builds private/import-backup.json from src/data/seed.json plus your real data in
// private/seed-overlay.json (any table in the overlay replaces the seed's, and meta is merged).
// Import that file once in Settings, Backups, Import backup on the deployed site: it saves to the
// device and syncs to Neon, and every other device downloads it from there.
// private/ is never committed, so your data stays out of the public repo.
//
// Usage: node scripts/make-import.mjs [overlay path] [output path]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const overlayPath = process.argv[2] || 'private/seed-overlay.json';
const outPath = process.argv[3] || 'private/import-backup.json';

const seed = JSON.parse(readFileSync('src/data/seed.json', 'utf8'));
if (!existsSync(overlayPath)) {
  console.error(`No overlay at ${overlayPath}. Pass its path: node scripts/make-import.mjs path/to/seed-overlay.json`);
  process.exit(1);
}
const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));

const data = { ...seed };
for (const [k, v] of Object.entries(overlay)) {
  if (k === 'meta') data.meta = { ...seed.meta, ...v };
  else if (k !== 'patches' && !k.startsWith('_')) data[k] = v;
}

// Seed dates can be written as @day-3 or @day+2, meaning days from today.
const today = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const resolve = (v) => {
  if (typeof v === 'string') {
    const m = /^@day([+-]\d+)$/.exec(v);
    if (!m) return v;
    const d = new Date(today);
    d.setDate(d.getDate() + Number(m[1]));
    return iso(d);
  }
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
  return v;
};

const out = { app: 'akosua-command-center', version: 1, exportedAt: new Date().toISOString() };
const counts = [];
for (const [name, rows] of Object.entries(resolve(data))) {
  if (name.startsWith('_') || name === 'patches') continue;
  if (name === 'meta') {
    out.meta = [...Object.entries(rows).map(([key, value]) => ({ key, value })), { key: 'seededAt', value: new Date().toISOString() }];
    counts.push(`meta ${out.meta.length}`);
  } else if (Array.isArray(rows)) {
    out[name] = rows;
    counts.push(`${name} ${rows.length}`);
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out));
console.log(`Wrote ${outPath} (${Math.round(JSON.stringify(out).length / 1024)} KB)`);
console.log(counts.join(', '));
