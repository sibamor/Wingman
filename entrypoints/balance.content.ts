import '../assets/insights.css';
import '../assets/balance.css';
import { cardNetwork, findBank } from '../lib/banks';
import { barChart } from '../lib/chart';
import { el, formatWhen, link } from '../lib/format';
import { FUNPAY_ORIGIN, parseAppDataJson } from '../lib/funpay';
import { onHistoryChange, readAll, syncHistory, syncState } from '../lib/history';
import { setIcon, TOOL_ICONS } from '../lib/icons';
import { button, metric, plural, segmented, shortDate } from '../lib/ins-ui';
import { csvDate, csvNumber, downloadCsv } from '../lib/csv';
import { formatMoney } from '../lib/money';
import type { Transaction, TransactionKind } from '../lib/rows';
import { buckets, inPeriod, PERIODS, summarizeTransactions, type Period } from '../lib/stats';
import { walletsItem, type WalletMeta } from '../lib/storage';

type KindFilter = 'all' | 'sales' | 'purchases' | 'withdraw' | 'payment' | 'refund' | 'waiting';

const KIND_FILTERS: { id: KindFilter; name: string }[] = [
  { id: 'all', name: 'Все' },
  { id: 'sales', name: 'Продажи' },
  { id: 'withdraw', name: 'Выводы' },
  { id: 'purchases', name: 'Покупки' },
  { id: 'payment', name: 'Пополнения' },
  { id: 'refund', name: 'Возвраты' },
  { id: 'waiting', name: 'Ожидают' },
];

const PREFS_KEY = 'wingman:finance';
const PAGE_SIZE = 50;

const PENCIL =
  '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM192,108.68,147.31,64l24-24L216,84.68Z"/></svg>';

function matchesKind(row: Transaction, filter: KindFilter): boolean {
  const kinds: Record<Exclude<KindFilter, 'all' | 'waiting' | 'sales' | 'purchases'>, TransactionKind[]> = {
    withdraw: ['withdraw', 'withdraw_cancel'],
    payment: ['payment'],
    refund: ['refund'],
  };
  if (filter === 'all') {
    return true;
  }
  if (filter === 'waiting') {
    return row.status === 'waiting';
  }
  if (filter === 'sales') {
    return row.kind === 'order' && row.amount > 0;
  }
  if (filter === 'purchases') {
    return row.kind === 'order' && row.amount < 0;
  }
  return kinds[filter].includes(row.kind);
}

