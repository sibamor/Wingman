import { browser } from '#imports';
import { loadAccount } from './api';
import { autoSettingsItem, autoStateItem, durationText, fillTemplate, inQuietHours, matchKeyword, needsLoop, parseClock, stateWithDefaults, summaryText, withDefaults, type AutoLogEntry, type AutoSettings, type AutoState } from './auto-settings';
import { chatHistory, loadBalanceRows, orderReview, pollRunner, replyToReview, sendChatMessage, systemEvent, type Contact } from './fp-chat';
import { ownPlaces, parseListing, parseReviewsHtml, parseSalesHtml, readContinueHtml, type SaleLite } from './fp-pages';
import { formatMoney, type Currency } from './money';
import { sendTelegram } from './telegram';
import { FUNPAY_ORIGIN } from './funpay';
import { setOrdersBadge } from './badge';
import { accountItem, blacklistItem, sectionsItem, type Account, type BlacklistEntry } from './storage';

export const AUTO_ALARM = 'auto';

const SEND_GAP = 3000;
const KEYWORD_COOLDOWN = 30 * 60_000;
const SEND_LIMIT = 15;
const SEND_WINDOW = 10 * 60_000;
const STALE_AFTER = 5 * 60_000;
const KEEP_DONE = 30 * 86_400_000;
const FLOOD_PAUSE = 5 * 60_000;
const BALANCE_EVERY = 15 * 60_000;
const ORDERS_EVERY = 10 * 60_000;
const WATCH_EVERY = 60 * 60_000;
const PAGE_GAP = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running: Promise<void> | null = null;
let lastSendAt = 0;
const activeAt = new Map<string, number>();

let telegram = { token: '', chatId: '' };
let summaryTriedAt = 0;

async function notify(url: string, title: string, message: string, silent: boolean) {
  if (telegram.token && telegram.chatId) {
    sendTelegram(telegram.token, telegram.chatId, `${title}
${message}
${url}`, silent);
  }
  await browser.notifications.create(url, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title,
    message: message.slice(0, 180),
    priority: 2,
    silent,
  });
}

export function runAuto(): Promise<void> {
  running ??= cycle()
    .catch((error) => console.warn('Wingman auto', error))
    .finally(() => {
      running = null;
    });
  return running;
}

export async function scheduleAuto() {
  const settings = withDefaults(await autoSettingsItem.getValue());
  if (needsLoop(settings, Object.keys(await blacklistItem.getValue()).length > 0)) {
    await browser.alarms.create(AUTO_ALARM, { periodInMinutes: 0.5 });
  } else {
    await browser.alarms.clear(AUTO_ALARM);
  }
}

export function openNotification(id: string) {
  const url = id.startsWith('https://') ? id : `${FUNPAY_ORIGIN}/orders/trade?wm_status=paid`;
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
  const wantAway = settings.away.enabled && settings.away.text.trim() && Date.now() - (state.awayAt[contact.node] ?? 0) > settings.away.everyHours * 3_600_000;
  const wantGreeting = settings.enabled && !settings.away.enabled && settings.greeting.enabled && settings.greeting.text.trim() && Date.now() - (state.greeted[contact.node] ?? 0) > settings.greeting.everyDays * 86_400_000;
  const wantKeyword = settings.enabled && settings.keywords.some((rule) => rule.enabled && rule.text.trim());
  if (!wantAway && !wantGreeting && !wantKeyword) {
    return;
  }
  const history = await chatHistory(contact.node);
  if (account.userName && history.some((message) => message.author === 0 && message.text.includes(`Покупатель ${account.userName} `))) {
    return;
  }
  const mine = history.some((message) => message.author === account.userId);
  const incoming = history.filter((message) => message.id > since && message.author !== account.userId && message.author !== 0);
  const text = incoming.map((message) => message.text).join('\n') || contact.preview;
  const parts: string[] = [];
  let kind: AutoLogEntry['kind'] = 'keyword';
  if (wantAway) {
    parts.push(fillTemplate(settings.away.text, { buyer: contact.name }));
    kind = 'away';
  } else if (wantGreeting && !mine) {
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
    if (kind === 'away') {
      state.awayAt[contact.node] = Date.now();
    }
    if (rule) {
      state.keywordAt[ruleKey] = Date.now();
    }
  }
}

