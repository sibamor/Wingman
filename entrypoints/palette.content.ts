import '../assets/palette.css';
import { el } from '../lib/format';
import { FUNPAY_ORIGIN, parseAppDataJson, SETTINGS_URL } from '../lib/funpay';
import { readAll } from '../lib/history';
import { favoritesItem, recentItem, sectionsItem } from '../lib/storage';

type Item = { title: string; hint: string; url: string; keywords: string };

const LIMIT = 9;

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').trim();
}

async function collect(userId: number): Promise<Item[]> {
  const items: Item[] = [
    { title: 'Продажи', hint: 'Страница', url: `${FUNPAY_ORIGIN}/orders/trade`, keywords: 'продажи заказы sales' },
    { title: 'Открытые продажи', hint: 'Страница', url: `${FUNPAY_ORIGIN}/orders/trade?wm_status=paid`, keywords: 'открытые оплаченные выдать' },
    { title: 'Покупки', hint: 'Страница', url: `${FUNPAY_ORIGIN}/orders/`, keywords: 'покупки purchases' },
    { title: 'Сообщения', hint: 'Страница', url: `${FUNPAY_ORIGIN}/chat/`, keywords: 'сообщения чат chat' },
    { title: 'Финансы', hint: 'Страница', url: `${FUNPAY_ORIGIN}/account/balance`, keywords: 'финансы баланс вывод деньги' },
    { title: 'Настройки Wingman', hint: 'Wingman', url: SETTINGS_URL, keywords: 'wingman настройки автоответы шаблоны' },
  ];
  if (userId) {
    items.push({ title: 'Мой профиль', hint: 'Страница', url: `${FUNPAY_ORIGIN}/users/${userId}/`, keywords: 'профиль лоты отзывы заработок' });
  }
  for (const entry of await favoritesItem.getValue()) {
    items.push({ title: entry.title, hint: 'Избранное', url: entry.url, keywords: entry.title });
  }
  for (const entry of await recentItem.getValue()) {
    items.push({ title: entry.title, hint: 'Недавний раздел', url: entry.url, keywords: entry.title });
  }
  for (const section of await sectionsItem.getValue()) {
    items.push({ title: section.name, hint: 'Мои лоты', url: `${FUNPAY_ORIGIN}/lots/${section.nodeId}/trade`, keywords: `${section.name} мои лоты` });
  }
  if (userId) {
    const sales = await readAll(userId, 'sales').catch(() => []);
    const buyers = new Map<string, string>();
    for (const sale of sales) {
      if (sale.buyerId && !buyers.has(sale.buyerId)) {
        buyers.set(sale.buyerId, sale.buyerName);
      }
    }
    for (const [id, name] of buyers) {
      const [a, b] = [Number(id), userId].sort((x, y) => x - y);
      items.push({ title: name, hint: 'Чат с покупателем', url: `${FUNPAY_ORIGIN}/chat/?node=users-${a}-${b}`, keywords: name });
      items.push({ title: name, hint: 'Заказы покупателя', url: `${FUNPAY_ORIGIN}/orders/trade?wm_q=${encodeURIComponent(name)}`, keywords: name });
    }
  }
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.url}|${item.hint}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function mount(userId: number) {
  let items: Item[] = [];
  let shown: Item[] = [];
  let active = 0;
  const overlay = el('div', 'wm-pal');
  overlay.hidden = true;
  const box = el('div', 'wm-pal-box');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Быстрый переход');
  const input = el('input', 'wm-pal-input');
  input.placeholder = 'Раздел, заказ #номер, покупатель или страница';
  input.setAttribute('aria-label', 'Быстрый переход');
  const list = el('ul', 'wm-pal-list');
  list.setAttribute('role', 'listbox');
  box.append(input, list);
  overlay.append(box);
  document.body.append(overlay);

  const render = () => {
    const query = normalize(input.value);
    const order = input.value.trim().match(/^#?([A-Za-z0-9]{8})$/)?.[1]?.toUpperCase();
    const matches = query ? items.filter((item) => normalize(`${item.title} ${item.keywords}`).includes(query)) : items.slice(0, LIMIT);
    shown = [...(order ? [{ title: `Заказ #${order}`, hint: 'Открыть заказ', url: `${FUNPAY_ORIGIN}/orders/${order}/`, keywords: '' }] : []), ...matches].slice(0, LIMIT);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.replaceChildren(
      ...shown.map((item, index) => {
        const row = el('li', index === active ? 'wm-pal-item wm-pal-active' : 'wm-pal-item');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(index === active));
        row.append(el('span', 'wm-pal-title', item.title), el('span', 'wm-pal-hint', item.hint));
        row.addEventListener('mousemove', () => {
          if (active !== index) {
            active = index;
            render();
          }
        });
        row.addEventListener('click', () => go(item));
        return row;
      }),
    );
    if (!shown.length) {
      list.append(el('li', 'wm-pal-empty', 'Ничего не найдено'));
    }
  };

  const close = () => {
    overlay.hidden = true;
  };

  const go = (item: Item) => {
    close();
    location.href = item.url;
  };

  const open = async () => {
    items = await collect(userId);
    input.value = '';
    active = 0;
    overlay.hidden = false;
    render();
    input.focus();
  };

  input.addEventListener('input', () => {
    active = 0;
    render();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(shown.length, 1);
      render();
    } else if (event.key === 'Enter' && shown[active]) {
      event.preventDefault();
      go(shown[active]!);
    } else if (event.key === 'Escape') {
      close();
    }
  });
  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
      event.preventDefault();
      if (overlay.hidden) {
        open();
      } else {
        close();
      }
    }
  });
}

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_idle',
  main() {
    const raw = document.body?.getAttribute('data-app-data');
    mount(Number(raw ? parseAppDataJson(raw)?.userId ?? 0 : 0));
  },
});
