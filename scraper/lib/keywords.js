// Keywords you type in. Each one is matched as a phrase against every story from every source,
// and gets its own Google News search, so stories that never reach the regular sources still turn up.
import { normalizeText } from './topics.js';

export const MAX_KEYWORDS = 30;

// "quiet luxury, Oura; menopause" -> ['quiet luxury', 'Oura', 'menopause']
export function parseKeywordInput(text) {
  return normalizeKeywords(String(text ?? '').split(/[,;\n]+/));
}

export function normalizeKeywords(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const k = normalizeText(String(raw ?? '').replace(/[|\t\r\n]/g, ' ')).slice(0, 80).trim();
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Words may be joined by spaces or hyphens, and the last word may be plural:
// "virtual try-on" finds "virtual try ons", "GLP-1" finds "GLP 1".
export function keywordRegex(keyword) {
  const words = normalizeText(keyword).replace(/^["']+|["']+$/g, '').split(/[\s-]+/).filter(Boolean).map(esc);
  if (!words.length) return null;
  const last = words.length - 1;
  words[last] = /\p{L}$/u.test(words[last]) ? `${words[last]}(?:s|es)?` : words[last];
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join('[\\s-]+')}(?![\\p{L}\\p{N}])`, 'iu');
}

export function compileKeywords(list) {
  return normalizeKeywords(list).map((k) => ({ keyword: k, re: keywordRegex(k) })).filter((x) => x.re);
}

// Which of the compiled keywords appear in the text.
export function matchKeywords(text, compiled) {
  if (!compiled?.length) return [];
  const t = normalizeText(text);
  return compiled.filter((c) => c.re.test(t)).map((c) => c.keyword);
}

// The Google News search for a keyword: a phrase, unless you wrote your own operators.
export function keywordQuery(keyword) {
  if (/["]|\bOR\b|\bsite:|\s-\w/.test(keyword)) return keyword;
  return /\s/.test(keyword) ? `"${keyword}"` : keyword;
}
