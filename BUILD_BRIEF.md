# Akosua's Command Center: build brief for Claude Code

Paste this file into the project root and tell Claude Code: "Read BUILD_BRIEF.md and mockup-reference.html, then build phase 1."

## What we are building

A personal command center web app that I build on my laptop and use on my iPhone. It covers my day, money, health, social life and the things I am learning. It is private to me and stores everything on my phone; there is no account, login or server database.

The file `mockup-reference.html` is the approved visual and behavioral mockup. Match its layout, copy, colors and interactions. It was written for a design tool, so treat it as a reference and rebuild it as a normal app (do not try to run it as is).

## Tech decisions

- Vite, React and TypeScript, built as an installable PWA (manifest, service worker, offline support, iPhone "Add to Home Screen" icon and splash).
- Storage: IndexedDB through Dexie. Nothing leaves the phone.
- Hosting: a static deploy (Vercel or Netlify) so the phone can open it at a stable address. Static files only, plus at most one small serverless function (see link previews below).
- CSV parsing with PapaParse. No other heavy dependencies; no UI kit. Plain CSS with variables for the palette.
- Mobile first. Design for a 390px wide iPhone screen first, then widen to the laptop layout.

## Design system

Palette (navy and chrome over a warm living room palette; light mode only, never dark mode):

| Token | Hex | Use |
|---|---|---|
| navy | #0F1A2E | Sidebar, phone tab bar, cover banner, primary buttons |
| navy 2 | #1C2A47 | Progress fills, secondary navy |
| ink | #141B2C | Body text |
| muted | #544F47 | Secondary text (keep 4.5:1 contrast) |
| background | #D8CFC1 | Page background (warm greige) |
| card | #F3EEE6 | Cards (linen) |
| border | #CDC2B0 | Card borders |
| divider | #DCD3C4 | Row dividers |
| track | #D6CCBC | Empty progress bars |
| cream | #E9E1D2 | Text on navy, active nav pill |
| walnut | #6B4A33 | Trend card top edge, money accents |
| olive | #556233 | Good news, positive trends |
| rust | #A4472B | Warnings, over budget, behind |
| chrome | gradient #FFFFFF, #DDE1E7, #AEB6C2, #E8EBEF | Flip clock, arches, page titles, pins |

Type: Newsreader (serif) for headings and numbers, Inter for body text, Pinyon Script for the "command center" wordmark. Small labels are 11px uppercase with letter spacing.

Signature details from the mockup: navy and cream striped edge on the sidebar and banner, chrome lettered page title in the banner, arched chrome tiles, flip clock, ticket style event cards, book covers with a spine edge, Pinterest style masonry grid for the Dump and vision board.

Rules: touch targets at least 44px; real buttons, links and labeled inputs; no emoji icons (use simple stroke SVG icons); green and red signals must also differ in arrow direction or text, never color alone.

## Navigation

- Laptop: left sidebar with wordmark, global search, sections, and a status block (calendar synced, Apple Watch synced, Rocket Money export date and next due date, "Saved on this phone").
- Phone: sidebar becomes a fixed navy bottom tab bar; wordmark and search move to the top of the page.
- Sections: Home, Dump, Money, Health, Social, Work (Work shows a "Coming soon" page for now).
- Each section has subpages shown as underline tabs below the cover banner. Only the first subpage of each section shows the "How you are doing" trend cards.

## Sections and features

### Home
Subpages: Today, Goals and life areas.

Today:
- Flip clock (live time, AM/PM, weekday).
- Four arched shortcut tiles with a live stat: Monthly budget (left to spend), Lisbon fund (percent saved), Classes (count this month), Bookshelf (read out of 20).
- Trend cards: Life score, Goals, Balance.
- Priorities now: two lists. "From your calendar" fills from today's calendar events; "Added by you" lets me add, check off and delete my own items.
- Today's calendar list with area tags.
- Recently dumped: latest three Dump items, tap to open the Dump.

Goals and life areas:
- Goal cards: title, area tag, horizon tag, deadline, percent, progress bar, action steps or progress text, "Mark as achieved". Goals are editable and live, for example the Lisbon card reads the trip planner and the reading card reads the bookshelf.
- Life area scores (Money, Health, Social, Learning) that open their section.

### Dump (learnings inbox)
Purpose: one place for learnings, articles, think pieces, Substacks, new perspectives, films and TV shows.

Everything subpage:
- Big "Paste a link" box designed for pasting from my phone, plus type (Article, Think piece, Substack, New perspective, Film, TV show), optional title, optional "My take".
- If no title is given, use the page title from the link preview function; fall back to a cleaned up version of the URL path.
- Filter chips by type; masonry grid of cards.
- Each card: type tag, source domain, date, title linking out, my take, a 1 to 5 star rating, a comment thread with an input to add follow up thoughts.
- Also support an iOS Shortcut "Send to Dump" from the share sheet (see Data sources).

Bookshelf subpage:
- Reading goal: 20 books a year, shown as a count, "X to go this year", and 20 spine tiles that fill in as books are read.
- Mini review form: title, author, shelf (Read, Currently reading, Want to read), 1 to 5 stars, short review.
- Shelf filters and a grid of review cards with a cover tile.

### Money
Subpages: Overview, Monthly budget, Long term goals, Trip planner.

Overview: trend cards (Savings, Net worth, Spending), key numbers (left to spend, savings rate, net worth, next card payment), the weekly Rocket Money export card with an upload button, account balances, upcoming bills.

