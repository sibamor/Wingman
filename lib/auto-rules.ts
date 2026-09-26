export type KeywordRule = { id: string; words: string; text: string; enabled: boolean };

export type AutoSettings = {
  enabled: boolean;
  greeting: { enabled: boolean; text: string; everyDays: number };
  keywords: KeywordRule[];
  thanks: { enabled: boolean; text: string };
  reviews: { enabled: boolean; byRating: string[] };
  notifyOrders: boolean;
  quietMinutes: number;
};

export type AutoLogEntry = { at: number; kind: 'greeting' | 'keyword' | 'thanks' | 'review' | 'order' | 'error'; node: string; buyer: string; text: string };

export type AutoState = {
  lastSeen: Record<string, number>;
  greeted: Record<string, number>;
  keywordAt: Record<string, number>;
  done: Record<string, number>;
  log: AutoLogEntry[];
  checkedAt: number;
  pausedUntil: number;
};

export const DEFAULT_AUTO: AutoSettings = {
  enabled: false,
  greeting: { enabled: false, text: 'Здравствуйте, {buyer}! Отвечу в течение нескольких минут.', everyDays: 7 },
  keywords: [],
  thanks: { enabled: false, text: 'Спасибо за покупку, {buyer}! Если всё в порядке, оставьте, пожалуйста, отзыв.' },
  reviews: { enabled: false, byRating: ['', '', '', 'Спасибо за отзыв!', 'Спасибо за отзыв, {buyer}! Обращайтесь ещё.'] },
  notifyOrders: true,
  quietMinutes: 10,
};

export const EMPTY_STATE: AutoState = { lastSeen: {}, greeted: {}, keywordAt: {}, done: {}, log: [], checkedAt: 0, pausedUntil: 0 };


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
