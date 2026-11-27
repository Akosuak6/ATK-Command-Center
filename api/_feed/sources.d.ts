// Types for sources.js, used by the app.
import type { FeedDomain } from './topics';
export type SourceGroup = 'health' | 'fashion' | 'search' | 'linkedin' | 'custom';
export interface SourceDef {
  id: string;
  name: string;
  url?: string;
  google?: string;
  days?: number;
  domain: FeedDomain;
  keep: 'all' | 'match';
  topics?: string[];
  group: SourceGroup;
  kind?: 'news' | 'newsletter' | 'search' | 'linkedin';
  broad?: boolean;
  weight?: number;
}
export const GROUP_LABELS: Record<SourceGroup, string>;
export const SOURCES: SourceDef[];
export const SOURCE_BY_ID: Record<string, SourceDef>;
export function googleNewsUrl(query: string, days?: number): string;
export function sourceUrl(s: SourceDef): string;
