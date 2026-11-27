// Tests for the feed reader, topic tagging and ranking. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, feedLinksIn, toText } from '../api/_feed/parse.js';
import { classify, isNoise } from '../api/_feed/topics.js';
import { aggregate, canonicalUrl, customSources, discoverFeed, hashId } from '../api/_feed/aggregate.js';
import { SOURCES, sourceUrl } from '../api/_feed/sources.js';
import { safeUrl } from '../api/_safe.js';

const NOW = Date.parse('2026-11-27T15:00:00Z');

const WORDPRESS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
  <title>Femtech Insider</title>
  <link>https://femtechinsider.com</link>
  <item>
    <title><![CDATA[Menopause startup Midi Health raises $100M Series C]]></title>
    <link>https://femtechinsider.com/midi-health-series-c/?utm_source=rss&amp;utm_medium=rss</link>
    <dc:creator><![CDATA[Jane Writer]]></dc:creator>
    <pubDate>Wed, 26 Nov 2026 14:00:00 +0000</pubDate>
    <category><![CDATA[Funding]]></category>
    <description><![CDATA[<p>The virtual menopause clinic will expand care &amp; coverage.</p><p>The post Menopause startup Midi Health raises $100M Series C appeared first on Femtech Insider.</p>]]></description>
    <media:content url="https://femtechinsider.com/wp-content/uploads/midi.jpg" medium="image" />
  </item>
  <item>
    <title>Old news from last year</title>
    <link>https://femtechinsider.com/old/</link>
    <pubDate>Mon, 01 Sep 2025 10:00:00 +0000</pubDate>
    <description>Something about fertility care.</description>
  </item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Trend notes</title>
  <link href="https://example.com/" rel="alternate"/>
  <entry>
    <title type="html">WGSN&#8217;s colour of the year for 2028</title>
    <link rel="alternate" href="/posts/colour-2028"/>
    <updated>2026-11-25T09:30:00Z</updated>
    <author><name>Trend Desk</name></author>
    <summary type="html">&lt;p&gt;Forecasters see a calmer palette &lt;img src="https://example.com/c.png"&gt;&lt;/p&gt;</summary>
  </entry>
</feed>`;

const GOOGLE = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>"WGSN" - Google News</title>
<item><title>AI is rewriting how brands forecast trends - Vogue Business</title><link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link><guid isPermaLink="false">CBMiAAA</guid><pubDate>Thu, 27 Nov 2026 08:00:00 GMT</pubDate><description>&lt;a href="https://news.google.com/rss/articles/CBMiAAA?oc=5" target="_blank"&gt;AI is rewriting how brands forecast trends&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Vogue Business&lt;/font&gt;</description><source url="https://www.voguebusiness.com">Vogue Business</source></item>
<item><title>Menopause startup Midi Health raises $100M Series C - Femtech Insider</title><link>https://news.google.com/rss/articles/CBMiBBB?oc=5</link><pubDate>Wed, 26 Nov 2026 15:00:00 GMT</pubDate><source url="https://femtechinsider.com">Femtech Insider</source></item>
</channel></rss>`;

const VOGUE = `<rss version="2.0"><channel><title>Vogue</title><link>https://www.vogue.com</link>
<item><title>Your Weekly Horoscope Is Here</title><link>https://www.vogue.com/article/horoscope</link><pubDate>Thu, 27 Nov 2026 07:00:00 GMT</pubDate><description>The stars align.</description></item>
<item><title>Zendaya Wore Head To Toe Louis Vuitton</title><link>https://www.vogue.com/article/zendaya</link><pubDate>Thu, 27 Nov 2026 06:00:00 GMT</pubDate><description>A look from the red carpet.</description></item>
<item><title>The Biggest Trends From the Spring 2027 Shows</title><link>https://www.vogue.com/article/spring-2027-trends</link><pubDate>Thu, 27 Nov 2026 05:00:00 GMT</pubDate><description>Sheer layers and soft tailoring.</description><media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="https://assets.vogue.com/photos/trends.jpg"/></item>
<item><title>Why Gen Z Shoppers Are Turning to Resale</title><link>https://www.vogue.com/article/resale</link><pubDate>Wed, 26 Nov 2026 18:00:00 GMT</pubDate><description>Secondhand is now the first stop.</description></item>
</channel></rss>`;

