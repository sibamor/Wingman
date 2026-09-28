import '../assets/nav.css';
import { el } from '../lib/format';
import { setIcon, TOOL_ICONS } from '../lib/icons';
import { favoritesItem, recentItem, type NavEntry } from '../lib/storage';

const RECENT_LIMIT = 10;

function sectionUrl(): string | null {
  const match = location.pathname.match(/^(?:\/(?:en|uk))?\/(lots|chips)\/(\d+)\/?$/);
  return match ? `${location.origin}/${match[1]}/${match[2]}/` : null;
}

function sectionTitle(): string {
  return document.querySelector('#content h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function chip(entry: NavEntry, current: string | null, onRemove?: () => void): HTMLElement {
  const item = el('span', entry.url === current ? 'wm-nav-chip wm-nav-current' : 'wm-nav-chip');
  const anchor = el('a', 'wm-nav-link', entry.title);
  anchor.href = entry.url;
  anchor.title = entry.title;
  item.append(anchor);
  if (onRemove) {
    const remove = el('button', 'wm-nav-remove');
    remove.type = 'button';
    setIcon(remove, TOOL_ICONS.close);
    remove.setAttribute('aria-label', `Убрать «${entry.title}»`);
    remove.addEventListener('click', onRemove);
    item.append(remove);
  }
  return item;
}

function mountBar(host: HTMLElement, position: 'prepend' | 'after') {
  const bar = el('nav', 'wm-nav');
  bar.setAttribute('aria-label', 'Избранные и недавние разделы');
  if (position === 'prepend') {
    const wrap = el('div', 'container wm-nav-wrap');
    wrap.append(bar);
    host.prepend(wrap);
  } else {
    host.after(bar);
  }
  const current = sectionUrl();
  const render = async () => {
    const favorites = await favoritesItem.getValue();
    const recent = (await recentItem.getValue()).filter((entry) => !favorites.some((item) => item.url === entry.url));
    bar.replaceChildren();
    const groups: [string, NavEntry[], ((entry: NavEntry) => () => void) | null][] = [
      ['Избранное', favorites, (entry) => () => favoritesItem.setValue(favorites.filter((item) => item.url !== entry.url))],
      ['Недавние', recent.filter((entry) => entry.url !== current).slice(0, 8), (entry) => async () => recentItem.setValue((await recentItem.getValue()).filter((item) => item.url !== entry.url))],
    ];
    for (const [name, entries, remover] of groups) {
      if (!entries.length) {
        continue;
      }
      const row = el('div', 'wm-nav-row');
      row.append(el('span', 'wm-nav-label', name));
      const list = el('div', 'wm-nav-list');
      for (const entry of entries) {
        list.append(chip(entry, current, remover ? remover(entry) : undefined));
      }
      row.append(list);
      bar.append(row);
    }
    bar.hidden = !bar.children.length;
  };
  favoritesItem.watch(render);
  recentItem.watch(render);
  render();
}

async function trackSection() {
  const url = sectionUrl();
  const title = sectionTitle();
  if (!url || !title) {
    return;
  }
  const entry: NavEntry = { url, title, at: Date.now() };
  const recent = (await recentItem.getValue()).filter((item) => item.url !== url);
  await recentItem.setValue([entry, ...recent].slice(0, RECENT_LIMIT));
  const heading = document.querySelector<HTMLElement>('#content h1');
  if (!heading || heading.querySelector('.wm-fav')) {
    return;
  }
  const star = el('button', 'wm-fav');
  star.type = 'button';
  setIcon(star, TOOL_ICONS.star);
  const paint = async () => {
    const on = (await favoritesItem.getValue()).some((item) => item.url === url);
    star.classList.toggle('wm-fav-on', on);
    star.setAttribute('aria-pressed', String(on));
    star.setAttribute('aria-label', on ? 'Убрать из избранного' : 'В избранное');
    star.title = on ? 'Убрать из избранного' : 'В избранное';
  };
  star.addEventListener('click', async () => {
    const favorites = await favoritesItem.getValue();
    const on = favorites.some((item) => item.url === url);
    await favoritesItem.setValue(on ? favorites.filter((item) => item.url !== url) : [...favorites, entry]);
  });
  favoritesItem.watch(paint);
  paint();
  heading.append(star);
}

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_idle',
  main() {
    const content = document.querySelector<HTMLElement>('#content');
    if (!content) {
      return;
    }
    if (sectionUrl()) {
      trackSection();
      const head = content.querySelector<HTMLElement>('.content-with-cd') ?? content.querySelector<HTMLElement>('h1')?.parentElement ?? null;
      if (head) {
        mountBar(head, 'after');
      }
      return;
    }
    if (content.classList.contains('content-promo-index')) {
      mountBar(content, 'prepend');
    }
  },
});
