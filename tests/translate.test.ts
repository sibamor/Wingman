import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLanguage, fromLanguage, languageName, markerLanguage, translate } from '../lib/translate.ts';

test('язык по характерным буквам', () => {
  assert.equal(markerLanguage('Привіт, є в наявності?'), 'uk');
  assert.equal(markerLanguage('Сәлеметсіз бе, бар ма?'), 'kk');
  assert.equal(markerLanguage('Ці ёсць у наяўнасці?'), 'be');
  assert.equal(markerLanguage('Здравствуйте, есть в наличии?'), null);
});

test('язык без встроенного детектора', async () => {
  assert.equal(await detectLanguage('Здравствуйте, есть в наличии?'), 'ru');
  assert.equal(await detectLanguage('Hello, is it available?'), 'en');
  assert.equal(await detectLanguage('Добрий вечір, є знижка?'), 'uk');
  assert.equal(await detectLanguage('+'), 'und');
  assert.equal(await detectLanguage('👍👍'), 'und');
});

test('названия языков', () => {
  assert.equal(languageName('en'), 'английский');
  assert.equal(fromLanguage('en'), 'английского');
  assert.equal(fromLanguage('uk'), 'украинского');
  assert.equal(fromLanguage('he'), 'иврита');
  assert.equal(fromLanguage('hi'), 'хинди');
});

test('без переводчика в браузере понятная ошибка', async () => {
  await assert.rejects(translate('Hello', 'ru'), /Chrome 138\+ и Edge 148\+/);
});
