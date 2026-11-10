import '../assets/quickbar.css';
import { formatIn } from '../lib/format';
import { FUNPAY_ORIGIN, parseAppDataJson, SETTINGS_URL } from '../lib/funpay';
import { ICONS, MARK_MONO_SVG, setIcon } from '../lib/icons';
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
  setIcon(link, icon);
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

function setText(node: Element, text: string) {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

function setAttr(node: Element, name: string, value: string) {
  if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
  }
}

function setCount(link: HTMLElement | null, count: number, label: string, noun: string) {
  if (!link) {
    return;
  }
  const badge = link.querySelector<HTMLElement>('.wm-qb-count')!;
  setText(badge, count > 99 ? '99+' : String(count));
  if (badge.hidden !== (count === 0)) {
    badge.hidden = count === 0;
  }
  setAttr(link, 'aria-label', count > 0 ? `${label}, ${noun}: ${count}` : label);
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
  setIcon(raise, ICONS.raise);
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
  setIcon(brand, MARK_MONO_SVG);
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
    setAttr(salesLink, 'href', sales > 0 ? `${FUNPAY_ORIGIN}/orders/trade?state=paid` : `${FUNPAY_ORIGIN}/orders/trade`);
  }
  setCount(salesLink, sales, 'Продажи', 'открытых заказов');
  const chat = readCount('#header a.menu-item-chat .badge') || readCount('#header a.navbar-xs-icon.icon-chat span');
  setCount(bar.querySelector('[data-wm-qb="chat"]'), chat, 'Сообщения', 'непрочитанных');
  const balance = document.querySelector('#header .badge-balance')?.textContent?.trim() ?? '';
  const money = bar.querySelector<HTMLAnchorElement>('[data-wm-qb="balance"]');
  if (money) {
    setText(money.querySelector('.wm-qb-value')!, balance || 'Баланс');
    setAttr(money, 'aria-label', balance ? `Баланс: ${balance}` : 'Баланс');
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
  const label = raise.querySelector('.wm-qb-label')!;
  const next = active.length ? Math.min(...active.map((section) => section.nextAt)) : 0;
  const waiting = next > Date.now() + 60_000;
  const auto = await autoRaiseItem.getValue();
  if (raise.dataset.done) {
    return;
  }
  if (raise.disabled !== (running || waiting)) {
    raise.disabled = running || waiting;
  }
  setText(label, running ? 'Поднимаю…' : waiting ? formatIn(next - Date.now()) : 'Поднять');
  setAttr(raise, 'title', waiting ? `Поднять можно ${formatIn(next - Date.now())}${auto ? ', поднимется само' : ''}` : 'Поднять лоты');
}

const CACHE_KEY = 'wingman:quickbar';

function remember(enabled: boolean) {
  try {
    localStorage.setItem(CACHE_KEY, enabled ? '1' : '0');
  } catch {}
}

function domReady(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    } else {
      resolve();
    }
  });
}

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_start',
  async main() {
    const root = document.documentElement;
    try {
      if (localStorage.getItem(CACHE_KEY) === '1') {
        root.setAttribute('data-wm-qb', 'wait');
      }
    } catch {}
    let enabled = await quickBarItem.getValue();
    remember(enabled);
    if (!enabled) {
      root.removeAttribute('data-wm-qb');
    }
    await domReady();
    const raw = document.body?.getAttribute('data-app-data');
    const appData = raw ? parseAppDataJson(raw) : null;
    const container = document.querySelector('#header > .container');
    const nav = document.querySelector('#header nav.navbar');
    if (!appData?.userId || !container || !nav) {
      root.removeAttribute('data-wm-qb');
      return;
    }
    let bar: HTMLElement | null = null;
    let mounting = false;
    const mount = async () => {
      if (bar || mounting) {
        return;
      }
      mounting = true;
      let next: HTMLElement;
      try {
        next = build(appData.userId);
        sync(next);
        await syncRaise(next).catch(() => null);
      } catch {
        mounting = false;
        root.removeAttribute('data-wm-qb');
        return;
      }
      mounting = false;
      if (!enabled) {
        root.removeAttribute('data-wm-qb');
        return;
      }
      bar = next;
      container.querySelector(':scope > .wm-qb')?.remove();
      container.append(bar);
      root.setAttribute('data-wm-qb', '');
    };
    const unmount = () => {
      bar?.remove();
      bar = null;
      root.removeAttribute('data-wm-qb');
    };
    if (enabled) {
      await mount();
    } else {
      root.removeAttribute('data-wm-qb');
    }
    quickBarItem.watch((value) => {
      enabled = value;
      remember(value);
      if (value) {
        mount();
      } else {
        unmount();
      }
    });
    for (const item of [runningItem, sectionsItem, excludedItem, autoRaiseItem]) {
      item.watch(() => bar && syncRaise(bar));
    }
    setInterval(() => bar && syncRaise(bar).catch(() => {}), 30_000);
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
