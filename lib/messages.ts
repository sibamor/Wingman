import { browser } from '#imports';
import type { Account } from './storage';

export type Message = { type: 'account'; account: Account } | { type: 'raise-now' } | { type: 'check-account' };

export type RaiseNowReply = { error: string | null };

export function sendMessage<T = void>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
