import { useEffect, useState } from 'react';

export type SectionId = 'home' | 'dump' | 'money' | 'health' | 'social' | 'work' | 'settings';

export interface SectionDef {
  id: SectionId;
  label: string;
  banner: string;
  sub: string;
  subs: [string, string][];
  trends: boolean;
}

export const SECTIONS: SectionDef[] = [
  { id: 'home', label: 'Home', banner: 'HOME', sub: 'your day at a glance', subs: [['today', 'Today'], ['goals', 'Goals and life areas']], trends: true },
  { id: 'dump', label: 'Dump', banner: 'DUMP', sub: 'learnings, think pieces, films and books', subs: [['all', 'Everything'], ['books', 'Bookshelf']], trends: true },
  { id: 'money', label: 'Money', banner: 'MONEY', sub: 'budget, goals and every purchase', subs: [['overview', 'Overview'], ['budget', 'Monthly budget'], ['goals', 'Long term goals'], ['trips', 'Trip planner']], trends: true },
  { id: 'health', label: 'Health', banner: 'HEALTH', sub: 'body, classes and routines', subs: [['classes', 'Classes'], ['workouts', 'Workouts'], ['routines', 'Routines']], trends: true },
  { id: 'social', label: 'Social', banner: 'SOCIAL', sub: 'people, places and plans', subs: [['board', 'Vision board'], ['people', 'People and plans']], trends: true },
  { id: 'work', label: 'Work', banner: 'WORK', sub: 'opens when you start', subs: [['soon', 'Coming soon']], trends: false },
  { id: 'settings', label: 'Settings', banner: 'SETTINGS', sub: 'backups and this phone', subs: [['backup', 'Backups']], trends: false }
];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];

export interface Route { section: SectionId; sub: string; param?: string }

export function parseHash(hash = location.hash): Route {
  const parts = hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  const def = sectionById(parts[0] ?? 'home');
  const sub = def.subs.some(([id]) => id === parts[1]) ? parts[1] : def.subs[0][0];
  return { section: def.id, sub, param: parts[2] ? decodeURIComponent(parts[2]) : undefined };
}

export function hrefFor(section: SectionId, sub?: string, param?: string) {
  const def = sectionById(section);
  const s = sub ?? def.subs[0][0];
  return `#/${section}/${s}${param ? '/' + encodeURIComponent(param) : ''}`;
}

export function navigate(section: SectionId, sub?: string, param?: string) {
  const next = hrefFor(section, sub, param);
  if (location.hash !== next) location.hash = next;
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
