import { FUNPAY_ORIGIN } from './funpay.ts';

export type PriceMode = 'keep' | 'set' | 'up_pct' | 'down_pct' | 'up_abs' | 'down_abs';

export type BulkChange = { priceMode: PriceMode; priceValue: number; amount: string; active: 'keep' | 'on' | 'off' };

export type BulkResult = { offerId: string; ok: boolean; message: string; price?: number; active?: boolean };

export function nextPrice(current: number, mode: PriceMode, value: number): number {
  const next = {
    keep: current,
    set: value,
    up_pct: current * (1 + value / 100),
    down_pct: current * (1 - value / 100),
    up_abs: current + value,
    down_abs: current - value,
  }[mode];
  return Math.round(next * 100) / 100;
}

export async function applyToOffer(offerId: string, change: BulkChange): Promise<BulkResult> {
  const page = await fetch(`${FUNPAY_ORIGIN}/lots/offerEdit?offer=${encodeURIComponent(offerId)}`, { credentials: 'include' });
  if (!page.ok) {
    return { offerId, ok: false, message: `FunPay ответил ${page.status}` };
  }
  const doc = new DOMParser().parseFromString(await page.text(), 'text/html');
  const form = doc.querySelector<HTMLFormElement>('form.form-offer-editor');
  if (!form) {
    return { offerId, ok: false, message: 'Форма лота не найдена' };
  }
  const data = new FormData(form);
  if (data.get('offer_id') !== offerId || !data.get('csrf_token')) {
    return { offerId, ok: false, message: 'Форма лота не совпала, лот не тронут' };
  }
  const result: BulkResult = { offerId, ok: true, message: '' };
  if (change.priceMode !== 'keep') {
    const current = Number(String(data.get('price') ?? '').replace(',', '.'));
    if (!Number.isFinite(current) && change.priceMode !== 'set') {
      return { offerId, ok: false, message: 'Не удалось прочитать цену' };
    }
    const price = nextPrice(current, change.priceMode, change.priceValue);
    if (!(price > 0)) {
      return { offerId, ok: false, message: 'Цена получилась не больше нуля' };
    }
    data.set('price', String(price));
    result.price = price;
  }
  if (change.amount.trim()) {
    data.set('amount', change.amount.trim());
  }
  if (change.active === 'on') {
    data.set('active', 'on');
    result.active = true;
  } else if (change.active === 'off') {
    data.delete('active');
    result.active = false;
  }
  const body = new URLSearchParams();
  for (const [key, value] of data.entries()) {
    if (typeof value === 'string') {
      body.append(key, value);
    }
  }
  const save = await fetch(`${FUNPAY_ORIGIN}/lots/offerSave`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
    body,
  });
  const reply = (await save.json().catch(() => null)) as { error?: unknown; msg?: string; errors?: [string, string][] } | null;
  if (!save.ok || !reply || reply.error) {
    const detail = reply?.errors?.map((item) => item[1]).join(', ') || reply?.msg || `FunPay ответил ${save.status}`;
    return { offerId, ok: false, message: detail };
  }
  return result;
}
