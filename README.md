# Akosua's command center

A private PWA for day, money, health, social life and learning. Everything is stored on the phone in IndexedDB. There is no account, login or server database.

See `BUILD_BRIEF.md` for the full plan and `mockup-reference.html` for the approved design.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173, also on your Wi-Fi network for testing on the phone
npm run build      # production build in dist/
npm run preview    # serve the build (service worker and offline mode work here)
```

## Your real data

`src/data/seed.json` is loaded once, on the very first launch on a device. It holds placeholder values from the mockup. Before deploying, replace them with your real budget, savings goals, trips, routines, books, restaurants and so on, and set `meta.sampleData` to `false` (that removes the "Sample data" label in the banner).

Dates can be ISO (`2027-04-10`) or relative to the first launch (`@day-3`, `@day+2`).

After the first launch, the seed is never read again. Edit things in the app (every card has an Edit link), or use Settings, Erase and start over, to reload the seed.

## Deploy (Vercel)

1. Push this repo to GitHub and import it in Vercel. Framework preset: Vite. Build command `npm run build`, output `dist`.
2. Open the URL on the iPhone in Safari, tap Share, then Add to Home Screen.

Netlify works the same way (build `npm run build`, publish `dist`).

## Link previews and covers

`api/preview.js` reads a link's title and cover image, and `api/image.js` downloads the cover so the phone keeps its own copy (it still shows offline). Vercel runs both automatically from the `api/` folder. Without them, links still save, titled from the URL, and you can add a cover by hand with Edit.

## Backups

Data lives only on the phone, so use Settings, Export backup about once a month. The app reminds you after 30 days. Import backup restores everything, including photos and tickets.

## Structure

- `src/lib/db.ts` Dexie database, stores, seed loading, backup export and import
- `src/lib/calc.ts` afford check, trip planner, recovery estimate, goal progress, life area scores
- `src/lib/router.ts` sections, subpages and hash routes (`#/money/trips/lisbon`)
- `src/pages/*` one file per section
- `src/components/ListEditor.tsx` the edit sheet used by every editable list
- `scripts/make-icons.mjs` renders the home screen icons and iPhone splash screens

## Phases

1. App shell, pages, manual entry, PWA, IndexedDB with seed data. Done.
2. Rocket Money CSV import, category mapping, live budget, afford check and trip trims from real spending.
3. Morning sync and Send to Dump Shortcuts (`SHORTCUTS.md`), link preview function at `api/preview`.
4. Trend history and period comparisons, accessibility pass.

Already in from later phases: global search, backup export and import with a monthly reminder. The trend cards show placeholder numbers from the seed until phase 4.