function dateTime(at: number): string {
  const time = new Date(at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${shortDate(at)}, ${time}`;
}

function methodLogo(method: string): HTMLElement {
  const logo = el('span', `payment-logo payment-method-${method} wm-fin-logo`);
  logo.setAttribute('aria-hidden', 'true');
  return logo;
}

function transactionRow(row: Transaction): HTMLElement {
  const item = el('li', `wm-fin-row wm-fin-${row.status}`);
  const order = row.title.match(/#([A-Z0-9]{6,})/)?.[1];
  const title = order && row.kind === 'order' ? link('wm-fin-title', row.title, `${FUNPAY_ORIGIN}/orders/${order}/`) : el('span', 'wm-fin-title', row.title);
  if (order) {
    title.removeAttribute('target');
  }
  const main = el('div', 'wm-fin-main');
  main.append(title);
  if (row.wallet || row.method) {
    const info = el('span', 'wm-fin-wallet');
    if (row.method) {
      info.append(methodLogo(row.method));
    }
    info.append(row.wallet);
    main.append(info);
  }
  const statusText = row.status === 'waiting' ? 'Ожидает' : row.status === 'cancel' ? 'Отменено' : '';
  item.append(
    el('span', 'wm-fin-date', row.at ? dateTime(row.at) : ''),
    main,
    el('span', 'wm-fin-status', statusText),
    el('span', row.amount > 0 ? 'wm-fin-amount wm-fin-plus' : 'wm-fin-amount', formatMoney(row.amount, row.currency, true)),
  );
  return item;
}

function mountFinance(userId: number, getTransactions: () => Transaction[], onData: (listener: () => void) => void) {
  const funpayList = document.querySelector<HTMLElement>('.tc-finance');
  if (!funpayList || document.querySelector('.wm-fin')) {
    return;
  }
  let prefs: { period: Period } = { period: '30d' };
  try {
    prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {}
  let kind: KindFilter = 'all';
  let query = '';
  let limit = PAGE_SIZE;

  const root = el('section', 'wm-ins wm-fin');
  root.setAttribute('aria-label', 'Финансы');
  const head = el('div', 'wm-ins-head');
  const periods = segmented<Period>(PERIODS, 'Период', (id) => {
    prefs.period = id;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {}
    limit = PAGE_SIZE;
    render();
  });
  const status = el('span', 'wm-ins-status');
  const refresh = button('wm-ins-icon', '');
  setIcon(refresh, TOOL_ICONS.refresh);
  refresh.setAttribute('aria-label', 'Обновить операции');
  refresh.title = 'Обновить операции';
  refresh.addEventListener('click', () => syncHistory(userId, 'transactions', true));
  head.append(periods.root, status, refresh);
  const body = el('div', 'wm-ins-panel wm-ins-body');
  const metrics = el('div', 'wm-ins-metrics');
  const chartBox = el('div', 'wm-fin-chart');
  const pick = el('div', 'wm-ins-pick');
  const filters = el('div', 'wm-fin-filters');
  const chips = el('div', 'wm-ins-chips');
  const chipButtons = KIND_FILTERS.map((item) => {
    const chip = button('wm-ins-chip', item.name);
    chip.addEventListener('click', () => {
      kind = item.id;
      limit = PAGE_SIZE;
      render();
    });
    chips.append(chip);
    return { item, chip };
  });
  const search = el('input', 'wm-fin-search');
  search.type = 'search';
  search.placeholder = 'Номер заказа или реквизиты';
  search.setAttribute('aria-label', 'Поиск по операциям');
  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    limit = PAGE_SIZE;
    render();
  });
  filters.append(chips, search);
  const found = el('div', 'wm-fin-found');
  const exportButton = button('wm-ins-more wm-fin-export', 'Выгрузить CSV');
  let exportRows: Transaction[] = [];
  exportButton.addEventListener('click', () => {
    const status = { complete: 'Завершено', waiting: 'Ожидает', cancel: 'Отменено' } as const;
    downloadCsv('wingman-операции', [
      ['Дата', 'Операция', 'Статус', 'Сумма', 'Валюта', 'Реквизиты'],
      ...exportRows.map((row) => [csvDate(row.at), row.title, status[row.status], csvNumber(row.amount), row.currency, row.wallet]),
    ]);
  });
  const list = el('ul', 'wm-fin-list');
  const more = button('wm-ins-more', '');
  more.addEventListener('click', () => {
    limit += PAGE_SIZE;
    render();
  });
  const foundRow = el('div', 'wm-fin-found-row');
  foundRow.append(found, exportButton);
  body.append(metrics, chartBox, pick, filters, foundRow, list, more);
  root.append(head, body);
  const fullWidth = (document.querySelector<HTMLElement>('#content .alert') ?? document.querySelector<HTMLElement>('#content .container') ?? document.body).getBoundingClientRect().width;
  let row: HTMLElement = funpayList;
  while (row.parentElement && row.parentElement !== document.body && row.parentElement.getBoundingClientRect().width < fullWidth - 2) {
    row = row.parentElement;
  }
  if (row.parentElement?.classList.contains('row') && row.parentElement.getBoundingClientRect().width < fullWidth + 40) {
    row = row.parentElement;
  }
  row.parentElement?.insertBefore(root, row);
  const withdrawLink = [...document.querySelectorAll<HTMLElement>('a.withdraw, .btn.withdraw')].find((node) => !node.closest('.modal'));
  if (withdrawLink) {
    withdrawLink.classList.add('wm-fin-withdraw');
    head.append(withdrawLink);
  }
  const funpayParts = [funpayList, document.querySelector<HTMLElement>('.dyn-table-filter'), document.querySelector<HTMLElement>('.dyn-table-continue')].filter(Boolean) as HTMLElement[];

  function render() {
    const all = getTransactions();
    const state = syncState(userId, 'transactions');
    periods.set(prefs.period);
    refresh.disabled = state.running;
    status.className = state.error ? 'wm-ins-status wm-ins-bad' : 'wm-ins-status';
    status.textContent = state.error ? state.error : state.running ? (state.complete ? 'Обновляю…' : `Загружаю операции, страница ${state.pages + 1}`) : state.syncedAt ? `Обновлено ${formatWhen(state.syncedAt)}` : '';
    const summary = summarizeTransactions(all, prefs.period);
    const money = (value: number) => formatMoney(value, summary.currency);
    const card = (id: KindFilter, label: string, value: string, sub = '') => {
      const node = metric(label, value, sub);
      node.classList.add('wm-fin-card');
      node.setAttribute('role', 'button');
      node.tabIndex = 0;
      node.setAttribute('aria-pressed', String(kind === id));
      const pickKind = () => {
        kind = kind === id ? 'all' : id;
        limit = PAGE_SIZE;
        render();
      };
      node.addEventListener('click', pickKind);
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          pickKind();
        }
      });
      return node;
    };
    const cards = [
      card('sales', 'Пришло с продаж', money(summary.income)),
      card('waiting', 'Ожидает', money(summary.waiting), summary.waitingCount ? plural(summary.waitingCount, 'операция', 'операции', 'операций') : ''),
      card('withdraw', 'Выведено', money(summary.withdrawn)),
    ];
    if (all.some((row) => row.kind === 'order' && row.amount < 0)) {
      cards.push(card('purchases', 'Покупки', money(summary.spent)));
    }
    metrics.replaceChildren(...cards);
    metrics.style.gridTemplateColumns = `repeat(${cards.length}, minmax(0, 1fr))`;
    chartBox.replaceChildren();
    pick.textContent = '';
    if (prefs.period !== 'today') {
      const income = inPeriod(all, prefs.period).filter((row) => row.kind === 'order' && row.amount > 0 && row.status === 'complete' && row.currency === summary.currency);
      chartBox.append(barChart(buckets(income, prefs.period, (row) => row.amount), money, (bucket) => (pick.textContent = bucket ? `${bucket.label}: ${money(bucket.value)}` : '')));
    }
    for (const { item, chip } of chipButtons) {
      chip.setAttribute('aria-pressed', String(item.id === kind));
    }
    const ready = all.length > 0;
    for (const part of funpayParts) {
      part.classList.toggle('wm-fin-hide', ready);
    }
    if (row !== funpayList) {
      row.classList.remove('wm-fin-hide');
      row.classList.toggle('wm-fin-hide', ready && !row.innerText.trim() && !row.querySelector('.modal, .withdraw-box'));
    }
    filters.hidden = !ready;
    foundRow.hidden = !ready;
    list.hidden = !ready;
    more.hidden = true;
    if (!ready) {
      return;
    }
    const rows = inPeriod(all, prefs.period)
      .filter((row) => matchesKind(row, kind))
      .filter((row) => !query || `${row.title} ${row.wallet}`.toLowerCase().includes(query))
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const own = rows.filter((row) => row.currency === summary.currency);
    const sum = (list: Transaction[]) => list.reduce((total, row) => total + row.amount, 0);
    const done = sum(own.filter((row) => row.status === 'complete'));
    const outgoing = kind === 'withdraw' || kind === 'purchases';
    const waiting = sum(own.filter((row) => row.status === 'waiting' && (outgoing ? row.amount < 0 : row.amount > 0)));
    const nouns: Record<KindFilter, [string, string, string]> = {
      all: ['операция', 'операции', 'операций'],
      sales: ['продажа', 'продажи', 'продаж'],
      withdraw: ['вывод', 'вывода', 'выводов'],
      purchases: ['покупка', 'покупки', 'покупок'],
      payment: ['пополнение', 'пополнения', 'пополнений'],
      refund: ['возврат', 'возврата', 'возвратов'],
      waiting: ['операция', 'операции', 'операций'],
    };
    const doneWord = kind === 'withdraw' ? 'выведено' : kind === 'purchases' ? 'потрачено' : 'итог';
    const parts = [plural(rows.length, ...nouns[kind])];
    if (kind !== 'waiting') {
      parts.push(`${doneWord} ${formatMoney(kind === 'withdraw' || kind === 'purchases' ? Math.abs(done) : done, summary.currency, kind !== 'withdraw' && kind !== 'purchases')}`);
    }
    if (waiting) {
      parts.push(`ожидает ${formatMoney(Math.abs(waiting), summary.currency)}`);
    }
    found.textContent = rows.length ? parts.join(', ') : 'Операций не найдено';
    exportRows = rows;
    exportButton.hidden = !rows.length;
    list.replaceChildren(...rows.slice(0, limit).map(transactionRow));
    more.hidden = rows.length <= limit;
    more.textContent = `Показать ещё ${Math.min(PAGE_SIZE, rows.length - limit)}`;
  }

  onData(render);
  render();
}

function formatWallet(ext: string, wallet: string): string {
  const digits = wallet.replace(/\D/g, '');
  if (ext === 'fps' && digits.length === 11) {
    return `+${digits[0]} ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  }
  if (ext.startsWith('card')) {
    return wallet.replace(/[\s-]/g, '').replace(/[*•●]/g, '•').replace(/(.{4})(?=.)/g, '$1 ');
  }
  return wallet;
}

