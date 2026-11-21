// Coast FIRE: once your investments, left alone, would grow to your FI number by your retirement age,
// you only need to cover today's spending; saving more is optional.
// Everything is in today's dollars: the growth rate is after inflation.

export interface FireInputs {
  age: number;
  retireAge: number;
  spending: number; // a year in retirement, today's dollars
  withdrawal: number; // percent, usually 4
  realReturn: number; // percent a year after inflation
  contributions: number; // a year, until you stop
}

export interface FireYear { age: number; balance: number; coastNumber: number; noMore: number }

export function fiNumber(i: FireInputs) {
  return i.spending / (i.withdrawal / 100);
}

// What you need invested at a given age to coast to the FI number by retirement.
export function coastNumberAt(i: FireInputs, age: number) {
  const years = Math.max(0, i.retireAge - age);
  return fiNumber(i) / Math.pow(1 + i.realReturn / 100, years);
}

export function projectFire(i: FireInputs, invested: number): FireYear[] {
  const r = i.realReturn / 100;
  const out: FireYear[] = [];
  let balance = invested;
  let noMore = invested;
  for (let age = i.age; age <= i.retireAge; age++) {
    out.push({ age, balance: Math.round(balance), coastNumber: Math.round(coastNumberAt(i, age)), noMore: Math.round(noMore) });
    balance = balance * (1 + r) + i.contributions;
    noMore = noMore * (1 + r);
  }
  return out;
}

export function coastAge(rows: FireYear[]) {
  return rows.find((y) => y.balance >= y.coastNumber)?.age ?? null;
}
