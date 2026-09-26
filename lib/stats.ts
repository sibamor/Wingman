import { mskDayStart } from './fpdate.ts';
import type { Currency } from './money.ts';
import type { Review, Sale, Transaction } from './rows.ts';

export type Period = 'today' | '7d' | '30d' | '365d' | 'all';

export const PERIODS: { id: Period; name: string }[] = [
  { id: 'today', name: 'Сегодня' },
  { id: '7d', name: '7 дней' },
  { id: '30d', name: '30 дней' },
  { id: '365d', name: 'Год' },
  { id: 'all', name: 'Всё время' },
];

const DAY = 86_400_000;

export function periodStart(period: Period, now = Date.now()): number {
  const today = mskDayStart(now);
  const days = { today: 0, '7d': 6, '30d': 29, '365d': 364, all: Infinity }[period];
  return days === Infinity ? 0 : today - days * DAY;
}

export function inPeriod<T extends { at: number | null }>(rows: T[], period: Period, now = Date.now()): T[] {
  const from = periodStart(period, now);
  return rows.filter((row) => period === 'all' || (row.at !== null && row.at >= from));
}

export function mainCurrency(rows: { currency: Currency }[]): Currency {
  const counts: Partial<Record<Currency, number>> = {};
  for (const row of rows) {
    counts[row.currency] = (counts[row.currency] ?? 0) + 1;
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as Currency) ?? 'RUB';
}

export type Bucket = { from: number; label: string; value: number; count: number };

export function buckets<T extends { at: number | null }>(rows: T[], period: Period, value: (row: T) => number, now = Date.now()): Bucket[] {
  const dated = rows.filter((row) => row.at !== null) as (T & { at: number })[];
  const first = period === 'all' ? Math.min(...dated.map((row) => row.at), now) : periodStart(period, now);
  const start = mskDayStart(first);
  const span = Math.ceil((mskDayStart(now) - start) / DAY) + 1;
  const step = span > 400 ? 30 : span > 62 ? 7 : 1;
  const list: Bucket[] = [];
  for (let from = start; from <= now; from += step * DAY) {
    const date = new Date(from + 3 * 3600_000);
    const label = step === 30 ? date.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    list.push({ from, label, value: 0, count: 0 });
  }
  for (const row of dated) {
    const index = Math.floor((mskDayStart(row.at) - start) / (step * DAY));
    const bucket = list[index];
    if (bucket) {
      bucket.value += value(row);
      bucket.count += 1;
    }
  }
  return list;
}

export type SalesSummary = {
  currency: Currency;
  revenue: number;
  orders: number;
  average: number;
  pending: number;
  pendingCount: number;
  refunded: number;
  refundedCount: number;
  buyers: number;
  repeatBuyers: number;
  sections: { name: string; revenue: number; orders: number }[];
  otherCurrencies: Currency[];
};

export function summarizeSales(all: Sale[], period: Period, now = Date.now()): SalesSummary {
  const rows = inPeriod(all, period, now);
  const currency = mainCurrency(rows.length ? rows : all);
  const own = rows.filter((sale) => sale.currency === currency);
  const earned = own.filter((sale) => sale.status !== 'refunded');
  const revenue = earned.reduce((sum, sale) => sum + sale.amount, 0);
  const pending = own.filter((sale) => sale.status === 'paid');
  const refunded = own.filter((sale) => sale.status === 'refunded');
  const byBuyer = new Map<string, number>();
  for (const sale of earned) {
    byBuyer.set(sale.buyerId, (byBuyer.get(sale.buyerId) ?? 0) + 1);
  }
  const bySection = new Map<string, { name: string; revenue: number; orders: number }>();
  for (const sale of earned) {
    const name = sale.section || 'Без раздела';
    const entry = bySection.get(name) ?? { name, revenue: 0, orders: 0 };
    entry.revenue += sale.amount;
    entry.orders += 1;
    bySection.set(name, entry);
  }
  return {
    currency,
    revenue,
    orders: earned.length,
    average: earned.length ? revenue / earned.length : 0,
    pending: pending.reduce((sum, sale) => sum + sale.amount, 0),
    pendingCount: pending.length,
    refunded: refunded.reduce((sum, sale) => sum + sale.amount, 0),
    refundedCount: refunded.length,
    buyers: byBuyer.size,
    repeatBuyers: [...byBuyer.values()].filter((count) => count > 1).length,
    sections: [...bySection.values()].sort((a, b) => b.revenue - a.revenue),
    otherCurrencies: [...new Set(rows.map((sale) => sale.currency))].filter((item) => item !== currency),
  };
}

export type MoneySummary = { currency: Currency; income: number; withdrawn: number; waiting: number; waitingCount: number; spent: number };

export function summarizeTransactions(all: Transaction[], period: Period, now = Date.now()): MoneySummary {
  const rows = inPeriod(all, period, now);
  const currency = mainCurrency(rows.length ? rows : all);
  const own = rows.filter((row) => row.currency === currency);
  const sum = (list: Transaction[]) => list.reduce((total, row) => total + row.amount, 0);
  const complete = own.filter((row) => row.status === 'complete');
  return {
    currency,
    income: sum(complete.filter((row) => row.kind === 'order' && row.amount > 0)),
    withdrawn: -sum(complete.filter((row) => row.kind === 'withdraw')),
    spent: -sum(complete.filter((row) => row.kind === 'order' && row.amount < 0)),
    waiting: sum(own.filter((row) => row.status === 'waiting' && row.amount > 0)),
    waitingCount: own.filter((row) => row.status === 'waiting' && row.amount > 0).length,
  };
}

export type ReviewSummary = { count: number; average: number; byRating: number[]; unanswered: number };

export function summarizeReviews(all: Review[]): ReviewSummary {
  const rated = all.filter((review) => review.rating > 0);
  const byRating = [0, 0, 0, 0, 0];
  for (const review of rated) {
    byRating[review.rating - 1]! += 1;
  }
  return {
    count: rated.length,
    average: rated.length ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length : 0,
    byRating,
    unanswered: all.filter((review) => review.orderId && !review.reply).length,
  };
}
