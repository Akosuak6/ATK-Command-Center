# Akosua's command center

A private app for day, money, health, social life and learning. Next.js 16 (App Router) on Vercel, with Neon Postgres keeping the laptop and phone in sync. Each device also keeps a full copy in IndexedDB, so it opens instantly and works without signal.

See `BUILD_BRIEF.md` for the full plan and `mockup-reference.html` for the approved design.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000, also on your Wi-Fi network for the phone
npm run build      # production build
npm run start      # serve the build (the service worker and offline mode work here)
```

Without `DATABASE_URL`, `npm run dev` stores synced rows in PGlite (Postgres in the dev server, saved in `private/pglite`), so sync can be tested between two browsers: `localhost:3000` and `127.0.0.1:3000` count as separate devices. Without `APP_PASSWORD`, `npm run dev` needs no sign in.

## Settings in Vercel (Environment Variables)

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | Set for you when Neon is added in the Vercel Storage tab. |
| `APP_PASSWORD` | The one password for signing in. Required: a deploy without it stays locked. Changing it signs every device out. |
| `ANTHROPIC_API_KEY` | Optional. Lets the Bookshelf read the books in a TikTok. |
| `HEVY_API_KEY` | Optional. Hevy workouts without pasting the key on each device. |
| `SESSION_SECRET` | Optional. Signs the sign in cookie; made from the password and database address when unset. |

## Deploy (Vercel)

1. Push this repo to GitHub, then in Vercel: Add New, Project, import it. The framework is detected as Next.js. Set the production branch in Settings, Git.
2. Storage tab: add Neon and connect it to the project (this sets `DATABASE_URL`).
3. Settings, Environment Variables: add `APP_PASSWORD` (and the optional ones), then redeploy.
4. Load your data once: run `npm run make-import` on the laptop, open the site, sign in, then Settings, Import backup, and pick `private/import-backup.json`. It syncs to Neon from there.
5. On the iPhone: open the site in Safari, sign in, tap Share, then Add to Home Screen.

## How sync works

- Every write on a device marks that row as changed (kept in localStorage, so closing the app loses nothing).
- A sync sends the changed rows to `/api/sync`, then downloads what other devices changed since last time. It runs on open, when the app comes back to the front, when the connection returns, a moment after each edit, and every minute while open.
- In Neon every row of every store lives in one table, `cc_rows` (store, id, data as JSON, edit time, a running change number). When the same row was edited in two places, the most recent edit wins.
- A new device shows "Downloading your data" until its first sync finishes.

## Your real data

The repo is public, so real data never goes in `src/data/seed.json` (it only has placeholders). Your real tables are in `private/seed-overlay.json` (gitignored). `npm run make-import` merges the two into `private/import-backup.json` to import once, as above. After that, Neon holds everything.

## Structure

- `app/` routes: the app page, `login`, `api/*` route handlers, the manifest
- `proxy.ts` sends anyone not signed in to the sign in page (API calls get a 401)
- `src/Shell.tsx` starts the database, sync and daily history, and registers `public/sw.js`
- `src/lib/db.ts` Dexie stores, backup export and import
- `src/lib/sync.ts` the device side of sync; `src/server/store.ts` the Neon side
- `src/server/handlers/*` link previews, image and logo copies, book lookup, TikTok book lists, Hevy; run through `src/server/adapter.ts`
- `src/lib/router.ts` sections, subpages and hash routes (`#/money/trips/ethiopia-2027`), so moving around needs no server
- `src/pages/*` one file per section (plain components; the empty root `pages/` folder keeps Next.js from treating them as routes)
- `scripts/make-icons.mjs` renders the home screen icons and iPhone splash screens; `scripts/make-import.mjs` builds the import file
