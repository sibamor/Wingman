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
  quietMinutes: number;
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
  quietMinutes: 10,
};

export const EMPTY_STATE: AutoState = { lastSeen: {}, greeted: {}, keywordAt: {}, done: {}, log: [], checkedAt: 0, pausedUntil: 0, awayAt: {}, waiting: {}, balanceCheckedAt: 0 };

export function withDefaults(value: Partial<AutoSettings>): AutoSettings {
  return { ...DEFAULT_AUTO, ...value, away: { ...DEFAULT_AUTO.away, ...value.away } };
}

export function stateWithDefaults(value: Partial<AutoState>): AutoState {
  return { ...EMPTY_STATE, ...value };
}

export function inQuietHours(settings: AutoSettings, now = new Date()): boolean {
  const parse = (text: string) => {
    const match = text.match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const from = parse(settings.quietFrom);
  const to = parse(settings.quietTo);
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
