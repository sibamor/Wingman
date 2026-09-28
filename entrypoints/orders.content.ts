import '../assets/insights.css';
import '../assets/orders.css';
import { el, formatWhen, link } from '../lib/format';
import { FUNPAY_ORIGIN, parseAppDataJson } from '../lib/funpay';
import { onHistoryChange, readAll, syncHistory, syncState } from '../lib/history';
import { ICONS, setIcon, TOOL_ICONS } from '../lib/icons';
import { button, plural, segmented, shortDate } from '../lib/ins-ui';
import { csvDate, csvNumber, downloadCsv } from '../lib/csv';
import { formatMoney } from '../lib/money';
import type { Sale, SaleStatus } from '../lib/rows';
import { inPeriod, mainCurrency, PERIODS, type Period } from '../lib/stats';
import { blacklistItem, ticketedItem, type BlacklistEntry } from '../lib/storage';

const TICKET_AFTER = 24 * 3600_000;
const TICKET_REPEAT = 3 * 86_400_000;

type StatusFilter = 'all' | SaleStatus;

type Mode = {
  history: 'sales' | 'purchases';
  label: string;
  search: string;
  refresh: string;
  loading: string;
  status: Record<StatusFilter, string>;
  statusText: Record<SaleStatus, string>;
  person: string;
  totalWord: string;
  lateAfter: number;
};

const MODES: Record<Mode['history'], Mode> = {
  sales: {
    history: 'sales',
    label: 'Поиск по продажам',
    search: 'Номер заказа, покупатель или товар',
    refresh: 'Обновить продажи',
    loading: 'Загружаю продажи',
    status: { all: 'Все', paid: 'Открытые', closed: 'Закрытые', refunded: 'Возвраты' },
    statusText: { paid: 'Открыт', closed: 'Закрыт', refunded: 'Возврат' },
    person: 'Все заказы этого покупателя',
    totalWord: 'сумма',
    lateAfter: 12 * 3600_000,
  },
  purchases: {
    history: 'purchases',
    label: 'Поиск по покупкам',
    search: 'Номер заказа, продавец или товар',
    refresh: 'Обновить покупки',
    loading: 'Загружаю покупки',
    status: { all: 'Все', paid: 'Ждут подтверждения', closed: 'Закрытые', refunded: 'Возвраты' },
    statusText: { paid: 'Оплачен', closed: 'Закрыт', refunded: 'Возврат' },
    person: 'Все заказы у этого продавца',
    totalWord: 'потрачено',
    lateAfter: Infinity,
  },
};

const STATUS_IDS: StatusFilter[] = ['all', 'paid', 'closed', 'refunded'];

function age(at: number): string {
  const minutes = Math.max(1, Math.floor((Date.now() - at) / 60_000));
  if (minutes < 60) {
    return `${minutes} мин`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 3) {
    return `${hours} ч ${minutes % 60} мин`;
  }
  if (hours < 48) {
    return `${hours} ч`;
  }
  return `${Math.floor(hours / 24)} дн`;
}
const PREFS_KEY = 'wingman:orders';

function chatLink(userId: number, otherId: string): string {
  const [a, b] = [Number(otherId), userId].sort((x, y) => x - y);
  return `${FUNPAY_ORIGIN}/chat/?node=users-${a}-${b}`;
}
const PAGE_SIZE = 50;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

let blacklist: Record<string, BlacklistEntry> = {};

