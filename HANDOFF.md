# Handoff: where the command center stands

Read this, then `BUILD_BRIEF.md`, `README.md` and `mockup-reference.html`, before changing anything.

## What is built

Phases 1 to 3 of the brief are done, plus parts of 4. Since Nov 27, 2026 it is a Next.js 16 App Router app for Vercel with Neon Postgres sync and one password sign in (branch `claude/nextjs-vercel-neon`, cut from `claude/life-command-center-46qqa6`). `README.md` covers running, deploying and how sync works.

- Shell: sidebar on laptop, tab bar on phone, cover banner (slim outside Home), subpage tabs, swipeable trend cards on phone, global search, Settings with backup export, import and a monthly reminder.
- Home: flip clock, arch tiles, priorities, calendar, recently dumped (with covers), goals and life areas.
- Dump: paste any link (YouTube and Pinterest get covers, YouTube plays in the card), watchlist for films and shows, bookshelf that looks up a book from a link or title (cover, author, price, where to buy, short version).
- Money: Rocket Money import (CSV or .xlsx), category mapping, payee rules and a Needs a look queue for Venmo and Zelle, transfers to own accounts and investments left out of spending, savings first budget, fixed bills (rent), employer credits on categories, grouped accounts and net worth, savings order with paycheck deductions (401k), goal projection charts with growth, Coast FIRE card and chart, trip planner with travel year summary and optional card points.
- Health: today (recovery, rings, today's call), classes as a photo grid with studio tallies and logos (from studio websites), routines with day by day skincare and a facial buffer, supplements, habits with daily counts (water bottles), wishlist.
- Feed (Dump, Feed, Nov 28, 2026): your keywords (box at the top; each is matched against every story and gets its own Google News search), plus healthcare and fashion stories from about 40 public RSS feeds and Google News searches, tagged by topic, with views (For you, Your keywords, Healthcare, Fashion, AI, Consumers, LinkedIn, Saved), topic chips, Top or Newest, Save to Dump, Hide, pasted LinkedIn posts, and a Sources and topics sheet. Pulled stories stay on each device in their own Dexie database (`akosua-command-center-feed`, in `src/lib/feed.ts`); keywords and settings (meta `feedSettings`), hidden ids (meta `feedHidden`), pasted posts (`feedPosts`, Dexie version 2) and saves (the Dump, matched by link) sync. The scraper is the standalone program in `scraper/` (`npm run feed`, `npm test`); `src/server/handlers/feed.js` wraps it at `/api/feed`. LinkedIn is never scraped. The feed addresses could not be checked from the build sandbox: run `npm run feed -- --check` and fix or drop any source that does not answer.
- Social: vision board (trip tiles with cover photos, photo and link pins, restaurants grid, seasonal shows and tickets, intention), people and plans.
- Route handlers in `app/api/`: `sync`, `login`, `logout`, plus the original functions in `src/server/handlers/` run through `src/server/adapter.ts`: `preview` (title and cover, oEmbed for YouTube, Pinterest and TikTok), `image` (image copy so covers are stored on the device), `book`, `booklist` (Claude reads the books in a TikTok), `logo`, `hevy`, `feed` (runs the scraper in `scraper/`). `_safe.js` blocks private addresses. Every route checks the session too, not only `proxy.ts`.
- Calendars (Nov 27, 2026): Google calendars linked in Settings by their secret iCal address, as many as wanted (personal now, work once that account exists). `app/api/calendars` and `app/api/calendars/sync`; the addresses stay in Neon (`cc_calendars`), the events reach devices through the normal sync as `calendar` rows with ids `ical-<calendar>-...`. Home Today and Priorities, Social Plans this week and Health's call read them. README, Calendars, has the details.

Not built yet: Morning sync and Send to Dump iOS Shortcuts with `SHORTCUTS.md` (hash import `#sync=` and `#dump=`), real trend history for the trend cards (they still show seed placeholders), the Work page (the owner started a new job on Nov 30, 2026, so it can open now), custom sections and subpages with a plus.

## Real data stays out of the repo

The repo is public. Real data never goes in `src/data/seed.json`.

- `private/seed-overlay.json` (gitignored) holds the owner's real tables. `npm run make-import` merges it over `src/data/seed.json` into `private/import-backup.json`, which is imported once in Settings on the deployed site and then lives in Neon.
- The old one time `patches` and the Dexie upgrade steps are gone: every device starts empty and downloads from Neon. Dexie has a single `version(1)` with every store; add a store with a new `version(2)` and it syncs automatically (rows for stores a device does not know yet are downloaded again once it does).
- Data entered in the old Vite version (localhost:5173) is only in that browser: export a backup there and import it on the new site.

## Owner preferences

- Merge finished work every time: open a pull request into `claude/nextjs-vercel-neon` (the branch Vercel deploys) and merge it once the Vercel check passes, so the live app always has the latest version. `claude/life-command-center-46qqa6` is the old Vite version and does not deploy.
- The feed scraper stays an independent program: plain code making ordinary requests from the machine it runs on (the laptop, or the app's own server), identified as an RSS reader. Never route its fetching through an AI tool, agent or model API, since sites block those. Keep `scraper/` free of dependencies on the app so it runs on its own.

- Two looks, chosen per device in Settings, Look: **Moody** is the default (near black navy, deep navy cards, cream text, chrome kept) and **Light** is the original linen and navy. Moody is `:root[data-theme='moody']` in `src/styles.css`; `app/layout.tsx` sets it before the first paint and `src/lib/theme.ts` switches it. Fonts come from `next/font` (`--font-sans`, `--font-serif`, `--font-script`). Use the color variables, never hard coded colors, so both looks work.
- Fonts as in the brief; no dashes or em dashes in app copy; section titles never end in a period; no emoji icons.
- Budget is built for saving: savings come first, spending gets what is left.
- Chart colors are the `--series-*` variables (light values validated in `src/components/Charts.tsx`, lighter tints for Moody); keep legends for two or more series.
- No empty space on wide screens: card and box rows stretch to fill each row.

## Run and check

```bash
npm install
npm run dev        # http://localhost:3000 and the network address for the phone
npm run build && npm run start
```

After changes: `npm run typecheck`, `npm run build`, and look at the pages at phone width (390px) and laptop width (1280px). To test sync, open `localhost:3000` and `127.0.0.1:3000` side by side; in development `window.__cc` gives the console `db` and `sync`. Next.js 16 changed a lot: read `node_modules/next/dist/docs/` before using an API from memory (for example `middleware` is now `proxy.ts`).