Monthly budget:
- Category rows with spent versus budget and rust styling when over. Categories and amounts are editable by me.
- "Fitness classes" is not entered manually; it sums class prices from the Health class log for the month.
- Can I afford it: price input plus presets. Logic:
  - left = monthly budget remaining from the latest export.
  - If price is 40% or less of left: "Go for it".
  - If price is at most left: "Fits, but tightens the month", with the daily amount left for the rest of the month.
  - If price is over left: over = price minus left; for each savings goal, delay in weeks = ceil(over / goal monthly contribution x 4.33). Show every goal's delay and name the least disruptive one.

Long term goals: savings goals with progress and monthly contribution (emergency fund, Roth IRA, all trip funds combined) and a five year roadmap list. Goals, targets, dates and contributions are editable.

Trip planner:
- Trips are shared with the Social vision board; tapping a trip tile there opens that trip here.
- Trip chips to switch trips; editable total cost, months until the trip (3, 5, 8, 12, 16 or custom), amount saved.
- Monthly set aside = (cost minus saved) / months.
- Fill that amount from a ranked list of trims (unused subscriptions, dining out, shopping, coffee and takeout, rideshare), each with a cap; show which are used and which are not needed.
- Verdict: covered without touching savings, or the monthly shortfall plus how many months would close it. Trims should eventually come from real spending categories in the export.

### Health
Subpages: Today, Classes, Routines. Data comes from Apple Watch via Apple Health (no Oura, no cycle tracking).

Today: trend cards (Sleep, Training, Recovery), a recovery estimate built from HRV versus baseline, resting heart rate and sleep, activity rings (Move, Exercise, Stand), a "Today's call" suggestion that reads the calendar for planned workouts, and overnight numbers (sleep, HRV, resting HR, steps).

Classes:
- Summary: classes this month with mix by type, spend versus a $250 fitness budget, average cost per class, best value class (rating per dollar).
- Log form: type (Pilates, HIIT, Gym, Yoga, Spin, Run), class name, studio, instructor, price, 1 to 5 stars, notes.
- Past classes list with type filters and sort by Newest, Top rated, Price.

Routines: supplement stack with timing tags, morning and evening skincare steps, daily habits with 7 day completion, self care wishlist. All editable. No restock reminders.

### Social
Subpages: Vision board, People and plans.

Vision board: headline "2027 is for more yeses"; masonry board with trip tiles (status, percent saved, opens trip planner), uploaded photos, pinned links, restaurants, shows and events, and an intention quote tile.
- Photo upload: resize to about 640px wide JPEG before storing in IndexedDB.
- Pin a link: paste a URL, show title from the link preview.
- Restaurants: name, cuisine, neighborhood, and list (Want to try or Been, loved it). Tags are cuisine and neighborhood only. Filter by list.
- Shows and events: ticket style cards; I add them myself and can upload a ticket image or PDF.

People and plans: plans this week from the calendar, people to reach out to sorted by longest gap.

### Work
Placeholder page only: "This page opens when you start." We will design it later.

### Search
Global search across Dump items, books, classes, restaurants and trips, with results that open the right page.

### Trend cards ("How you are doing")
Three cards per section, each with a main percent change, a secondary change, and a footer total, with a 7, 30 or 90 day toggle comparing against the prior period of the same length. Color means good or bad for me, not up or down (spending down is olive; dining up is rust). Compute these from stored history once real data exists.

## Data sources

1. Rocket Money (weekly): I export a CSV from Rocket Money and upload it on the Money overview. Parse it, store transactions, map categories to my budget categories (editable mapping), update balances, the budget, the afford check and trends. Show the last export date and remind me when the next one is due (7 days later).
2. Apple Watch and calendar (daily): a web app cannot read Apple Health or the iPhone calendar directly. Build a "Morning sync" iOS Shortcut recipe that reads yesterday's sleep, HRV, resting HR, steps, ring progress and today's calendar events, then opens the app at a URL like `https://APP/#sync=<base64 JSON>`. The app reads the hash on load, saves the data, clears the hash and updates the "synced" status. Include step by step instructions for creating the Shortcut in a SHORTCUTS.md file.
3. Share sheet to Dump: a second Shortcut, "Send to Dump", that takes the shared URL and page title and opens `https://APP/#dump=<base64 JSON>`.
4. Link previews: one small serverless function that fetches a URL and returns its title and site name, used when pasting links. If it fails, fall back to the URL.
5. Everything else is entered by me in the app.

## Seed data

Create `src/data/seed.json` with the same shape as the app's stores and load it on first launch only. I will fill it with my real data before deploying: budget categories and amounts, savings goals (target, date, monthly contribution, saved), trips (name, cost, date, saved, status), supplements and skincare steps, books read this year, restaurants, studios and typical class prices. Use the mockup's sample values as placeholders.

## Backups

Because data lives only on my phone, add Settings with: Export backup (downloads a JSON of all stores including photos), Import backup, and a gentle monthly reminder to export.

## Build phases

1. App shell: navigation, banner, subpages, palette, PWA install, IndexedDB with seed data, and all pages built from the mockup with manual entry working (classes, Dump, books, priorities, pins, restaurants, trips, goals).
2. Money data: Rocket Money CSV import, category mapping, live budget, afford check and trip trims from real data.
3. Phone integrations: Morning sync and Send to Dump Shortcuts with SHORTCUTS.md, link preview function.
4. Trends and polish: trend history and period comparisons, backups, search, accessibility pass.

## Definition of done for each phase

- Works on an iPhone screen and a laptop screen.
- Data survives closing and reopening the app.
- No dashes or em dashes in any app copy; section titles never end in a period.
- I can install it to my home screen and use it offline (except syncing and link previews).
