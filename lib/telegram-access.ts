import { browser, storage } from '#imports';

export const TELEGRAM_ORIGIN = 'https://api.telegram.org/*';

export const TELEGRAM_DATA = ['personalCommunications', 'personallyIdentifyingInfo', 'websiteContent'];

export const telegramAccessItem = storage.defineItem<number>('local:telegramAccess', { fallback: 0 });

type Request = { origins: string[]; data_collection?: string[] };

function request(): Request {
  return import.meta.env.FIREFOX ? { origins: [TELEGRAM_ORIGIN], data_collection: TELEGRAM_DATA } : { origins: [TELEGRAM_ORIGIN] };
}

export async function hasTelegramAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains(request() as Parameters<typeof browser.permissions.contains>[0]);
  } catch {
    return false;
  }
}

export async function requestTelegramAccess(): Promise<boolean> {
  const granted = await browser.permissions.request(request() as Parameters<typeof browser.permissions.request>[0]);
  await telegramAccessItem.setValue(granted ? Date.now() : 0);
  return granted;
}

export async function revokeTelegramAccess(): Promise<void> {
  await browser.permissions.remove(request() as Parameters<typeof browser.permissions.remove>[0]).catch(() => false);
  await telegramAccessItem.setValue(0);
}
