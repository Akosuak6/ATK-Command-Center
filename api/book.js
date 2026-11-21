// GET /api/book?url=...  or  /api/book?q=title author
// -> { title, author, cover, description, price, currency, store, buyUrl, isbn }
// Reads the store page (structured data and meta tags), then fills gaps from Open Library and Google Books.
// No keys needed.
import { fetchWithTimeout, safeUrl } from './_safe.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

const STORES = [
  [/bookshop\.org/, 'Bookshop.org'], [/amazon\./, 'Amazon'], [/barnesandnoble\.com/, 'Barnes & Noble'],
  [/goodreads\.com/, 'Goodreads'], [/target\.com/, 'Target'], [/books\.google\./, 'Google Books'],
  [/audible\./, 'Audible'], [/libro\.fm/, 'Libro.fm'], [/thriftbooks\.com/, 'ThriftBooks'], [/books\.apple\.com/, 'Apple Books']
];

const decode = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/\s+/g, ' ').trim();

function meta(html, keys) {
  for (const key of keys) {
    const a = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']*)["']`, 'i').exec(html);
    const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, 'i').exec(html);
    const m = a || b;
    if (m && m[1]) return decode(m[1]);
  }
  return '';
}

function jsonLd(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const list = Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j];
      out.push(...list);
    } catch { /* skip broken blocks */ }
  }
  return out.find((x) => /Book|Product/i.test([].concat(x['@type'] || []).join(' '))) || null;
}

const isbnFrom = (s) => {
  const m = /(97[89]\d{10})/.exec(s) || /\/dp\/(\d{9}[\dX])\b/i.exec(s) || /\/(\d{9}[\dX])(?:[/?]|$)/.exec(s);
  return m ? m[1] : '';
};

async function json(url) {
  const r = await fetchWithTimeout(url, { headers: { 'user-agent': UA, accept: 'application/json' } }, 6000);
  return r.ok ? r.json() : null;
}

async function openLibrary({ isbn, q }) {
  try {
    let work = null;
    let edition = null;
    let cover = '';
    let author = '';
    let title = '';
    if (isbn) {
      edition = await json(`https://openlibrary.org/isbn/${isbn}.json`);
      if (edition) {
        title = edition.title || '';
        if (edition.covers?.[0] > 0) cover = `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg`;
        if (edition.works?.[0]?.key) work = await json(`https://openlibrary.org${edition.works[0].key}.json`);
      }
    }
    if (!work && q) {
      const s = await json(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=1&fields=key,title,author_name,cover_i,isbn`);
      const d = s?.docs?.[0];
      if (d) {
        title = title || d.title || '';
        author = d.author_name?.[0] || '';
        if (d.cover_i) cover = cover || `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`;
        isbn = isbn || (d.isbn || []).find((x) => /^97[89]/.test(x)) || '';
        if (d.key) work = await json(`https://openlibrary.org${d.key}.json`);
      }
    }
    if (work && !author && work.authors?.[0]?.author?.key) {
      const a = await json(`https://openlibrary.org${work.authors[0].author.key}.json`);
      author = a?.name || '';
    }
    if (work && !cover && work.covers?.[0] > 0) cover = `https://covers.openlibrary.org/b/id/${work.covers[0]}-L.jpg`;
    const description = typeof work?.description === 'string' ? work.description : work?.description?.value || '';
    return { title: title || work?.title || '', author, cover, description: decode(description).replace(/\(\[source\].*$/i, '').trim(), isbn };
  } catch {
    return {};
  }
}

