import { browser } from '#imports';
import { SETTINGS_URL } from './funpay';

export async function openSettings(tabName = '') {
  const url = tabName ? `${SETTINGS_URL}#${tabName}` : SETTINGS_URL;
  const [tab] = await browser.tabs.query({ url: `${SETTINGS_URL}*` });
  if (tab?.id === undefined) {
    await browser.tabs.create({ url });
    return;
  }
  await browser.tabs.update(tab.id, tabName ? { active: true, url } : { active: true });
  if (tab.windowId !== undefined) {
    await browser.windows.update(tab.windowId, { focused: true });
  }
}
