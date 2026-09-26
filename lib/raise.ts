import { browser } from '#imports';
import { loadAccount, loadLotSections, loadRaiseButton, NotLoggedInError, raiseGame } from './api';
import type { RaiseResult } from './funpay';
import { accountItem, autoRaiseItem, lastErrorItem, runningItem, sectionsItem, type SectionState } from './storage';

export const RAISE_ALARM = 'raise';

const REQUEST_GAP_MS = 2000;
const MIN_ALARM_DELAY_MS = 60_000;
const ERROR_RETRY_MS = 600_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function mergeSections(found: { nodeId: string; name: string }[], saved: SectionState[]): SectionState[] {
  const byNode = new Map(saved.map((section) => [section.nodeId, section]));
  return found.map((section) => {
    const previous = byNode.get(section.nodeId);
    if (previous) {
      return { ...previous, name: section.name };
    }
    return { nodeId: section.nodeId, gameId: null, name: section.name, nextAt: 0, lastRaisedAt: null, status: null, message: '' };
  });
}

function applyResult(section: SectionState, result: RaiseResult, now: number) {
  section.status = result.status;
  section.message = result.message;
  section.nextAt = now + result.waitSeconds * 1000;
  if (result.status === 'raised') {
    section.lastRaisedAt = now;
  }
}

async function raiseDueSections(force: boolean) {
  const account = await loadAccount();
  await accountItem.setValue(account);
  const sections = mergeSections(await loadLotSections(account.userId), await sectionsItem.getValue());
  await sectionsItem.setValue(sections);
  const doneGames = new Map<string, RaiseResult>();
  for (const section of sections) {
    if (!force && section.nextAt > Date.now()) {
      continue;
    }
    if (section.gameId && doneGames.has(section.gameId)) {
      applyResult(section, doneGames.get(section.gameId)!, Date.now());
      await sectionsItem.setValue(sections);
      continue;
    }
    const button = await loadRaiseButton(section.nodeId);
    if (!button) {
      applyResult(section, { status: 'error', waitSeconds: 3600, message: 'Не поднято - на странице нет кнопки' }, Date.now());
    } else {
      section.gameId = button.gameId;
      const result = doneGames.get(button.gameId) ?? (await raiseGame(button, account.csrfToken));
      doneGames.set(button.gameId, result);
      applyResult(section, result, Date.now());
    }
    await sectionsItem.setValue(sections);
    await sleep(REQUEST_GAP_MS);
  }
}

async function scheduleNext(failed: boolean) {
  await browser.alarms.clear(RAISE_ALARM);
  if (!(await autoRaiseItem.getValue())) {
    return;
  }
  const sections = await sectionsItem.getValue();
  let nextAt = sections.length ? Math.min(...sections.map((section) => section.nextAt)) : Date.now() + 3600_000;
  if (failed) {
    nextAt = Date.now() + ERROR_RETRY_MS;
  }
  await browser.alarms.create(RAISE_ALARM, { when: Math.max(nextAt, Date.now() + MIN_ALARM_DELAY_MS) });
}

export async function checkAccount() {
  try {
    await accountItem.setValue(await loadAccount());
  } catch (error) {
    if (error instanceof NotLoggedInError) {
      await accountItem.setValue(null);
    }
  }
}

let running: Promise<string | null> | null = null;

export function runRaise(force: boolean): Promise<string | null> {
  if (running) {
    return running;
  }
  running = (async () => {
    await runningItem.setValue(true);
    let failed = false;
    try {
      await raiseDueSections(force);
      await lastErrorItem.setValue(null);
      return null;
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof NotLoggedInError) {
        await accountItem.setValue(null);
      }
      await lastErrorItem.setValue(message);
      return message;
    } finally {
      await runningItem.setValue(false);
      await scheduleNext(failed);
      running = null;
    }
  })();
  return running;
}
