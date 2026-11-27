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

## Feed

Dump, Feed pulls this week's stories on your own keywords, healthcare (digital health, femtech, women's health, mental health, Medicaid, Medicare, health services, healthcare with AI and with consumers) and fashion (trend forecasting, fashion with technology, AI and consumers).

- The scraper is its own program in `scraper/` (see `scraper/README.md`). It has no dependencies and no AI in it, so sites that block AI crawlers still answer. It runs on your laptop, and `api/feed.js` runs the same code on the app's server when the phone refreshes.
- It reads about 40 public RSS feeds and Google News searches, tags each story with topics and your keywords, drops repeats, shopping lists and horoscopes, and ranks the rest by recency and fit. The sources are in `scraper/lib/sources.js` and the topic words in `scraper/lib/topics.js`.
- Your keywords: type them in the box at the top of the feed. Each one is matched against every story from every source and gets its own news search. Tap a keyword to see only its stories.
- WGSN, The Business of Fashion and Vogue Business have no open feeds, so they come in through Google News searches.
- LinkedIn has no feeds and its terms forbid scraping, so the app never logs in to it. Paste a post into the box at the top of the feed and it is tagged and kept. Two Google News searches also pick up public LinkedIn articles that Google has indexed.
- Sources and topics (on the feed) turns topics and sources on or off, shows which sources answered on the last refresh, and adds your own: any Substack, newsletter or site with a feed (Find feed locates it), or any Google News search.
- Save to Dump copies a story into Everything with its cover.

The same scraper runs on its own from the command line:

```bash
npm run feed                                   # top stories for every topic
npm run feed -- --keywords "quiet luxury, Oura"  # your keywords first
npm run feed -- --html feed.html --every 60    # a page for any browser, refreshed hourly
npm run feed -- --check                        # which sources answered
npm test                                       # reader, tagging, keyword and ranking tests
```

`npm run dev` and `npm run preview` serve the functions in `api/` too, so the feed and link previews work on the laptop before deploying.

## Backups

Data lives only on the phone, so use Settings, Export backup about once a month. The app reminds you after 30 days. Import backup restores everything, including photos and tickets.

## Structure

- `src/lib/db.ts` Dexie database, stores, seed loading, backup export and import
- `src/lib/calc.ts` afford check, trip planner, recovery estimate, goal progress, life area scores
- `src/lib/router.ts` sections, subpages and hash routes (`#/money/trips/lisbon`)
- `src/pages/*` one file per section
- `src/components/ListEditor.tsx` the edit sheet used by every editable list
- `scripts/make-icons.mjs` renders the home screen icons and iPhone splash screens
- `scraper/` the feed scraper, a standalone program (RSS and Atom parsing, topics, keywords, sources, ranking), also used by `api/feed.js` and the app
- `src/lib/feed.ts` and `src/pages/Feed.tsx` the feed on the phone

## Phases

1. App shell, pages, manual entry, PWA, IndexedDB with seed data. Done.
2. Rocket Money CSV import, category mapping, live budget, afford check and trip trims from real spending.
3. Morning sync and Send to Dump Shortcuts (`SHORTCUTS.md`), link preview function at `api/preview`.
4. Trend history and period comparisons, accessibility pass.

Already in from later phases: global search, backup export and import with a monthly reminder. The trend cards show placeholder numbers from the seed until phase 4.
