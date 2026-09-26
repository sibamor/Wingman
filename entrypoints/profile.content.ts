import '../assets/insights.css';
import { barChart } from '../lib/chart';
import { el, formatWhen, link } from '../lib/format';
import { FUNPAY_ORIGIN, parseAppDataJson } from '../lib/funpay';
import { onHistoryChange, readAll, syncHistory, syncState, type HistoryName } from '../lib/history';
import { TOOL_ICONS } from '../lib/icons';
import { formatMoney } from '../lib/money';
import { button, keyValue, metric, plural, segmented, shortDate } from '../lib/ins-ui';
import { autoSettingsItem, fillTemplate } from '../lib/auto-settings';
import type { Review, Sale } from '../lib/rows';
import { buckets, inPeriod, PERIODS, summarizeReviews, summarizeSales, type Period } from '../lib/stats';

type Tab = 'sales' | 'reviews';
type ReviewFilter = 'all' | 'unanswered' | 'low' | '1' | '2' | '3' | '4' | '5';
type Prefs = { tab: Tab; period: Period; collapsed: boolean };

const PREFS_KEY = 'wingman:insights';
const PAGE_SIZE = 20;

function loadPrefs(): Prefs {
  try {
    return { tab: 'sales', period: '30d', collapsed: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return { tab: 'sales', period: '30d', collapsed: false };
  }
}

function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

function stars(rating: number): HTMLElement {
  const root = el('span', 'wm-ins-stars', '★'.repeat(rating) + '☆'.repeat(5 - rating));
  root.setAttribute('aria-label', `Оценка ${rating} из 5`);
  root.dataset.rating = String(rating);
  return root;
}

function mount(userId: number) {
  const anchor = document.querySelector('.profile-data-container');
  if (!anchor || anchor.querySelector('.wm-ins')) {
    return;
  }
  const prefs = loadPrefs();
  let sales: Sale[] = [];
  let reviews: Review[] = [];
  let reviewFilter: ReviewFilter = 'all';
  let reviewLimit = PAGE_SIZE;

  const root = el('section', 'wm-ins');
  root.setAttribute('aria-label', 'Кабинет продавца');
  const head = el('div', 'wm-ins-head');
  const tabs = segmented<Tab>(
    [
      { id: 'sales', name: 'Заработок' },
      { id: 'reviews', name: 'Отзывы' },
    ],
    'Кабинет продавца',
    (id) => {
      prefs.tab = id;
      prefs.collapsed = false;
      savePrefs(prefs);
      render();
      sync(false);
    },
  );
  tabs.root.classList.add('wm-ins-tabs');
  const status = el('span', 'wm-ins-status');
  const refresh = button('wm-ins-icon', '');
  refresh.innerHTML = TOOL_ICONS.refresh;
  refresh.setAttribute('aria-label', 'Обновить данные');
  refresh.title = 'Обновить данные';
  refresh.addEventListener('click', () => sync(true));
  const collapse = button('wm-ins-icon wm-ins-collapse', '');
  collapse.innerHTML = TOOL_ICONS.caret;
  collapse.addEventListener('click', () => {
    prefs.collapsed = !prefs.collapsed;
    savePrefs(prefs);
    render();
  });
  head.append(tabs.root, status, refresh, collapse);
  const body = el('div', 'wm-ins-body');
  root.append(head, body);
  anchor.prepend(root);
  const chat = document.querySelector<HTMLElement>('.chat-profile-container .chat');
  if (chat) {
    const shift = chat.getBoundingClientRect().top - root.getBoundingClientRect().top;
    if (shift > 0 && shift < 80) {
      root.style.marginTop = `${Math.round(shift)}px`;
    }
  }

  const periods = segmented<Period>(PERIODS, 'Период', (id) => {
    prefs.period = id;
    savePrefs(prefs);
    render();
  });
  const salesPanel = el('div', 'wm-ins-panel');
  const reviewsPanel = el('div', 'wm-ins-panel');
  body.append(salesPanel, reviewsPanel);

  const activeName = (): HistoryName => (prefs.tab === 'sales' ? 'sales' : 'reviews');

  function renderStatus() {
    const state = syncState(userId, activeName());
    refresh.disabled = state.running;
    status.className = state.error ? 'wm-ins-status wm-ins-bad' : 'wm-ins-status';
    if (state.error) {
      status.textContent = state.error;
    } else if (state.running) {
      status.textContent = state.complete ? 'Обновляю…' : `Загружаю историю, страница ${state.pages + 1}`;
    } else {
      status.textContent = state.syncedAt ? `Обновлено ${formatWhen(state.syncedAt)}` : '';
    }
  }

  function renderSales() {
    salesPanel.replaceChildren(periods.root);
    periods.set(prefs.period);
    if (!sales.length) {
      const state = syncState(userId, 'sales');
      salesPanel.append(el('p', 'wm-ins-empty', state.running || !state.syncedAt ? 'Загружаю продажи…' : 'Продаж пока нет'));
      return;
    }
    const summary = summarizeSales(sales, prefs.period);
    const money = (value: number) => formatMoney(value, summary.currency);
    const metrics = el('div', 'wm-ins-metrics');
    metrics.append(
      metric('Выручка', money(summary.revenue), plural(summary.orders, 'заказ', 'заказа', 'заказов')),
      metric('Открытые', money(summary.pending), plural(summary.pendingCount, 'заказ', 'заказа', 'заказов'), `${FUNPAY_ORIGIN}/orders/trade?state=paid`),
      metric('Средний чек', money(summary.average)),
      metric('Возвраты', money(summary.refunded), plural(summary.refundedCount, 'заказ', 'заказа', 'заказов'), summary.refundedCount ? `${FUNPAY_ORIGIN}/orders/trade?state=refunded` : ''),
    );
    const pickLine = el('div', 'wm-ins-pick');
    const rows = inPeriod(sales, prefs.period).filter((sale) => sale.currency === summary.currency && sale.status !== 'refunded');
    const series = buckets(rows, prefs.period, (sale) => sale.amount);
    const describe = (bucket: (typeof series)[number]) => `${bucket.label}: ${money(bucket.value)}, ${plural(bucket.count, 'заказ', 'заказа', 'заказов')}`;
    const top1 = series.reduce<(typeof series)[number] | null>((max, bucket) => (!max || bucket.value > max.value ? bucket : max), null);
    const step = series.length > 1 ? (series[1]!.from - series[0]!.from) / 86_400_000 : 1;
    const bestWord = step >= 28 ? 'Лучший месяц' : step >= 7 ? 'Лучшая неделя' : 'Лучший день';
    const idle = top1 && top1.value > 0 ? `${bestWord} ${describe(top1)}` : '';
    pickLine.textContent = idle;
    const chart = prefs.period === 'today' ? null : barChart(series, money, (bucket) => (pickLine.textContent = bucket ? describe(bucket) : idle));
    const columns = el('div', 'wm-ins-cols');
    const sectionsBox = el('div', 'wm-ins-box');
    sectionsBox.append(el('h4', 'wm-ins-subtitle', 'Разделы'));
    const top = summary.sections.slice(0, 5);
    const maxRevenue = top[0]?.revenue ?? 0;
    for (const section of top) {
      const row = el('div', 'wm-ins-share');
      const bar = el('span', 'wm-ins-share-bar');
      bar.style.width = `${maxRevenue ? Math.max(2, (section.revenue / maxRevenue) * 100) : 0}%`;
      row.append(el('span', 'wm-ins-share-name', section.name), el('span', 'wm-ins-share-value', money(section.revenue)), bar);
      row.title = plural(section.orders, 'заказ', 'заказа', 'заказов');
      sectionsBox.append(row);
    }
    if (!top.length) {
      sectionsBox.append(el('p', 'wm-ins-empty', 'Нет продаж за период'));
    }
    const buyersBox = el('div', 'wm-ins-box');
    const share = summary.buyers ? ` (${Math.round((summary.repeatBuyers / summary.buyers) * 100)}%)` : '';
    buyersBox.append(el('h4', 'wm-ins-subtitle', 'Покупатели'), keyValue('Всего', summary.buyers.toLocaleString('ru-RU')), keyValue('Купили повторно', `${summary.repeatBuyers.toLocaleString('ru-RU')}${share}`));
    columns.append(sectionsBox, buyersBox);
    salesPanel.append(metrics);
    if (chart) {
      salesPanel.append(chart, pickLine);
    }
    salesPanel.append(columns);
    if (summary.otherCurrencies.length) {
      salesPanel.append(el('p', 'wm-ins-note', `Суммы в ${summary.currency}, продажи в ${summary.otherCurrencies.join(', ')} не входят`));
    }
  }

  function renderReviews() {
    reviewsPanel.replaceChildren();
    if (!reviews.length) {
      const state = syncState(userId, 'reviews');
      reviewsPanel.append(el('p', 'wm-ins-empty', state.running || !state.syncedAt ? 'Загружаю отзывы…' : 'Отзывов пока нет'));
      return;
    }
    const summary = summarizeReviews(reviews);
    const top = el('div', 'wm-ins-reviews-top');
    const score = el('div', 'wm-ins-score');
    const total = Number(document.querySelector('.rating-full-count')?.textContent?.replace(/\D+/g, '') ?? 0);
    const counted = total > summary.count ? `по ${summary.count.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}` : plural(summary.count, 'отзыв', 'отзыва', 'отзывов');
    score.append(el('span', 'wm-ins-score-value', summary.average.toFixed(2).replace('.', ',')), el('span', 'wm-ins-metric-sub', counted));
    const bars = el('div', 'wm-ins-rating-bars');
    bars.classList.toggle('wm-ins-filtering', /^[1-5]$/.test(reviewFilter));
    for (let rating = 5; rating >= 1; rating -= 1) {
      const count = summary.byRating[rating - 1]!;
      const row = button('wm-ins-rating-row', '');
      row.setAttribute('aria-pressed', String(reviewFilter === String(rating)));
      const fill = el('span', 'wm-ins-rating-fill');
      const track = el('span', 'wm-ins-rating-track');
      fill.style.width = `${summary.count ? (count / summary.count) * 100 : 0}%`;
      track.append(fill);
      row.append(el('span', 'wm-ins-rating-label', `${rating} ★`), track, el('span', 'wm-ins-rating-count', count.toLocaleString('ru-RU')));
      row.addEventListener('click', () => setFilter(reviewFilter === String(rating) ? 'all' : (String(rating) as ReviewFilter)));
      bars.append(row);
    }
    top.append(score, bars);
    const chips = el('div', 'wm-ins-chips');
    const chipDefs: { id: ReviewFilter; name: string }[] = [
      { id: 'all', name: `Все ${summary.count.toLocaleString('ru-RU')}` },
      { id: 'unanswered', name: `Без ответа ${summary.unanswered.toLocaleString('ru-RU')}` },
      { id: 'low', name: `Оценка 1-2 ${(summary.byRating[0]! + summary.byRating[1]!).toLocaleString('ru-RU')}` },
    ];
    for (const chip of chipDefs) {
      const node = button('wm-ins-chip', chip.name);
      const active = reviewFilter === chip.id;
      node.setAttribute('aria-pressed', String(active));
      node.addEventListener('click', () => setFilter(chip.id));
      chips.append(node);
    }
    const filtered = reviews
      .filter((review) => {
        if (reviewFilter === 'all') {
          return true;
        }
        if (reviewFilter === 'unanswered') {
          return Boolean(review.orderId) && !review.reply;
        }
        if (reviewFilter === 'low') {
          return review.rating > 0 && review.rating <= 2;
        }
        return String(review.rating) === reviewFilter;
      })
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const list = el('ul', 'wm-ins-review-list');
    for (const review of filtered.slice(0, reviewLimit)) {
      const item = el('li', 'wm-ins-review');
      const meta = el('div', 'wm-ins-review-meta');
      meta.append(stars(review.rating));
      if (review.authorId) {
        meta.append(link('wm-ins-review-author', review.authorName || `ID ${review.authorId}`, `${FUNPAY_ORIGIN}/users/${review.authorId}/`));
      }
      if (review.orderId) {
        meta.append(link('wm-ins-review-order', `#${review.orderId}`, `${FUNPAY_ORIGIN}/orders/${review.orderId}/`));
      }
      meta.append(el('span', 'wm-ins-review-date', review.at ? shortDate(review.at) : ''));
      item.append(meta);
      if (review.detail) {
        item.append(el('div', 'wm-ins-review-detail', review.detail));
      }
      item.append(el('p', 'wm-ins-review-text', review.text || 'Без текста'));
      if (review.reply) {
        item.append(el('p', 'wm-ins-review-reply', review.reply));
      } else if (review.orderId) {
        item.append(replyBox(review));
      }
      list.append(item);
    }
    reviewsPanel.append(top, chips, list);
    if (!filtered.length) {
      reviewsPanel.append(el('p', 'wm-ins-empty', 'Таких отзывов нет'));
    }
    if (filtered.length > reviewLimit) {
      const more = button('wm-ins-more', `Показать ещё ${Math.min(PAGE_SIZE, filtered.length - reviewLimit)}`);
      more.addEventListener('click', () => {
        reviewLimit += PAGE_SIZE;
        renderReviews();
      });
      reviewsPanel.append(more);
    }
  }

  function replyBox(review: Review): HTMLElement {
    const box = el('div', 'wm-ins-reply');
    const open = button('wm-ins-review-answer', 'Ответить');
    box.append(open);
    open.addEventListener('click', async () => {
      const templates = (await autoSettingsItem.getValue()).reviews.byRating;
      const form = el('form', 'wm-ins-reply-form');
      const field = el('textarea', 'wm-ins-reply-field');
      field.rows = 3;
      field.maxLength = 1000;
      field.value = fillTemplate(templates[review.rating - 1] ?? '', { buyer: review.authorName, order: review.orderId });
      field.setAttribute('aria-label', 'Ответ на отзыв');
      const actions = el('div', 'wm-ins-reply-actions');
      const send = button('wm-ins-reply-send', 'Отправить');
      send.type = 'submit';
      const cancel = button('wm-ins-reply-cancel', 'Отмена');
      const status = el('span', 'wm-ins-reply-status');
      actions.append(send, cancel, status);
      form.append(field, actions);
      box.replaceChildren(form);
      field.focus();
      cancel.addEventListener('click', () => box.replaceChildren(open));
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = field.value.trim();
        if (!text) {
          return;
        }
        send.disabled = true;
        status.textContent = '';
        const raw = document.body.getAttribute('data-app-data');
        const csrf = raw ? parseAppDataJson(raw)?.csrfToken ?? '' : '';
        try {
          const response = await fetch(`${FUNPAY_ORIGIN}/orders/review`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' },
            body: new URLSearchParams({ authorId: String(userId), orderId: review.orderId, text, rating: '', csrf_token: csrf }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}) as { msg?: string });
            throw new Error((data as { msg?: string }).msg || `FunPay ответил ${response.status}`);
          }
          review.reply = text;
          renderReviews();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : 'Не отправлено';
          send.disabled = false;
        }
      });
    });
    return box;
  }

  function setFilter(filter: ReviewFilter) {
    reviewFilter = filter;
    reviewLimit = PAGE_SIZE;
    renderReviews();
  }

  function render() {
    tabs.set(prefs.tab);
    root.classList.toggle('wm-ins-collapsed', prefs.collapsed);
    collapse.setAttribute('aria-label', prefs.collapsed ? 'Развернуть' : 'Свернуть');
    collapse.title = prefs.collapsed ? 'Развернуть' : 'Свернуть';
    collapse.setAttribute('aria-expanded', String(!prefs.collapsed));
    salesPanel.hidden = prefs.tab !== 'sales';
    reviewsPanel.hidden = prefs.tab !== 'reviews';
    renderStatus();
    if (prefs.tab === 'sales') {
      renderSales();
    } else {
      renderReviews();
    }
  }

  async function reload(name: HistoryName) {
    if (name === 'sales') {
      sales = await readAll(userId, 'sales');
    } else if (name === 'reviews') {
      reviews = await readAll(userId, 'reviews');
    }
    render();
  }

  function sync(force: boolean) {
    if (!prefs.collapsed) {
      syncHistory(userId, activeName(), force);
    }
  }

  onHistoryChange((name) => {
    if (name === activeName()) {
      reload(name);
    }
  });
  render();
  reload('sales');
  reload('reviews');
  sync(false);
}

export default defineContentScript({
  matches: ['https://funpay.com/users/*', 'https://funpay.com/en/users/*', 'https://funpay.com/uk/users/*'],
  runAt: 'document_idle',
  main() {
    const raw = document.body?.getAttribute('data-app-data');
    const userId = Number(raw ? parseAppDataJson(raw)?.userId ?? 0 : 0);
    const pageId = Number(location.pathname.match(/\/users\/(\d+)/)?.[1] ?? -1);
    if (!userId || userId !== pageId || !document.querySelector('#header a.menu-item-trade')) {
      return;
    }
    mount(userId);
  },
});
