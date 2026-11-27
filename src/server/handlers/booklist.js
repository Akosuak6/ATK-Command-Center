// POST /api/booklist  { url }  or  { images: [dataUrl, ...] }
// -> { books: [{ title, author }], from: { title, creator, slides } }
// Reads the books a post recommends. A TikTok link gives its photo slides (or a video's cover) and
// caption; any other link gives the page text; screenshots are read as they are. Claude lists the books.
// Key: ANTHROPIC_API_KEY in Vercel (only signed in devices reach this), or the x-anthropic-key header
// saved on a device when the server has no key.
import Anthropic from '@anthropic-ai/sdk';
import { fetchWithTimeout, safeUrl } from './_safe.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const MAX_IMAGES = 12;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SCHEMA = {
  type: 'object',
  properties: {
    books: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, author: { type: 'string' } },
        required: ['title', 'author'],
        additionalProperties: false
      }
    }
  },
  required: ['books'],
  additionalProperties: false
};

const PROMPT = `These are from a post that recommends books (slides, screenshots, or page text). List every book it recommends, in the order shown.
Use the title the book is published under in the US, with normal capitalization, and the author's full name. When the author is not shown, give the author of that book if you know it; otherwise leave author empty.
Only include books that actually appear in the post. Skip the creator's name, captions, hashtags, and anything that is not a book. If there are no books, return an empty list.`;

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 40 * 1024 * 1024) throw Object.assign(new Error('Too many or too large screenshots'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const isTikTok = (u) => /(^|\.)tiktok\.com$/i.test(u.hostname);

// The post's ID from a full link, or from where a short link (vm.tiktok.com, vt.tiktok.com, /t/) leads.
async function tiktokId(u) {
  const direct = /\/(?:video|photo)\/(\d+)/.exec(u.pathname);
  if (direct) return direct[1];
  const r = await fetchWithTimeout(u.href, { headers: { 'user-agent': UA } }, 8000);
  r.body?.cancel?.().catch?.(() => {});
  return /\/(?:video|photo)\/(\d+)/.exec(r.url)?.[1] ?? '';
}

// TikTok serves a photo post's slides on its video page, and any username works there.
async function readTikTok(u) {
  const id = await tiktokId(u);
  if (!id) throw Object.assign(new Error('That does not look like a TikTok post link'), { status: 400 });
  const r = await fetchWithTimeout(`https://www.tiktok.com/@i/video/${id}`, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } }, 10000);
  const html = await r.text();
  const m = /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  let item = null;
  try { item = JSON.parse(m?.[1] ?? '{}').__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct ?? null; } catch { item = null; }
  if (!item) throw Object.assign(new Error('TikTok did not share this post. Try screenshots instead.'), { status: 502 });
  const slides = (item.imagePost?.images ?? []).map((im) => im.imageURL?.urlList?.[0]).filter(Boolean);
  const cover = item.video?.originCover || item.video?.cover;
  return {
    title: item.imagePost?.title || '',
    creator: item.author?.nickname || item.author?.uniqueId || '',
    caption: item.desc || '',
    imageUrls: (slides.length ? slides : cover ? [cover] : []).slice(0, MAX_IMAGES),
    isVideo: !slides.length
  };
}

async function readPage(u) {
  const r = await fetchWithTimeout(u.href, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } }, 10000);
  const html = (await r.text()).slice(0, 2_000_000);
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40000);
  return { title, creator: '', caption: text, imageUrls: [], isVideo: false };
}

async function download(url) {
  const r = await fetchWithTimeout(url, { headers: { 'user-agent': UA, referer: 'https://www.tiktok.com/' } }, 10000);
  const type = (r.headers.get('content-type') ?? '').split(';')[0];
  if (!r.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > MAX_IMAGE_BYTES ? null : { media_type: type, data: buf.toString('base64') };
}

function fromDataUrl(s) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(s || ''));
  return m && m[2].length * 0.75 <= MAX_IMAGE_BYTES ? { media_type: m[1], data: m[2] } : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const key = String(process.env.ANTHROPIC_API_KEY || req.headers['x-anthropic-key'] || '').trim();
  if (!key) return res.status(401).json({ error: 'needs-key' });

  try {
    const body = await readBody(req);
    let post = { title: '', creator: '', caption: '', imageUrls: [], isVideo: false };
    let images = [];
    if (Array.isArray(body.images) && body.images.length) {
      images = body.images.slice(0, MAX_IMAGES).map(fromDataUrl).filter(Boolean);
      if (!images.length) return res.status(400).json({ error: 'Those files could not be read as images' });
    } else {
      const u = safeUrl(body.url);
      if (!u) return res.status(400).json({ error: 'Paste a full link, starting with https' });
      post = isTikTok(u) ? await readTikTok(u) : await readPage(u);
      images = (await Promise.all(post.imageUrls.map(download))).filter(Boolean);
      if (!images.length && !post.caption) return res.status(502).json({ error: 'Nothing could be read from that link. Try screenshots instead.' });
    }

    const notes = [post.title && `Post title: ${post.title}`, post.caption && `${post.imageUrls.length ? 'Caption' : 'Page text'}: ${post.caption}`].filter(Boolean).join('\n\n');
    const client = new Anthropic({ apiKey: key });
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          ...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.media_type, data: im.data } })),
          { type: 'text', text: notes ? `${PROMPT}\n\n${notes}` : PROMPT }
        ]
      }]
    });

    if (msg.stop_reason === 'refusal') return res.status(422).json({ error: 'Claude could not read this one. Try screenshots instead.' });
    const text = msg.content.find((b) => b.type === 'text')?.text ?? '{}';
    let books = [];
    try { books = JSON.parse(text).books ?? []; } catch { books = []; }
    books = books
      .map((b) => ({ title: String(b.title || '').trim(), author: String(b.author || '').trim() }))
      .filter((b) => b.title);
    return res.status(200).json({
      books,
      from: { title: post.title, creator: post.creator, slides: images.length, isVideo: post.isVideo }
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return res.status(401).json({ error: 'bad-key' });
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Claude is busy. Try again in a minute.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude said: ${e.message}` });
    return res.status(e.status || 500).json({ error: e.message || 'Could not read that post' });
  }
}
