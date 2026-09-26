import { browser } from '#imports';
import { updateCheckItem, type UpdateCheck } from './storage';

export async function checkForUpdate(): Promise<UpdateCheck> {
  let check: UpdateCheck;
  try {
    const self = await browser.management.getSelf();
    if (self.installType === 'development') {
      check = { status: 'development', version: null, at: Date.now() };
    } else {
      const result = await browser.runtime.requestUpdateCheck();
      check = { status: result.status, version: result.version ?? null, at: Date.now() };
    }
  } catch {
    check = { status: 'unavailable', version: null, at: Date.now() };
  }
  await updateCheckItem.setValue(check);
  return check;
}