test('reads an RSS feed with CDATA, images and footers', () => {
  const f = parseFeed(WORDPRESS, 'https://femtechinsider.com/feed/');
  assert.equal(f.title, 'Femtech Insider');
  assert.equal(f.items.length, 2);
  const [a] = f.items;
  assert.equal(a.title, 'Menopause startup Midi Health raises $100M Series C');
  assert.equal(a.author, 'Jane Writer');
  assert.equal(a.image, 'https://femtechinsider.com/wp-content/uploads/midi.jpg');
  assert.equal(a.summary, 'The virtual menopause clinic will expand care & coverage.');
  assert.equal(a.date, '2026-11-26T14:00:00.000Z');
  assert.deepEqual(a.categories, ['Funding']);
});

test('reads an Atom feed with relative links and escaped HTML', () => {
  const f = parseFeed(ATOM, 'https://example.com/atom.xml');
  const [e] = f.items;
  assert.equal(e.title, 'WGSN’s colour of the year for 2028');
  assert.equal(e.url, 'https://example.com/posts/colour-2028');
  assert.equal(e.author, 'Trend Desk');
  assert.equal(e.image, 'https://example.com/c.png');
  assert.equal(e.summary, 'Forecasters see a calmer palette');
});

test('refuses a web page that is not a feed', () => {
  assert.throws(() => parseFeed('<!doctype html><html><head><title>Hi</title></head></html>'), /not a feed/);
});

test('finds feed links a page advertises', () => {
  const html = '<head><link rel="alternate" type="application/rss+xml" title="Posts" href="/feed"></head>';
  assert.deepEqual(feedLinksIn(html, 'https://writer.substack.com/'), [{ url: 'https://writer.substack.com/feed', title: 'Posts' }]);
});

test('tags stories with the right topics', () => {
  assert.ok(classify('Menopause startup Midi Health raises $100M Series C').includes('femtech'));
  assert.ok(classify('Menopause startup Midi Health raises $100M Series C').includes('womens-health'));
  assert.ok(classify('States brace for Medicaid work requirements').includes('medicaid'));
  assert.ok(classify('CMS finalizes Medicare Advantage star ratings changes').includes('medicare'));
  assert.ok(classify('Hospitals turn to ambient AI scribes to cut burnout').includes('health-ai'));
  assert.ok(classify('Teens and anxiety: the therapist shortage').includes('mental-health'));
  assert.ok(classify('Why Gen Z shoppers are turning to resale', 'fashion').includes('fashion-consumer'));
  assert.ok(classify('The biggest trends from the Spring 2027 shows', 'fashion').includes('trend-forecasting'));
  assert.ok(classify('WGSN says the colour of the year is calm').includes('trend-forecasting'));
  assert.ok(classify('Brands test AI stylists and virtual try-on', 'fashion').includes('fashion-ai'));
  assert.ok(classify('Brands test AI stylists and virtual try-on', 'fashion').includes('fashion-tech'));
  assert.ok(classify('Patients want cash-pay prices they can shop for', 'health').includes('health-consumer'));
});

test('keeps unrelated stories untagged', () => {
  assert.deepEqual(classify('Zendaya wore head to toe Louis Vuitton', 'fashion'), []);
  assert.deepEqual(classify('Chip makers report record quarter'), []);
  assert.deepEqual(classify('The best pasta recipes for fall'), []);
  assert.ok(!classify('New chip plant opens in Arizona').includes('medicaid'));
  assert.ok(!classify('The CHIP program renewal passes', 'health').includes('fashion-tech'));
});

test('spots shopping lists and horoscopes', () => {
  assert.ok(isNoise('Your Weekly Horoscope Is Here'));
  assert.ok(isNoise('The 40 Best Black Friday Fashion Deals'));
  assert.ok(!isNoise('The Biggest Trends From the Spring 2027 Shows'));
});

test('canonical urls drop tracking and match across sources', () => {
  assert.equal(canonicalUrl('https://www.Example.com/a/?utm_source=rss&id=3#top'), 'https://example.com/a?id=3');
  assert.equal(hashId(canonicalUrl('https://example.com/a/')), hashId(canonicalUrl('https://www.example.com/a?utm_medium=x')));
});

