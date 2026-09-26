export type Bank = { id: string; name: string; aliases: string[] };

export const BANKS: Bank[] = [
  { id: '100000000111', name: 'Сбербанк', aliases: ['сбер', 'сбербанк', 'sber'] },
  { id: '100000000004', name: 'Т-Банк', aliases: ['т-банк', 'тбанк', 'тинькофф', 'tinkoff', 't-bank'] },
  { id: '100000000005', name: 'ВТБ', aliases: ['втб', 'vtb'] },
  { id: '100000000008', name: 'Альфа-Банк', aliases: ['альфа', 'alfa'] },
  { id: '100000000007', name: 'Райффайзен', aliases: ['райффайзен', 'raiffeisen'] },
  { id: '100000000001', name: 'Газпромбанк', aliases: ['газпромбанк', 'гпб', 'gazprombank'] },
  { id: '100000000010', name: 'ПСБ', aliases: ['псб', 'промсвязьбанк', 'psb'] },
  { id: '100000000013', name: 'Совкомбанк', aliases: ['совкомбанк', 'халва', 'sovcombank'] },
  { id: '100000000020', name: 'Россельхозбанк', aliases: ['рсхб', 'россельхоз'] },
  { id: '100000000025', name: 'МКБ', aliases: ['мкб', 'московский кредитный'] },
  { id: '100000000273', name: 'Озон Банк', aliases: ['озон', 'ozon'] },
  { id: '100000000150', name: 'Яндекс Банк', aliases: ['яндекс', 'yandex'] },
  { id: '100000000017', name: 'МТС Банк', aliases: ['мтс-банк', 'мтс банк', 'mts bank'] },
  { id: '100000000289', name: 'МТС Деньги', aliases: ['мтс деньги', 'экси'] },
  { id: '100000000284', name: 'Точка', aliases: ['точка', 'tochka'] },
  { id: '100000000099', name: 'Модульбанк', aliases: ['модульбанк', 'модуль'] },
  { id: '100000000082', name: 'Банк ДОМ.РФ', aliases: ['дом.рф', 'дом рф'] },
  { id: '100000000006', name: 'Ак Барс', aliases: ['ак барс', 'акбарс'] },
  { id: '100000000026', name: 'Уралсиб', aliases: ['уралсиб'] },
  { id: '100000000018', name: 'ОТП Банк', aliases: ['отп', 'otp'] },
  { id: '100000000032', name: 'Ренессанс', aliases: ['ренессанс'] },
  { id: '100000000022', name: 'ЮMoney', aliases: ['юmoney', 'юмани', 'yoomoney', 'ю money'] },
  { id: '100000000259', name: 'ВБ Банк', aliases: ['вайлдберриз', 'wildberries', 'вб банк', 'wb'] },
  { id: '100000000265', name: 'Цифра банк', aliases: ['цифра'] },
  { id: '100000000014', name: 'Русский Стандарт', aliases: ['русский стандарт'] },
  { id: '100000000029', name: 'Банк Санкт-Петербург', aliases: ['санкт-петербург', 'бспб'] },
  { id: '100000000047', name: 'Абсолют Банк', aliases: ['абсолют'] },
  { id: '100000000044', name: 'Экспобанк', aliases: ['экспобанк'] },
];

export function findBank(name: string): Bank | null {
  const value = name.toLowerCase().replace(/ё/g, 'е').replace(/[«»"]/g, '').trim();
  if (!value) {
    return null;
  }
  let best: { bank: Bank; length: number } | null = null;
  for (const bank of BANKS) {
    for (const alias of bank.aliases) {
      if (value.includes(alias) && (!best || alias.length > best.length)) {
        best = { bank, length: alias.length };
      }
    }
  }
  return best?.bank ?? null;
}

export function cardNetwork(wallet: string): string {
  const digits = wallet.replace(/\D/g, '');
  if (digits.length < 12) {
    return '';
  }
  if (/^220[0-4]/.test(digits)) {
    return 'МИР';
  }
  if (digits.startsWith('4')) {
    return 'Visa';
  }
  if (/^(5[1-5]|2[2-7])/.test(digits)) {
    return 'Mastercard';
  }
  if (digits.startsWith('62')) {
    return 'UnionPay';
  }
  return '';
}
