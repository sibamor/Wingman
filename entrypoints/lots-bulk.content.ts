import '../assets/bulk.css';
import { applyToOffer, describeChange, type BulkChange, type BulkResult, type PriceMode } from '../lib/bulk-lots';
import { confirmAction } from '../lib/confirm';
import { el } from '../lib/format';
import { parseAppDataJson } from '../lib/funpay';
import { button, plural } from '../lib/ins-ui';

const GAP = 1200;

const PRICE_MODES: { id: PriceMode; name: string }[] = [
  { id: 'keep', name: 'Не менять' },
  { id: 'set', name: 'Установить' },
  { id: 'up_pct', name: 'Поднять на %' },
  { id: 'down_pct', name: 'Снизить на %' },
  { id: 'up_abs', name: 'Прибавить ₽' },
  { id: 'down_abs', name: 'Вычесть ₽' },
];

function offerIdOf(row: HTMLElement): string {
  return row.getAttribute('data-offer') || row.getAttribute('href')?.match(/[?&](?:id|offer)=(\d+)/)?.[1] || '';
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('a.tc-item')].filter((row) => offerIdOf(row) && !row.closest('.wm-ins'));
}

function select<T extends string>(items: { id: T; name: string }[], label: string): HTMLSelectElement {
  const node = el('select', 'wm-bulk-select');
  node.setAttribute('aria-label', label);
  for (const item of items) {
    node.append(new Option(item.name, item.id));
  }
  return node;
}

function setRowPrice(row: HTMLElement, price: number) {
  const box = row.querySelector('.tc-price > div') ?? row.querySelector('.tc-price');
  const text = [...(box?.childNodes ?? [])].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
  if (text) {
    text.textContent = `${price.toFixed(2)} `;
  }
  row.querySelector('.tc-price')?.setAttribute('data-s', String(price));
}

