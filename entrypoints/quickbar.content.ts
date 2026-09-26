import '../assets/quickbar.css';
import { formatIn } from '../lib/format';
import { FUNPAY_ORIGIN, parseAppDataJson, SETTINGS_URL } from '../lib/funpay';
import { ICONS, MARK_MONO_SVG } from '../lib/icons';
import { sendMessage, type TaskReply } from '../lib/messages';
import { autoRaiseItem, excludedItem, quickBarItem, runningItem, sectionsItem } from '../lib/storage';

type Cell = { key: string; label: string; icon: string; href: string };

function readCount(selector: string): number {
  const value = parseInt((document.querySelector(selector)?.textContent ?? '').replace(/\D+/g, ''), 10);
  return Number.isFinite(value) ? value : 0;
}

function makeLink({ key, label, icon, href }: Cell): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'wm-qb-link';
  link.dataset.wmQb = key;
  link.href = href;
  link.innerHTML = icon;
  link.firstElementChild?.setAttribute('class', 'wm-qb-icon');
  const text = document.createElement('span');
  text.className = key === 'balance' ? 'wm-qb-value' : 'wm-qb-label';
  text.textContent = label;
  const count = document.createElement('span');
  count.className = 'wm-qb-count';
  count.setAttribute('aria-hidden', 'true');
  count.hidden = true;
  link.append(text, count);
  return link;
}

function setCount(link: HTMLElement | null, count: number, label: string, noun: string) {
  if (!link) {
    return;
  }
  const badge = link.querySelector<HTMLElement>('.wm-qb-count')!;
  badge.textContent = String(count);
  badge.hidden = count === 0;
  link.setAttribute('aria-label', count > 0 ? `${label}, ${noun}: ${count}` : label);
}

function build(userId: number): HTMLElement {
  const profile = document.querySelector<HTMLAnchorElement>('#header a.user-link-dropdown[href*="/users/"]')?.href ?? `${FUNPAY_ORIGIN}/users/${userId}/`;
  const bar = document.createElement('nav');
  bar.className = 'wm-qb';
  bar.setAttribute('aria-label', 'Быстрые действия продавца');
  const cells: Cell[] = [
    { key: 'sales', label: 'Продажи', icon: ICONS.sales, href: `${FUNPAY_ORIGIN}/orders/trade` },
    { key: 'chat', label: 'Сообщения', icon: ICONS.chat, href: `${FUNPAY_ORIGIN}/chat/` },
    { key: 'lots', label: 'Мои лоты', icon: ICONS.lots, href: profile },
  ];
  for (const cell of cells) {
    if (cell.key === 'sales' && !document.querySelector('#header a.menu-item-trade')) {
      continue;
    }
    bar.append(makeLink(cell));
  }
  const raise = document.createElement('button');
  raise.type = 'button';
  raise.className = 'wm-qb-link wm-qb-raise';
  raise.innerHTML = ICONS.raise;
  raise.firstElementChild?.setAttribute('class', 'wm-qb-icon');
  const raiseText = document.createElement('span');
  raiseText.className = 'wm-qb-label';
  raiseText.textContent = 'Поднять';
  raise.append(raiseText);
  raise.addEventListener('click', async () => {
    raise.disabled = true;
    const reply = await sendMessage<TaskReply>({ type: 'raise-now' });
    raise.disabled = false;
    if (reply?.error) {
      raise.title = reply.error;
      return;
    }
    raiseText.textContent = 'Подняты';
    raise.dataset.done = '1';
    setTimeout(() => {
      delete raise.dataset.done;
      syncRaise(bar);
    }, 2000);
  });
  bar.append(raise);
  bar.append(makeLink({ key: 'balance', label: 'Баланс', icon: ICONS.balance, href: `${FUNPAY_ORIGIN}/account/balance` }));
  const brand = document.createElement('a');
  brand.className = 'wm-qb-link wm-qb-brand';
  brand.href = SETTINGS_URL;
  brand.setAttribute('aria-label', 'Настройки Wingman');
  brand.title = 'Настройки Wingman';
  brand.innerHTML = MARK_MONO_SVG;
  bar.append(brand);
  for (const link of bar.querySelectorAll<HTMLAnchorElement>('a.wm-qb-link')) {
    const path = new URL(link.href).pathname;
    if (path !== '/' && location.pathname.startsWith(path)) {
      link.setAttribute('aria-current', 'page');
    }
  }
  return bar;
}

