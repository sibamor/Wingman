import { parseAppDataJson, SETTINGS_URL } from '../lib/funpay';
import { sendMessage } from '../lib/messages';

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
