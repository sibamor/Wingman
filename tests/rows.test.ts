import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { mskDayStart, parseFunPayDate } from '../lib/fpdate.ts';
import { formatMoney, parseMoney } from '../lib/money.ts';
import { parseReviews, parseSales, parseTransactions, readContinue, transactionKind } from '../lib/rows.ts';

const fixture = (name: string) => parseHTML(`<html><body>${readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')}</body></html>`).document;

const NOW = Date.UTC(2026, 8, 26, 9, 0) - 3 * 3600_000;
const msk = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m, d, h, min) - 3 * 3600_000;

test('даты FunPay по Москве', () => {
  assert.equal(parseFunPayDate('сегодня, 13:33', NOW), msk(2026, 8, 26, 13, 33));
  assert.equal(parseFunPayDate('вчера, 00:05', NOW), msk(2026, 8, 25, 0, 5));
  assert.equal(parseFunPayDate('20 января, 23:11', NOW), msk(2026, 0, 20, 23, 11));
  assert.equal(parseFunPayDate('20 декабря, 23:11', NOW), msk(2025, 11, 20, 23, 11));
  assert.equal(parseFunPayDate('30 октября 2022, 14:12 ', NOW), msk(2022, 9, 30, 14, 12));
  assert.equal(parseFunPayDate('11 августа 2022, 18:12', NOW), msk(2022, 7, 11, 18, 12));
  assert.equal(parseFunPayDate('август 2022', NOW), msk(2022, 7, 1));
  assert.equal(parseFunPayDate('January 5, 10:00', NOW), msk(2026, 0, 5, 10));
  assert.equal(parseFunPayDate('5 січня, 10:00', NOW), msk(2026, 0, 5, 10));
  assert.equal(parseFunPayDate('непонятно', NOW), null);
  assert.equal(mskDayStart(msk(2026, 8, 26, 23, 59)), msk(2026, 8, 26));
});

test('суммы', () => {
  assert.deepEqual(parseMoney('− 68.52 ₽'), { amount: -68.52, currency: 'RUB' });
  assert.deepEqual(parseMoney('+ 1 234,50 €'), { amount: 1234.5, currency: 'EUR' });
  assert.deepEqual(parseMoney('40 $'), { amount: 40, currency: 'USD' });
  assert.equal(parseMoney('нет суммы'), null);
  assert.equal(formatMoney(-1234.5, 'RUB'), '−1 234,5 ₽');
  assert.equal(formatMoney(10, 'USD', true), '+10 $');
});

test('продажи', () => {
  const sales = parseSales(fixture('sales.html'), NOW);
  assert.equal(sales.length, 3);
  assert.deepEqual(sales[0], {
    id: 'PAID0001',
    at: msk(2026, 8, 26, 9, 5),
    title: 'Order Description',
    section: 'Category, Subcategory',
    buyerId: '123456',
    buyerName: 'Counterparty username',
    status: 'paid',
    amount: 1250.5,
    currency: 'RUB',
  });
  assert.equal(sales[1]!.status, 'refunded');
  assert.equal(sales[2]!.status, 'closed');
  assert.equal(sales[2]!.currency, 'USD');
  assert.equal(readContinue(fixture('sales.html')), 'ABCDEFGI');
});

test('операции баланса', () => {
  const list = parseTransactions(fixture('transactions.html'), NOW);
  assert.ok(list.length >= 4);
  assert.deepEqual(list[0], {
    id: '75266034',
    at: msk(2022, 9, 30, 14, 12),
    title: 'Заказ #NZF6TSZG',
    kind: 'order',
    status: 'complete',
    amount: -68.52,
    currency: 'RUB',
    wallet: '',
    method: '',
  });
  assert.equal(list[1]!.kind, 'payment');
  assert.equal(list[1]!.method, '7');
  assert.equal(list[1]!.amount, 57.2);
  assert.equal(transactionKind('Вывод денег #54321'), 'withdraw');
  assert.equal(transactionKind('Отмена вывода #54321'), 'withdraw_cancel');
});

test('отзывы', () => {
  const list = parseReviews(fixture('reviews.html'), NOW);
  assert.ok(list.length >= 1);
  assert.equal(list[0]!.orderId, 'Z6ELKTKG');
  assert.equal(list[0]!.rating, 5);
  assert.equal(list[0]!.authorId, '5375598');
  assert.equal(list[0]!.authorName, 'P0c0c0m');
  assert.equal(list[0]!.at, msk(2022, 7, 11, 18, 12));
  assert.equal(list[0]!.detail, 'Dota 2, 100 ₽');
  assert.match(list[0]!.text, /Быстро и без траблов/);
});