function fakeFetch(map) {
  return async (url) => {
    const body = map[url];
    if (body === undefined) return new Response('nope', { status: 404 });
    if (body instanceof Error) throw body;
    return new Response(body, { status: 200, headers: { 'content-type': 'application/rss+xml' } });
  };
}

test('aggregates, filters, de-duplicates and ranks', async () => {
  const sources = [
    { id: 'femtech-insider', name: 'Femtech Insider', url: 'https://f.test/feed', domain: 'health', keep: 'all', topics: ['femtech'], weight: 1.2 },
    { id: 'vogue', name: 'Vogue', url: 'https://v.test/feed', domain: 'fashion', keep: 'match', broad: true, weight: 1 },
    { id: 'gn', name: 'Search', google: 'WGSN', domain: 'fashion', keep: 'all', topics: ['trend-forecasting'], weight: 0.9 },
    { id: 'down', name: 'Down', url: 'https://down.test/feed', domain: 'health', keep: 'all' }
  ];
  const out = await aggregate({
    sources,
    now: NOW,
    fetchImpl: fakeFetch({ 'https://f.test/feed': WORDPRESS, 'https://v.test/feed': VOGUE, [sourceUrl(sources[2])]: GOOGLE })
  });
  const titles = out.items.map((i) => i.title);
  assert.ok(!titles.includes('Old news from last year'), 'drops stories older than three weeks');
  assert.ok(!titles.some((t) => /Horoscope|Zendaya/.test(t)), 'drops off topic Vogue stories');
  assert.ok(titles.includes('The Biggest Trends From the Spring 2027 Shows'));
  assert.ok(titles.includes('AI is rewriting how brands forecast trends'), 'strips the publisher from Google News titles');
  const midi = out.items.filter((i) => /Midi Health/.test(i.title));
  assert.equal(midi.length, 1, 'keeps one copy of a story carried twice');
  assert.match(midi[0].url, /^https:\/\/femtechinsider\.com/, 'prefers the publisher link over Google News');
  assert.ok(midi[0].image);
  const gn = out.items.find((i) => i.title.startsWith('AI is rewriting'));
  assert.equal(gn.source, 'Vogue Business');
  assert.equal(gn.site, 'voguebusiness.com');
  assert.ok(gn.topics.includes('fashion-ai'));
  const down = out.sources.find((s) => s.id === 'down');
  assert.equal(down.ok, false);
  assert.match(down.error, /404/);
  assert.equal(out.sources.find((s) => s.id === 'vogue').kept, 2);
});

test('custom sources are validated', () => {
  const list = customSources([
    { n: 'My Substack', u: 'https://writer.substack.com/feed', d: 'health', k: 'all', t: ['femtech', 'nope'] },
    { n: 'Local', u: 'http://127.0.0.1/feed' },
    { n: 'Search', q: 'Oura ring', d: 'health' },
    'junk'
  ], safeUrl);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].topics, ['femtech']);
  assert.equal(list[1].google, 'Oura ring');
});

test('discovers a feed from a page', async () => {
  const page = '<html><head><link rel="alternate" type="application/rss+xml" href="https://w.test/feed"></head><body></body></html>';
  const found = await discoverFeed('https://w.test/', { fetchImpl: fakeFetch({ 'https://w.test/': page, 'https://w.test/feed': WORDPRESS }) });
  assert.equal(found.url, 'https://w.test/feed');
  assert.equal(found.title, 'Femtech Insider');
  assert.deepEqual(await discoverFeed('https://www.linkedin.com/in/someone'), { error: 'linkedin' });
});

test('every built-in source has a unique id and an address', () => {
  const ids = new Set();
  for (const s of SOURCES) {
    assert.ok(!ids.has(s.id), `duplicate id ${s.id}`);
    ids.add(s.id);
    assert.ok(/^https:\/\//.test(sourceUrl(s)), s.id);
    for (const t of s.topics ?? []) assert.ok(classify !== undefined && t, t);
  }
});

test('text helper strips markup', () => {
  assert.equal(toText('<p>Hello&nbsp;<b>there</b></p><script>x()</script>'), 'Hello there');
});
