# Handoff: where the command center stands

Read this, then `BUILD_BRIEF.md`, `README.md` and `mockup-reference.html`, before changing anything.

## What is built

Phases 1 to 3 of the brief are done, plus parts of 4. All on branch `claude/life-command-center-46qqa6`.

- Shell: sidebar on laptop, tab bar on phone, cover banner (slim outside Home), subpage tabs, swipeable trend cards on phone, global search, Settings with backup export, import and a monthly reminder.
- Home: flip clock, arch tiles, priorities, calendar, recently dumped (with covers), goals and life areas.
- Dump: paste any link (YouTube and Pinterest get covers, YouTube plays in the card), watchlist for films and shows, bookshelf that looks up a book from a link or title (cover, author, price, where to buy, short version).
- Money: Rocket Money import (CSV or .xlsx), category mapping, payee rules and a Needs a look queue for Venmo and Zelle, transfers to own accounts and investments left out of spending, savings first budget, fixed bills (rent), employer credits on categories, grouped accounts and net worth, savings order with paycheck deductions (401k), goal projection charts with growth, Coast FIRE card and chart, trip planner with travel year summary and optional card points.
- Health: today (recovery, rings, today's call), classes as a photo grid with studio tallies and logos (from studio websites), routines with day by day skincare and a facial buffer, supplements, habits with daily counts (water bottles), wishlist.
- Social: vision board (trip tiles with cover photos, photo and link pins, restaurants grid, seasonal shows and tickets, intention), people and plans.
- Feed (Dump, Feed): your keywords (typed in the box at the top; each is matched against every story and gets its own Google News search), plus healthcare and fashion stories from public RSS feeds and Google News searches, tagged by topic, with lenses (Your keywords, Healthcare, Fashion, AI, Consumers, LinkedIn, Saved), topic chips, Top or Newest, Save to Dump, Hide, pasted LinkedIn posts, and a Sources and topics sheet for muting topics, turning sources off and adding your own feeds or searches. Stories live in the `feed` table (Dexie version 11) and leave after 30 days unless saved or pasted. The scraper is a standalone program in `scraper/` (`node scraper/feed.mjs`, or `npm run feed`; HTML, Markdown and JSON output, `--every` to rerun); `api/feed.js` only wraps it. `npm test` covers it. LinkedIn is never scraped (its terms forbid it): posts are pasted, and Google News finds indexed LinkedIn articles. The source addresses were written from each publisher's usual feed address and could not be checked from the build sandbox, so run `npm run feed -- --check` after a deploy and fix or drop any that do not answer.
- Serverless functions in `api/` (Vercel): `preview` (title, description and cover, oEmbed for YouTube and Pinterest), `image` (image proxy so covers are stored on the phone), `book`, `logo`, `feed`. `_safe.js` blocks private addresses. `npm run dev` serves them too (plugin in `vite.config.ts`).

Not built yet: Morning sync and Send to Dump iOS Shortcuts with `SHORTCUTS.md` (hash import `#sync=` and `#dump=`), real trend history for the trend cards (they still show seed placeholders), the Work page (the owner started a new job on Nov 30, 2026, so it can open now), custom sections and subpages with a plus.

## Real data stays out of the repo

The repo is public. Real data never goes in `src/data/seed.json`.

- `private/seed-overlay.json` (gitignored) holds the owner's real tables and `patches`. The Vite plugin in `vite.config.ts` merges it over the sample seed as `virtual:seed`.
- `patches` are one time corrections for phones that already have data: `set` only applies when the row still matches `from` (null means empty), `add` adds a missing row. Applied ids are stored in meta `appliedPatches`.
- `private/command-center-starter.json` is a full backup of the real data (no sample rows). Import it in Settings to start the real app.
- Upgrades in `src/lib/db.ts` (versions 2 to 10) swap untouched sample rows for seed rows; never overwrite rows the owner edited.

## Owner preferences

- Merge finished work into the main branch, `claude/life-command-center-46qqa6`, every time (open a pull request and merge it), so the deployed app always has the latest version. Do not leave work sitting on a side branch.

- The feed scraper stays an independent program: plain code making ordinary requests from the machine it runs on (the laptop, or the app's own server), identified as an RSS reader. Never route fetching through an AI tool, agent or AI model API, since sites block those. Keep `scraper/` free of dependencies on the app so it runs on its own.

- Light mode only, palette and fonts as in the brief; no dashes or em dashes in app copy; section titles never end in a period; no emoji icons.
- Budget is built for saving: savings come first, spending gets what is left.
- Chart colors are the validated set in `src/components/Charts.tsx`; keep legends for two or more series.

## Run and check

```bash
npm install
npm run dev        # http://localhost:5173 and the network address for the phone
npm run build && npm run preview
```

After changes: `npx tsc -b`, `npm run build`, and look at the pages at phone width (390px) and laptop width (1280px).
