// Topics for the feed, and the keyword rules that tag a story with them.
// Shared by the serverless function (api/feed.js), the command line (scripts/feed.mjs) and the app.
//
// A topic matches when every condition in one of its rules matches. A condition is the name of a term
// set below, or '@health' / '@fashion', which also passes when the source itself covers that field
// (a Vogue story counts as fashion even when the headline never says "fashion").
// Terms are regular expression pieces. A leading '=' makes a term case sensitive (AI, CHIP, CMS).

const TERMS = {
  HEALTH: [
    'health', 'healthcare', 'health care', 'health systems?', 'hospitals?', 'patients?', 'clinical', 'clinics?', 'clinicians?',
    'medical', 'medicine', 'doctors?', 'physicians?', 'nurses?', 'nursing', 'payers?', 'insurers?', 'health insurance',
    'health plans?', 'pharma\\w*', 'pharmacy', 'pharmacies', 'drugmakers?', 'biotech', '=FDA', '=CDC', '=NIH', '=HHS', '=CMS',
    'Medicaid', 'Medicare', 'telehealth', 'telemedicine', 'therapists?', 'mental health', 'primary care', 'diagnos\\w+',
    'disease', 'cancer', 'diabetes', 'obesity', '=GLP-1s?', 'Ozempic', 'Wegovy', 'Zepbound', 'Mounjaro', 'wellness',
    'longevity', 'fertility', 'menopause', 'pregnan\\w+', 'maternal', 'vaccines?'
  ],
  FASHION: [
    'fashion', 'apparel', 'clothing', 'clothes', 'garments?', 'luxury', 'runways?', 'catwalks?', 'couture', 'ready-to-wear',
    'streetwear', 'sneakers?', 'footwear', 'handbags?', 'jewelry', 'jewellery', 'beauty', 'cosmetics', 'skincare', 'makeup',
    'fragrance', 'textiles?', 'fabrics?', 'denim', 'knitwear', 'menswear', 'womenswear', 'wardrobes?', 'outfits?', 'stylists?',
    'LVMH', 'Kering', 'Gucci', 'Prada', 'Chanel', 'Dior', 'Louis Vuitton', 'Herm[eè]s', 'Balenciaga', 'Zara', 'Inditex',
    'H&M', 'Uniqlo', 'Shein', 'Nike', 'Adidas', 'Lululemon', "Levi's", 'Ralph Lauren', 'Tapestry', 'Farfetch', 'Net-a-Porter',
    'Mytheresa', 'SSENSE', 'Revolve', 'ThredUp', 'The RealReal', 'Vinted', 'Depop', 'Poshmark', 'Stitch Fix', 'Rent the Runway',
    'Sephora', 'Ulta', 'Est[ée]e Lauder', "L'Or[ée]al", 'Fashion Week', 'Met Gala', 'WGSN'
  ],
  AI: [
    '=AI', 'A\\.I\\.', 'artificial intelligence', 'gen ?AI', 'machine learning', 'large language models?', '=LLMs?', 'chatbots?',
    'ChatGPT', 'OpenAI', 'Anthropic', 'agentic', 'computer vision', 'deep learning', 'neural networks?', 'algorithm(?:s|ic)?',
    'ambient (?:AI|scribes?|documentation|listening)', 'AI scribes?', 'Abridge'
  ],
  TECH: [
    'tech', 'technology', 'technologies', 'digital (?:fashion|clothing|IDs?|product|twins?|showrooms?|commerce|natives?|wardrobes?)',
    'virtual try-?ons?', 'try-?on', '3D', '=AR', 'augmented reality', '=VR',
    'virtual reality', 'metaverse', '=NFTs?', 'blockchain', 'digital product passports?', '=RFID', 'wearables?', 'smart glasses',
    'smart (?:fabrics?|textiles?|clothing)', 'Ray-Ban Meta', 'Meta Ray-Bans?', 'startups?', 'apps?', 'software', 'e-?commerce',
    'robots?', 'robotics', 'automation', 'biomaterials?', 'lab-grown', 'bio-?fabricat\\w+', 'material innovation', 'mycelium',
    'textile recycling', 'textile-to-textile', 'supply chain', 'livestream\\w*', 'social commerce', 'TikTok Shop', 'venture capital',
    'funding round', '=Series [A-F]', 'innovation', 'avatars?', 'gaming', 'Roblox', 'Fortnite', 'Snapchat'
  ],
  HEALTH_DIGITAL: [
    'digital health', 'health ?tech', 'telehealth', 'telemedicine', 'virtual care', 'virtual-first', 'remote (?:patient )?monitoring',
    '=RPM', 'wearables?', 'health apps?', 'digital therapeutics', '=DTx', '=EHRs?', 'electronic health records?', 'Epic Systems',
    'interoperability', '=FHIR', 'health data', 'patient portals?', 'health(?:care)? startups?', 'Teladoc', 'Hinge Health', 'Omada',
    'Sword Health', 'Oura', 'Whoop', 'Zocdoc', 'Doximity', 'Included Health', 'Transcarent', 'Talkspace', 'Hims', 'Function Health',
    'Commure', 'Abridge', 'Rock Health', 'digital front door', 'hospital at home', 'at-home (?:testing|tests?|care)', '=CGMs?',
    'continuous glucose monitors?', 'Dexcom'
  ],
  DIGITAL_WORDS: ['apps?', 'software', 'digital', 'platforms?', 'online', 'virtual', 'startups?', 'tech', 'technology'],
  WOMEN: [
    "women'?s health(?:care)?", 'maternal (?:health|mortality|care)', 'maternity care', 'menopaus\\w+', 'perimenopaus\\w+', 'fertility',
    '=IVF', 'in vitro', 'egg freezing', 'reproductive (?:health|care|rights)', 'abortions?', 'contracepti\\w+', 'birth control',
    'postpartum', 'prenatal', 'pregnan\\w+', 'ob-?gyns?', 'gynecolog\\w+', 'breast cancer', 'cervical cancer', 'ovarian cancer',
    'endometriosis', '=PCOS', 'polycystic', 'menstrua\\w+', 'period (?:care|tracking|trackers?|poverty|pain)', 'mammogra\\w+',
    'midwi\\w+', 'doulas?', 'lactation', 'breastfeeding', 'breast pumps?', 'pelvic floor', 'hormone therapy', '=HRT'
  ],
  FEMTECH: [
    'femtech', 'fem-tech', 'Maven Clinic', 'Kindbody', 'Flo Health', 'Natural Cycles', 'Midi Health', 'Elvie', 'Evernow',
    'Bonafide', 'Gameto', 'Pomelo Care', 'Nurx', 'Carrot Fertility', 'Progyny', 'Cofertility', 'Oula'
  ],
  VENTURE: [
    'startups?', 'founders?', 'funding', 'raises?', 'raised', 'investors?', 'venture', '=VC', '=Series [A-F]', 'apps?', 'platforms?',
    'digital', 'tech', 'technology', 'wearables?', 'devices?', '=AI'
  ],
  MENTAL: [
    'mental health', 'mental illness', 'behavioral health', 'psychiatr\\w+', 'psycholog\\w+', 'psychotherapy', 'talk therapy',
    'therapists?', 'counseling', 'depressive', '=ADHD', 'autism', 'bipolar', 'schizophrenia', '=PTSD',
    'suicid\\w+', '=988', 'crisis lines?', 'substance use', 'addiction', 'opioid use disorder', 'overdoses?',
    'eating disorders?', 'psychedelic\\w*', 'psilocybin', 'ketamine', '=MDMA', '=SSRIs?', 'antidepressants?',
    'Headspace', 'Talkspace', 'BetterHelp', 'Spring Health', 'Lyra Health', 'Cerebral', 'Brightline', 'Rula', 'Grow Therapy'
  ],
  // Words that mean mental health only in a health story ("investor anxiety" is not).
  MENTAL_SOFT: ['anxiety', 'depression', 'loneliness', 'well-?being', 'self-harm'],
  MEDICAID: [
    'Medicaid', 'Medi-Cal', 'MassHealth', 'TennCare', 'SoonerCare', '=CHIP', "Children's Health Insurance Program", '1115 waivers?',
    'section 1115', 'dual(?:ly)? eligibles?', 'dually eligible', '=D-SNPs?'
  ],
  MEDICARE: [
    'Medicare', 'Medicare Advantage', '=MA plans?', 'Part D', 'Medicare Part [A-D]', 'Medigap', '=ACO REACH', 'accountable care organizations?',
    'star ratings', '=CMS', 'Centers for Medicare', 'drug price negotiations?', 'Medicare Shared Savings', '=MSSP', 'Original Medicare'
  ],
  SERVICES: [
    'health systems?', 'hospitals?', 'hospital systems?', 'physician groups?', 'medical groups?', 'provider groups?',
    'health ?care providers?', 'care providers?', 'payers?', 'health insurers?', 'health plans?', 'UnitedHealth\\w*', 'Optum',
    'Humana', 'Elevance', 'Anthem', 'Cigna', 'Evernorth', 'Aetna', 'CVS Health', 'Centene', 'Molina', 'Kaiser Permanente', '=HCA',
    'Tenet Healthcare', 'CommonSpirit', 'Mayo Clinic', 'Cleveland Clinic', 'value-based care', 'fee-for-service', 'primary care',
    'home health', 'home care', 'hospice', 'urgent care', 'ambulatory', 'outpatient', 'skilled nursing', 'nursing homes?',
    'long-term care', 'physician practices?', 'nurse staffing', 'prior authori[sz]ation', 'price transparency', '=340B', '=PBMs?',
    'pharmacy benefit managers?', 'Express Scripts', 'Caremark', 'Walgreens', 'One Medical', 'Oak Street Health', 'ChenMed',
    'VillageMD', 'Privia', 'Aledade', 'agilon', '=ACOs?', 'emergency departments?', 'health care costs', 'hospital prices'
  ],
  HEALTH_CONSUMER: [
    'consumers?', 'consumerism', 'consumer-?driven', 'consumer health', 'direct-to-consumer', '=DTC', '=D2C', 'retail health',
    'retail clinics?', 'cash-?pay', 'self-?pay', 'out-of-pocket', 'price transparency', 'patient experience', 'shoppers?', 'shopping',
    'subscriptions?', 'memberships?', 'concierge', 'wellness', 'longevity', 'biohack\\w*', 'wearables?', 'Oura', 'Whoop',
    'Function Health', 'Hims', 'One Medical', 'Walmart Health', 'Cost Plus Drugs', 'marketplaces?', 'branding', 'marketing',
    'influencers?', 'TikTok', 'social media', 'Gen Z', 'millennials', 'compounded', 'personali[sz]ed', 'at-home tests?'
  ],
  FASHION_CONSUMER: [
    'consumers?', 'consumerism', 'shoppers?', 'shopping', 'spending', 'retail sales', 'sales', 'demand', 'resale', 'secondhand',
    'second-hand', 'thrift\\w*', 'vintage', 'dupes?', 'fast fashion', 'ultra-fast fashion', 'Shein', 'Temu', 'tariffs?', 'prices?',
    'pricing', 'price hikes?', 'markdowns?', 'e-?commerce', '=DTC', 'direct-to-consumer', 'loyalty', 'Gen Z', 'Gen Alpha',
    'millennials', 'influencers?', 'creators?', 'TikTok', 'social commerce', 'livestream shopping', 'quiet luxury',
    'luxury slowdown', 'aspirational', 'sentiment', 'holiday season', 'Black Friday', 'Cyber Monday', 'foot traffic', 'malls?',
    'department stores?', 'overconsumption', 'de-?influenc\\w+', 'hauls?', 'cost of living', 'cost-of-living'
  ],
  TREND: [
    'trends?', 'trending', 'forecast\\w*', 'forecasters?', 'WGSN', 'Pantone', 'Coloro', 'colou?r of the year', 'micro-?trends?',
    'trend cycles?', 'aesthetics?', 'zeitgeist', "what's next", 'future of (?:fashion|retail|beauty|luxury|shopping)',
    'Fashion Week', 'runway reports?', 'spring ?/? ?summer 20\\d\\d', 'fall ?/? ?winter 20\\d\\d', 'autumn ?/? ?winter 20\\d\\d',
    '=SS ?2\\d', '=AW ?2\\d', '=FW ?2\\d', 'resort 20\\d\\d', 'pre-fall', 'street style', 'Lyst', 'Heuritech', 'Trendalytics',
    'Pinterest Predicts', 'TikTok trends?'
  ],
  TREND_STRONG: [
    'WGSN', 'trend forecast\\w*', 'trend forecasters?', 'Pantone', 'Coloro', 'colou?r of the year', 'Pinterest Predicts', 'Heuritech',
    'Trendalytics', 'Lyst Index', 'micro-?trends?', 'trend cycles?'
  ]
};

