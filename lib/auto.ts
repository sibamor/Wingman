import { browser } from '#imports';
import { loadAccount } from './api';
import { autoSettingsItem, autoStateItem, fillTemplate, matchKeyword, type AutoLogEntry, type AutoSettings, type AutoState } from './auto-settings';
import { chatHistory, orderReview, pollRunner, replyToReview, sendChatMessage, systemEvent, type Contact } from './fp-chat';
import { FUNPAY_ORIGIN } from './funpay';
import { accountItem, type Account } from './storage';

export const AUTO_ALARM = 'auto';

const SEND_GAP = 3000;
const KEYWORD_COOLDOWN = 30 * 60_000;
const SEND_LIMIT = 15;
const SEND_WINDOW = 10 * 60_000;
const STALE_AFTER = 5 * 60_000;
const KEEP_DONE = 30 * 86_400_000;
const FLOOD_PAUSE = 5 * 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running: Promise<void> | null = null;
let lastSendAt = 0;
const activeAt = new Map<string, number>();
const orderLinks = new Map<string, string>();

export function runAuto(): Promise<void> {
  running ??= cycle()
    .catch((error) => console.warn('Wingman auto', error))
    .finally(() => {
      running = null;
    });
  return running;
}

export async function scheduleAuto() {
  const settings = await autoSettingsItem.getValue();
  if (settings.enabled || settings.notifyOrders) {
    await browser.alarms.create(AUTO_ALARM, { periodInMinutes: 0.5 });
  } else {
    await browser.alarms.clear(AUTO_ALARM);
  }
}

export function openNotification(id: string) {
  const url = orderLinks.get(id) ?? `${FUNPAY_ORIGIN}/orders/trade?state=paid`;
  browser.tabs.create({ url });
  browser.notifications.clear(id);
}

function log(state: AutoState, entry: Omit<AutoLogEntry, 'at'>) {
  state.log = [{ ...entry, at: Date.now() }, ...state.log].slice(0, 100);
}

function sentRecently(state: AutoState): number {
  return state.log.filter((entry) => entry.kind !== 'error' && entry.kind !== 'order' && Date.now() - entry.at < SEND_WINDOW).length;
}

async function send(account: Account, state: AutoState, contact: Contact, kind: AutoLogEntry['kind'], text: string): Promise<boolean> {
  if (sentRecently(state) >= SEND_LIMIT) {
    log(state, { kind: 'error', node: contact.node, buyer: contact.name, text: 'Достигнут лимит автоответов, пауза 10 минут' });
    state.pausedUntil = Date.now() + SEND_WINDOW;
    return false;
  }
  const wait = lastSendAt + SEND_GAP - Date.now();
  if (wait > 0) {
    await sleep(wait);
  }
  lastSendAt = Date.now();
  const error = await sendChatMessage(account.csrfToken, contact.node, text);
  if (error) {
    log(state, { kind: 'error', node: contact.node, buyer: contact.name, text: error });
    if (/часто|often/i.test(error)) {
      state.pausedUntil = Date.now() + FLOOD_PAUSE;
    }
    return false;
  }
  log(state, { kind, node: contact.node, buyer: contact.name, text });
  return true;
}

async function handleMessage(account: Account, settings: AutoSettings, state: AutoState, contact: Contact, since: number) {
  const quiet = activeAt.get(contact.node);
  if (quiet && Date.now() - quiet < settings.quietMinutes * 60_000) {
    return;
  }
  const wantGreeting = settings.greeting.enabled && settings.greeting.text.trim() && Date.now() - (state.greeted[contact.node] ?? 0) > settings.greeting.everyDays * 86_400_000;
  const wantKeyword = settings.keywords.some((rule) => rule.enabled && rule.text.trim());
  if (!wantGreeting && !wantKeyword) {
    return;
  }
  const history = await chatHistory(contact.node);
  const mine = history.some((message) => message.author === account.userId);
  const incoming = history.filter((message) => message.id > since && message.author !== account.userId && message.author !== 0);
  const text = incoming.map((message) => message.text).join('\n') || contact.preview;
  const parts: string[] = [];
  let kind: AutoLogEntry['kind'] = 'keyword';
  if (wantGreeting && !mine) {
    parts.push(fillTemplate(settings.greeting.text, { buyer: contact.name }));
    kind = 'greeting';
  }
  const rule = wantKeyword ? matchKeyword(settings.keywords, text) : null;
  const ruleKey = rule ? `${contact.node}|${rule.id}` : '';
  if (rule && Date.now() - (state.keywordAt[ruleKey] ?? 0) > KEYWORD_COOLDOWN) {
    parts.push(fillTemplate(rule.text, { buyer: contact.name }));
  }
  if (!parts.length) {
    return;
  }
  if (await send(account, state, contact, kind, parts.join('\n\n'))) {
    if (kind === 'greeting') {
      state.greeted[contact.node] = Date.now();
    }
    if (rule) {
      state.keywordAt[ruleKey] = Date.now();
    }
  }
}

