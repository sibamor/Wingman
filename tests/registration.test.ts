import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isYoungAccount, parseRegistration, registrationFromLines } from '../lib/registration.ts';

const MSK = 3 * 3600_000;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 10, 12, 0) - MSK;
const msk = (year: number, month: number, day: number, hours = 0, minutes = 0) => Date.UTC(year, month, day, hours, minutes) - MSK;

const profile = (item: string) => `
<div class="profile-header">
  <h1 class="mb40 online"><span class="mr4">Buyer</span></h1>
  <span class="media-user-status">Онлайн</span>
  ${item}
</div>
<div class="param-item mb10">
  <div class="rating-value"><span class="big">4.9</span></div>
  <div class="mb5">12 отзывов</div>
</div>`;

test('дата регистрации из шапки профиля', () => {
  const html = profile('<div class="param-item"><h5 class="mb5">Дата регистрации</h5><div class="text-nowrap">8 декабря 2024, 21:24<br>11 месяцев назад</div></div>');
  assert.equal(parseRegistration(html, NOW), msk(2024, 11, 8, 21, 24));
});

test('дата регистрации в английской версии', () => {
  const html = profile('<div class="param-item">\n<div>Registered</div>\n<div>15 August 2015, 18:01</div>\n<div>10 years ago</div>\n</div>');
  assert.equal(parseRegistration(html, NOW), msk(2015, 7, 15, 18, 1));
});

test('дата текущего года без года и «сегодня»', () => {
  assert.equal(parseRegistration(profile('<div class="param-item"><h5>Дата регистрации</h5><div>5 ноября, 14:10<br>5 дней назад</div></div>'), NOW), msk(2026, 10, 5, 14, 10));
  assert.equal(parseRegistration(profile('<div class="param-item"><h5>Дата регистрации</h5><div>Сегодня, 09:15<br>3 часа назад</div></div>'), NOW), msk(2026, 10, 10, 9, 15));
});

test('нет поля - нет даты, соседний блок рейтинга не путается', () => {
  assert.equal(parseRegistration('<div class="profile"><h1>Buyer</h1></div>', NOW), null);
  assert.equal(parseRegistration(profile('<div class="param-item"><h5>Статус</h5><div>Заблокирован</div></div>'), NOW), null);
  assert.equal(parseRegistration(readFileSync(new URL('./fixtures/profile.html', import.meta.url), 'utf8'), NOW), null);
});

test('строки блока из чата', () => {
  assert.equal(registrationFromLines(['Дата регистрации', '8 декабря 2024, 21:24', '11 месяцев назад'], NOW), msk(2024, 11, 8, 21, 24));
  assert.equal(registrationFromLines(['Дата регистрации', '7 месяцев назад'], NOW), null);
});

test('аккаунт моложе 7 дней', () => {
  assert.equal(isYoungAccount(NOW - 6 * DAY, NOW), true);
  assert.equal(isYoungAccount(NOW - 7 * DAY, NOW), false);
  assert.equal(isYoungAccount(msk(2024, 11, 8, 21, 24), NOW), false);
});
