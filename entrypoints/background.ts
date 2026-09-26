import type { Message } from '../lib/messages';
import { checkAccount, currentRun, RAISE_ALARM, rescheduleRaise, runRaise, runRefresh } from '../lib/raise';
import { openSettings } from '../lib/settings-tab';
import { accountItem, autoRaiseItem, runningItem } from '../lib/storage';
import { checkForUpdate } from '../lib/updates';

export default defineBackground(() => {
  runningItem.setValue(false);

  browser.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      await openSettings();
    }
    if (details.reason === 'update') {
      await rescheduleRaise();
    }
  });

  browser.runtime.onUpdateAvailable.addListener(async () => {
    await currentRun();
    browser.runtime.reload();
  });

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
    const reply = (task: Promise<unknown>) => {
      task.then(sendResponse);
      return true;
    };
    switch (message.type) {
      case 'account':
        return reply(accountItem.setValue(message.account));
      case 'check-account':
        return reply(checkAccount());
      case 'raise-now':
        return reply(runRaise(true).then((error) => ({ error })));
      case 'refresh-sections':
        return reply(runRefresh().then((error) => ({ error })));
      case 'check-update':
        return reply(checkForUpdate());
      case 'reschedule':
        return reply(rescheduleRaise());
      default:
        return false;
    }
  });
});
