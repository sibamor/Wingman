import { parseAppDataJson, SETTINGS_URL } from '../lib/funpay';
import { MARK_SVG } from '../lib/icons';
import { sendMessage } from '../lib/messages';

function addNavButton() {
  const nav = document.querySelector('.navbar-nav.navbar-right');
  if (!nav || nav.querySelector('.wingman-nav')) {
    return;
  }
  const item = document.createElement('li');
  item.className = 'wingman-nav';
  const anchor = document.createElement('a');
  anchor.href = SETTINGS_URL;
  anchor.title = 'Настройки Wingman';
  anchor.innerHTML = MARK_SVG;
  anchor.append('Wingman');
  item.append(anchor);
  nav.prepend(item);
}

function addMenuItem() {
  const menu = document.querySelector('#header .user-link.dropdown-toggle')?.closest('li')?.querySelector('.dropdown-menu');
  if (!menu || menu.querySelector('.wingman-menu-item')) {
    return;
  }
  const divider = document.createElement('li');
  divider.className = 'divider';
  divider.setAttribute('role', 'separator');
  const item = document.createElement('li');
  const anchor = document.createElement('a');
  anchor.className = 'wingman-menu-item';
  anchor.href = SETTINGS_URL;
  anchor.textContent = 'Wingman';
  item.append(anchor);
  menu.append(divider, item);
}

function watchCounters() {
  const header = document.querySelector('#header');
  if (!header) {
    return;
  }
  const read = () => [...header.querySelectorAll('a.menu-item-trade .badge, a.menu-item-chat .badge')].map((node) => node.textContent?.trim() ?? '').join('|');
  let last = read();
  new MutationObserver(() => {
    const next = read();
    if (next !== last) {
      last = next;
      sendMessage({ type: 'auto-poke' }).catch(() => {});
    }
  }).observe(header, { childList: true, subtree: true, characterData: true });
}

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_idle',
  main() {
    addNavButton();
    const raw = document.body?.getAttribute('data-app-data');
    const appData = raw ? parseAppDataJson(raw) : null;
    if (!appData?.userId) {
      return;
    }
    addMenuItem();
    watchCounters();
    sendMessage({
      type: 'account',
      account: {
        userId: appData.userId,
        userName: document.querySelector('.user-link-name')?.textContent?.trim() ?? '',
        csrfToken: appData.csrfToken,
        checkedAt: Date.now(),
      },
    });
  },
});
