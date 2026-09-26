import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_AUTO, durationText, fillTemplate, matchKeyword, needsLoop, normalize, summaryText } from '../lib/auto-rules.ts';
import { parseContacts, systemEvent } from '../lib/fp-chat.ts';
import { formatMoney } from '../lib/money.ts';

test('список чатов из runner', () => {
  const html = `<a href="https://funpay.com/chat/?node=123" class="contact-item unread" data-id="123" data-node-msg="900" data-user-msg="880">
  <div class="contact-item-photo"></div><div class="media-user-name">Dima&amp;Co</div>
  <div class="contact-item-message">Здравствуйте, есть в наличии?</div><div class="contact-item-time">12:00</div></a>
  <a href="https://funpay.com/chat/?node=124" class="contact-item" data-id="124" data-node-msg="50" data-user-msg="50"><div class="media-user-name">Oleg</div><div class="contact-item-message">ок</div></a>`;
  assert.deepEqual(parseContacts(html), [
    { node: '123', name: 'Dima&Co', preview: 'Здравствуйте, есть в наличии?', nodeMsg: 900, userMsg: 880, unread: true },
    { node: '124', name: 'Oleg', preview: 'ок', nodeMsg: 50, userMsg: 50, unread: false },
  ]);
});

test('системные события', () => {
  assert.deepEqual(systemEvent('Покупатель Dima оплатил заказ #TEW4JEBP. Игра, раздел'), { kind: 'paid', order: 'TEW4JEBP' });
  assert.deepEqual(systemEvent('Покупатель Dima подтвердил успешное выполнение заказа #TEW4JEBP и отправил деньги'), { kind: 'confirmed', order: 'TEW4JEBP' });
  assert.deepEqual(systemEvent('Покупатель Dima написал отзыв к заказу #TKHP3DN6.'), { kind: 'review', order: 'TKHP3DN6' });
  assert.deepEqual(systemEvent('Продавец вернул деньги покупателю по заказу #AAAAAAAA'), { kind: 'refund', order: 'AAAAAAAA' });
  assert.equal(systemEvent('Здравствуйте, когда выдадите?'), null);
});

test('ключевые слова и шаблоны', () => {
  const rules = [
    { id: '1', words: 'наличии, есть ли', text: 'Да, в наличии', enabled: true },
    { id: '2', words: 'гарантия', text: '', enabled: true },
  ];
  assert.equal(matchKeyword(rules, 'Здравствуйте, есть в НАЛИЧИИ?')?.id, '1');
  assert.equal(matchKeyword(rules, 'какая гарантия'), null);
  assert.equal(normalize('Ёлка\u200b  тест'), 'елка тест');
  assert.equal(fillTemplate('Спасибо, {buyer}! Заказ {order}', { buyer: 'Dima', order: 'ABC123' }), 'Спасибо, Dima! Заказ #ABC123');
});

test('тихие часы', async () => {
  const { inQuietHours, withDefaults } = await import('../lib/auto-rules.ts');
  const night = withDefaults({ quietFrom: '23:00', quietTo: '08:00' });
  assert.equal(inQuietHours(night, new Date(2026, 8, 26, 23, 30)), true);
  assert.equal(inQuietHours(night, new Date(2026, 8, 26, 7, 59)), true);
  assert.equal(inQuietHours(night, new Date(2026, 8, 26, 12, 0)), false);
  assert.equal(inQuietHours(withDefaults({}), new Date()), false);
  assert.equal(withDefaults({ away: { enabled: true } as never }).away.everyHours, 12);
});

test('операции баланса регулярками', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseBalanceRows } = await import('../lib/fp-chat.ts');
  const rows = parseBalanceRows(readFileSync(new URL('./fixtures/transactions.html', import.meta.url), 'utf8'));
  assert.ok(rows.length >= 4);
  assert.deepEqual(rows[0], { id: '75266034', status: 'complete', title: 'Заказ #NZF6TSZG', amount: -68.52, currency: 'RUB' });
  assert.equal(rows[1]!.amount, 57.2);
});

test('итоги дня', () => {
  const now = Date.UTC(2026, 8, 26, 19, 0);
  const sale = (id: string, status: 'paid' | 'closed' | 'refunded', amount: number, hoursAgo: number, currency: 'RUB' | 'USD' = 'RUB') => ({ id, at: now - hoursAgo * 3_600_000, status, amount, currency, buyerId: '1', buyerName: 'b', title: 't' });
  const today = [sale('A', 'closed', 1000, 2), sale('B', 'paid', 450.5, 5), sale('C', 'refunded', 300, 1), sale('D', 'closed', 10, 3, 'USD')];
  const text = summaryText(new Date(now), today, [sale('B', 'paid', 450.5, 5)], [5, 5, 2], now);
  assert.equal(text, ['Итоги дня, 26 сентября', `Продажи: 3 на ${formatMoney(1450.5, 'RUB')} + ${formatMoney(10, 'USD')}`, `Возвраты: 1 на ${formatMoney(300, 'RUB')}`, 'Ждут выдачи: 1, дольше всех 5 ч', 'Отзывы: 3 (5★: 2, 2★: 1)'].join('\n'));
  assert.equal(summaryText(new Date(now), [], [], [], now), ['Итоги дня, 26 сентября', 'Продажи: нет', 'Ждут выдачи: нет', 'Отзывы: нет'].join('\n'));
  assert.equal(durationText(90 * 60_000), '1 ч 30 мин');
  assert.equal(durationText(20 * 60_000), '20 мин');
  assert.equal(durationText(26 * 3_600_000), '26 ч');
});

test('когда нужен фоновый цикл', () => {
  const off = { ...DEFAULT_AUTO, notifyOrders: false, notifyUnfreeze: false };
  assert.equal(needsLoop(off, false), false);
  assert.equal(needsLoop(off, true), true);
  assert.equal(needsLoop({ ...off, notifyBlacklist: false }, true), false);
  assert.equal(needsLoop({ ...off, watch: { enabled: true, top: 3 } }, false), true);
});