async function googleBooks({ isbn, q }) {
  try {
    const query = isbn ? `isbn:${isbn}` : q;
    const j = await json(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1&printType=books`);
    const v = j?.items?.[0];
    if (!v) return {};
    const info = v.volumeInfo || {};
    const img = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
    const price = v.saleInfo?.retailPrice || v.saleInfo?.listPrice;
    return {
      title: info.title || '', author: info.authors?.[0] || '', description: decode(info.description || ''),
      cover: img ? img.replace(/^http:/, 'https:').replace(/&edge=curl/, '').replace(/zoom=\d/, 'zoom=2') : '',
      isbn: (info.industryIdentifiers || []).find((x) => x.type === 'ISBN_13')?.identifier || '',
      price: price?.amount || 0, currency: price?.currencyCode || '', buyUrl: v.saleInfo?.buyLink || ''
    };
  } catch {
    return {};
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const target = req.query?.url ? safeUrl(req.query.url) : null;
  const q = String(req.query?.q || '').trim();
  if (!target && !q) return res.status(400).json({ error: 'send a url or q' });

  let book = { title: '', author: '', cover: '', description: '', price: 0, currency: '', store: '', buyUrl: '', isbn: '' };
  if (target) {
    book.buyUrl = target.href;
    book.store = (STORES.find(([re]) => re.test(target.hostname)) || [])[1] || target.hostname.replace(/^www\./, '');
    book.isbn = isbnFrom(target.href);
    try {
      const r = await fetchWithTimeout(target.href, { headers: { 'user-agent': UA, accept: 'text/html' } }, 7000);
      const html = (await r.text()).slice(0, 1500000);
      const ld = jsonLd(html);
      const offer = ld ? [].concat(ld.offers || [])[0] : null;
      const ldAuthor = ld ? [].concat(ld.author || [])[0] : null;
      book.title = decode(ld?.name) || meta(html, ['og:title', 'twitter:title']);
      book.author = decode(typeof ldAuthor === 'string' ? ldAuthor : ldAuthor?.name) || meta(html, ['book:author', 'author']);
      book.cover = [].concat(ld?.image || [])[0]?.url || [].concat(ld?.image || [])[0] || meta(html, ['og:image', 'twitter:image']);
      book.description = decode(ld?.description) || meta(html, ['og:description', 'description', 'twitter:description']);
      book.price = Number(offer?.price || offer?.lowPrice || meta(html, ['product:price:amount', 'og:price:amount', 'price'])) || 0;
      book.currency = offer?.priceCurrency || meta(html, ['product:price:currency', 'og:price:currency', 'priceCurrency']) || (book.price ? 'USD' : '');
      book.isbn = book.isbn || decode(ld?.isbn) || meta(html, ['book:isbn', 'isbn']) || isbnFrom(html.slice(0, 200000));
      if (typeof book.cover !== 'string') book.cover = '';
      if (book.cover) book.cover = new URL(book.cover, r.url).href;
      // Store titles often carry extra words: "Title: A Novel | Bookshop.org"
      book.title = book.title.replace(/\s*[|:–-]\s*(Bookshop\.org|Amazon\.com|Barnes & Noble|Goodreads).*$/i, '').replace(/^Amazon\.com:\s*/i, '').trim();
    } catch { /* fall back to the book databases */ }
  }

  const query = q || [book.title, book.author].filter(Boolean).join(' ');
  if (!book.description || book.description.length < 120 || !book.cover || !book.author || !book.title) {
    const ol = await openLibrary({ isbn: book.isbn, q: query });
    const gb = (!ol.description && (!book.description || book.description.length < 120)) || !(book.cover || ol.cover) ? await googleBooks({ isbn: book.isbn || ol.isbn, q: query || ol.title }) : {};
    book = {
      ...book,
      title: book.title || ol.title || gb.title || '',
      author: book.author || ol.author || gb.author || '',
      cover: book.cover || ol.cover || gb.cover || '',
      description: book.description && book.description.length > 120 ? book.description : (ol.description || gb.description || book.description || ''),
      isbn: book.isbn || ol.isbn || gb.isbn || '',
      price: book.price || gb.price || 0,
      currency: book.currency || gb.currency || '',
      buyUrl: book.buyUrl || gb.buyUrl || '',
      store: book.store || (gb.buyUrl ? 'Google Books' : '')
    };
  }
  if (!book.title) return res.status(404).json({ error: 'not found' });
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).json(book);
}
