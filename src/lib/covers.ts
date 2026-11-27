import { useEffect } from 'react';
import { db } from './db';
import { coverFromImageUrl } from './preview';
import type { Trip } from './types';

// Trip covers: a trip without a photo gets one found for it once, a freely licensed photo of
// the place (see api/placecover). Your own photo always wins, and a trip is only tried once,
// so removing a cover you did not like keeps it off.

// "Sunday River Skiing (Maine)" -> "Sunday River Maine ski", "Florida for the holidays" -> "Florida state park",
// "Ethiopia" -> "Ethiopia landscape". A US state alone is searched with "state park", since "Florida
// landscape" also finds places like Strata Florida in Wales.
const US_STATES = new Set(['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming']);
export function placeQuery(name: string) {
  const inParens = /\(([^)]+)\)/.exec(name)?.[1] ?? '';
  const ski = /\bski(ing)?\b/i.test(name);
  const base = name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(trip|trips|vacation|holidays?|for the|the|weekend|getaway|visit|skiing|ski|birthday|wedding|honeymoon|home|to)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hint = ski ? 'ski' : !inParens && US_STATES.has(base.toLowerCase()) ? 'state park' : 'landscape';
  return `${base} ${inParens} ${hint}`.replace(/\s+/g, ' ').trim();
}

let running = false;

export async function fillTripCovers(trips: Trip[]) {
  if (running) return;
  running = true;
  try {
    for (const t of trips.filter((x) => !x.photo && !x.coverTried && x.name.trim())) {
      let r: Response;
      try {
        r = await fetch(`/api/placecover?v=2&q=${encodeURIComponent(placeQuery(t.name))}`);
      } catch {
        return; // offline: try again another time
      }
      if (r.status === 404) { await db.trips.update(t.id, { coverTried: true }); continue; }
      if (!r.ok) return; // the photo service is down: try again another time
      const j = (await r.json()) as { image?: string; credit?: string };
      const photo = j.image ? await coverFromImageUrl(j.image) : undefined;
      if (!photo) continue;
      await db.trips.update(t.id, { photo, photoCredit: j.credit || undefined, coverTried: true });
    }
  } finally {
    running = false;
  }
}

// The next photo for a trip, for when the one found is not the right place or mood.
export async function nextTripCover(t: Trip): Promise<boolean> {
  const n = (t.coverIndex ?? 0) + 1;
  try {
    const r = await fetch(`/api/placecover?v=2&n=${n}&q=${encodeURIComponent(placeQuery(t.name))}`);
    if (!r.ok) return false;
    const j = (await r.json()) as { image?: string; credit?: string };
    const photo = j.image ? await coverFromImageUrl(j.image) : undefined;
    if (!photo) return false;
    await db.trips.update(t.id, { photo, photoCredit: j.credit || undefined, coverTried: true, coverIndex: n });
    return true;
  } catch {
    return false;
  }
}

export function useAutoTripCovers(trips: Trip[]) {
  const waiting = trips.some((t) => !t.photo && !t.coverTried && t.name.trim());
  useEffect(() => {
    if (waiting && navigator.onLine) void fillTripCovers(trips);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);
}
