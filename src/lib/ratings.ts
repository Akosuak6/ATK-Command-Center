import type { FitnessClass } from './types';

// Three things you rate each class on, 1 to 5. Cost comes from the class's credits or price instead.
// (Sweat and Cost were dropped; old scores for them stay on the class but no longer count.)
export const SCORES = [
  { key: 'rSculpt', label: 'Sculpt', hint: 'How much it built strength and tone' },
  { key: 'rStudio', label: 'Studio', hint: 'The space, cleanliness and vibe' },
  { key: 'rCoach', label: 'Coach', hint: 'The instructor and their cues' }
] as const;
export type ScoreKey = (typeof SCORES)[number]['key'];

const round1 = (n: number) => Math.round(n * 10) / 10;

// A class's overall score: the average of the scores you gave it, or its stars if none.
export function classScore(c: FitnessClass): number {
  const set = SCORES.map((s) => c[s.key]).filter((v): v is number => !!v && v > 0);
  return set.length ? round1(set.reduce((a, v) => a + v, 0) / set.length) : c.rating || 0;
}

export interface StudioScores { overall: number; rated: number; byKey: Partial<Record<ScoreKey, number>> }

// A studio's averages across every class you logged there.
export function studioScores(classes: FitnessClass[]): StudioScores {
  const rated = classes.filter((c) => classScore(c) > 0);
  const byKey: Partial<Record<ScoreKey, number>> = {};
  for (const s of SCORES) {
    const vals = classes.map((c) => c[s.key]).filter((v): v is number => !!v && v > 0);
    if (vals.length) byKey[s.key] = round1(vals.reduce((a, v) => a + v, 0) / vals.length);
  }
  const overall = rated.length ? round1(rated.reduce((a, c) => a + classScore(c), 0) / rated.length) : 0;
  return { overall, rated: rated.length, byKey };
}

export const scoreText = (n: number) => (n > 0 ? n.toFixed(1) : 'None');

// What a class cost in dollars: its price, or its ClassPass credits at your plan's cost per credit.
export interface ClassPassPlan { monthly: number; credits: number; since?: string } // e.g. $99 a month for 48 credits, counted from `since`
export const creditValue = (plan: ClassPassPlan | null) => (plan && plan.monthly > 0 && plan.credits > 0 ? plan.monthly / plan.credits : 0);
export function classCost(c: FitnessClass, perCredit: number): number {
  if (c.price > 0) return c.price;
  return c.credits ? Math.round(c.credits * perCredit * 100) / 100 : 0;
}
export interface GymMembership { name: string; monthly: number } // visits are classes logged as Gym, or at this gym
