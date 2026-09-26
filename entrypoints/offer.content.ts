import '../assets/offer.css';
import { buyerPrice, sectionCommission, sellerPrice } from '../lib/commission';
import { el } from '../lib/format';
import { formatMoney, parseMoney, type Currency } from '../lib/money';
import { costsItem } from '../lib/storage';

const SIGN_TO_CURRENCY: Record<string, Currency> = { '₽': 'RUB', $: 'USD', '€': 'EUR' };

function percentText(percent: number): string {
  return `${percent.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function numberOf(value: string): number {
  const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function field(label: string, name: string, unit: string): { root: HTMLElement; input: HTMLInputElement } {
  const root = el('label', 'wm-calc-field');
  const input = el('input', 'form-control wm-calc-input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.name = '';
  input.autocomplete = 'off';
  input.dataset.wm = name;
  const box = el('span', 'wm-calc-box');
  box.append(input, el('span', 'wm-calc-unit', unit));
  root.append(el('span', 'wm-calc-label', label), box);
  return { root, input };
}

async function enhanceEditor(form: HTMLFormElement) {
  const price = form.querySelector<HTMLInputElement>('input[name="price"]');
  const nodeId = form.querySelector<HTMLInputElement>('input[name="node_id"]')?.value || new URLSearchParams(location.search).get('node') || '';
  const offerId = form.querySelector<HTMLInputElement>('input[name="offer_id"]')?.value || new URLSearchParams(location.search).get('offer') || '';
  if (!price || !nodeId || form.querySelector('.wm-calc')) {
    return;
  }
  const group = price.closest('.form-group') ?? price.parentElement!;
  const sign = group.querySelector('.form-control-feedback')?.textContent?.trim() ?? '₽';
  const currency = SIGN_TO_CURRENCY[sign] ?? 'RUB';
  const box = el('div', 'wm-calc');
  const buyer = field('Покупатель заплатит', 'buyer', sign);
  const cost = field('Себестоимость', 'cost', sign);
  const info = el('div', 'wm-calc-info');
  box.append(buyer.root, cost.root, info);
  group.after(box);

  const commission = await sectionCommission(nodeId, currency);
  const costs = await costsItem.getValue();
  if (offerId && costs[offerId] !== undefined) {
    cost.input.value = String(costs[offerId]);
  }

  function renderInfo() {
    const own = numberOf(price!.value);
    const spent = numberOf(cost.input.value);
    info.replaceChildren();
    if (commission) {
      info.append(el('span', 'wm-calc-chip', `Комиссия раздела ${percentText(commission.percent)}`));
    } else {
      info.append(el('span', 'wm-calc-chip wm-calc-muted', 'Комиссию раздела узнать не удалось'));
    }
    if (Number.isFinite(own) && own > 0 && Number.isFinite(spent) && spent > 0) {
      const profit = own - spent;
      const chip = el('span', profit >= 0 ? 'wm-calc-chip wm-calc-profit' : 'wm-calc-chip wm-calc-loss', `Прибыль ${formatMoney(profit, currency, true)}`);
      info.append(chip);
    }
  }

  function fromSeller() {
    const own = numberOf(price!.value);
    if (commission && document.activeElement !== buyer.input) {
      buyer.input.value = Number.isFinite(own) && own > 0 ? String(buyerPrice(own, commission.percent)) : '';
    }
    renderInfo();
  }

  buyer.input.disabled = !commission;
  buyer.input.addEventListener('input', () => {
    const want = numberOf(buyer.input.value);
    if (!commission || !Number.isFinite(want) || want <= 0) {
      return;
    }
    price.value = String(sellerPrice(want, commission.percent));
    price.dispatchEvent(new Event('input', { bubbles: true }));
    price.dispatchEvent(new Event('change', { bubbles: true }));
    renderInfo();
  });
  buyer.input.addEventListener('blur', fromSeller);
  price.addEventListener('input', fromSeller);
  let timer = 0;
  cost.input.addEventListener('input', () => {
    renderInfo();
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (!offerId) {
        return;
      }
      const all = { ...(await costsItem.getValue()) };
      const value = numberOf(cost.input.value);
      if (Number.isFinite(value) && value > 0) {
        all[offerId] = value;
      } else {
        delete all[offerId];
      }
      await costsItem.setValue(all);
    }, 500);
  });
  fromSeller();
}

async function enhanceSection(nodeId: string, publicList: boolean) {
  const header = document.querySelector<HTMLElement>('h1.page-header, .page-header h1, h1');
  if (!header || header.querySelector('.wm-commission')) {
    return;
  }
  const commission = await sectionCommission(nodeId, 'RUB');
  if (!commission) {
    return;
  }
  const badge = el('span', 'wm-commission', `Комиссия ${percentText(commission.percent)}`);
  badge.title = 'Столько FunPay добавляет к цене продавца';
  header.append(badge);
  if (!publicList) {
    return;
  }
  for (const cell of document.querySelectorAll<HTMLElement>('a.tc-item .tc-price')) {
    const money = parseMoney(cell.textContent ?? '');
    if (!money || money.currency !== 'RUB' || cell.querySelector('.wm-net')) {
      continue;
    }
    cell.append(el('span', 'wm-net', `продавцу ${formatMoney(sellerPrice(money.amount, commission.percent), 'RUB')}`));
  }
}

export default defineContentScript({
  matches: ['https://funpay.com/lots/*', 'https://funpay.com/en/lots/*', 'https://funpay.com/uk/lots/*'],
  runAt: 'document_idle',
  main() {
    const form = document.querySelector<HTMLFormElement>('form.form-offer-editor');
    if (form) {
      enhanceEditor(form);
      return;
    }
    const match = location.pathname.match(/\/lots\/(\d+)\/(trade)?/);
    if (match) {
      enhanceSection(match[1]!, !match[2]);
    }
  },
});
