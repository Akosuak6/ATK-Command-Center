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
- Serverless functions in `api/` (Vercel): `preview` (title and cover, oEmbed for YouTube and Pinterest), `image` (image proxy so covers are stored on the phone), `book`, `logo`. `_safe.js` blocks private addresses.

Not built yet: Morning sync and Send to Dump iOS Shortcuts with `SHORTCUTS.md` (hash import `#sync=` and `#dump=`), real trend history for the trend cards (they still show seed placeholders), the Work page (the owner started a new job on Nov 30, 2026, so it can open now), custom sections and subpages with a plus.

## Real data stays out of the repo

The repo is public. Real data never goes in `src/data/seed.json`.

- `private/seed-overlay.json` (gitignored) holds the owner's real tables and `patches`. The Vite plugin in `vite.config.ts` merges it over the sample seed as `virtual:seed`.
- `patches` are one time corrections for phones that already have data: `set` only applies when the row still matches `from` (null means empty), `add` adds a missing row. Applied ids are stored in meta `appliedPatches`.
- `private/command-center-starter.json` is a full backup of the real data (no sample rows). Import it in Settings to start the real app.
- Upgrades in `src/lib/db.ts` (versions 2 to 10) swap untouched sample rows for seed rows; never overwrite rows the owner edited.

## Owner preferences

- Two looks, chosen per device in Settings, Look: **Moody** is the default (near black navy, deep navy cards, cream text, chrome kept) and **Light** is the original linen and navy. Moody is `:root[data-theme='moody']` in `src/styles.css`; `index.html` sets it before the first paint and `src/lib/theme.ts` switches it. Use the color variables, never hard coded colors, so both looks work.
- Fonts as in the brief; no dashes or em dashes in app copy; section titles never end in a period; no emoji icons.
- Budget is built for saving: savings come first, spending gets what is left.
- Chart colors are the `--series-*` variables (light values validated in `src/components/Charts.tsx`, lighter tints for Moody); keep legends for two or more series.
- No empty space on wide screens: card and box rows stretch to fill each row.

## Run and check

```bash
npm install
npm run dev        # http://localhost:5173 and the network address for the phone
npm run build && npm run preview
```

After changes: `npx tsc -b`, `npm run build`, and look at the pages at phone width (390px) and laptop width (1280px).
