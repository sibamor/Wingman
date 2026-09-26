import { applyToOffer, type BulkChange, type PriceMode } from '../../lib/bulk-lots';
import { el, formatWhen, link } from '../../lib/format';
import { FUNPAY_ORIGIN } from '../../lib/funpay';
import { formatMoney, parseMoney } from '../../lib/money';
import { lotsCacheItem, sectionsItem, type CachedLot } from '../../lib/storage';

type Parts = {
  button: (className: string, text: string) => HTMLButtonElement;
};

type Filter = 'all' | 'on' | 'off';

const GAP = 1200;
const PRICE_MODES: { id: PriceMode; name: string }[] = [
  { id: 'keep', name: 'Цена не меняется' },
  { id: 'set', name: 'Установить цену' },
  { id: 'up_pct', name: 'Поднять на %' },
  { id: 'down_pct', name: 'Снизить на %' },
  { id: 'up_abs', name: 'Прибавить ₽' },
  { id: 'down_abs', name: 'Вычесть ₽' },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseTrade(html: string, nodeId: string, section: string): CachedLot[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lots: CachedLot[] = [];
  for (const row of doc.querySelectorAll<HTMLElement>('a.tc-item')) {
    const offerId = row.getAttribute('data-offer') || row.getAttribute('href')?.match(/[?&](?:id|offer)=(\d+)/)?.[1] || '';
    if (!offerId) {
      continue;
    }
    const priceCell = row.querySelector('.tc-price');
    const money = parseMoney(priceCell?.textContent ?? '');
    const dataPrice = Number(priceCell?.getAttribute('data-s'));
    lots.push({
      offerId,
      nodeId,
      section,
      title: row.querySelector('.tc-desc-text')?.textContent?.replace(/\s+/g, ' ').trim() || row.querySelector('.tc-desc')?.textContent?.replace(/\s+/g, ' ').trim() || `Лот ${offerId}`,
      price: Number.isFinite(dataPrice) && dataPrice > 0 ? dataPrice : money?.amount ?? 0,
      currency: money?.currency ?? 'RUB',
      amount: row.querySelector('.tc-amount')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      active: !row.classList.contains('warning'),
    });
  }
  return lots;
}

export function mountLotsPanel(panel: HTMLElement, aside: HTMLElement, parts: Parts) {
  let lots: CachedLot[] = [];
  let loadedAt = 0;
  let loading = false;
  let query = '';
  let filter: Filter = 'all';
  let sortByPrice = false;
  let confirming = false;
  let saving = false;
  const selected = new Set<string>();

  const head = el('div', 'wm-panel-head');
  const status = el('span', 'wm-counter wm-push');
  const reload = parts.button('wm-btn wm-secondary', 'Загрузить лоты');
  head.append(el('h2', 'wm-title', 'Мои лоты'), status, reload);
  const tools = el('div', 'wm-lots-tools');
  const search = el('input', 'wm-input wm-lots-search');
  search.type = 'search';
  search.placeholder = 'Название или раздел';
  search.setAttribute('aria-label', 'Поиск по лотам');
  const chips = el('div', 'wm-lots-chips');
  const chipDefs: { id: Filter; name: string }[] = [
    { id: 'all', name: 'Все' },
    { id: 'on', name: 'Активные' },
    { id: 'off', name: 'Выключенные' },
  ];
  const chipButtons = chipDefs.map((item) => {
    const chip = parts.button('wm-lots-chip', item.name);
    chip.addEventListener('click', () => {
      filter = item.id;
      render();
    });
    chips.append(chip);
    return { item, chip };
  });
  const sort = parts.button('wm-lots-chip', 'По цене');
  sort.addEventListener('click', () => {
    sortByPrice = !sortByPrice;
    render();
  });
  chips.append(sort);
  tools.append(search, chips);

  const bar = el('div', 'wm-lots-bar');
  const count = el('span', 'wm-lots-count');
  const priceMode = el('select', 'wm-input wm-lots-select');
  for (const mode of PRICE_MODES) {
    priceMode.append(new Option(mode.name, mode.id));
  }
  priceMode.setAttribute('aria-label', 'Цена');
  const priceValue = el('input', 'wm-input wm-lots-value');
  priceValue.inputMode = 'decimal';
  priceValue.placeholder = 'Значение';
  priceValue.setAttribute('aria-label', 'Значение цены');
  const state = el('select', 'wm-input wm-lots-select');
  state.append(new Option('Статус не меняется', 'keep'), new Option('Включить', 'on'), new Option('Выключить', 'off'));
  state.setAttribute('aria-label', 'Статус');
  const apply = parts.button('wm-btn wm-primary', 'Применить');
  const report = el('p', 'wm-hint');
  bar.append(count, priceMode, priceValue, state, apply);

  const table = el('ul', 'wm-list wm-lots-list');
  const empty = el('p', 'wm-hint');
  panel.append(head, tools, bar, report, table, empty);

  const change = (): BulkChange => ({
    priceMode: priceMode.value as PriceMode,
    priceValue: Number(priceValue.value.replace(',', '.').replace(/\s/g, '')),
    amount: '',
    active: state.value as BulkChange['active'],
  });

  const valid = () => {
    const value = change();
    return (value.priceMode === 'keep' || (Number.isFinite(value.priceValue) && value.priceValue > 0)) && (value.priceMode !== 'keep' || value.active !== 'keep');
  };

  function visible(): CachedLot[] {
    const q = query.toLowerCase();
    const list = lots.filter((lot) => (filter === 'all' || (filter === 'on') === lot.active) && (!q || `${lot.title} ${lot.section}`.toLowerCase().includes(q)));
    return sortByPrice ? [...list].sort((a, b) => a.price - b.price) : list;
  }

  function render() {
    status.textContent = loading ? status.textContent : loadedAt ? `${lots.length} лотов, ${formatWhen(loadedAt)}` : '';
    reload.disabled = loading || saving;
    reload.textContent = loadedAt ? 'Обновить' : 'Загрузить лоты';
    aside.textContent = lots.length ? String(lots.length) : '';
    tools.hidden = !lots.length;
    for (const { item, chip } of chipButtons) {
      const total = item.id === 'all' ? lots.length : lots.filter((lot) => (item.id === 'on') === lot.active).length;
      chip.textContent = `${item.name} ${total}`;
      chip.setAttribute('aria-pressed', String(filter === item.id));
    }
    sort.setAttribute('aria-pressed', String(sortByPrice));
    bar.hidden = !selected.size;
    count.textContent = `Выбрано ${selected.size}`;
    priceValue.hidden = priceMode.value === 'keep';
    apply.disabled = saving || !valid();
    apply.textContent = saving ? 'Сохраняю…' : confirming ? `Подтвердить для ${selected.size}` : 'Применить';
    const rows = visible();
    table.replaceChildren(
      ...rows.map((lot) => {
        const row = el('li', lot.active ? 'wm-lots-row' : 'wm-lots-row wm-off');
        const check = el('input', 'wm-check');
        check.type = 'checkbox';
        check.checked = selected.has(lot.offerId);
        check.setAttribute('aria-label', `Выбрать «${lot.title}»`);
        check.addEventListener('change', () => {
          if (check.checked) {
            selected.add(lot.offerId);
          } else {
            selected.delete(lot.offerId);
          }
          confirming = false;
          render();
        });
        const text = el('div', 'wm-row-body');
        text.append(link('wm-row-name', lot.title, `${FUNPAY_ORIGIN}/lots/offerEdit?node=${lot.nodeId}&offer=${lot.offerId}`), el('span', 'wm-row-note wm-muted', [lot.section, lot.amount ? `в наличии ${lot.amount}` : '', lot.active ? '' : 'выключен'].filter(Boolean).join(', ')));
        row.append(check, text, el('span', 'wm-lots-price', formatMoney(lot.price, lot.currency)));
        return row;
      }),
    );
    empty.textContent = loading ? '' : !loadedAt ? 'Загрузятся лоты из всех ваших разделов, по одному разделу в секунду' : rows.length ? '' : 'Ничего не найдено';
  }

  async function load() {
    const sections = await sectionsItem.getValue();
    if (!sections.length) {
      empty.textContent = 'Разделы ещё не загружены, откройте вкладку «Поднятие»';
      return;
    }
    loading = true;
    const next: CachedLot[] = [];
    for (const [index, section] of sections.entries()) {
      status.textContent = `Загружаю раздел ${index + 1} из ${sections.length}`;
      render();
      try {
        const response = await fetch(`${FUNPAY_ORIGIN}/lots/${section.nodeId}/trade`, { credentials: 'include' });
        if (response.ok) {
          next.push(...parseTrade(await response.text(), section.nodeId, section.name));
        }
      } catch {}
      if (index < sections.length - 1) {
        await sleep(GAP);
      }
    }
    loading = false;
    lots = next;
    loadedAt = Date.now();
    await lotsCacheItem.setValue({ at: loadedAt, lots });
    render();
  }

  reload.addEventListener('click', load);
  search.addEventListener('input', () => {
    query = search.value.trim();
    render();
  });
  for (const input of [priceMode, priceValue, state]) {
    input.addEventListener('input', () => {
      confirming = false;
      render();
    });
  }
  apply.addEventListener('click', async () => {
    if (!confirming) {
      confirming = true;
      render();
      return;
    }
    confirming = false;
    saving = true;
    render();
    const value = change();
    const ids = [...selected];
    let failed = 0;
    for (const [index, id] of ids.entries()) {
      report.textContent = `Сохраняю ${index + 1} из ${ids.length}`;
      const result = await applyToOffer(id, value).catch((error) => ({ offerId: id, ok: false, message: String(error) }));
      const lot = lots.find((item) => item.offerId === id);
      if (result.ok && lot) {
        if ('price' in result && result.price !== undefined) {
          lot.price = result.price;
        }
        if ('active' in result && result.active !== undefined) {
          lot.active = result.active;
        }
        selected.delete(id);
      } else {
        failed += 1;
      }
      if (index < ids.length - 1) {
        await sleep(GAP);
      }
    }
    saving = false;
    report.textContent = failed ? `Сохранено ${ids.length - failed}, не удалось ${failed}` : `Сохранено ${ids.length}`;
    await lotsCacheItem.setValue({ at: loadedAt, lots });
    render();
  });

  lotsCacheItem.getValue().then((cache) => {
    if (cache) {
      lots = cache.lots;
      loadedAt = cache.at;
    }
    render();
  });
  render();
}
