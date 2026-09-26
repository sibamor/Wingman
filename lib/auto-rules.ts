import type { SaleLite } from './fp-pages.ts';
import { formatMoney, type Currency } from './money.ts';

export type KeywordRule = { id: string; words: string; text: string; enabled: boolean };

export type AutoSettings = {
  enabled: boolean;
  greeting: { enabled: boolean; text: string; everyDays: number };
  keywords: KeywordRule[];
  thanks: { enabled: boolean; text: string };
  reviews: { enabled: boolean; byRating: string[] };
  notifyOrders: boolean;
  notifyMessages: boolean;
  notifyUnfreeze: boolean;
  quietFrom: string;
  quietTo: string;
  away: { enabled: boolean; text: string; everyHours: number };
  telegram: { token: string; chatId: string; chatName: string };
  quietMinutes: number;
  deadline: { enabled: boolean; hours: number };
  summary: { enabled: boolean; time: string };
  watch: { enabled: boolean; top: number };
  notifyBlacklist: boolean;
};

export type AutoLogEntry = { at: number; kind: 'greeting' | 'keyword' | 'thanks' | 'review' | 'order' | 'away' | 'error'; node: string; buyer: string; text: string };

export type AutoState = {
  lastSeen: Record<string, number>;
  greeted: Record<string, number>;
  keywordAt: Record<string, number>;
  done: Record<string, number>;
  log: AutoLogEntry[];
  checkedAt: number;
  pausedUntil: number;
  awayAt: Record<string, number>;
  waiting: Record<string, { amount: number; currency: string; title: string }>;
  balanceCheckedAt: number;
  ordersCheckedAt: number;
  overdue: Record<string, number>;
  summaryDay: string;
  watchCheckedAt: number;
  watch: Record<string, number>;
};

export const DEFAULT_AUTO: AutoSettings = {
  enabled: false,
  greeting: { enabled: false, text: 'Здравствуйте, {buyer}! Отвечу в течение нескольких минут.', everyDays: 7 },
  keywords: [],
  thanks: { enabled: false, text: 'Спасибо за покупку, {buyer}! Если всё в порядке, оставьте, пожалуйста, отзыв.' },
  reviews: { enabled: false, byRating: ['', '', '', 'Спасибо за отзыв!', 'Спасибо за отзыв, {buyer}! Обращайтесь ещё.'] },
  notifyOrders: true,
  notifyMessages: false,
  notifyUnfreeze: true,
  quietFrom: '',
  quietTo: '',
  away: { enabled: false, text: 'Здравствуйте! Сейчас меня нет на месте, отвечу, как только вернусь.', everyHours: 12 },
  telegram: { token: '', chatId: '', chatName: '' },
  quietMinutes: 10,
  deadline: { enabled: false, hours: 2 },
  summary: { enabled: false, time: '22:00' },
  watch: { enabled: false, top: 3 },
  notifyBlacklist: true,
};

export const EMPTY_STATE: AutoState = { lastSeen: {}, greeted: {}, keywordAt: {}, done: {}, log: [], checkedAt: 0, pausedUntil: 0, awayAt: {}, waiting: {}, balanceCheckedAt: 0, ordersCheckedAt: 0, overdue: {}, summaryDay: '', watchCheckedAt: 0, watch: {} };

export function withDefaults(value: Partial<AutoSettings>): AutoSettings {
  return {
    ...DEFAULT_AUTO,
    ...value,
    away: { ...DEFAULT_AUTO.away, ...value.away },
    telegram: { ...DEFAULT_AUTO.telegram, ...value.telegram },
    deadline: { ...DEFAULT_AUTO.deadline, ...value.deadline },
    summary: { ...DEFAULT_AUTO.summary, ...value.summary },
    watch: { ...DEFAULT_AUTO.watch, ...value.watch },
  };
}

export function stateWithDefaults(value: Partial<AutoState>): AutoState {
  return { ...EMPTY_STATE, ...value };
}

