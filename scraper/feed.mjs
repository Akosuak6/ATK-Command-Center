#!/usr/bin/env node
// The feed scraper as a program of its own. It needs Node 18 or newer and nothing else: no packages,
// no accounts, no AI. It reads public RSS feeds and Google News searches straight from this machine.
//
//   node scraper/feed.mjs                              top stories for your keywords and every topic
//   node scraper/feed.mjs --keyword "quiet luxury"     add a keyword (repeat, or --keywords "a, b, c")
//   node scraper/feed.mjs --keywords-only              only your keywords, no built-in topics
//   node scraper/feed.mjs --html feed.html             a page you can open in any browser
//   node scraper/feed.mjs --html feed.html --every 60  keep it fresh, once an hour
//   node scraper/feed.mjs --check                      which sources answered
//
// Keywords, extra feeds and searches can also live in scraper/config.json (see config.example.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, GROUP_LABELS } from './lib/sources.js';
import { TOPICS, TOPIC_BY_ID } from './lib/topics.js';
import { aggregate, customSources, score } from './lib/aggregate.js';
import { normalizeKeywords, parseKeywordInput } from './lib/keywords.js';
import { safeUrl } from './lib/safe.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const values = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] && !args[i + 1].startsWith('--') ? [args[i + 1]] : []));
const value = (name, fallback) => values(name)[0] ?? fallback;

if (flag('help') || flag('h')) {
  console.log(help());
  process.exit(0);
}
if (flag('topics')) {
  for (const t of TOPICS) console.log(`${t.id.padEnd(20)} ${t.label}`);
  process.exit(0);
}

const limit = Number(value('limit', 5));
const days = Number(value('days', 21));
const only = values('topic');
for (const t of only) if (!TOPIC_BY_ID[t]) fail(`Unknown topic "${t}". Run with --topics to see the list.`);
const every = Number(value('every', 0));

// Read the config each run, so keywords you edit while --every is running are picked up.
function loadConfig() {
  const path = resolve(value('config', resolve(here, 'config.json')));
  if (!existsSync(path)) {
    if (values('config').length) fail(`No config file at ${path}`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`Could not read ${path}: ${e.message}`);
  }
}

