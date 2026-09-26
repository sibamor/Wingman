import '../assets/offer.css';
import { buyerPrice, sectionCommission, sellerPrice } from '../lib/commission';
import { confirmAction } from '../lib/confirm';
import { el } from '../lib/format';
import { parseAppDataJson } from '../lib/funpay';
import { formatMoney, parseMoney, type Currency } from '../lib/money';
import { costsItem } from '../lib/storage';
import { canTranslate, translate } from '../lib/translate';

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
      info.append(el('span', 'wm-calc-note', `Комиссия раздела ${percentText(commission.percent)}`));
    } else {
      info.append(el('span', 'wm-calc-note', 'Комиссию раздела узнать не удалось'));
    }
    if (Number.isFinite(own) && own > 0 && Number.isFinite(spent) && spent > 0) {
      const profit = own - spent;
      const chip = el('span', profit >= 0 ? 'wm-calc-chip wm-calc-profit' : 'wm-calc-chip wm-calc-loss', profit >= 0 ? `Прибыль ${formatMoney(profit, currency)}` : `Убыток ${formatMoney(-profit, currency)}`);
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

const CLONE_KEY = 'wingman:clone';
const SKIP_CLONE = new Set(['offer_id', 'csrf_token', 'secrets', 'deleted', 'form_created_at']);

function editorBar(form: HTMLFormElement): { box: HTMLElement; status: HTMLElement } {
  let box = form.querySelector<HTMLElement>('.wm-en-fill');
  if (!box) {
    box = el('div', 'wm-en-fill');
    const status = el('span', 'wm-calc-note wm-editor-status');
    box.append(status);
    const first = form.querySelector('[name^="fields["]')?.closest('.form-group, .lot-field') ?? form.firstElementChild;
    (first ?? form).before(box);
  }
  return { box, status: box.querySelector<HTMLElement>('.wm-editor-status')! };
}

function editorButton(text: string): HTMLButtonElement {
  const action = el('button', 'wm-en-button', text);
  action.type = 'button';
  return action;
}

function textFields(form: HTMLFormElement): (HTMLInputElement | HTMLTextAreaElement)[] {
  return [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[name^="fields["][type="text"], input[name^="fields["]:not([type]), textarea[name^="fields["]')];
}

function addCleanup(form: HTMLFormElement) {
  const { box, status } = editorBar(form);
  const action = editorButton('Убрать лишние пробелы');
  action.addEventListener('click', () => {
    let changed = 0;
    for (const field of textFields(form)) {
      const next = field.value
        .split('\n')
        .map((line) => line.replace(/[ \t\u00a0]{2,}/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (next !== field.value) {
        field.value = next;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        changed += 1;
      }
    }
    status.textContent = changed ? `Исправлено полей: ${changed}` : 'Лишних пробелов нет';
  });
  box.insertBefore(action, status);
}

function formValues(form: HTMLFormElement): [string, string][] {
  const values: [string, string][] = [];
  for (const element of form.elements) {
    const field = element as HTMLInputElement;
    if (!field.name || SKIP_CLONE.has(field.name) || field.type === 'hidden' || field.type === 'file' || field.type === 'submit' || field.type === 'button') {
      continue;
    }
    if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) {
      continue;
    }
    values.push([field.name, field.type === 'checkbox' ? '__checked__' : field.value]);
  }
  return values;
}

function addClone(form: HTMLFormElement, nodeId: string, offerId: string) {
  if (!offerId || offerId === '0') {
    return;
  }
  const { box, status } = editorBar(form);
  const action = editorButton('Создать копию');
  action.title = 'Новый лот в этом разделе с теми же полями, без товаров автовыдачи';
  const initial = JSON.stringify(formValues(form));
  action.addEventListener('click', async () => {
    const values = formValues(form);
    if (JSON.stringify(values) !== initial) {
      const ok = await confirmAction({
        title: 'Лот не сохранён',
        text: 'Копия возьмёт поля из формы вместе с правками, сам лот останется прежним.',
        confirm: 'Создать копию',
        cancel: 'Остаться',
        danger: true,
      });
      if (!ok) {
        return;
      }
    }
    try {
      sessionStorage.setItem(CLONE_KEY, JSON.stringify({ nodeId, values, at: Date.now() }));
    } catch {
      status.textContent = 'Не удалось сохранить копию';
      return;
    }
    location.href = `${location.origin}/lots/offerEdit?node=${encodeURIComponent(nodeId)}`;
  });
  box.insertBefore(action, status);
}

function applyClone(form: HTMLFormElement, nodeId: string, offerId: string) {
  if (offerId && offerId !== '0') {
    return;
  }
  let data: { nodeId: string; values: [string, string][]; at: number } | null = null;
  try {
    data = JSON.parse(sessionStorage.getItem(CLONE_KEY) ?? 'null');
    sessionStorage.removeItem(CLONE_KEY);
  } catch {}
  if (!data || data.nodeId !== nodeId || Date.now() - data.at > 10 * 60_000) {
    return;
  }
  for (const [name, value] of data.values) {
    for (const element of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${CSS.escape(name)}"]`)) {
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
        element.checked = value === '__checked__' || element.value === value;
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  editorBar(form).status.textContent = 'Поля скопированы из лота, товары автовыдачи добавьте сами';
}

function addEnglishFill(form: HTMLFormElement) {
  if (!canTranslate() || form.querySelector('.wm-en-fill .wm-en-translate')) {
    return;
  }
  const pairs = ['summary', 'desc', 'payment_msg']
    .map((key) => [form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="fields[${key}][ru]"]`), form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="fields[${key}][en]"]`)] as const)
    .filter((pair): pair is readonly [HTMLInputElement | HTMLTextAreaElement, HTMLInputElement | HTMLTextAreaElement] => Boolean(pair[0] && pair[1]));
  if (!pairs.length) {
    return;
  }
  const { box, status } = editorBar(form);
  const action = editorButton('Заполнить английскую версию');
  action.classList.add('wm-en-translate');
  box.insertBefore(action, status);
  action.addEventListener('click', async () => {
    action.disabled = true;
    let filled = 0;
    try {
      for (const [ru, en] of pairs) {
        if (en.value.trim() || !ru.value.trim()) {
          continue;
        }
        status.textContent = 'Перевожу…';
        en.value = await translate(ru.value, 'en', { source: 'ru', onProgress: (percent) => (status.textContent = `Скачиваю переводчик ${percent}%`) });
        en.dispatchEvent(new Event('input', { bubbles: true }));
        en.dispatchEvent(new Event('change', { bubbles: true }));
        filled += 1;
      }
      status.textContent = filled ? `Заполнено полей: ${filled}` : 'Английские поля уже заполнены';
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Не удалось перевести';
    } finally {
      action.disabled = false;
    }
  });
}

function markOwnPlace(userId: string) {
  const header = document.querySelector<HTMLElement>('h1.page-header, .page-header h1, #content h1');
  if (!userId || !header) {
    return;
  }
  const priceOf = (row: HTMLElement) => {
    const cell = row.querySelector<HTMLElement>('.tc-price');
    const data = Number(cell?.getAttribute('data-s'));
    return Number.isFinite(data) && data > 0 ? data : parseMoney(cell?.firstElementChild?.textContent ?? cell?.textContent ?? '')?.amount ?? NaN;
  };
  const isOwn = (row: HTMLElement) => Boolean(row.querySelector(`[href*="/users/${userId}/"], [data-href*="/users/${userId}/"]`));
  const all = [...document.querySelectorAll<HTMLElement>('a.tc-item')];
  const mine = all.filter(isOwn);
  if (!mine.length) {
    return;
  }
  for (const row of mine) {
    row.classList.add('wm-own-lot');
  }
  const place = el('span', 'wm-place');
  header.append(place);
  const update = () => {
    const priced = all.filter((row) => Number.isFinite(priceOf(row)));
    const shown = priced.filter((row) => row.offsetParent !== null);
    const rows = shown.some(isOwn) ? shown : priced;
    const own = rows.filter(isOwn);
    place.hidden = !own.length;
    if (!own.length) {
      return;
    }
    const best = Math.min(...own.map(priceOf));
    const cheaper = rows.filter((row) => priceOf(row) < best).length;
    place.textContent = `Ваш лот ${cheaper + 1}-й по цене из ${rows.length}`;
    place.title = cheaper ? `Дешевле вас: ${cheaper}` : 'Ваш лот самый дешёвый';
  };
  update();
  let timer = 0;
  const later = () => {
    clearTimeout(timer);
    timer = window.setTimeout(update, 400);
  };
  document.addEventListener('click', later, true);
  document.addEventListener('change', later, true);
  document.addEventListener('input', later, true);
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
      const nodeId = form.querySelector<HTMLInputElement>('input[name="node_id"]')?.value || new URLSearchParams(location.search).get('node') || '';
      const offerId = form.querySelector<HTMLInputElement>('input[name="offer_id"]')?.value || new URLSearchParams(location.search).get('offer') || '';
      applyClone(form, nodeId, offerId);
      enhanceEditor(form);
      addEnglishFill(form);
      addCleanup(form);
      addClone(form, nodeId, offerId);
      return;
    }
    const raw = document.body?.getAttribute('data-app-data');
    const userId = String(raw ? parseAppDataJson(raw)?.userId ?? '' : '');
    const match = location.pathname.match(/\/lots\/(\d+)\/(trade)?/);
    if (match && !match[2]) {
      markOwnPlace(userId);
    }
    if (match) {
      enhanceSection(match[1]!, !match[2]);
    }
  },
});
