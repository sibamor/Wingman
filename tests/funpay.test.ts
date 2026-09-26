import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  parseAppData,
  parseLotSections,
  parseModalNodeIds,
  parseRaiseButton,
  parseRaiseResponse,
  parseUserName,
  waitFromMessage,
} from '../lib/funpay.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('app data гостя: userId 0 и csrf', () => {
  const data = parseAppData(fixture('home-guest.html'));
  assert.equal(data?.userId, 0);
  assert.match(data?.csrfToken ?? '', /^[a-z0-9]{8,}$/);
  assert.equal(data?.locale, 'ru');
});

test('app data отсутствует', () => {
  assert.equal(parseAppData('<body class="x">'), null);
});

test('разделы лотов из профиля', () => {
  assert.deepEqual(parseLotSections(fixture('profile.html')), [
    { nodeId: '2141', name: 'Валюта 8 Ball Pool' },
    { nodeId: '2142', name: 'Донат 8 Ball Pool' },
    { nodeId: '2140', name: 'Монеты 8 Ball Pool' },
    { nodeId: '952', name: 'Алмазы AFK Arena' },
  ]);
});

test('ник из шапки', () => {
  assert.equal(parseUserName('<div class="user-link-name">Seller&amp;Co</div>'), 'Seller&Co');
  assert.equal(parseUserName('<div></div>'), '');
});

test('кнопка поднятия при любом порядке атрибутов', () => {
  assert.deepEqual(parseRaiseButton('<button class="btn btn-default js-lot-raise" data-game="41" data-node="2141">'), {
    gameId: '41',
    nodeId: '2141',
  });
  assert.deepEqual(parseRaiseButton('<button data-node="7" type="button" data-game="3" class="js-lot-raise">'), {
    gameId: '3',
    nodeId: '7',
  });
  assert.equal(parseRaiseButton('<button class="js-lot-raised" data-game="1" data-node="2">'), null);
});

test('подразделы из модалки', () => {
  const modal = '<div class="checkbox"><label><input type="checkbox" name="node_ids[]" value="2141" checked></label></div>'
    + '<div class="checkbox"><label><input type="checkbox" value="2142"></label></div>';
  assert.deepEqual(parseModalNodeIds(modal), ['2141', '2142']);
});

test('ожидание из текста', () => {
  assert.equal(waitFromMessage('Подождите 3 часа.'), 9000);
  assert.equal(waitFromMessage('Подождите 45 минут.'), 2640);
  assert.equal(waitFromMessage('Please wait 30 seconds.'), 30);
  assert.equal(waitFromMessage('Зачекайте 2 години.'), 5400);
  assert.equal(waitFromMessage('Ошибка'), null);
});

test('ответы на поднятие', () => {
  assert.deepEqual(parseRaiseResponse(200, '{"error":false,"msg":"Предложения подняты","wait":14400}'), {
    kind: 'done',
    result: { status: 'raised', waitSeconds: 14400, message: 'Предложения подняты' },
  });
  assert.deepEqual(parseRaiseResponse(200, '{"error":true,"msg":"Подождите 2 часа."}'), {
    kind: 'done',
    result: { status: 'wait', waitSeconds: 5400, message: 'Подождите 2 часа.' },
  });
  assert.deepEqual(parseRaiseResponse(429, '{"error":true,"msg":"Подождите","wait":600}'), {
    kind: 'done',
    result: { status: 'wait', waitSeconds: 600, message: 'Подождите' },
  });
  assert.deepEqual(parseRaiseResponse(200, '{"error":true,"msg":"Лот не найден"}'), {
    kind: 'done',
    result: { status: 'error', waitSeconds: 600, message: 'Лот не найден' },
  });
  assert.equal(parseRaiseResponse(200, '{"modal":"<div class=\\"checkbox\\"></div>"}').kind, 'modal');
  assert.deepEqual(parseRaiseResponse(502, '<html>Bad gateway</html>'), {
    kind: 'done',
    result: { status: 'error', waitSeconds: 600, message: 'FunPay ответил 502' },
  });
});
