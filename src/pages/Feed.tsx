import { useEffect, useMemo, useState } from 'react';
import { db, getMeta, setMeta, uid, useMeta, useTable } from '../lib/db';
import { hrefFor } from '../lib/router';
import { normalizeUrl, timeOfDate, todayISO } from '../lib/format';
import {
  DEFAULT_FEED_SETTINGS, STALE_AFTER_MS, addPasted, discoverFeed, liveKeywords, orderedTopics, rankFeed, refreshFeed, saveToDump,
  setKeywords, timeAgo, topicLabel, topicTagClass
} from '../lib/feed';
import { MAX_KEYWORDS, parseKeywordInput } from '../../scraper/lib/keywords.js';
import { IconClose } from '../components/Icons';
import { LENSES, TOPICS } from '../../scraper/lib/topics.js';
import { GROUP_LABELS, SOURCES, type SourceGroup } from '../../scraper/lib/sources.js';
import type { CustomFeedSource, FeedItem, FeedSettings, FeedSourceStatus } from '../lib/types';
import { Chips, Sheet, useToast } from '../components/ui';
import { useFocusItem } from '../components/Search';

type Lens = 'all' | 'keywords' | 'health' | 'fashion' | 'ai' | 'consumer' | 'linkedin' | 'saved';
const PAGE = 24;

