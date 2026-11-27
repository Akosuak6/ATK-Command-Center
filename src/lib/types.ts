// Shapes of every IndexedDB store. src/data/seed.json uses the same shapes.

export type Area = 'Work' | 'Health' | 'Money' | 'Social' | 'Learning' | 'Experiences' | 'Other';

export interface DumpComment { text: string; date: string }
export type DumpType = 'Article' | 'Think piece' | 'Substack' | 'Perspective' | 'Film' | 'TV show' | 'Video' | 'Pinterest';
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
  photo?: string; // cover image
  watched?: boolean; // films and TV shows: false means still on your watchlist
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
  cover?: string; // cover art, stored as a resized copy when possible
  description?: string; // the publisher's description
  tldr?: string; // a short version: the description's first sentence or two
  price?: number;
  currency?: string;
  store?: string; // where to buy it
  buyUrl?: string;
  isbn?: string;
}

export type ClassType = 'Pilates' | 'Hot Pilates' | 'Yoga' | 'Hot Yoga' | 'Barre' | 'Strength' | 'Spin' | 'HIIT' | 'Boxing' | 'Gym' | 'Run';

export interface Studio {
  id: string;
  order: number;
  name: string;
  type: ClassType; // usual class type, prefilled when you log a class there
  pastVisits: number; // visits before you started logging in the app
  price: number; // usual price per class
  logo?: string;
  website?: string; // the logo is found from here
  logoTried?: boolean;
  tags?: string; // e.g. "Mat Pilates, Sculpt, Heated"
  location?: string; // neighborhood or branch, e.g. "Chelsea" or "Chelsea, Tribeca"
}
export interface FitnessClass {
  id: string;
  date: string;
  type: ClassType;
  name: string;
  studio: string;
  instructor: string;
  price: number;
  rating: number; // overall stars; worked out from the five scores below when any are set
  credits?: number; // paid with ClassPass credits instead of dollars (price is then 0)
  free?: boolean; // a free class, like a studio promo
  location?: string; // which of the studio's locations, e.g. "Upper East Side"
  notes: string;
  photo?: string; // JPEG data URL, or an image URL if it could not be copied
  // Scores from 1 to 5 (sweat is no longer asked). Cost is value for money, so higher is better value.
  rSweat?: number; rSculpt?: number; rStudio?: number; rCoach?: number; rCost?: number;
}

export interface Priority { id: string; text: string; done: boolean; date: string }

export interface Pin {
  id: string;
  kind: 'photo' | 'link';
  src?: string; // JPEG data URL for photos
  url?: string;
  title?: string;
  cover?: string; // cover image for link pins
  date: string;
}

export type RestaurantList = 'Want to try' | 'Been, loved it';
export interface Restaurant { id: string; name: string; cuisine: string; hood: string; list: RestaurantList; photo?: string }

export interface ShowEvent {
  id: string;
  title: string;
  date: string; // empty for a seasonal favorite with no date yet
  season?: string; // e.g. Winter, for something you go to every year
  detail: string;
  ticket?: { name: string; type: string; data: string }; // data URL
}

export type TripStatus = 'Booked' | 'Planning' | 'Dreaming';
export interface Trip {
  id: string; name: string; cost: number;
  months?: number; // older trips only: months are now worked out from the trip date
  saved: number; status: TripStatus;
  date: string; // first day
  endDate?: string; // last day
  photo?: string; // shows on the trip and the vision board
  whoPaid?: string; // a note on who paid what, for splitting costs
  links?: TripLink[]; // TikToks, articles and anything else saved about the place
  extras?: TripExtra[]; // other payments for the trip from the travel vault, due on their own date

  estimate?: boolean; points?: number; pointsValue?: number; // pointsValue: dollars the points cover
}
export interface TripLink { id: string; url: string; title?: string; site?: string; cover?: string }
export interface TripExtra { label: string; amount: number; due: string } // e.g. a wedding gift sent before the trip

export interface PointsWallet { card: string; balance: number; centsPerPoint: number }

export interface Trim { id: string; order: number; label: string; how: string; cap: number }

