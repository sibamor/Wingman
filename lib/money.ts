export type Currency = 'RUB' | 'USD' | 'EUR';

export type Money = { amount: number; currency: Currency };

const SIGNS: Record<Currency, string> = { RUB: '₽', USD: '$', EUR: '€' };

export function parseMoney(text: string): Money | null {
  const value = text.replace(/&minus;|[−–]/g, '-').replace(/[\s  ]/g, '');
  const currency: Currency | null = value.includes('₽') ? 'RUB' : value.includes('$') ? 'USD' : value.includes('€') ? 'EUR' : null;
  const match = value.match(/([+-]?)(\d+(?:[.,]\d+)?)/);
  if (!currency || !match) {
    return null;
  }
  const amount = Number(match[2]!.replace(',', '.'));
  return { amount: match[1] === '-' ? -amount : amount, currency };
}

export function formatMoney(amount: number, currency: Currency, signed = false): string {
  const rounded = Math.round(amount * 100) / 100;
  const text = Math.abs(rounded).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const sign = rounded < 0 ? '−' : signed && rounded > 0 ? '+' : '';
  return `${sign}${text} ${SIGNS[currency]}`;
}