async function handleEvent(account: Account, settings: AutoSettings, state: AutoState, contact: Contact, event: NonNullable<ReturnType<typeof systemEvent>>) {
  const key = `${event.kind}:${event.order}`;
  if (!event.order || state.done[key]) {
    return;
  }
  if (event.kind === 'paid' && settings.notifyOrders) {
    state.done[key] = Date.now();
    orderLinks.set(event.order, `${FUNPAY_ORIGIN}/orders/${event.order}/`);
    await browser.notifications.create(event.order, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: `Новый заказ #${event.order}`,
      message: `${contact.name}: ${contact.preview}`.slice(0, 180),
      priority: 2,
    });
    log(state, { kind: 'order', node: contact.node, buyer: contact.name, text: `Оплачен заказ #${event.order}` });
    return;
  }
  if (!settings.enabled) {
    return;
  }
  if (event.kind === 'confirmed' && settings.thanks.enabled && settings.thanks.text.trim()) {
    state.done[key] = Date.now();
    await send(account, state, contact, 'thanks', fillTemplate(settings.thanks.text, { buyer: contact.name, order: event.order }));
    return;
  }
  if (event.kind === 'review' && settings.reviews.enabled) {
    const review = await orderReview(event.order);
    if (!review || review.hasReply || !review.rating) {
      return;
    }
    const template = settings.reviews.byRating[review.rating - 1]?.trim();
    state.done[key] = Date.now();
    if (!template) {
      return;
    }
    const text = fillTemplate(template, { buyer: review.buyerName || contact.name, order: event.order });
    const error = await replyToReview(account.csrfToken, account.userId, event.order, text);
    log(state, error ? { kind: 'error', node: contact.node, buyer: contact.name, text: `Ответ на отзыв #${event.order}: ${error}` } : { kind: 'review', node: contact.node, buyer: contact.name, text });
  }
}

async function cycle() {
  const settings = await autoSettingsItem.getValue();
  if (!settings.enabled && !settings.notifyOrders) {
    return;
  }
  const state = await autoStateItem.getValue();
  if (Date.now() < state.pausedUntil) {
    return;
  }
  let account = await accountItem.getValue();
  if (!account) {
    account = await loadAccount();
    await accountItem.setValue(account);
  }
  let result;
  try {
    result = await pollRunner(account.userId, account.csrfToken);
  } catch {
    account = await loadAccount();
    await accountItem.setValue(account);
    result = await pollRunner(account.userId, account.csrfToken);
  }
  const baseline = !state.checkedAt || Date.now() - state.checkedAt > STALE_AFTER;
  for (const contact of result.contacts ?? []) {
    const since = state.lastSeen[contact.node] ?? 0;
    if (contact.nodeMsg <= since) {
      continue;
    }
    state.lastSeen[contact.node] = contact.nodeMsg;
    if (baseline) {
      continue;
    }
    const fromBuyer = contact.unread || contact.nodeMsg > contact.userMsg;
    if (!fromBuyer) {
      activeAt.set(contact.node, Date.now());
      continue;
    }
    const event = systemEvent(contact.preview);
    try {
      if (event) {
        await handleEvent(account, settings, state, contact, event);
      } else if (settings.enabled) {
        await handleMessage(account, settings, state, contact, since);
      }
    } catch (error) {
      log(state, { kind: 'error', node: contact.node, buyer: contact.name, text: error instanceof Error ? error.message : String(error) });
    }
  }
  for (const [key, at] of Object.entries(state.done)) {
    if (Date.now() - at > KEEP_DONE) {
      delete state.done[key];
    }
  }
  state.checkedAt = Date.now();
  await autoStateItem.setValue(state);
}
