import { parseAppDataJson, SETTINGS_URL } from '../lib/funpay';
import { sendMessage } from '../lib/messages';

const MARK_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#FFC21A"/>' +
  '<svg x="8" y="8.1" width="48" height="44.8" viewBox="1 1 45 42">' +
  '<path d="M13 2 L24 28 L13 21 L2 28 Z M34 16 L45 42 L34 35 L23 42 Z" fill="#111214"/></svg></svg>';

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
  const menu = document.querySelector('.user-link-name')?.closest('li')?.querySelector('.dropdown-menu');
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
