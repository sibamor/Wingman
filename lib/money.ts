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
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100).toLocaleString('ru-RU').replace(/\s/g, ' ');
  const fraction = cents % 100;
  const text = fraction ? `${whole}.${String(fraction).padStart(2, '0')}` : whole;
  const sign = cents && amount < 0 ? '-' : signed && cents && amount > 0 ? '+' : '';
  return `${sign}${text} ${SIGNS[currency]}`;
}
