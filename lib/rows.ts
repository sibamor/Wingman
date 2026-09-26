import { parseFunPayDate } from './fpdate.ts';
import { parseMoney, type Currency } from './money.ts';

export type SaleStatus = 'paid' | 'closed' | 'refunded';

export type Sale = {
  id: string;
  at: number | null;
  title: string;
  section: string;
  buyerId: string;
  buyerName: string;
  status: SaleStatus;
  amount: number;
  currency: Currency;
};

export type TransactionKind = 'order' | 'withdraw' | 'withdraw_cancel' | 'payment' | 'refund' | 'other';

export type TransactionStatus = 'complete' | 'waiting' | 'cancel';

export type Transaction = {
  id: string;
  at: number | null;
  title: string;
  kind: TransactionKind;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  wallet: string;
  method: string;
};

export type Review = {
  key: string;
  orderId: string;
  authorId: string;
  authorName: string;
  rating: number;
  text: string;
  reply: string;
  at: number | null;
  detail: string;
};

const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const userIdFrom = (href: string | null | undefined) => href?.match(/\/users\/(\d+)/)?.[1] ?? '';

export function readContinue(root: ParentNode): string {
  const inputs = root.querySelectorAll<HTMLInputElement>('input[name="continue"]');
  return inputs.length ? (inputs[inputs.length - 1]!.getAttribute('value') ?? '') : '';
}

export function parseSales(root: ParentNode, now = Date.now()): Sale[] {
  const sales: Sale[] = [];
  for (const row of root.querySelectorAll<HTMLElement>('a.tc-item')) {
    const id = text(row, '.tc-order').replace(/^#/, '');
    const money = parseMoney(text(row, '.tc-price'));
    if (!id || !money) {
      continue;
    }
    const desc = row.querySelector('.order-desc');
    const user = row.querySelector('.media-user-name [data-href], .media-user-name a');
    sales.push({
      id,
      at: parseFunPayDate(text(row, '.tc-date-time'), now),
      title: desc?.querySelector(':scope > div:not(.text-muted)')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      section: desc ? text(desc, '.text-muted') : '',
      buyerId: userIdFrom(user?.getAttribute('data-href') ?? user?.getAttribute('href')),
      buyerName: user?.textContent?.trim() ?? '',
      status: row.classList.contains('info') ? 'paid' : row.classList.contains('warning') ? 'refunded' : 'closed',
      amount: Math.abs(money.amount),
      currency: money.currency,
    });
  }
  return sales;
}

export function transactionKind(title: string): TransactionKind {
  const value = title.toLowerCase();
  if (/отмена вывода|скасування виведення|withdrawal cancel/.test(value)) {
    return 'withdraw_cancel';
  }
  if (/вывод|виведення|withdraw/.test(value)) {
    return 'withdraw';
  }
  if (/пополнение|поповнення|deposit|top.?up/.test(value)) {
    return 'payment';
  }
  if (/возврат|повернення|refund/.test(value)) {
    return 'refund';
  }
  if (/заказ|замовлення|order/.test(value)) {
    return 'order';
  }
  return 'other';
}

export function parseTransactions(root: ParentNode, now = Date.now()): Transaction[] {
  const list: Transaction[] = [];
  for (const row of root.querySelectorAll<HTMLElement>('.tc-item[data-transaction]')) {
    const money = parseMoney(row.querySelector('.tc-price')?.innerHTML.replace(/<[^>]+>/g, ' ') ?? '');
    if (!money) {
      continue;
    }
    const title = text(row, '.tc-title');
    const logo = row.querySelector('.payment-logo')?.className.match(/payment-method-([\w-]+)/)?.[1] ?? '';
    list.push({
      id: row.getAttribute('data-transaction') ?? '',
      at: parseFunPayDate(text(row, '.tc-date-time'), now),
      title,
      kind: transactionKind(title),
      status: row.classList.contains('transaction-status-waiting') ? 'waiting' : row.classList.contains('transaction-status-cancel') ? 'cancel' : 'complete',
      amount: money.amount,
      currency: money.currency,
      wallet: text(row, '.tc-payment-number'),
      method: logo,
    });
  }
  return list;
}

export function parseReviews(root: ParentNode, now = Date.now()): Review[] {
  const list: Review[] = [];
  for (const container of root.querySelectorAll<HTMLElement>('.review-container')) {
    const rating = Number(container.querySelector('.rating [class^="rating"], .rating div')?.className.match(/rating(\d)/)?.[1] ?? 0);
    const orderId = container.querySelector('.review-item-order a')?.getAttribute('href')?.match(/\/orders\/([^/]+)/)?.[1] ?? '';
    const author = container.querySelector('.review-item-user .media-user-name a');
    const authorId = userIdFrom(author?.getAttribute('href') ?? container.querySelector('.review-item-photo a')?.getAttribute('href'));
    const dateText = text(container, '.review-item-date');
    const reviewText = text(container, '.review-item-text');
    const detail = text(container, '.review-item-detail');
    list.push({
      key: orderId || `${authorId}|${dateText}|${reviewText.slice(0, 40)}`,
      orderId,
      authorId,
      authorName: author?.textContent?.trim() ?? '',
      rating,
      text: reviewText,
      reply: text(container, '.review-compiled-reply'),
      at: parseFunPayDate(dateText.split(',')[0]!.replace(' в ', ', '), now),
      detail,
    });
  }
  return list;
}
