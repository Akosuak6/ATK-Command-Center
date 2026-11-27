# Feed scraper

A program of its own that collects healthcare and fashion stories from public RSS feeds and Google News searches, tags them with topics and your keywords, removes repeats, and ranks them. It needs Node 18 or newer and nothing else: no packages, no accounts, no AI.

## Why it is a separate program

Many sites block AI crawlers. This program is ordinary code making ordinary web requests from the machine it runs on, identified as a personal RSS reader. No AI service sits between it and the sites, so those blocks do not apply. It reads only the feeds publishers offer for exactly this, plus Google News searches, which are feeds too.

It runs in two places, with the same code:

- On your laptop: `node scraper/feed.mjs` (or `npm run feed` from the project). Requests come from your own internet connection.
- Behind the app: `api/feed.js` is a thin wrapper that runs this program on the app's server (Vercel) whenever the phone refreshes its feed.

The folder has no dependencies on the rest of the project, so you can copy it anywhere and run it.

## Keywords

Type keywords in the app (Dump, Feed, Your keywords), or give them to the program:

```bash
node scraper/feed.mjs --keyword "quiet luxury" --keyword Oura
node scraper/feed.mjs --keywords "quiet luxury, Oura, menopause"
node scraper/feed.mjs --keywords "quiet luxury" --keywords-only    # nothing but your keywords
```

Each keyword is matched as a phrase against every story from every source (hyphens, spaces and plurals are forgiven, so "virtual try-on" finds "virtual try ons"), and gets its own Google News search, so stories that never reach the regular sources still turn up. Write your own search operators if you want them: `menopause OR perimenopause`.

To keep keywords between runs, copy `config.example.json` to `config.json` in this folder and edit it. `config.json` stays on your machine.

## Output

```bash
node scraper/feed.mjs                              # print the top stories per keyword and topic
node scraper/feed.mjs --html feed.html             # a page you can open in any browser
node scraper/feed.mjs --html feed.html --every 60  # rewrite it every hour until you press Ctrl+C
node scraper/feed.mjs --md digest.md               # Markdown, to paste or share
node scraper/feed.mjs --json feed.json             # every story, for other programs
node scraper/feed.mjs --check                      # which sources answered, and how many stories each gave
node scraper/feed.mjs --help                       # everything else
```

To run it on a schedule without leaving a terminal open, use cron on a Mac or Linux machine, for example every morning at 7:

```
0 7 * * * cd /path/to/ATK-Command-Center && /usr/local/bin/node scraper/feed.mjs --html ~/feed.html
```

## What is where

- `lib/sources.js` the built-in feeds and Google News searches
- `lib/topics.js` the topics and the words that tag a story with each one
- `lib/keywords.js` your keywords: phrase matching and their searches
- `lib/parse.js` reads RSS and Atom
- `lib/aggregate.js` fetches everything, tags, removes repeats and ranks
- `feed.mjs` the command line program
- `feed.test.mjs` tests: `node --test scraper/feed.test.mjs` (or `npm test`)

LinkedIn offers no feeds and its terms forbid scraping, so this program never logs in to it. Paste posts into the feed in the app instead, and the two LinkedIn searches find public LinkedIn articles that Google has indexed.