// Stories that are shopping lists or horoscopes rather than ideas. Dropped from broad sources like Vogue.
const NOISE = [
  'horoscopes?', 'zodiac', 'astrolog\\w+', 'tarot', 'promo codes?', 'coupons?', 'gift guides?',
  'gifts? for (?:him|her|mom|dad|men|women|everyone|the)', 'sale alert', 'on sale', 'deals? of the (?:day|week)',
  'best .{0,40}deals', 'Amazon (?:finds|deals)', 'we tested', 'tried and tested', 'editor-approved', 'wedding guest',
  'engagement rings?', 'recipes?', 'crossword', 'quiz'
];

export const TOPICS = [
  { id: 'digital-health', label: 'Digital health', group: 'health', rules: [['HEALTH_DIGITAL'], ['@health', 'DIGITAL_WORDS']] },
  { id: 'femtech', label: 'Femtech', group: 'health', rules: [['FEMTECH'], ['WOMEN', 'VENTURE']] },
  { id: 'womens-health', label: "Women's health", group: 'health', rules: [['WOMEN']] },
  { id: 'mental-health', label: 'Mental health', group: 'health', rules: [['MENTAL'], ['@health', 'MENTAL_SOFT']] },
  { id: 'medicaid', label: 'Medicaid', group: 'health', rules: [['MEDICAID']] },
  { id: 'medicare', label: 'Medicare', group: 'health', rules: [['MEDICARE']] },
  { id: 'health-services', label: 'Health services', group: 'health', rules: [['SERVICES']] },
  { id: 'health-ai', label: 'Healthcare and AI', group: 'health', cross: 'ai', rules: [['@health', 'AI']] },
  { id: 'health-consumer', label: 'Healthcare and consumers', group: 'health', cross: 'consumer', rules: [['@health', 'HEALTH_CONSUMER']] },
  { id: 'trend-forecasting', label: 'Trend forecasting', group: 'fashion', rules: [['TREND_STRONG'], ['@fashion', 'TREND']] },
  { id: 'fashion-tech', label: 'Fashion and tech', group: 'fashion', cross: 'tech', rules: [['@fashion', 'TECH']] },
  { id: 'fashion-ai', label: 'Fashion and AI', group: 'fashion', cross: 'ai', rules: [['@fashion', 'AI']] },
  { id: 'fashion-consumer', label: 'Fashion and consumers', group: 'fashion', cross: 'consumer', rules: [['@fashion', 'FASHION_CONSUMER']] }
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

// Views across topics: the chips at the top of the feed.
export const LENSES = [
  { id: 'all', label: 'For you', topics: TOPICS.map((t) => t.id) },
  { id: 'health', label: 'Healthcare', topics: TOPICS.filter((t) => t.group === 'health').map((t) => t.id) },
  { id: 'fashion', label: 'Fashion', topics: TOPICS.filter((t) => t.group === 'fashion').map((t) => t.id) },
  { id: 'ai', label: 'AI', topics: TOPICS.filter((t) => t.cross === 'ai').map((t) => t.id) },
  { id: 'consumer', label: 'Consumers', topics: TOPICS.filter((t) => t.cross === 'consumer').map((t) => t.id) }
];

function compile(terms) {
  // Text is normalized to straight apostrophes before matching, so terms only need the straight one.
  const ci = terms.filter((t) => !t.startsWith('='));
  const cs = terms.filter((t) => t.startsWith('=')).map((t) => t.slice(1));
  const wrap = (alts, flags) => (alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, flags) : null);
  const a = wrap(ci, 'iu');
  const b = wrap(cs, 'u');
  return (text) => Boolean((a && a.test(text)) || (b && b.test(text)));
}
const MATCHERS = Object.fromEntries(Object.entries(TERMS).map(([k, v]) => [k, compile(v)]));
const NOISE_RE = compile(NOISE);

export function normalizeText(s) {
  return String(s || '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

// Topics a story belongs to. domain is what the source covers: 'health', 'fashion', 'both' or ''.
export function classify(text, domain = '') {
  const t = normalizeText(text);
  const cache = {};
  const has = (cond) => {
    if (cond in cache) return cache[cond];
    let ok;
    if (cond === '@health') ok = domain === 'health' || domain === 'both' || MATCHERS.HEALTH(t);
    else if (cond === '@fashion') ok = domain === 'fashion' || domain === 'both' || MATCHERS.FASHION(t);
    else ok = MATCHERS[cond](t);
    cache[cond] = ok;
    return ok;
  };
  return TOPICS.filter((topic) => topic.rules.some((rule) => rule.every(has))).map((topic) => topic.id);
}

export function isNoise(title) {
  return NOISE_RE(normalizeText(title));
}