function markNativeRows() {
  for (const row of document.querySelectorAll<HTMLElement>('a.tc-item')) {
    const name = row.querySelector<HTMLElement>('.media-user-name [data-href], .media-user-name a');
    const id = (name?.getAttribute('data-href') ?? name?.getAttribute('href'))?.match(/\/users\/(\d+)\//)?.[1] ?? '';
    const black = Boolean(blacklist[id]);
    if (row.classList.contains('wm-ord-black') === black) {
      continue;
    }
    row.classList.toggle('wm-ord-black', black);
    row.querySelector('.wm-black-badge')?.remove();
    if (black) {
      name?.after(Object.assign(document.createElement('span'), { className: 'wm-black-badge', textContent: 'ЧС' }));
    }
  }
}

function mount(userId: number, mode: Mode) {
  const table = document.querySelector<HTMLElement>('.orders-table') ?? document.querySelector<HTMLElement>('a.tc-item')?.closest<HTMLElement>('.tc') ?? null;
  const filterForm = document.querySelector<HTMLElement>('.orders-filter, form[action*="/orders/"]');
  const anchor = filterForm ?? table;
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
  root.setAttribute('aria-label', mode.label);
  const head = el('div', 'wm-ins-head');
  const search = el('input', 'wm-ord-search');
  search.type = 'search';
  search.placeholder = mode.search;
  search.setAttribute('aria-label', mode.label);
  const syncStatus = el('span', 'wm-ins-status');
  const refresh = button('wm-ins-icon', '');
  setIcon(refresh, TOOL_ICONS.refresh);
  refresh.setAttribute('aria-label', mode.refresh);
  refresh.title = mode.refresh;
  refresh.addEventListener('click', () => syncHistory(userId, mode.history, true));
  head.append(search, syncStatus, refresh);
  const filters = el('div', 'wm-ord-filters');
  const chips = el('div', 'wm-ins-chips');
  const chipButtons = STATUS_IDS.map((id) => ({ id, name: mode.status[id] })).map((item) => {
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
  const secondRow = el('div', 'wm-ord-row2');
  secondRow.append(sectionSelect, periods.root);
  filters.append(chips, secondRow);
  const summary = el('div', 'wm-ord-summary');
  const summaryText = el('span', 'wm-ord-summary-text');
  const copy = button('wm-ord-copy', 'Скопировать номера');
  const exportButton = button('wm-ord-copy', 'Выгрузить CSV');
  const reset = button('wm-ord-reset', 'Сбросить');
  const ticket = button('wm-ord-copy wm-ord-ticket', '');
  summary.append(summaryText, ticket, copy, exportButton, reset);
  let ticketed: Record<string, number> = {};
  ticketedItem.getValue().then((value) => {
    ticketed = value;
    render();
  });
  const stale = () => filtered.filter((sale) => sale.status === 'paid' && sale.at !== null && Date.now() - sale.at > TICKET_AFTER && Date.now() - (ticketed[sale.id] ?? 0) > TICKET_REPEAT);
  ticket.addEventListener('click', async () => {
    const orders = stale();
    if (!orders.length) {
      return;
    }
    const nick = document.querySelector('.user-link-name')?.textContent?.trim() ?? '';
    const text = `Здравствуйте. Покупатели не подтверждают выполнение заказов, товар выдан: ${orders.map((sale) => `#${sale.id}`).join(', ')}. Прошу подтвердить заказы.${nick ? ` Мой ник на FunPay: ${nick}.` : ''}`;
    await copyText(text);
    const now = Date.now();
    ticketed = { ...ticketed, ...Object.fromEntries(orders.map((sale) => [sale.id, now])) };
    await ticketedItem.setValue(ticketed);
    window.open('https://support.funpay.com/tickets/new', '_blank', 'noopener');
    ticket.textContent = 'Текст скопирован';
    setTimeout(render, 2500);
  });
  const list = el('ul', 'wm-ord-list');
  const more = button('wm-ins-more', '');
  root.append(head, filters, summary, list, more);
  anchor.parentElement?.insertBefore(root, anchor);
  const funpayParts = [table, document.querySelector<HTMLElement>('.dyn-table-continue'), filterForm].filter(Boolean) as HTMLElement[];

  let filtered: Sale[] = [];
  {
    const params = new URLSearchParams(location.search);
    const state = params.get('wm_status') || params.get('state');
    if (state === 'paid' || state === 'closed' || state === 'refunded') {
      status = state;
    }
    query = (params.get('wm_q') ?? '').toLowerCase();
    search.value = params.get('wm_q') ?? '';
    section = params.get('wm_section') ?? '';
    const urlPeriod = params.get('wm_period');
    if (urlPeriod && PERIODS.some((item) => item.id === urlPeriod)) {
      period = urlPeriod as Period;
    }
  }

  function writeUrl() {
    const params = new URLSearchParams(location.search);
    const set = (key: string, value: string) => (value ? params.set(key, value) : params.delete(key));
    set('wm_q', query);
    set('wm_status', status === 'all' ? '' : status);
    set('wm_section', section);
    set('wm_period', period === 'all' ? '' : period);
    const next = `${location.pathname}${params.toString() ? `?${params}` : ''}${location.hash}`;
    if (next !== `${location.pathname}${location.search}${location.hash}`) {
      history.replaceState(history.state, '', next);
    }
  }

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
  exportButton.addEventListener('click', () => {
    const who = mode.history === 'sales' ? 'Покупатель' : 'Продавец';
    downloadCsv(mode.history === 'sales' ? 'wingman-продажи' : 'wingman-покупки', [
      ['Дата', 'Заказ', 'Товар', 'Раздел', who, 'Статус', 'Сумма', 'Валюта'],
      ...filtered.map((sale) => [csvDate(sale.at), sale.id, sale.title, sale.section, sale.buyerName, mode.statusText[sale.status], csvNumber(sale.amount), sale.currency]),
    ]);
  });
  copy.addEventListener('click', async () => {
    const ids = filtered.map((sale) => `#${sale.id}`).join(' ');
    if (await copyText(ids)) {
      copy.textContent = 'Скопировано';
      setTimeout(() => (copy.textContent = 'Скопировать номера'), 1500);
    }
  });

  function saleRow(sale: Sale): HTMLElement {
    const late = sale.status === 'paid' && sale.at !== null && Date.now() - sale.at > mode.lateAfter;
    const row = el('li', `wm-ord-row wm-ord-${sale.status}${late ? ' wm-ord-late' : ''}`);
    const order = link('wm-ord-id', `#${sale.id}`, `${FUNPAY_ORIGIN}/orders/${sale.id}/`);
    order.removeAttribute('target');
    const desc = el('div', 'wm-ord-desc');
    desc.append(el('span', 'wm-ord-title', sale.title), el('span', 'wm-ord-sectiontext', sale.section));
    const person = el('span', 'wm-ord-person');
    const buyer = button('wm-ord-buyer', sale.buyerName);
    buyer.title = mode.person;
    person.append(buyer);
    if (blacklist[sale.buyerId]) {
      row.classList.add('wm-ord-black');
      person.append(el('span', 'wm-black-badge', 'ЧС'));
      buyer.title = 'В вашем чёрном списке';
    }
    if (sale.buyerId) {
      const chat = link('wm-ord-chat', '', chatLink(userId, sale.buyerId));
      setIcon(chat, ICONS.chat);
      chat.title = 'Открыть чат';
      chat.setAttribute('aria-label', `Чат с ${sale.buyerName}`);
      chat.removeAttribute('target');
      person.append(chat);
    }
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
      person,
      el('span', 'wm-ord-status', sale.status === 'paid' && sale.at ? `${mode.statusText.paid} ${age(sale.at)}` : mode.statusText[sale.status]),
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
    const state = syncState(userId, mode.history);
    refresh.disabled = state.running;
    syncStatus.className = state.error ? 'wm-ins-status wm-ins-bad' : 'wm-ins-status';
    syncStatus.textContent = state.error ? state.error : state.running ? (state.complete ? 'Обновляю…' : `${mode.loading}, страница ${state.pages + 1}`) : state.syncedAt ? `Обновлено ${formatWhen(state.syncedAt)}` : '';
    periods.set(period);
    const byPeriod = inPeriod(sales, period);
    const matchText = (sale: Sale) => !query || `${sale.id} ${sale.buyerName} ${sale.title} ${sale.section}`.toLowerCase().includes(query);
    const base = byPeriod.filter((sale) => matchText(sale) && (!section || sale.section === section));
    for (const { item, chip } of chipButtons) {
      const count = item.id === 'all' ? base.length : base.filter((sale) => sale.status === item.id).length;
      chip.replaceChildren(`${item.name} `, el('span', item.id === 'paid' && count > 0 ? 'wm-ord-count wm-ord-hot' : 'wm-ord-count', count.toLocaleString('ru-RU')));
      chip.setAttribute('aria-pressed', String(item.id === status));
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
    filtered = base.filter((sale) => status === 'all' || sale.status === status).sort((a, b) => (status === 'paid' ? (a.at ?? 0) - (b.at ?? 0) : (b.at ?? 0) - (a.at ?? 0)));
    writeUrl();
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
    summaryText.textContent = filtered.length ? `${plural(filtered.length, 'заказ', 'заказа', 'заказов')}, ${mode.totalWord} ${formatMoney(total, currency)}` : sales.length ? 'Ничего не найдено' : `${mode.loading}…`;
    copy.hidden = !filtered.length;
    exportButton.hidden = !filtered.length;
    const late = mode.history === 'sales' ? stale().length : 0;
    ticket.hidden = !late;
    ticket.textContent = `Заявка в поддержку (${late})`;
    ticket.title = 'Скопирует текст с номерами заказов старше суток и откроет форму поддержки';
    renderList();
  }

  onHistoryChange(async (name) => {
    if (name === mode.history) {
      sales = await readAll(userId, mode.history);
      render();
    }
  });
  readAll(userId, mode.history).then((value) => {
    sales = value;
    render();
  });
  syncHistory(userId, mode.history);
}

export default defineContentScript({
  matches: ['https://funpay.com/orders/*', 'https://funpay.com/en/orders/*', 'https://funpay.com/uk/orders/*'],
  runAt: 'document_idle',
  async main() {
    const raw = document.body?.getAttribute('data-app-data');
    const userId = Number(raw ? parseAppDataJson(raw)?.userId ?? 0 : 0);
    const path = location.pathname.replace(/^\/(en|uk)\//, '/');
    const mode = path.startsWith('/orders/trade') ? MODES.sales : path === '/orders/' ? MODES.purchases : null;
    if (userId && mode) {
      blacklist = await blacklistItem.getValue();
      mount(userId, mode);
      if (mode === MODES.sales) {
        markNativeRows();
        new MutationObserver(markNativeRows).observe(document.querySelector('#content') ?? document.body, { childList: true, subtree: true });
      }
    }
  },
});