async function handleEvent(account: Account, settings: AutoSettings, state: AutoState, contact: Contact, event: NonNullable<ReturnType<typeof systemEvent>>, flagged: boolean) {
  const key = `${event.kind}:${event.order}`;
  if (!event.order || state.done[key]) {
    return;
  }
  const warn = flagged && settings.notifyBlacklist;
  if (event.kind === 'paid' && (settings.notifyOrders || warn)) {
    state.done[key] = Date.now();
    await notify(`${FUNPAY_ORIGIN}/orders/${event.order}/`, warn ? `Чёрный список: заказ #${event.order}` : `Новый заказ #${event.order}`, `${contact.name}: ${contact.preview}`, inQuietHours(settings));
    log(state, { kind: 'order', node: contact.node, buyer: contact.name, text: `Оплачен заказ #${event.order}` });
    return;
  }
  if (!settings.enabled || flagged) {
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

async function checkBalance(settings: AutoSettings, state: AutoState) {
  if (!settings.notifyUnfreeze || Date.now() - state.balanceCheckedAt < BALANCE_EVERY) {
    return;
  }
  const first = !state.balanceCheckedAt;
  state.balanceCheckedAt = Date.now();
  const rows = await loadBalanceRows();
  if (!rows.length) {
    return;
  }
  const next: AutoState['waiting'] = {};
  for (const row of rows) {
    if (row.status === 'waiting' && row.amount > 0) {
      next[row.id] = { amount: row.amount, currency: row.currency, title: row.title };
    }
    const was = state.waiting[row.id];
    if (!first && was && row.status === 'complete') {
      await notify(`${FUNPAY_ORIGIN}/account/balance`, `Зачислено ${formatMoney(was.amount, was.currency as Currency)}`, was.title, inQuietHours(settings));
    }
  }
  state.waiting = next;
}

const keepAlive = () => browser.storage.local.get('account').catch(() => null);

async function fetchPage(url: string, form?: Record<string, string>): Promise<string> {
  await keepAlive();
  const response = await fetch(url, {
    method: form ? 'POST' : 'GET',
    credentials: 'include',
    headers: form ? { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' } : undefined,
    body: form ? new URLSearchParams(form) : undefined,
  });
  if (!response.ok || response.url.includes('/account/login')) {
    throw new Error(`FunPay ответил ${response.status}`);
  }
  return response.text();
}

async function checkDeadlines(settings: AutoSettings, state: AutoState) {
  if (!settings.deadline.enabled || Date.now() - state.ordersCheckedAt < ORDERS_EVERY) {
    return;
  }
  state.ordersCheckedAt = Date.now();
  const paid = parseSalesHtml(await fetchPage(`${FUNPAY_ORIGIN}/orders/trade?state=paid`)).filter((sale) => sale.status === 'paid');
  const limit = settings.deadline.hours * 3_600_000;
  const late = paid.filter((sale) => sale.at && Date.now() - sale.at >= limit && !state.overdue[sale.id]);
  for (const sale of late) {
    state.overdue[sale.id] = Date.now();
  }
  if (late.length > 2) {
    const count = late.length % 10 === 1 && late.length % 100 !== 11 ? 'заказ ждёт' : [2, 3, 4].includes(late.length % 10) && ![12, 13, 14].includes(late.length % 100) ? 'заказа ждут' : 'заказов ждут';
    await notify(`${FUNPAY_ORIGIN}/orders/trade?wm_status=paid`, `${late.length} ${count} выдачи дольше ${durationText(limit)}`, late.map((sale) => `#${sale.id} ${sale.buyerName}`).join(', '), inQuietHours(settings));
  } else {
    for (const sale of late) {
      await notify(`${FUNPAY_ORIGIN}/orders/${sale.id}/`, `Заказ #${sale.id} ждёт выдачи ${durationText(Date.now() - sale.at!)}`, `${sale.buyerName}: ${sale.title}`, inQuietHours(settings));
    }
  }
  const open = new Set(paid.map((sale) => sale.id));
  for (const id of Object.keys(state.overdue)) {
    if (!open.has(id)) {
      delete state.overdue[id];
    }
  }
}

async function sendSummary(settings: AutoSettings, state: AutoState, account: Account) {
  const at = parseClock(settings.summary.time);
  if (!settings.summary.enabled || at === null || !telegram.token || !telegram.chatId) {
    return;
  }
  const now = new Date();
  const day = now.toLocaleDateString('sv-SE');
  if (state.summaryDay === day || now.getHours() * 60 + now.getMinutes() < at || Date.now() - summaryTriedAt < ORDERS_EVERY) {
    return;
  }
  summaryTriedAt = Date.now();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sales: SaleLite[] = [];
  let html = await fetchPage(`${FUNPAY_ORIGIN}/orders/trade`);
  for (let page = 0; page < 8; page += 1) {
    const rows = parseSalesHtml(html);
    sales.push(...rows);
    const cursor = readContinueHtml(html);
    if (!rows.length || !cursor || rows.some((sale) => sale.at !== null && sale.at < dayStart)) {
      break;
    }
    await sleep(PAGE_GAP);
    html = await fetchPage(`${FUNPAY_ORIGIN}/orders/trade`, { continue: cursor });
  }
  await sleep(PAGE_GAP);
  const reviews = parseReviewsHtml(await fetchPage(`${FUNPAY_ORIGIN}/users/${account.userId}/`)).filter((review) => review.at !== null && review.at >= dayStart && review.rating);
  const text = summaryText(
    now,
    sales.filter((sale) => sale.at !== null && sale.at >= dayStart),
    sales.filter((sale) => sale.status === 'paid'),
    reviews.map((review) => review.rating),
  );
  const error = await sendTelegram(telegram.token, telegram.chatId, text, inQuietHours(settings));
  if (error) {
    throw new Error(error);
  }
  state.summaryDay = day;
}

async function checkCompetitors(settings: AutoSettings, state: AutoState, account: Account) {
  if (!settings.watch.enabled || Date.now() - state.watchCheckedAt < WATCH_EVERY) {
    return;
  }
  state.watchCheckedAt = Date.now();
  const next: Record<string, number> = {};
  const sections = await sectionsItem.getValue();
  for (const [index, section] of sections.entries()) {
    if (index) {
      await sleep(PAGE_GAP);
    }
    let html: string;
    try {
      html = await fetchPage(`${FUNPAY_ORIGIN}/lots/${section.nodeId}/`);
    } catch {
      continue;
    }
    const offers = parseListing(html);
    for (const own of ownPlaces(offers, String(account.userId))) {
      next[own.offerId] = own.place;
      const was = state.watch[own.offerId];
      if (was === undefined || own.place <= was || was > settings.watch.top) {
        continue;
      }
      const currency = offers.find((offer) => offer.offerId === own.offerId)?.currency ?? 'RUB';
      const title = own.title.length > 70 ? `${own.title.slice(0, 69)}…` : own.title;
      const rival = own.cheapest ? `, дешевле всех ${own.cheapest.userName} за ${formatMoney(own.cheapest.price, own.cheapest.currency)}` : '';
      await notify(
        `${FUNPAY_ORIGIN}/lots/${section.nodeId}/#wm-${own.offerId}`,
        was === 1 ? `Вашу цену перебили: ${section.name}` : `${section.name}: ${own.place}-е место из ${own.total}`,
        `${title}. У вас ${formatMoney(own.price, currency)}${rival}`,
        inQuietHours(settings),
      );
    }
  }
  state.watch = next;
}

async function cycle() {
  const settings = withDefaults(await autoSettingsItem.getValue());
  telegram = settings.telegram;
  const blacklist = await blacklistItem.getValue();
  if (!needsLoop(settings, Object.keys(blacklist).length > 0)) {
    return;
  }
  const state = stateWithDefaults(await autoStateItem.getValue());
  let account = await accountItem.getValue();
  if (!account) {
    account = await loadAccount();
    await accountItem.setValue(account);
  }
  if (Date.now() >= state.pausedUntil) {
    account = await readChats(account, settings, state, blacklist);
  }
  for (const [key, at] of Object.entries(state.done)) {
    if (Date.now() - at > KEEP_DONE) {
      delete state.done[key];
    }
  }
  const checks: [string, () => Promise<void>][] = [
    ['Баланс', () => checkBalance(settings, state)],
    ['Сроки заказов', () => checkDeadlines(settings, state)],
    ['Итоги дня', () => sendSummary(settings, state, account)],
    ['Конкуренты', () => checkCompetitors(settings, state, account)],
  ];
  for (const [name, check] of checks) {
    try {
      await check();
    } catch (error) {
      log(state, { kind: 'error', node: '', buyer: '', text: `${name}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  await autoStateItem.setValue(state);
}

async function readChats(account: Account, settings: AutoSettings, state: AutoState, blacklist: Record<string, BlacklistEntry>): Promise<Account> {
  const blocked = new Set(Object.values(blacklist).map((entry) => entry.name.toLowerCase()));
  let result;
  try {
    result = await pollRunner(account.userId, account.csrfToken);
  } catch {
    account = await loadAccount();
    await accountItem.setValue(account);
    result = await pollRunner(account.userId, account.csrfToken);
  }
  await setOrdersBadge(result.sellerOrders);
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
    const flagged = blocked.has(contact.name.toLowerCase());
    try {
      if (event) {
        await handleEvent(account, settings, state, contact, event, flagged);
      } else {
        if (flagged && settings.notifyBlacklist) {
          await notify(`${FUNPAY_ORIGIN}/chat/?node=${contact.node}`, `Чёрный список: ${contact.name}`, contact.preview, inQuietHours(settings));
        } else if (settings.notifyMessages && !inQuietHours(settings)) {
          await notify(`${FUNPAY_ORIGIN}/chat/?node=${contact.node}`, contact.name || 'Новое сообщение', contact.preview, false);
        }
        if (!flagged && (settings.enabled || settings.away.enabled)) {
          await handleMessage(account, settings, state, contact, since);
        }
      }
    } catch (error) {
      log(state, { kind: 'error', node: contact.node, buyer: contact.name, text: error instanceof Error ? error.message : String(error) });
    }
  }
  state.checkedAt = Date.now();
  return account;
}
