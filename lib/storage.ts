import { storage } from '#imports';
import type { RaiseStatus } from './funpay';
import type { ThemeId } from './look';

export type Account = {
  userId: number;
  userName: string;
  csrfToken: string;
  checkedAt: number;
};

export type SectionState = {
  nodeId: string;
  gameId: string | null;
  name: string;
  nextAt: number;
  lastRaisedAt: number | null;
  status: RaiseStatus | null;
  message: string;
};

export type UpdateCheck = {
  status: 'update_available' | 'no_update' | 'throttled' | 'development' | 'unavailable';
  version: string | null;
  at: number;
};

export type WalletMeta = { label: string; bankId: string; bankName: string; usedAt: number };

export const accountItem = storage.defineItem<Account | null>('local:account', { fallback: null });
export const autoRaiseItem = storage.defineItem<boolean>('local:autoRaise', { fallback: false });
export const sectionsItem = storage.defineItem<SectionState[]>('local:sections', { fallback: [] });
export const excludedItem = storage.defineItem<string[]>('local:excluded', { fallback: [] });
export const lastErrorItem = storage.defineItem<string | null>('local:lastError', { fallback: null });
export const runningItem = storage.defineItem<boolean>('local:raiseRunning', { fallback: false });
export const themeItem = storage.defineItem<ThemeId>('local:theme', { fallback: 'default' });
export const refreshItem = storage.defineItem<boolean>('local:refresh', { fallback: true });
export const quickBarItem = storage.defineItem<boolean>('local:quickBar', { fallback: true });
export const notesItem = storage.defineItem<Record<string, string>>('local:notes', { fallback: {} });
export const noteNamesItem = storage.defineItem<Record<string, string>>('local:noteNames', { fallback: {} });
export const privacyItem = storage.defineItem<boolean>('local:privacy', { fallback: false });
export const templatesItem = storage.defineItem<string[]>('local:templates', {
  fallback: ['Здравствуйте! Выдаю заказ.', 'Спасибо! Подтвердите заказ и оставьте отзыв.'],
});
export const updateCheckItem = storage.defineItem<UpdateCheck | null>('local:updateCheck', { fallback: null });
export const walletsItem = storage.defineItem<Record<string, WalletMeta>>('local:wallets', { fallback: {} });
export const costsItem = storage.defineItem<Record<string, number>>('local:costs', { fallback: {} });