async function run() {
  const config = loadConfig();
  const keywords = normalizeKeywords([
    ...(Array.isArray(config.keywords) ? config.keywords : []),
    ...values('keyword'),
    ...values('keywords').flatMap(parseKeywordInput)
  ]);
  const extra = customSources([
    ...(Array.isArray(config.feeds) ? config.feeds : []).map((f, i) => ({ n: f.name || `Your feed ${i + 1}`, u: f.url, d: f.covers, k: f.keep })),
    ...(Array.isArray(config.searches) ? config.searches : []).map((q) => ({ n: `Search: ${q}`, q, k: 'all' })),
    ...values('add').map((u, i) => ({ n: `Your feed ${i + 1}`, u, k: 'all' })),
    ...values('add-search').map((q) => ({ n: `Search: ${q}`, q, k: 'all' }))
  ], safeUrl);
  const skip = new Set([...(Array.isArray(config.skip) ? config.skip : []), ...values('skip')]);
  const keywordsOnly = flag('keywords-only') || config.keywordsOnly === true;
  if (keywordsOnly && !keywords.length) fail('Add at least one keyword with --keyword, or in scraper/config.json.');
  const sources = keywordsOnly ? extra : [...SOURCES.filter((s) => !skip.has(s.id)), ...extra];

  const started = Date.now();
  process.stderr.write(`Reading ${sources.length + keywords.length} sources${keywords.length ? ` (${keywords.length} keyword searches)` : ''}...\n`);
  const out = await aggregate({ sources, keywords, maxAgeDays: days, timeoutMs: Number(value('timeout', 10000)), concurrency: 16 });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const failed = out.sources.filter((s) => !s.ok);

  if (flag('check')) {
    const groupOf = Object.fromEntries([...SOURCES, ...extra].map((s) => [s.id, s.group]));
    for (const g of Object.keys(GROUP_LABELS)) {
      const rows = out.sources.filter((s) => (groupOf[s.id] ?? (s.id.startsWith('kw-') ? 'keywords' : 'custom')) === g);
      if (!rows.length) continue;
      console.log(`\n${GROUP_LABELS[g]}`);
      for (const s of rows) {
        const mark = s.ok ? (s.kept ? 'ok  ' : 'none') : 'FAIL';
        console.log(`  ${mark}  ${s.name.padEnd(42)} ${s.ok ? `${s.kept} kept of ${s.found}` : s.error}`);
      }
    }
    console.log(`\n${out.sources.length - failed.length} of ${out.sources.length} sources answered in ${secs}s, ${out.items.length} stories after removing repeats.`);
    return;
  }

  const byScore = (a, b) => score(b) - score(a);
  const sections = [
    ...keywords.map((k) => ({ label: k, kind: 'keyword', items: out.items.filter((i) => i.keywords?.includes(k)).sort(byScore).slice(0, limit) })),
    ...(keywordsOnly ? [] : (only.length ? only.map((t) => TOPIC_BY_ID[t]) : TOPICS).map((t) => ({
      label: t.label, kind: 'topic', items: out.items.filter((i) => i.topics.includes(t.id)).sort(byScore).slice(0, limit)
    })))
  ];
  const summary = `${out.items.length} stories from ${out.sources.length - failed.length} of ${out.sources.length} sources in ${secs}s`;

  if (value('json')) writeOut(value('json'), JSON.stringify(out, null, 2));
  if (value('md')) writeOut(value('md'), markdown(sections, summary));
  if (value('html')) writeOut(value('html'), html(sections, summary, keywords));
  if (!value('json') && !value('md') && !value('html')) {
    for (const { label, kind, items } of sections) {
      console.log(`\n${kind === 'keyword' ? `KEYWORD: ${label}` : label.toUpperCase()}`);
      if (!items.length) console.log('  Nothing new.');
      for (const i of items) {
        console.log(`  ${i.title}`);
        console.log(`    ${i.source} · ${ago(i.date)} · ${i.url}`);
      }
    }
    console.log(`\n${summary}.${failed.length ? ' Run with --check to see which did not answer.' : ''}`);
    if (!keywords.length) console.log('Tip: add your own keywords with --keyword "quiet luxury" or in scraper/config.json.');
  } else {
    process.stderr.write(`${summary}.\n`);
  }
}

await run();
if (every > 0) {
  process.stderr.write(`Running again every ${every} minutes. Press Ctrl+C to stop.\n`);
  for (;;) {
    await new Promise((r) => setTimeout(r, every * 60000));
    process.stderr.write(`\n${new Date().toLocaleString()}\n`);
    try { await run(); } catch (e) { process.stderr.write(`That run failed: ${e.message}\n`); }
  }
}

function writeOut(path, text) {
  writeFileSync(path, text);
  process.stderr.write(`Saved ${path}\n`);
}

