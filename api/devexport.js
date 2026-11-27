// POST /api/devexport  (laptop only, while `npm run dev` runs)
// Saves rows sent from a browser on this laptop to private/pane-export.json, so changes made in one
// browser can be copied into the private data file for every device. Until the app has real sync,
// this is how data entered in one browser reaches the others.
// It refuses anything not from this machine, and does nothing on a deployed server.
import { mkdirSync, writeFileSync } from 'node:fs';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export default async function handler(req, res) {
  if (process.env.VERCEL || process.env.RENDER || process.env.NODE_ENV === 'production') return res.status(404).end();
  if (!LOOPBACK.has(req.socket?.remoteAddress ?? '')) return res.status(403).end('laptop only');
  if (req.method !== 'POST') return res.status(405).end();
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 50 * 1024 * 1024) return res.status(413).end('too large');
    chunks.push(c);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return res.status(400).end('bad json'); }
  mkdirSync('private', { recursive: true });
  writeFileSync('private/pane-export.json', JSON.stringify(body, null, 2));
  return res.status(200).json({ saved: true, bytes: size });
}
