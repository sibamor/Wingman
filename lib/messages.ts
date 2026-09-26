import { browser } from '#imports';
import type { Account, UpdateCheck } from './storage';

export type Message =
  | { type: 'account'; account: Account }
  | { type: 'check-account' }
  | { type: 'raise-now' }
  | { type: 'refresh-sections' }
  | { type: 'check-update' }
  | { type: 'reschedule' }
  | { type: 'auto-poke' }
  | { type: 'telegram-test'; token: string; chatId: string }
  | { type: 'telegram-find'; token: string };

export type TaskReply = { error: string | null };

export type UpdateReply = UpdateCheck;

export function sendMessage<T = void>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message) as Promise<T>;
}
