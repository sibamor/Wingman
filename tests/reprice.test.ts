import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buyerPrice } from '../lib/commission.ts';
import { parseListing, type ListingOffer } from '../lib/fp-pages.ts';
import { placeTarget, priceStep, rivalsFor, undercutPrice } from '../lib/reprice.ts';

const offers = parseListing(readFileSync(new URL('./fixtures/listing.html', import.meta.url), 'utf8'));
const PERCENT = 9.98;
const OWN = '63287858';
const USER = '8540783';

const offer = (offerId: string, userId: string, price: number, filters = 'a=1'): ListingOffer => ({ offerId, userId, userName: userId, price, currency: 'RUB', online: false, filters, title: '' });

test('шаг цены: рубль для целых цен, копейка для остальных', () => {
  assert.equal(priceStep(50, 'RUB'), 1);
  assert.equal(priceStep(49.5, 'RUB'), 0.01);
  assert.equal(priceStep(5, 'RUB'), 0.01);
  assert.equal(priceStep(50, 'USD'), 0.01);
  assert.equal(priceStep(50, 'EUR'), 0.01);
});

test('цена на шаг ниже конкурента считается от цены продавца', () => {
  assert.equal(undercutPrice(54.989817, PERCENT, 'RUB'), 49);
  assert.equal(undercutPrice(114.723378, PERCENT, 'RUB'), 104.3);
  assert.equal(undercutPrice(2.2, 10, 'USD'), 1.99);
  assert.equal(undercutPrice(5.5, 10, 'RUB'), 4.99);
  assert.ok(buyerPrice(undercutPrice(54.989817, PERCENT, 'RUB'), PERCENT) < 54.989817);
  assert.ok(buyerPrice(undercutPrice(114.723378, PERCENT, 'RUB'), PERCENT) < 114.723378);
});

test('конкуренты только из той же группы фильтров и без своих лотов', () => {
  const list = [offer('1', 'me', 60), offer('2', 'me', 40), offer('3', 'x', 80), offer('4', 'y', 50), offer('5', 'z', 30, 'a=2')];
  assert.deepEqual(rivalsFor(list, '1', 'me').map((item) => item.offerId), ['4', '3']);
  assert.deepEqual(rivalsFor(list, '9', 'me'), []);
});

test('место в разделе по настоящей разметке', () => {
  const first = placeTarget(offers, OWN, USER, 1, PERCENT);
  assert.equal(first?.rival.offerId, '78037028');
  assert.equal(first?.price, 49);
  const second = placeTarget(offers, OWN, USER, 2, PERCENT);
  assert.equal(second?.rival.offerId, '29551931');
  assert.equal(second?.price, 104.3);
  assert.equal(placeTarget(offers, OWN, USER, 3, PERCENT), null);
});
