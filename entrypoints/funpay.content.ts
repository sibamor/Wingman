import { parseAppDataJson } from '../lib/funpay';
import { sendMessage } from '../lib/messages';

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_idle',
  main() {
    const raw = document.body?.getAttribute('data-app-data');
    const appData = raw ? parseAppDataJson(raw) : null;
    if (!appData?.userId) {
      return;
    }
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
