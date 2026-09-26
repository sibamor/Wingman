import { browser } from '#imports';
import { SETTINGS_URL } from './funpay';

export async function openSettings() {
  const [tab] = await browser.tabs.query({ url: `${SETTINGS_URL}*` });
  if (tab?.id === undefined) {
    await browser.tabs.create({ url: SETTINGS_URL });
    return;
  }
  await browser.tabs.update(tab.id, { active: true });
  if (tab.windowId !== undefined) {
    await browser.windows.update(tab.windowId, { focused: true });
  }
}
