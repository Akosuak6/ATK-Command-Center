import { money } from './format';

// Short, upbeat lines that sit under the big numbers in place of explanations.
// Each one reads the number and says something human about it. No dashes, no ending periods.

export function moneyQuips(i: { left: number; daysLeft: number; savingsRate: number; netWorth: number; netChange: number | null; netGoal: number }) {
  const perDay = i.daysLeft ? i.left / i.daysLeft : i.left;
  const left = i.left < 0 ? 'Over for the month, hold steady'
    : perDay >= 100 ? 'Plenty of room this month'
    : perDay >= 30 ? `${money(perDay)} a day keeps you on track`
    : perDay > 0 ? 'Tight month, you can do this'
    : 'Right at the line';
  const rate = i.savingsRate >= 50 ? 'Saving more than half, that is elite'
    : i.savingsRate >= 30 ? 'Well above the usual 15%'
    : i.savingsRate >= 15 ? 'Right on the classic target'
    : i.savingsRate > 0 ? 'Every dollar saved counts'
    : 'Set your savings plan to see it';
  const pct = i.netGoal > 0 ? Math.round((i.netWorth / i.netGoal) * 100) : 0;
  const worth = i.netGoal > 0 && pct >= 100 ? `Past your ${money(i.netGoal)} goal`
    : i.netGoal > 0 ? `${pct}% of the way to ${shortMoney(i.netGoal)}`
    : i.netChange !== null && i.netChange > 0 ? 'Growing this month'
    : 'Building, one month at a time';
  return { left, rate, worth };
}

export function incomeQuips(i: { thisMonth: number; lastMonth: number; average: number; year: number; monthsWithIncome: number }) {
  const sofar = i.average > 0 ? i.thisMonth / i.average : 0;
  const thisMonth = i.thisMonth <= 0 ? 'Payday is coming'
    : sofar >= 1 ? 'Already past a usual month'
    : sofar >= 0.5 ? 'More than halfway to a usual month'
    : 'More paydays to come';
  const last = i.average <= 0 ? 'Your first month on record'
    : i.lastMonth > i.average * 1.1 ? 'A strong month'
    : i.lastMonth < i.average * 0.9 ? 'A lighter month'
    : 'Right on your usual';
  const avg = 'Your steady baseline';
  const year = i.year >= 100000 ? 'Six figures and counting'
    : i.monthsWithIncome > 1 ? `${i.monthsWithIncome} months of hard work`
    : 'The year is just getting started';
  return { thisMonth, last, avg, year };
}

export function workoutQuips(i: { week: number; month: number; liftedLb: number }) {
  const week = i.week === 0 ? 'Rest week or fresh start'
    : i.week >= 3 ? 'On a roll this week'
    : 'Moving and grooving';
  const month = i.month === 0 ? 'Your next PR is waiting'
    : i.month >= 12 ? 'Consistency is your superpower'
    : i.month >= 6 ? 'Building real momentum'
    : 'Every session counts';
  // Fun comparisons, in pounds: a car is about 4,000 lb, a grand piano about 1,000, a fridge about 250.
  const lifted = i.liftedLb >= 8000 ? 'Two cars worth of lifting'
    : i.liftedLb >= 4000 ? 'You lifted a car this month'
    : i.liftedLb >= 1000 ? 'Heavier than a grand piano'
    : i.liftedLb >= 250 ? 'A whole fridge worth'
    : i.liftedLb > 0 ? 'Strong start'
    : 'The weights are waiting';
  return { week, month, lifted };
}

const shortMoney = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money(n));
