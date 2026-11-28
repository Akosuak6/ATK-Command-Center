// Types for topics.js, used by the app.
export type FeedDomain = 'health' | 'fashion' | 'both' | '';
export interface TopicDef { id: string; label: string; group: 'health' | 'fashion'; cross?: 'ai' | 'consumer' | 'tech'; rules: string[][] }
export interface LensDef { id: string; label: string; topics: string[] }
export const TOPICS: TopicDef[];
export const TOPIC_BY_ID: Record<string, TopicDef>;
export const LENSES: LensDef[];
export function normalizeText(s: string): string;
export function classify(text: string, domain?: FeedDomain): string[];
export function isNoise(title: string): boolean;
