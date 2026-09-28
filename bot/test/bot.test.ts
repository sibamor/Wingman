import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { claimsToBeFunPay, findLinks, lookalikeHost } from '../../lib/scam.ts';
import { parseGames, parseProfile, resolveNodeId, resolveUserId } from '../src/funpay.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('профиль продавца', () => {
  const profile = parseProfile(fixture('profile.html'), '27523', Date.UTC(2026, 8, 28));
  assert.equal(profile.name, 'Ayakane');
  assert.equal(profile.online, true);
  assert.equal(profile.rating, 5);
  assert.equal(profile.reviewsCount, 16650);
  assert.equal(profile.registeredAt, Date.UTC(2016, 0, 19, 19, 56) - 3 * 3600_000);
  assert.equal(profile.sections.length, 2);
  assert.equal(profile.sections[0]!.name, 'Донат Albion Online');
  assert.ok(profile.offers > 0);
  assert.equal(profile.reviews.length, 2);
  assert.equal(profile.reviews[0]!.rating, 5);
  assert.ok(profile.avatar?.startsWith('https://sfunpay.com/'));
});

test('разделы с главной', () => {
  const list = parseGames(fixture('home.html'));
  assert.ok(list.length >= 3);
  assert.deepEqual(list[0], { nodeId: '3486', game: 'Abyss of Dungeons', name: 'Аккаунты' });
  assert.equal(new Set(list.map((item) => item.nodeId)).size, list.length);
});

test('ссылки и ID', () => {
  assert.equal(resolveUserId('https://funpay.com/users/27523/'), '27523');
  assert.equal(resolveUserId('27523'), '27523');
  assert.equal(resolveNodeId('https://funpay.com/lots/1000/'), '1000');
  assert.equal(resolveNodeId('https://funpay.com/en/lots/1000/trade'), '1000');
  assert.equal(resolveNodeId('Genshin'), null);
});

test('поддельные сайты и «администрация FunPay»', () => {
  assert.equal(lookalikeHost('funpay.com'), false);
  assert.equal(lookalikeHost('sfunpay.com'), false);
  assert.equal(lookalikeHost('en.funpay.com'), false);
  assert.equal(lookalikeHost('funpay-support.ru'), true);
  assert.equal(lookalikeHost('funnpay.com'), true);
  assert.equal(lookalikeHost('fvnpay.shop'), true);
  assert.deepEqual(findLinks('зайди на funpay-support.ru/login и https://funpay.com/lots/1/'), ['https://funpay-support.ru/login', 'https://funpay.com/lots/1/']);
  assert.ok(claimsToBeFunPay('Здравствуйте, администрация FunPay: ваш аккаунт будет заблокирован, перейдите по ссылке'));
  assert.ok(!claimsToBeFunPay('Купил на FunPay, всё пришло'));
});
