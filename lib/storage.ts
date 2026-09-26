import { storage } from '#imports';
import type { RaiseStatus } from './funpay';

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

export const accountItem = storage.defineItem<Account | null>('local:account', { fallback: null });
export const autoRaiseItem = storage.defineItem<boolean>('local:autoRaise', { fallback: false });
export const sectionsItem = storage.defineItem<SectionState[]>('local:sections', { fallback: [] });
export const lastErrorItem = storage.defineItem<string | null>('local:lastError', { fallback: null });
export const runningItem = storage.defineItem<boolean>('session:raiseRunning', { fallback: false });
