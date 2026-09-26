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
export type NavEntry = { url: string; title: string; at: number };
export const recentItem = storage.defineItem<NavEntry[]>('local:recentSections', { fallback: [] });
export const favoritesItem = storage.defineItem<NavEntry[]>('local:favoriteSections', { fallback: [] });
export const ticketedItem = storage.defineItem<Record<string, number>>('local:ticketed', { fallback: {} });
export type CachedLot = { offerId: string; nodeId: string; section: string; title: string; price: number; currency: 'RUB' | 'USD' | 'EUR'; amount: string; active: boolean };
export const lotsCacheItem = storage.defineItem<{ at: number; lots: CachedLot[] } | null>('local:lotsCache', { fallback: null });
export type ChatMarks = { pinned: string[]; tags: Record<string, { tag: string; name: string }> };
export const chatMarksItem = storage.defineItem<ChatMarks>('local:chatMarks', { fallback: { pinned: [], tags: {} } });
export type Delivered = { buyer: string; items: string[]; at: number };
export const deliveredItem = storage.defineItem<Record<string, Delivered>>('local:delivered', { fallback: {} });
export type BlacklistEntry = { name: string; at: number };
export const blacklistItem = storage.defineItem<Record<string, BlacklistEntry>>('local:blacklist', { fallback: {} });
