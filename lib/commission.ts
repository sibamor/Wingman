import { FUNPAY_ORIGIN } from './funpay.ts';
import { parseMoney, type Currency } from './money.ts';

export type Commission = { percent: number; currency: Currency };

const cache = new Map<string, Promise<Commission | null>>();
const TEST_PRICE: Record<Currency, number> = { RUB: 100000, USD: 1000, EUR: 1000 };

export function sectionCommission(nodeId: string, currency: Currency = 'RUB', chips = false): Promise<Commission | null> {
  const key = `${chips ? 'chips' : 'lots'}:${nodeId}:${currency}`;
  let request = cache.get(key);
  if (!request) {
    request = (async () => {
      const price = TEST_PRICE[currency];
      const body = new URLSearchParams(chips ? { game: nodeId, price: String(price) } : { nodeId, price: String(price) });
      const response = await fetch(`${FUNPAY_ORIGIN}/${chips ? 'chips' : 'lots'}/calc`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { methods?: { price: string; unit: string }[]; error?: string };
      const prices = (data.methods ?? [])
        .map((method) => parseMoney(`${method.price} ${method.unit}`))
        .filter((money): money is NonNullable<typeof money> => money !== null && money.currency === currency)
        .map((money) => money.amount);
      if (data.error || !prices.length) {
        return null;
      }
      return { percent: (Math.min(...prices) / price - 1) * 100, currency };
    })().catch(() => null);
    cache.set(key, request);
    request.then((value) => {
      if (!value) {
        cache.delete(key);
      }
    });
  }
  return request;
}

export function buyerPrice(sellerPrice: number, percent: number): number {
  return Math.round(sellerPrice * (1 + percent / 100) * 100) / 100;
}

export function sellerPrice(buyer: number, percent: number): number {
  return Math.round((buyer / (1 + percent / 100)) * 100) / 100;
}
