#!/usr/bin/env node
// The feed from the command line: the same sources and topics as the app, printed or saved as a digest.
//
//   npm run feed                          top stories for every topic
//   npm run feed -- --topic femtech       one topic (see --topics for the list)
//   npm run feed -- --check               which sources answered, and how many stories each gave
//   npm run feed -- --md digest.md        save a Markdown digest
//   npm run feed -- --json feed.json      save everything as JSON
//   npm run feed -- --add https://example.com/feed --add-search "Oura ring"
//   npm run feed -- --limit 8 --days 7
import { writeFileSync } from 'node:fs';
import { SOURCES, GROUP_LABELS } from '../api/_feed/sources.js';
import { TOPICS, TOPIC_BY_ID } from '../api/_feed/topics.js';
import { aggregate, customSources, score } from '../api/_feed/aggregate.js';
import { safeUrl } from '../api/_safe.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const values = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));
const value = (name, fallback) => values(name)[0] ?? fallback;

if (flag('help') || flag('h')) {
  console.log(readHelp());
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

const extra = customSources([
  ...values('add').map((u, i) => ({ n: `Your feed ${i + 1}`, u, k: 'all' })),
  ...values('add-search').map((q) => ({ n: `Search: ${q}`, q, k: 'all' }))
], safeUrl);
const skip = new Set(values('skip'));
const sources = [...SOURCES.filter((s) => !skip.has(s.id)), ...extra];

const started = Date.now();
process.stderr.write(`Reading ${sources.length} sources...\n`);
const out = await aggregate({ sources, maxAgeDays: days, timeoutMs: Number(value('timeout', 10000)) });
const secs = ((Date.now() - started) / 1000).toFixed(1);

if (flag('check')) {
  const groups = Object.keys(GROUP_LABELS);
  const bySource = Object.fromEntries(sources.map((s) => [s.id, s]));
  for (const g of groups) {
    const rows = out.sources.filter((s) => (bySource[s.id]?.group ?? 'custom') === g);
    if (!rows.length) continue;
    console.log(`\n${GROUP_LABELS[g]}`);
    for (const s of rows) {
      const mark = s.ok ? (s.kept ? 'ok  ' : 'none') : 'FAIL';
      const detail = s.ok ? `${s.kept} kept of ${s.found}` : s.error;
      console.log(`  ${mark}  ${s.name.padEnd(42)} ${detail}`);
    }
  }
  const failed = out.sources.filter((s) => !s.ok).length;
  console.log(`\n${out.sources.length - failed} of ${out.sources.length} sources answered in ${secs}s, ${out.items.length} stories after removing repeats.`);
  process.exit(0);
}

const topics = only.length ? only.map((t) => TOPIC_BY_ID[t]) : TOPICS;
const sections = topics.map((t) => ({
  topic: t,
  items: out.items.filter((i) => i.topics.includes(t.id)).sort((a, b) => score(b) - score(a)).slice(0, limit)
}));

if (value('json')) {
  writeFileSync(value('json'), JSON.stringify(out, null, 2));
  process.stderr.write(`Saved ${out.items.length} stories to ${value('json')}\n`);
}
if (value('md')) {
  writeFileSync(value('md'), markdown(sections));
  process.stderr.write(`Saved the digest to ${value('md')}\n`);
}
if (!value('json') && !value('md')) {
  for (const { topic, items } of sections) {
    console.log(`\n${topic.label.toUpperCase()}`);
    if (!items.length) console.log('  Nothing new.');
    for (const i of items) {
      console.log(`  ${i.title}`);
      console.log(`    ${i.source} · ${ago(i.date)} · ${i.url}`);
    }
  }
  const failed = out.sources.filter((s) => !s.ok);
  console.log(`\n${out.items.length} stories from ${out.sources.length - failed.length} of ${out.sources.length} sources in ${secs}s.${failed.length ? ' Run with --check to see which did not answer.' : ''}`);
}

function markdown(list) {
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const lines = [`# Feed digest, ${date}`, ''];
  for (const { topic, items } of list) {
    lines.push(`## ${topic.label}`, '');
    if (!items.length) lines.push('Nothing new.', '');
    for (const i of items) {
      lines.push(`- [${i.title.replace(/[[\]]/g, '')}](${i.url}) · ${i.source}, ${ago(i.date)}`);
      if (i.summary) lines.push(`  ${i.summary}`);
    }
    lines.push('');
  }
  return lines.join('\n');
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

function readHelp() {
  return `Usage: npm run feed -- [options]

  --topic <id>         only this topic (repeat for more); --topics lists them
  --limit <n>          stories per topic (default 5)
  --days <n>           ignore stories older than this (default 21)
  --check              list every source and whether it answered
  --md <file>          save a Markdown digest
  --json <file>        save every story as JSON
  --add <feed url>     also read this RSS or Atom feed (repeatable)
  --add-search <text>  also read this Google News search (repeatable)
  --skip <source id>   leave out a built-in source (repeatable)
  --timeout <ms>       per source timeout (default 10000)`;
}