function markdown(sections, summary) {
  const lines = [`# Feed digest, ${longDate()}`, '', `_${summary}_`, ''];
  for (const { label, kind, items } of sections) {
    lines.push(`## ${kind === 'keyword' ? `Keyword: ${label}` : label}`, '');
    if (!items.length) lines.push('Nothing new.', '');
    for (const i of items) {
      lines.push(`- [${i.title.replace(/[[\]]/g, '')}](${i.url}) · ${i.source}, ${ago(i.date)}`);
      if (i.summary) lines.push(`  ${i.summary}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function html(sections, summary, keywords) {
  const card = (i) => `
      <article class="card">
        ${i.image ? `<a class="img" href="${escHtml(i.url)}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${escHtml(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></a>` : ''}
        <div class="meta"><span class="src">${escHtml(i.source)}</span><span>${escHtml(ago(i.date))}</span></div>
        <a class="title" href="${escHtml(i.url)}" target="_blank" rel="noopener noreferrer">${escHtml(i.title)}</a>
        ${i.summary ? `<p>${escHtml(i.summary)}</p>` : ''}
        <div class="tags">${(i.keywords ?? []).map((k) => `<span class="tag kw">${escHtml(k)}</span>`).join('')}${i.topics.slice(0, 3).map((t) => `<span class="tag">${escHtml(TOPIC_BY_ID[t]?.label ?? t)}</span>`).join('')}</div>
      </article>`;
  const body = sections.map((s) => `
    <section>
      <h2>${s.kind === 'keyword' ? `<span class="lbl">Keyword</span> ` : ''}${escHtml(s.label)}</h2>
      ${s.items.length ? `<div class="grid">${s.items.map(card).join('')}</div>` : '<p class="empty">Nothing new.</p>'}
    </section>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Feed digest</title>
<style>
  :root { --navy: #0F1A2E; --ink: #141B2C; --muted: #544F47; --bg: #D8CFC1; --card: #F3EEE6; --border: #CDC2B0; --walnut: #6B4A33; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 Inter, system-ui, -apple-system, sans-serif; }
  header { background: var(--navy); color: #E9E1D2; padding: 28px 16px; }
  header h1 { margin: 0; font: 500 34px/1.1 Newsreader, Georgia, serif; letter-spacing: 0.04em; }
  header p { margin: 6px 0 0; color: #CBBFA9; font-size: 13px; }
  main { max-width: 1180px; margin: 0 auto; padding: 8px 16px 48px; }
  h2 { font: 500 24px/1.2 Newsreader, Georgia, serif; margin: 28px 0 12px; }
  .lbl { font: 600 11px/1 Inter, system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); vertical-align: middle; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 14px; align-items: start; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
  .img { margin: -16px -16px 4px; display: block; }
  .img img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .meta { display: flex; gap: 10px; font-size: 12px; color: var(--muted); }
  .src { font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; color: var(--walnut); }
  .title { font: 500 19px/1.25 Newsreader, Georgia, serif; color: var(--ink); text-decoration: none; }
  .title:hover { text-decoration: underline; }
  .card p { margin: 0; font-size: 14px; color: #48443D; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; padding: 3px 7px; border-radius: 999px; background: #E4DDD1; color: #4B463E; }
  .tag.kw { background: var(--navy); color: #FFFFFF; }
  .empty { color: var(--muted); font-size: 14px; }
</style>
</head>
<body>
<header>
  <h1>Feed digest</h1>
  <p>${escHtml(longDate())} · ${escHtml(summary)}${keywords.length ? ` · Keywords: ${escHtml(keywords.join(', '))}` : ''}</p>
</header>
<main>${body}
</main>
</body>
</html>
`;
}

function longDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function ago(iso) {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function help() {
  return `Usage: node scraper/feed.mjs [options]   (or: npm run feed -- [options])

Keywords
  --keyword <text>     follow a keyword or phrase (repeatable)
  --keywords "a, b"    several at once, separated by commas
  --keywords-only      only your keywords and your own sources, no built-in topics

Output
  --html <file>        a page you can open in any browser
  --md <file>          a Markdown digest
  --json <file>        every story as JSON
  --every <minutes>    keep running and refresh on this schedule
  --check              list every source and whether it answered

Choosing stories
  --topic <id>         only this built-in topic (repeatable); --topics lists them
  --limit <n>          stories per keyword or topic (default 5)
  --days <n>           ignore stories older than this (default 21)
  --add <feed url>     also read this RSS or Atom feed (repeatable)
  --add-search <text>  also read this Google News search (repeatable)
  --skip <source id>   leave out a built-in source (repeatable)
  --timeout <ms>       per source time limit (default 10000)
  --config <file>      read settings from this file (default scraper/config.json)`;
}
