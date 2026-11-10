import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stockAlert } from '../lib/auto-rules.ts';
import { parseTradeStock } from '../lib/fp-chat.ts';

test('остаток лотов со страницы раздела', () => {
  const html = `<div class="tc">
  <a href="https://funpay.com/lots/offerEdit?node=1234&offer=11" class="tc-item" data-offer="11">
    <div class="tc-desc"><div class="tc-desc-text">Ключ Steam &amp; бонус</div></div>
    <div class="tc-amount">2</div><div class="tc-price">100 ₽</div></a>
  <a href="https://funpay.com/lots/offerEdit?node=1234&offer=12" class="tc-item warning" data-offer="12">
    <div class="tc-desc"><div class="tc-desc-text">Аккаунт</div></div>
    <div class="tc-amount">0</div></a>
  <a href="https://funpay.com/lots/offerEdit?node=1234&offer=13" class="tc-item" data-offer="13">
    <div class="tc-desc"><div class="tc-desc-text">Буст</div></div>
    <div class="tc-amount">∞</div></a></div>`;
  assert.deepEqual(parseTradeStock(html), [
    { offerId: '11', title: 'Ключ Steam & бонус', amount: 2, active: true },
    { offerId: '12', title: 'Аккаунт', amount: 0, active: false },
    { offerId: '13', title: 'Буст', amount: null, active: true },
  ]);
});

test('когда предупреждать об остатке', () => {
  const row = { offerId: '1', title: 'Ключ', amount: 2, active: true };
  assert.equal(stockAlert(row, 3, undefined), 'Осталось 2 шт.');
  assert.equal(stockAlert(row, 3, 2), null);
  assert.equal(stockAlert({ ...row, amount: 1 }, 3, 2), 'Осталось 1 шт.');
  assert.equal(stockAlert({ ...row, amount: 0 }, 3, 1), 'Товар закончился');
  assert.equal(stockAlert({ ...row, amount: 5 }, 3, undefined), null);
  assert.equal(stockAlert({ ...row, amount: null }, 3, undefined), null);
});