export type GoalLink = 'none' | 'books' | 'classes' | 'networth' | `trip:${string}` | `savings:${string}`;
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
  target: number; // classes per month when link is classes; dollars when link is networth
  achieved: boolean;
}

export interface BudgetCategory { id: string; order: number; label: string; budget: number; spent: number; source: 'manual' | 'classes' | 'export' | 'fixed'; credit?: number; note?: string } // credit: paid back by work each month // fixed: a set bill like rent, counted as paid each month

// One row from a Rocket Money export. amount > 0 is money out, amount < 0 is money in.
export interface Transaction {
  id: string;
  date: string;
  account: string;
  institution: string;
  name: string;
  amount: number;
  category: string; // Rocket Money category
  kind: 'spend' | 'income' | 'transfer' | 'invest' | 'ignored';
  note: string;
  label?: string; // your choice: a budget category, or MOVED (own account), INVEST, or IGNORE
}

export interface PayeeRule { match: string; label: string }

export type SavingsKind = 'retirement' | 'savings' | 'brokerage' | 'other';
export interface SavingsGoal {
  id: string;
  order: number; // your priority: money goes to the lowest number first
  name: string;
  target: number;
  saved: number;
  monthly: number;
  due: string;
  kind?: SavingsKind;
  contributing?: boolean; // false: still invested, but no new money goes in
  fromPaycheck?: boolean; // taken out before take home pay, like a 401k
  note?: string;
  refill?: 'quarterly'; // once built, only topped back up at quarter ends (Mar 31, Jun 30, Sep 30, Dec 31)
  builtAt?: string; // the day it first reached its target; before that it fills every month
}

export interface RoadmapItem { id: string; year: string; title: string; detail: string; tag: string }

export type AccountGroup = 'Cash' | 'Savings' | 'Investments' | 'Retirement' | 'Debt';
export interface Account { id: string; order: number; name: string; balance: number; group?: AccountGroup; institution?: string; asOf?: string }

export interface Bill { id: string; name: string; due: string; amount: number; note: string; repeat?: 'monthly' | '' }

export interface Supplement { id: string; order: number; name: string; note: string; timing: 'AM' | 'Midday' | 'PM' }

export interface SkincareStep {
  id: string;
  time: 'AM' | 'PM';
  order: number;
  step: string;
  days: string; // empty for every day, or e.g. "Mon, Thu"
  note?: string; // how to use it, e.g. "on damp skin"
  theme?: string; // names the night when this step runs, e.g. "Glycolic night"
  exfoliant?: boolean; // skipped around a facial
}

export interface Facial { name: string; everyDays: number; last: string }

export interface Habit {
  id: string;
  order: number;
  name: string;
  done: string[]; // days the habit was fully done
  target?: number; // times a day, e.g. 2 bottles of water (default 1)
  unit?: string; // what one tap counts, e.g. "bottle"
  counts?: Record<string, number>; // per day progress when target is above 1
}

export interface WishItem { id: string; text: string; tag: 'Book' | 'Try' | 'Buy' | 'Schedule'; done: boolean }

export interface Person { id: string; name: string; lastContact: string; note: string; photo?: string }

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

// One row per day of the numbers that are only ever stored as their current value
// (balances, goal progress, shelf counts). Anything with its own dates (transactions,
// classes, habits, workouts, dump items) is worked out from those rows instead.
export interface DaySnapshot {
  date: string; // YYYY-MM-DD, local
  savedAt: string; // last time today's row was written
  sample: boolean; // true while the app still shows sample data; charts skip these
  money: {
    accountsTotal: number; // sum of every account balance (debt is negative)
    byGroup: Partial<Record<AccountGroup, number>>;
    accounts: Record<string, number>; // account id -> balance
    savings: Record<string, number>; // savings goal id -> saved
    trips: Record<string, number>; // trip id -> saved
    netWorth: number; // the Money page's net worth figure
    savingsRate: number;
    leftToSpend: number;
  };
  goals: Record<string, number>; // goal id -> percent done
  books: { read: number; reading: number; wantToRead: number; readThisYear: number };
  dump: { total: number; watchlist: number };
  people: Record<string, string>; // person id -> last contact date
}