function walletNote(ext: string, wallet: string): string {
  return ext.startsWith('card') ? cardNetwork(wallet) : '';
}

function bankLogo(bankId: string): HTMLImageElement {
  const img = el('img', 'wm-wd-bank');
  img.src = browser.runtime.getURL(`/banks/${bankId}.png` as '/banks/100000000111.png');
  img.alt = '';
  return img;
}

function choose(select: HTMLSelectElement, value: string) {
  if (select.value === value) {
    return;
  }
  const option = [...select.options].find((item) => item.value === value);
  if (!option) {
    return;
  }
  const picker = select.closest('.bootstrap-select') ?? select.parentElement?.querySelector('.bootstrap-select');
  const items = picker ? [...picker.querySelectorAll<HTMLAnchorElement>('.dropdown-menu li a')] : [];
  const index = [...select.options].indexOf(option);
  const item = picker?.querySelector<HTMLAnchorElement>(`li[data-original-index="${index}"] a`) ?? items.find((a) => a.textContent?.trim() === option.text.trim());
  if (item) {
    item.click();
    return;
  }
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function fill(input: HTMLInputElement, value: string) {
  input.focus();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

type Channel = { extCurrency: string; name: string };
type WithdrawData = { currencies?: Record<string, { channels?: Channel[] }>; extCurrencies?: Record<string, { wallets?: string[] }> };

function enhanceWithdraw(box: HTMLElement, getTransactions: () => Transaction[]) {
  if (box.dataset.wm) {
    return;
  }
  const form = box.querySelector('form');
  const inputs = box.querySelector('.inputs');
  const currency = form?.querySelector<HTMLSelectElement>('[name="currency_id"]');
  const ext = form?.querySelector<HTMLSelectElement>('[name="ext_currency_id"]');
  const wallet = form?.querySelector<HTMLInputElement>('[name="wallet"]');
  const amount = form?.querySelector<HTMLInputElement>('[name="amount_int"]');
  const bankGroup = form?.querySelector<HTMLElement>('.form-group-fps-bank');
  if (!form || !inputs || !currency || !ext || !wallet || !amount) {
    return;
  }
  box.dataset.wm = '1';
  let data: WithdrawData = {};
  try {
    data = JSON.parse(box.getAttribute('data-data') ?? '{}');
  } catch {}
  let metas: Record<string, WalletMeta> = {};
  let editing = '';
  let showAll = false;
  const panel = el('div', 'wm-wd');
  inputs.prepend(panel);

  const bankSelect = () => bankGroup?.querySelector<HTMLSelectElement>('select') ?? null;
  const keyOf = (extId: string, value: string) => `${extId}|${value.replace(/\s+/g, '')}`;

  function channels(): Channel[] {
    return data.currencies?.[currency!.value]?.channels ?? [];
  }

  function entries() {
    return channels().flatMap((channel) => (data.extCurrencies?.[channel.extCurrency]?.wallets ?? []).map((value) => ({ channel, value, meta: metas[keyOf(channel.extCurrency, value)] })));
  }

  async function saveMeta(key: string, patch: Partial<WalletMeta>) {
    const all = { ...(await walletsItem.getValue()) };
    all[key] = { label: '', bankId: '', bankName: '', usedAt: 0, ...all[key], ...patch };
    await walletsItem.setValue(all);
  }

  function pickBank(meta: WalletMeta | undefined) {
    const select = bankSelect();
    if (!select || !meta?.bankName) {
      return;
    }
    const option = [...select.options].find((item) => item.value === meta.bankId) ?? [...select.options].find((item) => item.text.trim() === meta.bankName);
    if (option) {
      choose(select, option.value);
    }
  }

  function apply(extId: string, value: string, meta: WalletMeta | undefined, sum = '') {
    choose(ext!, extId);
    setTimeout(() => {
      fill(wallet!, value);
      pickBank(meta);
      if (sum) {
        fill(amount!, sum);
      } else {
        amount!.focus();
      }
      render();
    }, 0);
  }

  function walletIcon(extId: string, meta: WalletMeta | undefined): HTMLElement {
    const bank = meta?.bankId ? meta : null;
    if (bank && extId === 'fps') {
      const known = findBank(bank.bankName);
      if (known) {
        return bankLogo(known.id);
      }
    }
    return methodLogo(extId);
  }

  function render() {
    const list = entries();
    const recent = getTransactions()
      .filter((row) => row.kind === 'withdraw' && row.status !== 'cancel')
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
      .slice(0, 3);
    panel.replaceChildren();
    if (list.length) {
      panel.append(el('div', 'wm-wd-title', 'Сохранённые реквизиты'));
      const grid = el('div', 'wm-wd-list');
      const visible = showAll ? list : list.slice(0, 4);
      for (const { channel, value, meta } of visible) {
        const key = keyOf(channel.extCurrency, value);
        const active = ext!.value === channel.extCurrency && wallet!.value.replace(/\s+/g, '') === value.replace(/\s+/g, '');
        const row = el('div', active ? 'wm-wd-item wm-wd-active' : 'wm-wd-item');
        if (editing === key) {
          const input = el('input', 'form-control wm-wd-rename');
          input.value = meta?.label ?? '';
          input.placeholder = 'Название, например «Сбер основная»';
          input.maxLength = 40;
          input.setAttribute('aria-label', 'Название реквизитов');
          const done = async () => {
            editing = '';
            await saveMeta(key, { label: input.value.trim() });
          };
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              done();
            }
            if (event.key === 'Escape') {
              editing = '';
              render();
            }
          });
          input.addEventListener('blur', done);
          row.append(input);
          grid.append(row);
          requestAnimationFrame(() => input.focus());
          continue;
        }
        const pickButton = button('wm-wd-pick', '');
        const text = el('span', 'wm-wd-text');
        const name = el('span', 'wm-wd-name', meta?.label || formatWallet(channel.extCurrency, value));
        const network = walletNote(channel.extCurrency, value);
        if (network && !meta?.label) {
          name.append(el('span', 'wm-wd-network', network));
        }
        text.append(name);
        if (meta?.label) {
          text.append(el('span', 'wm-wd-sub', [formatWallet(channel.extCurrency, value), network].filter(Boolean).join('  ')));
        }
        pickButton.title = channel.extCurrency === 'fps' && meta?.bankName ? `${channel.name}, ${meta.bankName}` : channel.name;
        pickButton.append(walletIcon(channel.extCurrency, meta), text);
        pickButton.addEventListener('click', () => apply(channel.extCurrency, value, meta));
        const rename = button('wm-wd-edit', '');
        setIcon(rename, PENCIL);
        rename.setAttribute('aria-label', 'Переименовать');
        rename.title = 'Переименовать';
        rename.addEventListener('click', () => {
          editing = key;
          render();
        });
        row.append(pickButton, rename);
        grid.append(row);
      }
      panel.append(grid);
      if (list.length > 4) {
        const toggle = button('wm-wd-more', showAll ? 'Свернуть' : `Ещё ${list.length - 4}`);
        toggle.addEventListener('click', () => {
          showAll = !showAll;
          render();
        });
        panel.append(toggle);
      }
    }
    if (recent.length) {
      panel.append(el('div', 'wm-wd-title', 'Недавние выводы'));
      const grid = el('div', 'wm-wd-recent');
      for (const row of recent) {
        const method = row.method;
        const tail = row.wallet.replace(/\D/g, '').slice(-2);
        const match = entries().find(({ channel, value }) => channel.extCurrency === method && tail && value.replace(/\D/g, '').endsWith(tail));
        const item = button('wm-wd-recent-row', '');
        const info = el('span', 'wm-wd-text');
        info.append(el('span', 'wm-wd-name', match ? match.meta?.label || formatWallet(method, match.value) : formatWallet(method, row.wallet)), el('span', 'wm-wd-sub', row.at ? shortDate(row.at) : ''));
        item.append(methodLogo(method), info, el('span', 'wm-wd-recent-sum', formatMoney(Math.abs(row.amount), row.currency)), el('span', 'wm-wd-repeat', 'Повторить'));
        item.disabled = !channels().some((channel) => channel.extCurrency === method);
        item.addEventListener('click', () => apply(method, match?.value ?? '', match?.meta, String(Math.abs(row.amount))));
        grid.append(item);
      }
      panel.append(grid);
    }
    panel.hidden = !panel.children.length;
  }

  function decorateBanks() {
    if (!bankGroup) {
      return;
    }
    for (const item of bankGroup.querySelectorAll<HTMLElement>('.dropdown-menu li a, .filter-option-inner-inner, .filter-option')) {
      if (item.querySelector('.wm-wd-bank') || item.querySelector('.filter-option-inner-inner')) {
        continue;
      }
      const bank = findBank(item.textContent ?? '');
      if (bank) {
        item.prepend(bankLogo(bank.id));
      }
    }
  }

  function decorateWallets() {
    for (const item of form!.querySelectorAll<HTMLAnchorElement>('.js-combobox .dropdown-menu a[data-value]')) {
      if (item.querySelector('.wm-wd-tag')) {
        continue;
      }
      const label = metas[keyOf(ext!.value, item.getAttribute('data-value') ?? '')]?.label;
      if (label) {
        item.append(el('span', 'wm-wd-tag', label));
      }
    }
  }

  form.addEventListener(
    'submit',
    () => {
      const select = bankSelect();
      const option = select && !select.disabled ? select.selectedOptions[0] : null;
      const patch: Partial<WalletMeta> = { usedAt: Date.now() };
      if (ext.value === 'fps' && option?.value) {
        patch.bankId = option.value;
        patch.bankName = option.text.trim();
      }
      if (wallet.value.trim()) {
        saveMeta(keyOf(ext.value, wallet.value), patch);
      }
    },
    true,
  );
  ext.addEventListener('change', () => requestAnimationFrame(render));
  currency.addEventListener('change', () => requestAnimationFrame(render));
  wallet.addEventListener('input', () => {
    const meta = metas[keyOf(ext.value, wallet.value)];
    if (ext.value === 'fps' && meta) {
      pickBank(meta);
    }
    render();
  });
  new MutationObserver(() => {
    decorateBanks();
    decorateWallets();
  }).observe(form, { childList: true, subtree: true });
  box.addEventListener('wm-refresh', render);
  const modal = box.closest('.modal');
  if (modal) {
    new MutationObserver(() => {
      if (modal.classList.contains('in')) {
        setTimeout(render, 50);
      }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  walletsItem.getValue().then((value) => {
    metas = value;
    render();
  });
  walletsItem.watch((value) => {
    metas = value;
    render();
  });
  decorateBanks();
}

export default defineContentScript({
  matches: ['https://funpay.com/account/balance*', 'https://funpay.com/en/account/balance*', 'https://funpay.com/uk/account/balance*'],
  runAt: 'document_idle',
  main() {
    const raw = document.body?.getAttribute('data-app-data');
    const userId = Number(raw ? parseAppDataJson(raw)?.userId ?? 0 : 0);
    if (!userId) {
      return;
    }
    let transactions: Transaction[] = [];
    const listeners = new Set<() => void>();
    const reload = async () => {
      transactions = await readAll(userId, 'transactions');
      for (const listener of listeners) {
        listener();
      }
    };
    onHistoryChange((name) => {
      if (name === 'transactions') {
        reload();
      }
    });
    mountFinance(userId, () => transactions, (listener) => listeners.add(listener));
    const box = document.querySelector<HTMLElement>('.withdraw-box');
    if (box) {
      enhanceWithdraw(box, () => transactions);
      listeners.add(() => box.dispatchEvent(new CustomEvent('wm-refresh')));
    }
    reload();
    syncHistory(userId, 'transactions');
  },
});
