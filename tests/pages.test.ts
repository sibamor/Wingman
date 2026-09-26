import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { ownPlaces, parseListing, parseReviewsHtml, parseSalesHtml, readContinueHtml } from '../lib/fp-pages.ts';
import { parseReviews, parseSales } from '../lib/rows.ts';

const raw = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const dom = (name: string) => parseHTML(`<html><body>${raw(name)}</body></html>`).document;

const NOW = Date.UTC(2026, 8, 26, 9, 0) - 3 * 3600_000;

test('продажи без DOM совпадают с разбором через DOM', () => {
  const lite = parseSalesHtml(raw('sales.html'), NOW);
  const full = parseSales(dom('sales.html'), NOW);
  assert.equal(lite.length, full.length);
  lite.forEach((sale, index) => {
    const other = full[index]!;
    assert.deepEqual(sale, { id: other.id, at: other.at, status: other.status, amount: other.amount, currency: other.currency, buyerId: other.buyerId, buyerName: other.buyerName, title: other.title });
  });
  assert.equal(readContinueHtml(raw('sales.html')), 'ABCDEFGI');
});

test('отзывы без DOM совпадают с разбором через DOM', () => {
  const lite = parseReviewsHtml(raw('reviews.html'), NOW);
  const full = parseReviews(dom('reviews.html'), NOW);
  assert.deepEqual(
    lite,
    full.map((review) => ({ orderId: review.orderId, rating: review.rating, at: review.at })),
  );
});

test('лоты раздела и место по цене', () => {
  const offers = parseListing(raw('listing.html'));
  assert.equal(offers.length, 8);
  assert.deepEqual(offers[1], {
    offerId: '78037028',
    userId: '21508130',
    userName: 'Kenjjii',
    price: 54.989817,
    currency: 'RUB',
    online: false,
    filters: 'method=пополнение по id|quantity=60 кристаллов сотворения',
    title: offers[1]!.title,
  });
  assert.ok(offers[0]!.online);
  const [own] = ownPlaces(offers, '8540783');
  assert.equal(own!.place, 2);
  assert.equal(own!.total, 3);
  assert.equal(own!.cheapest?.userName, 'Kenjjii');
  const [first] = ownPlaces(offers, '13521185');
  assert.equal(first!.place, 1);
  assert.equal(first!.total, 5);
  assert.equal(first!.cheapest, null);
});

test('поиск по переписке: все слова с учётом окончаний', async () => {
  const { matchesTerms, searchTerms } = await import('../lib/chat-search.ts');
  const terms = searchTerms('аккаунт с почтой');
  assert.deepEqual(terms, ['аккау', 'почт']);
  assert.ok(matchesTerms('Здравствуйте, нужен аккаунт с почтой, есть?', terms));
  assert.ok(matchesTerms('Да, есть, аккаунт с родной почтой', terms));
  assert.ok(matchesTerms('Почта привязана к аккаунту?', terms));
  assert.ok(!matchesTerms('Сколько стоит аккаунт?', terms));
  assert.ok(matchesTerms('Ёлка', searchTerms('елка')));
});
