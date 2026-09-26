import { browser } from '#imports';

export async function setOrdersBadge(count: number | null) {
  if (count === null) {
    return;
  }
  try {
    await browser.action.setBadgeText({ text: count ? String(count) : '' });
    await browser.action.setBadgeBackgroundColor({ color: '#FFC21A' });
    await browser.action.setBadgeTextColor({ color: '#111214' });
  } catch {}
}
