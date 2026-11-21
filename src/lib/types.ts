// Shapes of every IndexedDB store. src/data/seed.json uses the same shapes.

export type Area = 'Work' | 'Health' | 'Money' | 'Social' | 'Learning' | 'Experiences' | 'Other';

export interface DumpComment { text: string; date: string }
export type DumpType = 'Article' | 'Think piece' | 'Substack' | 'Perspective' | 'Film' | 'TV show';
export interface DumpItem {
  id: string;
  type: DumpType;
  title: string;
  url: string;
  source: string;
  date: string; // ISO date
  note: string;
  rating: number;
  comments: DumpComment[];
}

export type Shelf = 'Read' | 'Reading' | 'Want to read';
export interface Book {
  id: string;
  title: string;
  author: string;
  status: Shelf;
  stars: number;
  review: string;
  date: string; // ISO date added or finished
}

export type ClassType = 'Pilates' | 'HIIT' | 'Gym' | 'Yoga' | 'Spin' | 'Run';
export interface FitnessClass {
  id: string;
  date: string;
  type: ClassType;
  name: string;
  studio: string;
  instructor: string;
  price: number;
  rating: number;
  notes: string;
}

export interface Priority { id: string; text: string; done: boolean; date: string }

export interface Pin {
  id: string;
  kind: 'photo' | 'link';
  src?: string; // JPEG data URL for photos
  url?: string;
  title?: string;
  date: string;
}

export type RestaurantList = 'Want to try' | 'Been, loved it';
export interface Restaurant { id: string; name: string; cuisine: string; hood: string; list: RestaurantList }

export interface ShowEvent {
  id: string;
  title: string;
  date: string;
  detail: string;
  ticket?: { name: string; type: string; data: string }; // data URL
}

export type TripStatus = 'Booked' | 'Planning' | 'Dreaming';
export interface Trip { id: string; name: string; cost: number; months: number; saved: number; status: TripStatus; date: string }

export interface Trim { id: string; order: number; label: string; how: string; cap: number }

export type GoalLink = 'none' | 'books' | 'classes' | `trip:${string}` | `savings:${string}`;
export interface Goal {
  id: string;
  order: number;
  title: string;
  area: Area;
  horizon: string;
  due: string;
  link: GoalLink;
  pct: number; // used when link is none
  steps: string; // progress text when link is none
  target: number; // classes per month when link is classes
  achieved: boolean;
}

export interface BudgetCategory { id: string; order: number; label: string; budget: number; spent: number; source: 'manual' | 'classes' }

export interface SavingsGoal { id: string; order: number; name: string; target: number; saved: number; monthly: number; due: string }

export interface RoadmapItem { id: string; year: string; title: string; detail: string; tag: string }

export interface Account { id: string; order: number; name: string; balance: number }

export interface Bill { id: string; name: string; due: string; amount: number; note: string }

export interface Supplement { id: string; order: number; name: string; note: string; timing: 'AM' | 'Midday' | 'PM' }

export interface SkincareStep { id: string; time: 'AM' | 'PM'; order: number; step: string; days: string }

export interface Habit { id: string; order: number; name: string; done: string[] }

export interface WishItem { id: string; text: string; tag: 'Book' | 'Try' | 'Buy' | 'Schedule'; done: boolean }

export interface Person { id: string; name: string; lastContact: string; note: string }

export interface CalendarEvent { id: string; date: string; time: string; title: string; area: Area }

export interface HealthDay {
  date: string;
  sleepMin: number;
  bed: string;
  wake: string;
  hrv: number;
  hrvBaseline: number;
  hrv7: number;
  restingHr: number;
  restingHrWeekChange: number;
  steps: number;
  stepGoal: number;
  move: number;
  moveGoal: number;
  exercise: number;
  exerciseGoal: number;
  stand: number;
  standGoal: number;
}

export interface TrendDef {
  area: string;
  p1: number; p1Label: string; p1Up: boolean; p1Good: boolean;
  p2: number; p2Label: string; p2Up: boolean; p2Good: boolean;
  foot: string;
}

export interface MoneySnapshot {
  asOf: string;
  leftToSpend: number;
  savingsRate: number;
  savingsTarget: number;
  netWorth: number;
  netWorthChange: number;
  cardDue: string;
  cardAmount: number;
  autopay: boolean;
  transactions: number;
  covers: string;
}

export interface Meta {
  key: string;
  value: unknown;
}