function mount(anchor: HTMLElement) {
  if (document.querySelector('.wm-bulk-toggle')) {
    return;
  }
  const selected = new Set<string>();
  let running = false;
  const toggle = button('wm-bulk-toggle', 'Выбрать лоты');
  anchor.parentElement?.insertBefore(toggle, anchor);

  const bar = el('div', 'wm-bulk-bar');
  bar.hidden = true;
  const count = el('span', 'wm-bulk-count');
  const all = button('wm-bulk-link', 'Выбрать все');
  const priceMode = select(PRICE_MODES, 'Цена');
  const priceValue = el('input', 'wm-bulk-input');
  priceValue.inputMode = 'decimal';
  priceValue.placeholder = 'Цена';
  priceValue.setAttribute('aria-label', 'Значение цены');
  const amount = el('input', 'wm-bulk-input');
  amount.inputMode = 'numeric';
  amount.placeholder = 'Наличие';
  amount.setAttribute('aria-label', 'Новое наличие, пусто - не менять');
  const status = select(
    [
      { id: 'keep', name: 'Статус не менять' },
      { id: 'on', name: 'Включить' },
      { id: 'off', name: 'Выключить' },
    ],
    'Статус',
  );
  const apply = button('wm-bulk-apply', 'Изменить лоты');
  const close = button('wm-bulk-link', 'Отмена');
  const report = el('div', 'wm-bulk-report');
  const fields = el('div', 'wm-bulk-fields');
  fields.append(priceMode, priceValue, amount, status);
  const top = el('div', 'wm-bulk-top');
  top.append(count, all, fields, apply, close);
  bar.append(top, report);
  document.body.append(bar);

  const change = (): BulkChange => ({
    priceMode: priceMode.value as PriceMode,
    priceValue: Number(priceValue.value.replace(',', '.').replace(/\s/g, '')),
    amount: amount.value,
    active: status.value as BulkChange['active'],
  });

  const valid = () => {
    const value = change();
    const priceOk = value.priceMode === 'keep' || (Number.isFinite(value.priceValue) && value.priceValue > 0);
    const amountOk = !value.amount.trim() || /^\d+$/.test(value.amount.trim());
    const any = value.priceMode !== 'keep' || Boolean(value.amount.trim()) || value.active !== 'keep';
    return priceOk && amountOk && any;
  };

  function render() {
    count.textContent = selected.size ? `Выбрано ${selected.size}` : 'Отметьте лоты';
    priceValue.hidden = priceMode.value === 'keep';
    apply.disabled = running || !selected.size || !valid();
    apply.textContent = running ? 'Сохраняю…' : 'Изменить лоты';
    for (const row of rows()) {
      const id = offerIdOf(row);
      row.classList.toggle('wm-bulk-picked', selected.has(id));
      const box = row.querySelector<HTMLInputElement>('.wm-bulk-check input');
      if (box) {
        box.checked = selected.has(id);
      }
    }
  }

  function decorate() {
    for (const row of rows()) {
      if (row.querySelector('.wm-bulk-check')) {
        continue;
      }
      const label = el('span', 'wm-bulk-check');
      const box = el('input');
      box.type = 'checkbox';
      box.tabIndex = -1;
      box.setAttribute('aria-hidden', 'true');
      label.append(box);
      row.prepend(label);
    }
  }

  function onRowClick(event: MouseEvent) {
    if (!document.documentElement.classList.contains('wm-bulk-on')) {
      return;
    }
    const row = (event.target as HTMLElement).closest<HTMLElement>('a.tc-item');
    if (!row || !offerIdOf(row)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const id = offerIdOf(row);
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    render();
  }

  document.addEventListener('click', onRowClick, true);

  const setMode = (on: boolean) => {
    document.documentElement.classList.toggle('wm-bulk-on', on);
    bar.hidden = !on;
    toggle.textContent = on ? 'Готово' : 'Выбрать лоты';
    if (on) {
      decorate();
    } else {
      selected.clear();
      report.replaceChildren();
    }
    render();
  };

  toggle.addEventListener('click', () => setMode(!document.documentElement.classList.contains('wm-bulk-on')));
  close.addEventListener('click', () => setMode(false));
  all.addEventListener('click', () => {
    const ids = rows().map(offerIdOf);
    const everything = ids.every((id) => selected.has(id));
    for (const id of ids) {
      if (everything) {
        selected.delete(id);
      } else {
        selected.add(id);
      }
    }
    all.textContent = everything ? 'Выбрать все' : 'Снять все';
    render();
  });
  for (const input of [priceMode, priceValue, amount, status]) {
    input.addEventListener('input', render);
  }

  apply.addEventListener('click', async () => {
    const value = change();
    const ids = [...selected];
    const picked = rows().filter((row) => selected.has(offerIdOf(row)));
    const ok = await confirmAction({
      title: `Изменить ${plural(ids.length, 'лот', 'лота', 'лотов')}?`,
      text: 'Лоты сохраняются по одному в секунду, не закрывайте страницу. Отменить нельзя, старые значения возвращаются только вручную.',
      points: describeChange(
        value,
        picked.map((row) => row.querySelector('.tc-desc-text')?.textContent?.replace(/\s+/g, ' ').trim() || `Лот ${offerIdOf(row)}`),
      ),
      confirm: 'Изменить лоты',
      danger: value.active === 'off',
    });
    if (!ok) {
      return;
    }
    running = true;
    const results: BulkResult[] = [];
    report.replaceChildren();
    const progress = el('span', 'wm-bulk-progress');
    report.append(progress);
    render();
    for (const [index, id] of ids.entries()) {
      progress.textContent = `Сохраняю ${index + 1} из ${ids.length}`;
      let result: BulkResult;
      try {
        result = await applyToOffer(id, value);
      } catch (error) {
        result = { offerId: id, ok: false, message: error instanceof Error ? error.message : 'Ошибка сети' };
      }
      results.push(result);
      const row = rows().find((item) => offerIdOf(item) === id);
      if (row && result.ok) {
        if (result.price !== undefined) {
          setRowPrice(row, result.price);
        }
        if (result.active !== undefined) {
          row.classList.toggle('warning', !result.active);
        }
        row.classList.add('wm-bulk-done');
        selected.delete(id);
      }
      if (row && !result.ok) {
        row.classList.add('wm-bulk-failed');
      }
      if (index < ids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, GAP));
      }
    }
    running = false;
    const failed = results.filter((result) => !result.ok);
    report.replaceChildren(el('span', failed.length ? 'wm-bulk-progress wm-bulk-bad' : 'wm-bulk-progress', failed.length ? `Сохранено ${results.length - failed.length}, не удалось ${failed.length}` : `Сохранено ${plural(results.length, 'лот', 'лота', 'лотов')}`));
    for (const item of failed.slice(0, 5)) {
      const name = rows().find((row) => offerIdOf(row) === item.offerId)?.querySelector('.tc-desc-text')?.textContent?.trim().slice(0, 60) ?? item.offerId;
      report.append(el('span', 'wm-bulk-error', `${name}: ${item.message}`));
    }
    render();
  });

  new MutationObserver(() => {
    if (document.documentElement.classList.contains('wm-bulk-on')) {
      decorate();
    }
  }).observe(document.querySelector('#content') ?? document.body, { childList: true, subtree: true });
}

export default defineContentScript({
  matches: ['https://funpay.com/users/*', 'https://funpay.com/lots/*', 'https://funpay.com/en/users/*', 'https://funpay.com/en/lots/*', 'https://funpay.com/uk/users/*', 'https://funpay.com/uk/lots/*'],
  runAt: 'document_idle',
  main() {
    const raw = document.body?.getAttribute('data-app-data');
    const userId = Number(raw ? parseAppDataJson(raw)?.userId ?? 0 : 0);
    const path = location.pathname.replace(/^\/(en|uk)\//, '/');
    const ownProfile = userId > 0 && path === `/users/${userId}/`;
    const ownSection = userId > 0 && /^\/lots\/\d+\/trade/.test(path);
    if (!ownProfile && !ownSection) {
      return;
    }
    const anchor = ownProfile ? document.querySelector<HTMLElement>('.profile-data-container .offer') : document.querySelector<HTMLElement>('a.tc-item')?.closest<HTMLElement>('.tc') ?? null;
    if (anchor && rows().length) {
      mount(anchor);
    }
  },
});