function sync(bar: HTMLElement) {
  const sales = readCount('#header a.menu-item-trade .badge');
  const salesLink = bar.querySelector<HTMLAnchorElement>('[data-wm-qb="sales"]');
  if (salesLink) {
    salesLink.href = sales > 0 ? `${FUNPAY_ORIGIN}/orders/trade?state=paid` : `${FUNPAY_ORIGIN}/orders/trade`;
  }
  setCount(salesLink, sales, 'Продажи', 'открытых заказов');
  const chat = readCount('#header a.menu-item-chat .badge') || readCount('#header a.navbar-xs-icon.icon-chat span');
  setCount(bar.querySelector('[data-wm-qb="chat"]'), chat, 'Сообщения', 'непрочитанных');
  const balance = document.querySelector('#header .badge-balance')?.textContent?.trim() ?? '';
  const money = bar.querySelector<HTMLAnchorElement>('[data-wm-qb="balance"]');
  if (money) {
    money.querySelector('.wm-qb-value')!.textContent = balance || 'Баланс';
    money.setAttribute('aria-label', balance ? `Баланс: ${balance}` : 'Баланс');
  }
}

async function syncRaise(bar: HTMLElement) {
  const raise = bar.querySelector<HTMLButtonElement>('.wm-qb-raise');
  if (!raise) {
    return;
  }
  const running = await runningItem.getValue();
  const excluded = new Set(await excludedItem.getValue());
  const active = (await sectionsItem.getValue()).filter((section) => !excluded.has(section.nodeId));
  if (raise.dataset.done) {
    return;
  }
  const label = raise.querySelector('.wm-qb-label')!;
  const next = active.length ? Math.min(...active.map((section) => section.nextAt)) : 0;
  const waiting = next > Date.now() + 60_000;
  raise.disabled = running || waiting;
  label.textContent = running ? 'Поднимаю…' : waiting ? formatIn(next - Date.now()) : 'Поднять';
  const auto = await autoRaiseItem.getValue();
  raise.title = waiting ? `Поднять можно ${formatIn(next - Date.now())}${auto ? ', поднимется само' : ''}` : 'Поднять лоты';
}

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_end',
  async main() {
    const raw = document.body?.getAttribute('data-app-data');
    const appData = raw ? parseAppDataJson(raw) : null;
    const container = document.querySelector('#header > .container');
    const nav = document.querySelector('#header nav.navbar');
    if (!appData?.userId || !container || !nav) {
      return;
    }
    let bar: HTMLElement | null = null;
    const mount = () => {
      bar = build(appData.userId);
      container.append(bar);
      document.documentElement.setAttribute('data-wm-qb', '');
      sync(bar);
      syncRaise(bar);
    };
    const unmount = () => {
      bar?.remove();
      bar = null;
      document.documentElement.removeAttribute('data-wm-qb');
    };
    if (await quickBarItem.getValue()) {
      mount();
    }
    quickBarItem.watch((enabled) => (enabled ? bar ?? mount() : unmount()));
    for (const item of [runningItem, sectionsItem, excludedItem, autoRaiseItem]) {
      item.watch(() => bar && syncRaise(bar));
    }
    let queued = false;
    new MutationObserver(() => {
      if (queued) {
        return;
      }
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (bar) {
          sync(bar);
        }
      });
    }).observe(nav, { childList: true, subtree: true, characterData: true });
  },
});
