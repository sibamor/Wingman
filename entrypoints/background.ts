import type { Message } from '../lib/messages';
import { checkAccount, RAISE_ALARM, runRaise } from '../lib/raise';
import { accountItem, autoRaiseItem, runningItem } from '../lib/storage';

export default defineBackground(() => {
  runningItem.setValue(false);

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RAISE_ALARM) {
      runRaise(false);
    }
  });

  autoRaiseItem.watch((enabled) => {
    if (enabled) {
      runRaise(false);
    } else {
      browser.alarms.clear(RAISE_ALARM);
    }
  });

  browser.runtime.onStartup.addListener(async () => {
    if (await autoRaiseItem.getValue()) {
      runRaise(false);
    }
  });

  browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message.type === 'account') {
      accountItem.setValue(message.account).then(() => sendResponse());
      return true;
    }
    if (message.type === 'check-account') {
      checkAccount().then(() => sendResponse());
      return true;
    }
    if (message.type === 'raise-now') {
      runRaise(true).then((error) => sendResponse({ error }));
      return true;
    }
    return false;
  });
});
