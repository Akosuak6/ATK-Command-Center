// A small RSS 2.0 and Atom reader. Feeds are simple enough that a few careful regular expressions
// read them reliably, and it keeps the serverless function free of dependencies.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç',
  uuml: 'ü', ouml: 'ö', auml: 'ä', copy: '©', reg: '®', trade: '™', middot: '·', bull: '•'
};

export function decodeEntities(s) {
  return String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The raw inner markup of the first <name> element, or undefined.
function inner(block, name) {
  const re = new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}\\s*>`, 'i');
  const m = re.exec(block);
  return m ? m[1] : undefined;
}

// The content of an element as markup: CDATA unwrapped, or entities decoded once.
function markup(raw) {
  if (raw === undefined) return '';
  const s = raw.trim();
  if (/<!\[CDATA\[/.test(s)) return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(s);
}

// Plain text from markup: tags removed, entities decoded, spaces collapsed.
export function toText(html) {
  return decodeEntities(
    String(html ?? '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

const field = (block, ...names) => {
  for (const n of names) {
    const v = inner(block, n);
    if (v !== undefined && v.trim()) return markup(v);
  }
  return '';
};

function attr(tagText, key) {
  const m = new RegExp(`\\s${esc(key)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tagText);
  return m ? decodeEntities(m[1] ?? m[2] ?? '') : '';
}

// Every opening or self closing <name ...> tag in the block.
function tagsNamed(block, name) {
  return block.match(new RegExp(`<${esc(name)}(?=[\\s/>])[^>]*>`, 'gi')) ?? [];
}

function absolute(u, base) {
  if (!u) return '';
  try {
    return new URL(u.trim(), base || undefined).href;
  } catch {
    return '';
  }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;

function imageOf(block, html, base) {
  for (const name of ['media:content', 'media:thumbnail']) {
    for (const t of tagsNamed(block, name)) {
      const url = attr(t, 'url');
      const medium = attr(t, 'medium');
      const type = attr(t, 'type');
      if (url && (name === 'media:thumbnail' || medium === 'image' || type.startsWith('image/') || IMAGE_EXT.test(url))) return absolute(url, base);
    }
  }
  for (const t of tagsNamed(block, 'enclosure')) {
    const url = attr(t, 'url');
    if (url && (attr(t, 'type').startsWith('image/') || IMAGE_EXT.test(url))) return absolute(url, base);
  }
  for (const t of tagsNamed(block, 'link')) {
    if (attr(t, 'rel') === 'enclosure' && attr(t, 'type').startsWith('image/')) return absolute(attr(t, 'href'), base);
  }
  const img = /<img\b[^>]*?\ssrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(html);
  if (img) {
    const src = decodeEntities(img[1] ?? img[2]);
    // Skip tracking pixels and feed badges.
    if (!/(pixel|feedburner|doubleclick|gravatar|1x1|spacer|share|badge|emoji)/i.test(src)) return absolute(src, base);
  }
  return '';
}

function dateOf(block) {
  const raw = toText(field(block, 'pubDate', 'dc:date', 'published', 'updated', 'a10:updated', 'dc:created', 'issued'));
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

function atomLink(block) {
  const links = tagsNamed(block, 'link');
  const alt = links.find((t) => attr(t, 'href') && (!attr(t, 'rel') || attr(t, 'rel') === 'alternate'));
  return alt ? attr(alt, 'href') : '';
}

// WordPress and Substack footers that say nothing about the story.
const BOILERPLATE = [
  /The post .{1,300}? appeared first on .{1,120}?\.?$/i,
  /\s*(Continue reading|Read more|Read the full story|Keep reading)\b.{0,80}$/i,
  /\s*\[(…|\.\.\.)\]\s*$/
];

export function summarize(text, max = 300) {
  let s = text;
  for (const re of BOILERPLATE) s = s.replace(re, '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

// parseFeed(xml, feedUrl) -> { title, link, items: [{ title, url, date, summary, image, author, categories, source, sourceUrl }] }
export function parseFeed(xml, feedUrl = '') {
  const text = String(xml ?? '').replace(/^﻿/, '');
  const isAtom = /<feed[\s>]/i.test(text) && !/<rss[\s>]/i.test(text);
  if (!isAtom && !/<(rss|rdf:RDF|channel)[\s>]/i.test(text)) throw new Error('not a feed');
  const head = text.split(/<(item|entry)[\s>]/i)[0];
  const feedTitle = toText(field(head, 'title'));
  const feedLink = absolute(isAtom ? atomLink(head) : toText(field(head, 'link')), feedUrl) || feedUrl;

  const blocks = text.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const items = [];
  for (const block of blocks) {
    const title = toText(field(block, 'title'));
    let url = isAtom ? atomLink(block) : toText(field(block, 'link'));
    if (!url) {
      const guid = inner(block, 'guid');
      const guidText = guid ? toText(markup(guid)) : '';
      if (/^https?:\/\//i.test(guidText)) url = guidText;
    }
    url = absolute(url, feedLink);
    if (!title || !url) continue;
    const html = field(block, 'content:encoded', 'description', 'summary', 'content', 'media:description');
    const summary = summarize(toText(html));
    const categories = [...block.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>|<category\b([^>]*)\/>/gi)]
      .map((m) => toText(markup(m[2] ?? '')) || attr(m[1] ?? m[3] ?? '', 'term'))
      .filter(Boolean)
      .slice(0, 12);
    const authorBlock = inner(block, 'author');
    const author = toText(field(block, 'dc:creator')) || (authorBlock ? toText(field(authorBlock, 'name') || markup(authorBlock)) : '');
    const sourceTag = /<source\b([^>]*)>([\s\S]*?)<\/source>/i.exec(block);
    items.push({
      title,
      url,
      date: dateOf(block),
      summary,
      image: imageOf(block, html, url),
      author: /@/.test(author) ? '' : author.slice(0, 80),
      categories,
      source: sourceTag ? toText(markup(sourceTag[2])) : '',
      sourceUrl: sourceTag ? attr(sourceTag[1], 'url') : ''
    });
  }
  return { title: feedTitle, link: feedLink, items };
}

// Feed addresses a web page advertises in its <head>.
export function feedLinksIn(html, pageUrl) {
  const out = [];
  for (const t of tagsNamed(html, 'link')) {
    const rel = attr(t, 'rel').toLowerCase();
    const type = attr(t, 'type').toLowerCase();
    if (rel.includes('alternate') && /(rss|atom)\+xml|application\/feed\+json/.test(type)) {
      const href = absolute(attr(t, 'href'), pageUrl);
      if (href) out.push({ url: href, title: attr(t, 'title') });
    }
  }
  return out;
}
