// Types for keywords.js, used by the app.
export interface CompiledKeyword { keyword: string; re: RegExp }
export const MAX_KEYWORDS: number;
export function parseKeywordInput(text: string): string[];
export function normalizeKeywords(list: unknown): string[];
export function keywordRegex(keyword: string): RegExp | null;
export function compileKeywords(list: string[]): CompiledKeyword[];
export function matchKeywords(text: string, compiled: CompiledKeyword[]): string[];
export function keywordQuery(keyword: string): string;
