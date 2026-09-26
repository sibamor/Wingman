import { AUTO_ALARM, openNotification, runAuto, scheduleAuto } from '../lib/auto';
import { autoSettingsItem } from '../lib/auto-settings';
import type { Message } from '../lib/messages';
import { findTelegramChat, sendTelegram } from '../lib/telegram';
import { checkAccount, currentRun, RAISE_ALARM, rescheduleRaise, runRaise, runRefresh } from '../lib/raise';
import { openSettings } from '../lib/settings-tab';
import { accountItem, autoRaiseItem, blacklistItem, runningItem } from '../lib/storage';
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
    if (alarm.name === AUTO_ALARM) {
      runAuto();
    }
  });

  browser.notifications.onClicked.addListener(openNotification);
  autoSettingsItem.watch(() => {
    scheduleAuto();
    runAuto();
  });
  blacklistItem.watch(() => scheduleAuto());
  scheduleAuto();

  let pokeTimer: ReturnType<typeof setTimeout> | undefined;

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
      case 'telegram-test':
        return reply(sendTelegram(message.token, message.chatId, 'Wingman: уведомления будут приходить сюда').then((error) => ({ error })));
      case 'telegram-find':
        return reply(findTelegramChat(message.token));
      case 'auto-poke':
        clearTimeout(pokeTimer);
        pokeTimer = setTimeout(runAuto, 2000);
        return false;
      default:
        return false;
    }
  });
});