export function Feed({ focus }: { focus?: string }) {
  const items = useTable(db.feed);
  const settings = useMeta<FeedSettings>('feedSettings', DEFAULT_FEED_SETTINGS);
  const refreshedAt = useMeta<string | null>('feedRefreshedAt', null);
  const status = useMeta<FeedSourceStatus[]>('feedStatus', []);
  const toast = useToast();
  const [lens, setLens] = useState<Lens>('all');
  const [topic, setTopic] = useState('');
  const [sort, setSort] = useState<'top' | 'new'>('top');
  const [count, setCount] = useState(focus ? 1000 : PAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paste, setPaste] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [kwInput, setKwInput] = useState('');
  const [kwFocus, setKwFocus] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const [seenAt, setSeenAt] = useState<string | null>(null);
  useFocusItem(focus, items.length > 0);

  // Stories that arrived since you last left this page get a New tag.
  useEffect(() => {
    let alive = true;
    void getMeta<string | null>('feedSeenAt', null).then((v) => { if (alive) setSeenAt(v ?? ''); });
    return () => {
      alive = false;
      void setMeta('feedSeenAt', new Date().toISOString());
    };
  }, []);

  const refresh = async (fresh: boolean) => {
    setBusy(true);
    const r = await refreshFeed(fresh);
    setBusy(false);
    if (!r.ok) {
      setError(r.message ?? 'Could not refresh');
      if (fresh) toast(r.message ?? 'Could not refresh');
      return;
    }
    setError('');
    if (fresh) toast(r.added ? `${r.added} new ${r.added === 1 ? 'story' : 'stories'}` : 'You are up to date');
  };

  // Open the page, get a fresh feed when the last one is a couple of hours old.
  useEffect(() => {
    void getMeta<string | null>('feedRefreshedAt', null).then((at) => {
      if (!at || Date.now() - Date.parse(at) > STALE_AFTER_MS) void refresh(false);
    });
  }, []);

  const muted = useMemo(() => new Set(settings.mutedTopics), [settings.mutedTopics]);
  const keywords = useMemo(() => settings.keywords ?? [], [settings.keywords]);
  const lensDef = LENSES.find((l) => l.id === lens);
  const lensTopics = lensDef ? lensDef.topics : TOPICS.map((t) => t.id);
  const kwOf = (i: FeedItem) => liveKeywords(i, keywords);

  const visible = useMemo(
    () => items.filter((i) => !i.hidden && (i.manual || i.saved || liveKeywords(i, keywords).length > 0 || i.topics.some((t) => !muted.has(t)))),
    [items, muted, keywords]
  );
  const inLens = visible.filter((i) => {
    if (lens === 'saved') return Boolean(i.saved);
    if (lens === 'linkedin') return i.kind === 'linkedin';
    if (lens === 'keywords') return kwOf(i).length > 0;
    return lens === 'all' ? true : i.topics.some((t) => lensTopics.includes(t));
  });
  // The second row filters by a topic id, or by one of your keywords as kw:<keyword>.
  const shownAll = !topic ? inLens : topic.startsWith('kw:') ? inLens.filter((i) => kwOf(i).includes(topic.slice(3))) : inLens.filter((i) => i.topics.includes(topic));
  const ordered = sort === 'top' ? rankFeed(shownAll) : [...shownAll].sort((a, b) => b.date.localeCompare(a.date));
  const shown = ordered.slice(0, count);

  const topicCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of inLens) {
      for (const t of i.topics) c[t] = (c[t] ?? 0) + 1;
      for (const k of liveKeywords(i, keywords)) c[`kw:${k}`] = (c[`kw:${k}`] ?? 0) + 1;
    }
    return c;
  }, [inLens, keywords]);
  const keywordCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of visible) for (const k of liveKeywords(i, keywords)) c[k] = (c[k] ?? 0) + 1;
    return c;
  }, [visible, keywords]);
  const topicOptions = lens === 'keywords'
    ? keywords.map((k) => `kw:${k}`).filter((t) => topicCounts[t])
    : (lens === 'all' || lens === 'saved' || lens === 'linkedin' ? TOPICS.map((t) => t.id) : lensTopics).filter((t) => !muted.has(t) && topicCounts[t]);
  const optionLabel = (t: string) => (t.startsWith('kw:') ? t.slice(3) : topicLabel(t));

  const addKeywords = async () => {
    const parsed = parseKeywordInput(kwInput);
    if (!parsed.length) { toast('Type a keyword or phrase first'); return; }
    const fresh = parsed.filter((k) => !keywords.some((x) => x.toLowerCase() === k.toLowerCase()));
    setKwInput('');
    if (!fresh.length) { toast(parsed.length === 1 ? 'You already follow that keyword' : 'You already follow those keywords'); return; }
    if (keywords.length + fresh.length > MAX_KEYWORDS) toast(`You can follow up to ${MAX_KEYWORDS} keywords`);
    await setKeywords([...keywords, ...fresh]);
    setLens('keywords');
    setTopic(fresh.length === 1 ? `kw:${fresh[0]}` : '');
    setCount(PAGE);
    toast(`Looking for ${fresh.length === 1 ? `"${fresh[0]}"` : `${fresh.length} keywords`} everywhere`);
    void refresh(true);
  };

  const removeKeyword = async (k: string) => {
    const next = await setKeywords(keywords.filter((x) => x !== k));
    if (topic === `kw:${k}`) setTopic('');
    if (!next.length && lens === 'keywords') setLens('all');
  };

  const answered = status.filter((s) => s.ok).length;
  const statusLine = refreshedAt
    ? `Updated ${refreshedAt.slice(0, 10) === todayISO() ? timeOfDate(refreshedAt) : timeAgo(refreshedAt).toLowerCase()} from ${answered} of ${status.length} sources`
    : busy ? 'Pulling the first stories' : 'Not refreshed yet';

  const addPost = async () => {
    const url = paste.trim();
    if (!url) { toast('Paste a link first'); return; }
    try { new URL(normalizeUrl(url)); } catch { toast('That does not look like a link'); return; }
    setPasting(true);
    const { item, existed } = await addPasted(url);
    setPasting(false);
    setPaste('');
    setLens('all');
    setTopic('');
    toast(existed ? 'Already in your feed' : item.kind === 'linkedin' ? 'LinkedIn post added' : 'Added to your feed');
  };

  return (
    <div className="stack">
      <section className="card" aria-labelledby="feed-h">
        <div className="trend-head">
          <div className="stack-s" style={{ gap: 4 }}>
            <h2 className="h2" id="feed-h">Your feed</h2>
            <span className="sub" aria-live="polite">{statusLine}</span>
          </div>
          <div className="feed-head-btns">
            <button type="button" className="btn2" onClick={() => setSheet(true)}>Sources and topics</button>
            <button type="button" className="btn" onClick={() => void refresh(true)} disabled={busy}>{busy ? 'Refreshing' : 'Refresh'}</button>
          </div>
        </div>
        <form className="stack-s" noValidate onSubmit={(e) => { e.preventDefault(); void addKeywords(); }}>
          <label htmlFor="fkw" className="lbl">Your keywords</label>
          <div className="inline-add">
            <input id="fkw" type="text" autoCapitalize="off" className="field" value={kwInput} onChange={(e) => setKwInput(e.target.value)} onFocus={() => setKwFocus(true)} onBlur={() => setKwFocus(false)} placeholder="Type a keyword or phrase, like quiet luxury" enterKeyHint="done" />
            <button type="submit" className="btn2">Add</button>
          </div>
          {(kwFocus || kwInput || keywords.length === 0) && (
            <span className="sub">Every story from every source is checked for your keywords, and each keyword gets its own news search. Separate several with commas.</span>
          )}
        </form>
        {keywords.length > 0 && (
          <ul className="kw-list" aria-label="Keywords you follow">
            {keywords.map((k) => (
              <li className="kw-chip" key={k}>
                <button type="button" className="kw-name" onClick={() => { setLens('keywords'); setTopic(`kw:${k}`); setCount(PAGE); }} aria-label={`Show stories for ${k}`}>
                  {k} <span className="chip-count">{keywordCounts[k] ?? 0}</span>
                </button>
                <button type="button" className="kw-remove" onClick={() => void removeKeyword(k)} aria-label={`Stop following ${k}`}><IconClose /></button>
              </li>
            ))}
          </ul>
        )}
        {pasteOpen ? (
          <form className="stack-s" noValidate onSubmit={(e) => { e.preventDefault(); void addPost(); }}>
            <label htmlFor="fpaste" className="lbl">Paste a LinkedIn post or any article</label>
            <div className="inline-add">
              <input id="fpaste" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" className="field" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="https://www.linkedin.com/posts/..." autoFocus />
              <button type="submit" className="btn2" disabled={pasting}>{pasting ? 'Adding' : 'Add'}</button>
            </div>
            <span className="sub">LinkedIn does not let apps read your feed, so paste the posts worth keeping here. They are tagged by topic and your keywords, and stay until you remove them.</span>
          </form>
        ) : (
          <button type="button" className="btn-text" onClick={() => setPasteOpen(true)}>Paste a LinkedIn post or article</button>
        )}
        {error && <p className="feed-error" role="status">{error}</p>}
      </section>

      <div className="chips chips-scroll" role="group" aria-label="Show">
        {[
          { value: 'all' as Lens, label: 'For you' },
          ...(keywords.length ? [{ value: 'keywords' as Lens, label: 'Your keywords' }] : []),
          ...LENSES.filter((l) => l.id !== 'all').map((l) => ({ value: l.id as Lens, label: l.label })),
          { value: 'linkedin' as Lens, label: 'LinkedIn' },
          { value: 'saved' as Lens, label: 'Saved' }
        ].map((o) => (
          <button key={o.value} type="button" className="chip" aria-pressed={lens === o.value} onClick={() => { setLens(o.value); setTopic(''); setCount(PAGE); }}>{o.label}</button>
        ))}
      </div>
      {topicOptions.length > 1 && (
        <div className="chips chips-scroll" role="group" aria-label="Topic">
          <button type="button" className="chip" aria-pressed={!topic} onClick={() => { setTopic(''); setCount(PAGE); }}>{lens === 'keywords' ? 'All keywords' : 'All topics'}</button>
          {topicOptions.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={topic === t} onClick={() => { setTopic(topic === t ? '' : t); setCount(PAGE); }}>
              {optionLabel(t)} <span className="chip-count">{topicCounts[t]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row" style={{ alignItems: 'center' }}>
        <span className="sub">{ordered.length} {ordered.length === 1 ? 'story' : 'stories'}</span>
        <Chips<'top' | 'new'> label="Sort" value={sort} onChange={setSort} options={[{ value: 'top', label: 'Top' }, { value: 'new', label: 'Newest' }]} />
      </div>

      {items.length === 0 && !busy && (
        <section className="card" style={{ alignItems: 'flex-start' }}>
          <h2 className="h2">Nothing here yet</h2>
          <p className="body" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 560 }}>
            Type your keywords above, or tap Refresh to pull this week's stories on digital health, femtech, women's health, mental health, Medicaid, Medicare and health services, plus trend forecasting and fashion with technology, AI and consumers.
          </p>
        </section>
      )}
      {items.length > 0 && ordered.length === 0 && (
        <p className="empty">
          {lens === 'saved' ? 'Nothing saved yet. Tap Save to Dump on a story to keep it.'
            : lens === 'keywords' || topic.startsWith('kw:') ? (busy ? 'Looking for your keywords' : 'Nothing for this keyword yet. New stories come in on each refresh.')
            : 'No stories here yet. Try another topic or tap Refresh.'}
        </p>
      )}

      <div className="masonry">
        {shown.map((i) => (
          <FeedCard
            key={i.id}
            item={i}
            keywords={kwOf(i)}
            isNew={Boolean(seenAt) && i.firstSeen > seenAt! && !i.manual}
            showImage={Boolean(i.image) && !brokenImages.has(i.id)}
            onBrokenImage={() => setBrokenImages((s) => new Set(s).add(i.id))}
            onTopic={(t) => { if (t.startsWith('kw:')) setLens('keywords'); setTopic(t); setCount(PAGE); }}
          />
        ))}
      </div>
      {ordered.length > count && (
        <button type="button" className="btn2" style={{ alignSelf: 'center' }} onClick={() => setCount(count + PAGE)}>
          Show more ({ordered.length - count} left)
        </button>
      )}

      <FeedSettingsSheet open={sheet} onClose={() => setSheet(false)} settings={settings} status={status} onChanged={() => void refresh(true)} />
    </div>
  );
}

function FeedCard({ item: i, keywords, isNew, showImage, onBrokenImage, onTopic }: { item: FeedItem; keywords: string[]; isNew: boolean; showImage: boolean; onBrokenImage: () => void; onTopic: (t: string) => void }) {
  const toast = useToast();
  const markRead = () => { if (!i.read) void db.feed.update(i.id, { read: true }); };
  const tags = orderedTopics(i.topics).slice(0, Math.max(1, 3 - keywords.length));
  return (
    <article className={`card feed-card${showImage ? ' has-cover' : ''}${i.read ? ' read' : ''}`} id={`item-${i.id}`}>
      {showImage && (
        <a href={i.url} target="_blank" rel="noopener noreferrer" className="dump-cover" tabIndex={-1} aria-hidden="true" onClick={markRead}>
          <img src={i.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={onBrokenImage} />
        </a>
      )}
      <div className="feed-meta">
        <span className="feed-source">{i.source}</span>
        <span className="sub">{timeAgo(i.date)}</span>
        {isNew && <span className="tag t-work">New</span>}
        {i.manual && <span className="tag t-plain">Pasted</span>}
      </div>
      <a href={i.url} target="_blank" rel="noopener noreferrer" className="dump-title" onClick={markRead}>{i.title}</a>
      {i.author && <span className="sub">{i.kind === 'linkedin' ? `Posted by ${i.author}` : `By ${i.author}`}</span>}
      {i.summary && <p className="feed-summary">{i.summary}</p>}
      {(tags.length > 0 || keywords.length > 0 || (i.also?.length ?? 0) > 0) && (
        <div className="feed-tags">
          {keywords.map((k) => (
            <button key={`kw:${k}`} type="button" className="tag t-kw tag-btn" onClick={() => onTopic(`kw:${k}`)} aria-label={`Show only ${k}`}>{k}</button>
          ))}
          {tags.map((t) => (
            <button key={t} type="button" className={`${topicTagClass(t)} tag-btn`} onClick={() => onTopic(t)} aria-label={`Show only ${topicLabel(t)}`}>{topicLabel(t)}</button>
          ))}
          {i.also?.length ? <span className="sub">Also in {i.also.slice(0, 3).join(', ')}</span> : null}
        </div>
      )}
      <div className="card-actions">
        {i.saved
          ? <a className="btn-text" href={hrefFor('dump', 'all', i.saved)}>Saved to Dump</a>
          : <button type="button" className="btn-text" onClick={async () => { await saveToDump(i); toast('Saved to your Dump'); }}>Save to Dump</button>}
        {i.manual
          ? <button type="button" className="btn-text btn-danger" onClick={() => { if (confirm(`Remove "${i.title}" from your feed?`)) void db.feed.delete(i.id); }}>Remove</button>
          : <button type="button" className="btn-text" onClick={() => { void db.feed.update(i.id, { hidden: true }); toast('Hidden'); }}>Hide</button>}
      </div>
    </article>
  );
}

const GROUP_ORDER: SourceGroup[] = ['health', 'fashion', 'search', 'linkedin'];
const DOMAIN_OPTIONS = [{ value: 'health', label: 'Healthcare' }, { value: 'fashion', label: 'Fashion' }, { value: 'both', label: 'Both' }] as const;

function FeedSettingsSheet({ open, onClose, settings: stored, status, onChanged }: { open: boolean; onClose: () => void; settings: FeedSettings; status: FeedSourceStatus[]; onChanged: () => void }) {
  const toast = useToast();
  // A local copy, so switches and chips respond at once while the change is saved.
  const [settings, setSettings] = useState(stored);
  useEffect(() => { setSettings(stored); }, [stored]);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<'feed' | 'search'>('feed');
  const [form, setForm] = useState<{ url: string; query: string; name: string; domain: 'health' | 'fashion' | 'both'; keep: 'all' | 'match' }>({ url: '', query: '', name: '', domain: 'health', keep: 'all' });
  const [finding, setFinding] = useState(false);
  const byId = useMemo(() => Object.fromEntries(status.map((s) => [s.id, s])), [status]);
  const skip = new Set(settings.skip);
  const muted = new Set(settings.mutedTopics);

  const save = async (patch: Partial<FeedSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setDirty(true);
    await setMeta('feedSettings', next);
  };
  const close = () => {
    onClose();
    if (dirty) { setDirty(false); onChanged(); }
  };

  const statusText = (id: string) => {
    const s = byId[id];
    if (!s) return { text: 'Not read yet', bad: false };
    if (!s.ok) return { text: `Did not answer (${s.error})`, bad: true };
    return { text: s.kept ? `${s.kept} ${s.kept === 1 ? 'story' : 'stories'}` : 'Nothing on your topics', bad: false };
  };

  const find = async () => {
    if (!form.url.trim()) { toast('Paste a site or feed address first'); return; }
    setFinding(true);
    const r = await discoverFeed(form.url);
    setFinding(false);
    if (r.error === 'linkedin') { toast('LinkedIn has no feeds. Paste single posts into the box on the feed instead.'); return; }
    if (!r.url) { toast(r.error === 'no feed found' ? 'No feed found on that site' : 'Could not open that site'); return; }
    setForm({ ...form, url: r.url, name: form.name || r.title || '' });
    toast(`Found a feed with ${r.items ?? 0} stories`);
  };

  const add = async () => {
    const name = form.name.trim();
    let source: CustomFeedSource;
    if (mode === 'search') {
      const query = form.query.trim();
      if (!query) { toast('Type what to search for first'); return; }
      source = { id: uid().slice(0, 12), name: name || `Search: ${query}`, query, domain: form.domain, keep: form.keep, topics: [] };
    } else {
      const url = normalizeUrl(form.url);
      try { new URL(url); } catch { toast('Paste a feed or site address first'); return; }
      if (/linkedin\.com/i.test(url)) { toast('LinkedIn has no feeds. Paste single posts into the box on the feed instead.'); return; }
      source = { id: uid().slice(0, 12), name: name || new URL(url).hostname.replace(/^www\./, ''), url, domain: form.domain, keep: form.keep, topics: [] };
    }
    await save({ custom: [...settings.custom, source] });
    setForm({ url: '', query: '', name: '', domain: form.domain, keep: 'all' });
    toast('Added. It is read on the next refresh.');
  };

  return (
    <Sheet title="Sources and topics" open={open} onClose={close}>
      <section className="stack-s" aria-labelledby="ft-h">
        <h3 className="lbl" id="ft-h">Topics you follow</h3>
        <span className="sub">Turn a topic off to hide its stories. Pasted and saved stories always stay.</span>
        {(['health', 'fashion'] as const).map((g) => (
          <div className="chips" role="group" aria-label={g === 'health' ? 'Healthcare topics' : 'Fashion topics'} key={g}>
            {TOPICS.filter((t) => t.group === g).map((t) => (
              <button key={t.id} type="button" className="chip" aria-pressed={!muted.has(t.id)}
                onClick={() => void save({ mutedTopics: muted.has(t.id) ? settings.mutedTopics.filter((x) => x !== t.id) : [...settings.mutedTopics, t.id] })}>
                {t.label}
              </button>
            ))}
          </div>
        ))}
      </section>

      {GROUP_ORDER.map((g) => (
        <section className="stack-s" key={g} aria-label={GROUP_LABELS[g]} style={{ gap: 0 }}>
          <h3 className="lbl" style={{ marginBottom: 4 }}>{GROUP_LABELS[g]}</h3>
          {SOURCES.filter((s) => s.group === g).map((s) => {
            const st = statusText(s.id);
            return (
              <label className={`feed-src${st.bad && !skip.has(s.id) ? ' bad' : ''}`} key={s.id}>
                <input type="checkbox" checked={!skip.has(s.id)} onChange={(e) => void save({ skip: e.target.checked ? settings.skip.filter((x) => x !== s.id) : [...settings.skip, s.id] })} />
                <span className="feed-src-name">{s.name}</span>
                <span className="sub">{skip.has(s.id) ? 'Off' : st.text}</span>
              </label>
            );
          })}
        </section>
      ))}

      <section className="stack-s" aria-labelledby="fc-h" style={{ gap: 0 }}>
        <h3 className="lbl" id="fc-h" style={{ marginBottom: 4 }}>{GROUP_LABELS.custom}</h3>
        {settings.custom.length === 0 && <span className="sub" style={{ padding: '6px 0' }}>Add a Substack, a newsletter, any site with a feed, or a Google News search.</span>}
        {settings.custom.map((c) => {
          const st = statusText(`c-${c.id}`);
          return (
            <div className={`feed-src${st.bad ? ' bad' : ''}`} key={c.id}>
              <span className="feed-src-name">{c.name}<span className="sub" style={{ display: 'block' }}>{c.query ? `Google News: ${c.query}` : c.url}</span></span>
              <span className="sub">{st.text}</span>
              <button type="button" className="btn-text btn-danger" onClick={() => void save({ custom: settings.custom.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.name}`}>Remove</button>
            </div>
          );
        })}
      </section>

      <form className="stack-s card" style={{ gap: 10, padding: 16 }} noValidate onSubmit={(e) => { e.preventDefault(); void add(); }} aria-labelledby="fa-h">
        <h3 className="h2" id="fa-h" style={{ fontSize: 19 }}>Add a source</h3>
        <Chips<'feed' | 'search'> label="Kind of source" value={mode} onChange={setMode} options={[{ value: 'feed', label: 'A site or feed' }, { value: 'search', label: 'A Google News search' }]} />
        {mode === 'feed' ? (
          <>
            <label htmlFor="fa-url" className="lbl">Site or feed address</label>
            <div className="inline-add">
              <input id="fa-url" type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" className="field" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="writer.substack.com or a feed link" />
              <button type="button" className="btn2" onClick={() => void find()} disabled={finding}>{finding ? 'Looking' : 'Find feed'}</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="fa-q" className="lbl">Search for</label>
            <input id="fa-q" type="text" className="field" value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} placeholder='For example "GLP-1" fashion, or Oura ring' />
          </>
        )}
        <label htmlFor="fa-name" className="lbl">Name (optional)</label>
        <input id="fa-name" type="text" className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="How it shows in the feed" />
        <span className="lbl">It covers</span>
        <Chips label="It covers" value={form.domain} onChange={(v) => setForm({ ...form, domain: v })} options={[...DOMAIN_OPTIONS]} />
        <span className="lbl">Keep</span>
        <Chips<'all' | 'match'> label="Keep" value={form.keep} onChange={(v) => setForm({ ...form, keep: v })} options={[{ value: 'all', label: 'Every story' }, { value: 'match', label: 'Only stories on my topics' }]} />
        <button type="submit" className="btn">Add source</button>
      </form>
    </Sheet>
  );
}
