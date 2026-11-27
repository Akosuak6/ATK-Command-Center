// Where the feed reads from. Every source is a public RSS or Atom feed, or a Google News search
// (which is itself an RSS feed). Nothing here logs in anywhere.
//
// domain: what the source covers ('health', 'fashion', 'both' or ''), so a story counts toward that
//   field even when the headline does not say so.
// keep: 'all' keeps every story (tagged with topics when it can, else with the source's topics);
//   'match' keeps only stories that match at least one topic. Broad magazines use 'match'.
// broad: also drop shopping lists and horoscopes.
// weight: how much the source counts when ranking. Niche, high signal sources sit above 1.

export const GROUP_LABELS = {
  health: 'Healthcare news',
  fashion: 'Fashion and retail',
  search: 'Topic searches (Google News)',
  keywords: 'Your keywords (Google News)',
  linkedin: 'LinkedIn articles (via Google News)',
  custom: 'Added by you'
};

export function googleNewsUrl(query, days = 7) {
  const q = `${query} when:${days}d`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

const gn = (id, name, query, domain, topics, extra = {}) => ({
  id, name, google: query, domain, keep: 'all', topics, group: 'search', kind: 'search', weight: 0.9, ...extra
});

export const SOURCES = [
  // Healthcare news
  { id: 'stat', name: 'STAT', url: 'https://www.statnews.com/feed/', domain: 'health', keep: 'match', group: 'health', weight: 1.05 },
  { id: 'fierce-healthcare', name: 'Fierce Healthcare', url: 'https://www.fiercehealthcare.com/rss/xml', domain: 'health', keep: 'match', group: 'health', weight: 1 },
  { id: 'healthcare-dive', name: 'Healthcare Dive', url: 'https://www.healthcaredive.com/feeds/news/', domain: 'health', keep: 'match', group: 'health', weight: 1 },
  { id: 'kff-health-news', name: 'KFF Health News', url: 'https://kffhealthnews.org/feed/', domain: 'health', keep: 'match', group: 'health', weight: 1.05 },
  { id: 'medcity', name: 'MedCity News', url: 'https://medcitynews.com/feed/', domain: 'health', keep: 'match', group: 'health', weight: 1 },
  { id: 'mobihealthnews', name: 'MobiHealthNews', url: 'https://www.mobihealthnews.com/feed', domain: 'health', keep: 'all', topics: ['digital-health'], group: 'health', weight: 1.05 },
  { id: 'healthcare-it-news', name: 'Healthcare IT News', url: 'https://www.healthcareitnews.com/home/feed', domain: 'health', keep: 'match', group: 'health', weight: 0.95 },
  { id: 'rock-health', name: 'Rock Health', url: 'https://rockhealth.com/feed/', domain: 'health', keep: 'all', topics: ['digital-health'], group: 'health', weight: 1.15, kind: 'newsletter' },
  { id: 'second-opinion', name: 'Second Opinion', url: 'https://secondopinion.media/feed', domain: 'health', keep: 'all', topics: ['digital-health'], group: 'health', weight: 1.15, kind: 'newsletter' },
  { id: 'femtech-insider', name: 'Femtech Insider', url: 'https://femtechinsider.com/feed/', domain: 'health', keep: 'all', topics: ['femtech', 'womens-health'], group: 'health', weight: 1.2 },
  { id: 'bh-business', name: 'Behavioral Health Business', url: 'https://bhbusiness.com/feed/', domain: 'health', keep: 'all', topics: ['mental-health'], group: 'health', weight: 1.1 },
  { id: 'georgetown-ccf', name: 'Georgetown Center for Children and Families', url: 'https://ccf.georgetown.edu/feed/', domain: 'health', keep: 'all', topics: ['medicaid'], group: 'health', weight: 1.1 },

  // Fashion and retail
  { id: 'vogue', name: 'Vogue', url: 'https://www.vogue.com/feed/rss', domain: 'fashion', keep: 'match', broad: true, group: 'fashion', weight: 1.05 },
  { id: 'harpers-bazaar', name: "Harper's Bazaar", url: 'https://www.harpersbazaar.com/rss/all.xml/', domain: 'fashion', keep: 'match', broad: true, group: 'fashion', weight: 1.05 },
  { id: 'elle', name: 'Elle', url: 'https://www.elle.com/rss/all.xml/', domain: 'fashion', keep: 'match', broad: true, group: 'fashion', weight: 0.95 },
  { id: 'wwd', name: 'WWD', url: 'https://wwd.com/feed/', domain: 'fashion', keep: 'match', broad: true, group: 'fashion', weight: 1.05 },
  { id: 'fashionista', name: 'Fashionista', url: 'https://fashionista.com/.rss/full/', domain: 'fashion', keep: 'match', broad: true, group: 'fashion', weight: 1 },
  { id: 'glossy', name: 'Glossy', url: 'https://www.glossy.co/feed/', domain: 'fashion', keep: 'all', topics: ['fashion-consumer'], group: 'fashion', weight: 1.15 },
  { id: 'modern-retail', name: 'Modern Retail', url: 'https://www.modernretail.co/feed/', domain: '', keep: 'match', group: 'fashion', weight: 1.05 },
  { id: 'retail-dive', name: 'Retail Dive', url: 'https://www.retaildive.com/feeds/news/', domain: '', keep: 'match', group: 'fashion', weight: 0.95 },
  { id: 'fashion-law', name: 'The Fashion Law', url: 'https://www.thefashionlaw.com/feed/', domain: 'fashion', keep: 'all', topics: ['fashion-consumer'], group: 'fashion', weight: 1.1 },

  // Topic searches. Google News reads full articles, so these catch stories whose headlines never name the topic,
  // and publishers without a feed of their own (WGSN, The Business of Fashion, Vogue Business).
  gn('gn-digital-health', 'Digital health', '"digital health" OR telehealth OR "health tech"', 'health', ['digital-health']),
  gn('gn-femtech', 'Femtech', 'femtech OR "women\'s health startup" OR "menopause startup"', 'health', ['femtech']),
  gn('gn-womens-health', "Women's health", '"women\'s health" OR "maternal health"', 'health', ['womens-health']),
  gn('gn-mental-health', 'Mental health', '"behavioral health" OR "mental health care" OR "mental health startup"', 'health', ['mental-health']),
  gn('gn-medicaid', 'Medicaid', 'Medicaid', 'health', ['medicaid']),
  gn('gn-medicare', 'Medicare', '"Medicare Advantage" OR Medicare', 'health', ['medicare']),
  gn('gn-health-services', 'Health services', '"health system" OR "value-based care" OR "health insurer"', 'health', ['health-services']),
  gn('gn-health-ai', 'Healthcare and AI', '"AI in healthcare" OR "healthcare AI" OR "AI" hospitals', 'health', ['health-ai']),
  gn('gn-health-consumer', 'Healthcare and consumers', '"healthcare consumerism" OR "consumer health" OR "direct-to-consumer" healthcare', 'health', ['health-consumer']),
  gn('gn-wgsn', 'WGSN and trend forecasting', 'WGSN OR "trend forecasting" OR "trend forecaster"', 'fashion', ['trend-forecasting'], { weight: 1.1, days: 14 }),
  gn('gn-fashion-trends', 'Fashion trend reports', '"fashion trends" OR "trend report" fashion', 'fashion', ['trend-forecasting']),
  gn('gn-fashion-tech', 'Fashion and tech', '"fashion tech" OR "fashion technology" OR "virtual try-on"', 'fashion', ['fashion-tech']),
  gn('gn-fashion-ai', 'Fashion and AI', 'fashion "AI" OR "artificial intelligence" fashion', 'fashion', ['fashion-ai']),
  gn('gn-fashion-consumer', 'Fashion and consumers', '"fashion consumers" OR "apparel spending" OR "fashion resale" OR "luxury shoppers"', 'fashion', ['fashion-consumer']),
  gn('gn-bof', 'The Business of Fashion', 'site:businessoffashion.com', 'fashion', [], { keep: 'match', weight: 1.1 }),
  gn('gn-vogue-business', 'Vogue Business', 'site:voguebusiness.com OR "Vogue Business"', 'fashion', [], { keep: 'match', weight: 1.1 }),

  // LinkedIn does not offer feeds and does not allow scraping, so these only find LinkedIn articles
  // that Google has indexed. Paste single posts into the feed in the app instead.
  gn('li-health', 'LinkedIn: healthcare', 'site:linkedin.com/pulse (healthcare OR "digital health" OR femtech OR Medicaid OR Medicare)', 'health', [], { keep: 'match', group: 'linkedin', kind: 'linkedin', weight: 1, days: 14 }),
  gn('li-fashion', 'LinkedIn: fashion', 'site:linkedin.com/pulse (fashion OR "trend forecasting" OR luxury OR retail)', 'fashion', [], { keep: 'match', group: 'linkedin', kind: 'linkedin', weight: 1, days: 14 })
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

export function sourceUrl(s) {
  return s.google ? googleNewsUrl(s.google, s.days ?? 7) : s.url;
}