export function parseClock(text: string): number | null {
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function needsLoop(settings: AutoSettings, hasBlacklist: boolean): boolean {
  return (
    settings.enabled ||
    settings.notifyOrders ||
    settings.notifyMessages ||
    settings.notifyUnfreeze ||
    settings.away.enabled ||
    settings.deadline.enabled ||
    settings.summary.enabled ||
    settings.watch.enabled ||
    (settings.notifyBlacklist && hasBlacklist)
  );
}

export function inQuietHours(settings: AutoSettings, now = new Date()): boolean {
  const from = parseClock(settings.quietFrom);
  const to = parseClock(settings.quietTo);
  if (from === null || to === null || from === to) {
    return false;
  }
  const minute = now.getHours() * 60 + now.getMinutes();
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}


export function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[​-‏⁠-⁤]/g, '').replace(/\s+/g, ' ').trim();
}

export function matchKeyword(rules: KeywordRule[], message: string): KeywordRule | null {
  const value = normalize(message);
  for (const rule of rules) {
    if (!rule.enabled || !rule.text.trim()) {
      continue;
    }
    const words = rule.words.split(',').map(normalize).filter(Boolean);
    if (words.some((word) => value.includes(word))) {
      return rule;
    }
  }
  return null;
}

export function fillTemplate(text: string, vars: { buyer?: string; order?: string }): string {
  return text.replace(/\{buyer\}/g, vars.buyer ?? '').replace(/\{order\}/g, vars.order ? `#${vars.order}` : '').replace(/\s+([!?.,])/g, '$1').trim();
}

export function durationText(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  if (!hours) {
    return `${minutes} мин`;
  }
  return minutes % 60 && hours < 10 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
}

function sumText(sales: SaleLite[]): string {
  const totals = new Map<Currency, number>();
  for (const sale of sales) {
    totals.set(sale.currency, (totals.get(sale.currency) ?? 0) + sale.amount);
  }
  return [...totals].map(([currency, amount]) => formatMoney(amount, currency)).join(' + ');
}

export function summaryText(day: Date, today: SaleLite[], open: SaleLite[], ratings: number[], now = Date.now()): string {
  const sold = today.filter((sale) => sale.status !== 'refunded');
  const refunded = today.filter((sale) => sale.status === 'refunded');
  const lines = [`Итоги дня, ${day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`];
  lines.push(sold.length ? `Продажи: ${sold.length} на ${sumText(sold)}` : 'Продажи: нет');
  if (refunded.length) {
    lines.push(`Возвраты: ${refunded.length} на ${sumText(refunded)}`);
  }
  const oldest = Math.min(...open.map((sale) => sale.at ?? now));
  lines.push(open.length ? `Ждут выдачи: ${open.length}, дольше всех ${durationText(now - oldest)}` : 'Ждут выдачи: нет');
  if (ratings.length) {
    const counts = [5, 4, 3, 2, 1].filter((rating) => ratings.includes(rating)).map((rating) => `${rating}★: ${ratings.filter((item) => item === rating).length}`);
    lines.push(`Отзывы: ${ratings.length} (${counts.join(', ')})`);
  } else {
    lines.push('Отзывы: нет');
  }
  return lines.join('\n');
}

export function activeAutoParts(settings: AutoSettings): string[] {
  const list: string[] = [];
  if (settings.greeting.enabled && settings.greeting.text.trim()) {
    list.push('приветствие новым покупателям');
  }
  const rules = settings.keywords.filter((rule) => rule.enabled && rule.words.trim() && rule.text.trim()).length;
  if (rules) {
    const word = rules % 10 === 1 && rules % 100 !== 11 ? 'правило' : [2, 3, 4].includes(rules % 10) && ![12, 13, 14].includes(rules % 100) ? 'правила' : 'правил';
    list.push(`${rules} ${word} по словам`);
  }
  if (settings.thanks.enabled && settings.thanks.text.trim()) {
    list.push('благодарность за подтверждение заказа');
  }
  if (settings.reviews.enabled && settings.reviews.byRating.some((text) => text.trim())) {
    list.push('публичные ответы на отзывы');
  }
  return list;
}
