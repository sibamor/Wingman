import { loadAccount } from './api';
import { setOrdersBadge } from './badge';
import { pollRunner } from './fp-chat';
import { accountItem } from './storage';

export type Summary = { unread: number; orders: number; at: number } | { error: string };

export async function loadSummary(): Promise<Summary> {
  let account = await accountItem.getValue();
  if (!account) {
    return { error: 'Войдите в аккаунт FunPay' };
  }
  try {
    let result;
    try {
      result = await pollRunner(account.userId, account.csrfToken);
    } catch {
      account = await loadAccount();
      await accountItem.setValue(account);
      result = await pollRunner(account.userId, account.csrfToken);
    }
    await setOrdersBadge(result.sellerOrders);
    return { unread: (result.contacts ?? []).filter((contact) => contact.unread).length, orders: result.sellerOrders ?? 0, at: Date.now() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'FunPay не отвечает' };
  }
}
