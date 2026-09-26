import '../assets/insights.css';
import '../assets/orders.css';
import { el, formatWhen, link } from '../lib/format';
import { FUNPAY_ORIGIN, parseAppDataJson } from '../lib/funpay';
import { onHistoryChange, readAll, syncHistory, syncState } from '../lib/history';
import { TOOL_ICONS } from '../lib/icons';
import { button, plural, segmented, shortDate } from '../lib/ins-ui';
import { formatMoney } from '../lib/money';
import type { Sale, SaleStatus } from '../lib/rows';
import { inPeriod, mainCurrency, PERIODS, type Period } from '../lib/stats';

type StatusFilter = 'all' | SaleStatus;

const STATUS: { id: StatusFilter; name: string }[] = [
  { id: 'all', name: 'Все' },
  { id: 'paid', name: 'Ждут выдачи' },
  { id: 'closed', name: 'Закрытые' },
  { id: 'refunded', name: 'Возвраты' },
];

const STATUS_TEXT: Record<SaleStatus, string> = { paid: 'Оплачен', closed: 'Закрыт', refunded: 'Возврат' };
const PREFS_KEY = 'wingman:orders';
const PAGE_SIZE = 50;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function mount(userId: number) {
  const table = document.querySelector<HTMLElement>('.orders-table') ?? document.querySelector<HTMLElement>('a.tc-item')?.closest<HTMLElement>('.tc') ?? null;
  const anchor = document.querySelector<HTMLElement>('.orders-filter, form[action*="/orders/trade"]') ?? table;
  if (!anchor || document.querySelector('.wm-ord')) {
    return;
  }
  let sales: Sale[] = [];
  let period: Period = 'all';
  try {
    period = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}').period ?? 'all';
  } catch {}
  let status: StatusFilter = 'all';
  let query = '';
  let section = '';
  let limit = PAGE_SIZE;

  const root = el('section', 'wm-ins wm-ord');
  root.setAttribute('aria-label', 'Поиск по продажам');
  const head = el('div', 'wm-ins-head');
  const search = el('input', 'wm-ord-search');
  search.type = 'search';
  search.placeholder = 'Номер заказа, покупатель или товар';
  search.setAttribute('aria-label', 'Поиск по продажам');
  const syncStatus = el('span', 'wm-ins-status');
  const refresh = button('wm-ins-icon', '');
  refresh.innerHTML = TOOL_ICONS.refresh;
  refresh.setAttribute('aria-label', 'Обновить продажи');
  refresh.title = 'Обновить продажи';
  refresh.addEventListener('click', () => syncHistory(userId, 'sales', true));
  head.append(search, syncStatus, refresh);
  const filters = el('div', 'wm-ord-filters');
  const chips = el('div', 'wm-ins-chips');
  const chipButtons = STATUS.map((item) => {
    const chip = button('wm-ins-chip', item.name);
    chip.addEventListener('click', () => {
      status = item.id;
      update();
    });
    chips.append(chip);
    return { item, chip };
  });
  const periods = segmented<Period>(PERIODS, 'Период', (id) => {
    period = id;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ period }));
    } catch {}
    update();
  });
  const sectionSelect = el('select', 'wm-ord-section');
  sectionSelect.setAttribute('aria-label', 'Раздел');
  sectionSelect.addEventListener('change', () => {
    section = sectionSelect.value;
    update();
  });
  filters.append(chips, periods.root, sectionSelect);
  const summary = el('div', 'wm-ord-summary');
  const summaryText = el('span', 'wm-ord-summary-text');
  const copy = button('wm-ord-copy', 'Скопировать номера');
  const reset = button('wm-ord-reset', 'Сбросить');
  summary.append(summaryText, copy, reset);
  const list = el('ul', 'wm-ord-list');
  const more = button('wm-ins-more', '');
  root.append(head, filters, summary, list, more);
  anchor.parentElement?.insertBefore(root, anchor);
  const funpayParts = [table, document.querySelector<HTMLElement>('.dyn-table-continue'), document.querySelector<HTMLElement>('.orders-filter, form[action*="/orders/trade"]')].filter(Boolean) as HTMLElement[];

  let filtered: Sale[] = [];

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    update();
  });
  more.addEventListener('click', () => {
    limit += PAGE_SIZE;
    renderList();
  });
  reset.addEventListener('click', () => {
    status = 'all';
    query = '';
    section = '';
    search.value = '';
    update();
  });
  copy.addEventListener('click', async () => {
    const ids = filtered.map((sale) => `#${sale.id}`).join(' ');
    if (await copyText(ids)) {
      copy.textContent = 'Скопировано';
      setTimeout(() => (copy.textContent = 'Скопировать номера'), 1500);
    }
  });

  function saleRow(sale: Sale): HTMLElement {
    const row = el('li', `wm-ord-row wm-ord-${sale.status}`);
    const order = link('wm-ord-id', `#${sale.id}`, `${FUNPAY_ORIGIN}/orders/${sale.id}/`);
    order.removeAttribute('target');
    const desc = el('div', 'wm-ord-desc');
    desc.append(el('span', 'wm-ord-title', sale.title), el('span', 'wm-ord-sectiontext', sale.section));
    const buyer = button('wm-ord-buyer', sale.buyerName);
    buyer.title = 'Все заказы этого покупателя';
    buyer.addEventListener('click', () => {
      search.value = sale.buyerName;
      query = sale.buyerName.toLowerCase();
      status = 'all';
      update();
      search.focus();
    });
    row.append(
      el('span', 'wm-ord-date', sale.at ? `${shortDate(sale.at)}, ${new Date(sale.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''),
      order,
      desc,
      buyer,
      el('span', 'wm-ord-status', STATUS_TEXT[sale.status]),
      el('span', 'wm-ord-sum', formatMoney(sale.amount, sale.currency)),
    );
    return row;
  }

  function renderList() {
    list.replaceChildren(...filtered.slice(0, limit).map(saleRow));
    more.hidden = filtered.length <= limit;
    more.textContent = `Показать ещё ${Math.min(PAGE_SIZE, filtered.length - limit)}`;
  }

  function update() {
    limit = PAGE_SIZE;
    render();
  }

  function render() {
    const state = syncState(userId, 'sales');
    refresh.disabled = state.running;
    syncStatus.className = state.error ? 'wm-ins-status wm-ins-bad' : 'wm-ins-status';
    syncStatus.textContent = state.error ? state.error : state.running ? (state.complete ? 'Обновляю…' : `Загружаю продажи, страница ${state.pages + 1}`) : state.syncedAt ? `Обновлено ${formatWhen(state.syncedAt)}` : '';
    periods.set(period);
    const byPeriod = inPeriod(sales, period);
    const matchText = (sale: Sale) => !query || `${sale.id} ${sale.buyerName} ${sale.title} ${sale.section}`.toLowerCase().includes(query);
    const base = byPeriod.filter((sale) => matchText(sale) && (!section || sale.section === section));
    for (const { item, chip } of chipButtons) {
      const count = item.id === 'all' ? base.length : base.filter((sale) => sale.status === item.id).length;
      chip.textContent = `${item.name} ${count.toLocaleString('ru-RU')}`;
      chip.setAttribute('aria-pressed', String(item.id === status));
      chip.classList.toggle('wm-ord-hot', item.id === 'paid' && count > 0);
    }
    const sections = new Map<string, number>();
    for (const sale of byPeriod) {
      sections.set(sale.section, (sections.get(sale.section) ?? 0) + 1);
    }
    const options = [...sections.entries()].sort((a, b) => b[1] - a[1]);
    sectionSelect.replaceChildren(new Option('Все разделы', ''), ...options.map(([name, count]) => new Option(`${name || 'Без раздела'} (${count})`, name)));
    if (section && !sections.has(section)) {
      section = '';
    }
    sectionSelect.value = section;
    filtered = base.filter((sale) => status === 'all' || sale.status === status).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const active = status !== 'all' || Boolean(query) || Boolean(section) || period !== 'all';
    for (const part of funpayParts) {
      part.classList.toggle('wm-ord-hide', active);
    }
    summary.hidden = !active;
    list.hidden = !active;
    more.hidden = true;
    if (!active) {
      return;
    }
    const currency = mainCurrency(filtered.length ? filtered : sales);
    const total = filtered.filter((sale) => sale.currency === currency && sale.status !== 'refunded').reduce((sum, sale) => sum + sale.amount, 0);
    summaryText.textContent = filtered.length ? `${plural(filtered.length, 'заказ', 'заказа', 'заказов')}, сумма ${formatMoney(total, currency)}` : sales.length ? 'Ничего не найдено' : 'Загружаю продажи…';
    copy.hidden = !filtered.length;
    renderList();
  }

  onHistoryChange(async (name) => {
    if (name === 'sales') {
      sales = await readAll(userId, 'sales');
      render();
    }
  });
  readAll(userId, 'sales').then((value) => {
    sales = value;
    const params = new URLSearchParams(location.search);
    const state = params.get('state');
    if (state === 'paid' || state === 'closed' || state === 'refunded') {
      status = state;
    }
    render();
  });
  syncHistory(userId, 'sales');
}

export default defineContentScript({
  matches: ['https://funpay.com/orders/trade*', 'https://funpay.com/en/orders/trade*', 'https://funpay.com/uk/orders/trade*'],
  runAt: 'document_idle',
  main() {
    const raw = document.body?.getAttribute('data-app-data');
    const userId = Number(raw ? parseAppDataJson(raw)?.userId ?? 0 : 0);
    if (userId) {
      mount(userId);
    }
  },
});
