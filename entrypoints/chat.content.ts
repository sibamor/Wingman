import '../assets/chat.css';
import { FUNPAY_ORIGIN, parseAppDataJson } from '../lib/funpay';
import { readAll } from '../lib/history';
import { plural, shortDate } from '../lib/ins-ui';
import { formatMoney } from '../lib/money';
import { mainCurrency } from '../lib/stats';
import { noteNamesItem, notesItem } from '../lib/storage';

function userIdFromHref(href: string | null | undefined): string | null {
  return href?.match(/\/users\/(\d+)\//)?.[1] ?? null;
}

function addContactTools() {
  const contacts = document.querySelector('.chat-contacts');
  const list = contacts?.querySelector('.contact-list');
  if (!contacts || !list || contacts.querySelector('.wm-contact-tools')) {
    return;
  }
  const tools = document.createElement('div');
  tools.className = 'wm-contact-tools';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'form-control wm-contact-search';
  search.placeholder = 'Поиск';
  search.setAttribute('aria-label', 'Поиск по диалогам');
  const unread = document.createElement('button');
  unread.type = 'button';
  unread.className = 'wm-contact-unread';
  unread.setAttribute('aria-pressed', 'false');
  unread.textContent = 'Непрочитанные';
  const empty = document.createElement('div');
  empty.className = 'wm-contact-empty';
  empty.hidden = true;
  const apply = () => {
    const query = search.value.trim().toLowerCase();
    const onlyUnread = unread.getAttribute('aria-pressed') === 'true';
    let shown = 0;
    for (const item of list.querySelectorAll<HTMLElement>('a.contact-item')) {
      const text = item.textContent?.toLowerCase() ?? '';
      const hidden = (query && !text.includes(query)) || (onlyUnread && !item.classList.contains('unread'));
      item.classList.toggle('wm-hidden', Boolean(hidden));
      shown += hidden ? 0 : 1;
    }
    const text = onlyUnread && !query ? 'Непрочитанных нет' : 'Ничего не найдено';
    if (empty.hidden !== shown > 0) {
      empty.hidden = shown > 0;
    }
    if (empty.textContent !== text) {
      empty.textContent = text;
    }
  };
  search.addEventListener('input', apply);
  unread.addEventListener('click', () => {
    unread.setAttribute('aria-pressed', String(unread.getAttribute('aria-pressed') !== 'true'));
    apply();
  });
  new MutationObserver(apply).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  tools.append(search, unread);
  list.before(tools);
  tools.after(empty);
}

function shortenTimes() {
  for (const date of document.querySelectorAll<HTMLElement>('.chat-message-list .chat-msg-date')) {
    const text = date.textContent?.trim() ?? '';
    if (/^\d{2}:\d{2}:\d{2}$/.test(text)) {
      date.textContent = text.slice(0, 5);
    }
  }
}

function tidyPreviews() {
  for (const item of document.querySelectorAll<HTMLElement>('a.contact-item')) {
    const name = item.querySelector('.media-user-name')?.textContent?.trim();
    const preview = item.querySelector<HTMLElement>('.contact-item-message');
    if (!name || !preview || preview.dataset.wmTidy === preview.textContent) {
      continue;
    }
    const text = preview.textContent ?? '';
    const prefix = `Покупатель ${name} `;
    if (text.startsWith(prefix)) {
      const rest = text.slice(prefix.length);
      preview.textContent = rest.charAt(0).toUpperCase() + rest.slice(1);
      preview.title = text;
    }
    preview.dataset.wmTidy = preview.textContent ?? '';
  }
}

function markOwnMessages(myId: string) {
  const items = [...document.querySelectorAll<HTMLElement>('.chat-message-list .chat-msg-item')];
  let own = false;
  const flags = items.map((item) => {
    if (item.classList.contains('chat-msg-with-head')) {
      own = userIdFromHref(item.querySelector<HTMLAnchorElement>('a.chat-msg-author-link')?.getAttribute('href')) === myId;
    }
    return own;
  });
  items.forEach((item, index) => {
    const mine = flags[index]!;
    const next = items[index + 1];
    item.classList.toggle('wm-own', mine);
    item.classList.toggle('wm-own-start', mine && item.classList.contains('chat-msg-with-head'));
    item.classList.toggle('wm-own-end', mine && (!next || !flags[index + 1] || next.classList.contains('chat-msg-with-head')));
  });
}

let stick = true;
let chatKey = '';

function keepAtBottom() {
  const list = document.querySelector<HTMLElement>('.chat-message-list');
  if (!list) {
    return;
  }
  const key = document.querySelector('.chat')?.getAttribute('data-id') ?? '';
  const toBottom = () => {
    if (stick) {
      list.scrollTop = list.scrollHeight;
    }
  };
  if (key !== chatKey) {
    chatKey = key;
    stick = true;
    toBottom();
    requestAnimationFrame(toBottom);
  }
  if (list.dataset.wmBottom) {
    return;
  }
  list.dataset.wmBottom = '1';
  let userAt = 0;
  const touched = () => {
    userAt = Date.now();
  };
  for (const type of ['wheel', 'touchmove', 'keydown', 'pointerdown']) {
    list.addEventListener(type, touched, { passive: true });
  }
  list.addEventListener(
    'scroll',
    () => {
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      if (atBottom) {
        stick = true;
      } else if (Date.now() - userAt < 1000) {
        stick = false;
      }
    },
    { passive: true },
  );
  list.addEventListener('load', toBottom, true);
  new ResizeObserver(toBottom).observe(list);
  new MutationObserver(toBottom).observe(list, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });
  toBottom();
}

function captionImages() {
  const form = document.querySelector('.chat-form');
  const field = form?.querySelector<HTMLTextAreaElement>('textarea');
  const send = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!form || !field || !send || field.dataset.wmCaption) {
    return;
  }
  field.dataset.wmCaption = '1';
  const images = () => document.querySelectorAll('.chat-message-list .chat-img-link, .chat-message-list .chat-msg-body img').length;
  let armed: { text: string; images: number } | null = null;
  new MutationObserver(() => {
    if (field.readOnly) {
      if (!armed && field.value.trim()) {
        armed = { text: field.value, images: images() };
      }
      return;
    }
    const pending = armed;
    armed = null;
    if (!pending || field.value !== pending.text) {
      return;
    }
    const started = Date.now();
    const check = () => {
      if (field.value !== pending.text || field.readOnly) {
        return;
      }
      if (images() > pending.images) {
        send.click();
        return;
      }
      if (Date.now() - started < 6000) {
        setTimeout(check, 250);
      }
    };
    check();
  }).observe(field, { attributes: true, attributeFilter: ['readonly'] });
}

const IMPERSONATION = /(администраци|поддержк|арбитраж|модератор|служб\S* безопасности|support|administration)[^.!?\n]{0,24}fun\s?pay|fun\s?pay[^.!?\n]{0,24}(администраци|поддержк|арбитраж|модератор|support|administration)/i;

function lookalikeLink(href: string): boolean {
  try {
    const host = new URL(href, location.href).hostname.toLowerCase();
    return /f[uy]n-?p[ae]y|funpau|funnpay/.test(host) && !/(^|\.)funpay\.com$/.test(host) && host !== 'sfunpay.com';
  } catch {
    return false;
  }
}

function warnImpersonation(myId: string) {
  let official = false;
  let own = false;
  for (const item of document.querySelectorAll<HTMLElement>('.chat-message-list .chat-msg-item')) {
    if (item.classList.contains('chat-msg-with-head')) {
      official = Boolean(item.querySelector('.chat-msg-author-label.label-success'));
      own = userIdFromHref(item.querySelector<HTMLAnchorElement>('a.chat-msg-author-link')?.getAttribute('href')) === myId;
    }
    if (official || own || item.dataset.wmScam) {
      continue;
    }
    item.dataset.wmScam = '0';
    const text = item.querySelector('.chat-msg-text')?.textContent ?? '';
    const links = [...item.querySelectorAll<HTMLAnchorElement>('.chat-msg-text a[href]')].map((a) => a.getAttribute('href') ?? '');
    const plain = text.match(/https?:\/\/\S+/g) ?? [];
    const claim = IMPERSONATION.test(text) && /(заблокир|блокиров|подтверд|перейд|ссылк|верифик|код|сним|верн|оплат)/i.test(text);
    if (!claim && ![...links, ...plain].some(lookalikeLink)) {
      continue;
    }
    item.dataset.wmScam = '1';
    const warn = document.createElement('div');
    warn.className = 'wm-scam';
    warn.textContent = 'Пишет пользователь, а не FunPay. Поддержка и арбитраж отмечены меткой у имени';
    item.querySelector('.chat-msg-body')?.append(warn);
  }
}

let cardFor = '';
let cardLoading = '';
let cardEmpty = '';

async function addBuyerCard(myId: number) {
  const detail = document.querySelector('.chat-detail-list');
  const buyerId = userIdFromHref(document.querySelector<HTMLAnchorElement>('.chat-header .media-user-name a')?.getAttribute('href'));
  if (!detail || !buyerId || !myId) {
    return;
  }
  const existing = detail.querySelector<HTMLElement>('.wm-card');
  if (cardFor === buyerId && (existing || cardLoading === buyerId || cardEmpty === buyerId)) {
    return;
  }
  cardFor = buyerId;
  cardLoading = buyerId;
  const [sales, purchases, reviews] = await Promise.all([readAll(myId, 'sales'), readAll(myId, 'purchases'), readAll(myId, 'reviews')]).catch(() => [[], [], []] as const);
  cardLoading = '';
  if (cardFor !== buyerId) {
    return;
  }
  for (const old of detail.querySelectorAll('.wm-card')) {
    old.remove();
  }
  const mine = sales.filter((sale) => sale.buyerId === buyerId).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const bought = purchases.filter((sale) => sale.buyerId === buyerId);
  const review = reviews.filter((item) => item.authorId === buyerId).sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
  if (!mine.length && !bought.length) {
    cardEmpty = buyerId;
    return;
  }
  const card = document.createElement('div');
  card.className = 'param-item wm-card';
  const title = document.createElement('h5');
  title.textContent = mine.length ? 'Покупал у вас' : 'Вы покупали у него';
  card.append(title);
  const line = (text: string, className = '') => {
    const node = document.createElement('div');
    node.className = `wm-card-line ${className}`.trim();
    node.textContent = text;
    card.append(node);
    return node;
  };
  const list = mine.length ? mine : bought;
  const currency = mainCurrency(list);
  const paid = list.filter((sale) => sale.status !== 'refunded' && sale.currency === currency);
  line(`${plural(list.length, 'заказ', 'заказа', 'заказов')} на ${formatMoney(paid.reduce((sum, sale) => sum + sale.amount, 0), currency)}`, 'wm-card-main');
  const refunds = list.filter((sale) => sale.status === 'refunded').length;
  if (refunds) {
    line(`Возвраты: ${refunds}`, 'wm-card-bad');
  }
  const open = list.filter((sale) => sale.status === 'paid').length;
  if (open) {
    line(`Открытые: ${open}`, 'wm-card-warn');
  }
  const first = list[list.length - 1];
  if (first?.at) {
    line(`Первый заказ ${shortDate(first.at)}`);
  }
  if (review?.rating) {
    line(`Отзыв ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`, review.rating <= 2 ? 'wm-card-bad' : '');
  }
  const links = document.createElement('div');
  links.className = 'wm-card-orders';
  for (const sale of list.slice(0, 4)) {
    const anchor = document.createElement('a');
    anchor.href = `${FUNPAY_ORIGIN}/orders/${sale.id}/`;
    anchor.textContent = `#${sale.id}`;
    anchor.title = `${sale.title}, ${formatMoney(sale.amount, sale.currency)}`;
    links.append(anchor);
  }
  card.append(links);
  const note = detail.querySelector('.wm-note');
  if (note) {
    note.after(card);
  } else {
    detail.prepend(card);
  }
}

function addBuyerNote() {
  const detail = document.querySelector('.chat-detail-list');
  const buyer = document.querySelector<HTMLAnchorElement>('.chat-header .media-user-name a');
  const buyerId = userIdFromHref(buyer?.getAttribute('href'));
  if (!detail || !buyerId) {
    return;
  }
  const blocks = [...detail.querySelectorAll<HTMLElement>('.wm-note')];
  if (blocks.length === 1 && blocks[0]!.dataset.user === buyerId) {
    return;
  }
  for (const old of blocks) {
    old.remove();
  }
  const block = document.createElement('div');
  block.className = 'param-item wm-note';
  block.dataset.user = buyerId;
  const title = document.createElement('h5');
  title.textContent = 'Заметка';
  const field = document.createElement('textarea');
  field.className = 'form-control wm-note-field';
  field.rows = 3;
  field.maxLength = 1000;
  field.placeholder = 'Видна только вам';
  field.setAttribute('aria-label', 'Заметка о собеседнике');
  let edited = false;
  let timer = 0;
  const save = async () => {
    const text = field.value.trim();
    const notes = { ...(await notesItem.getValue()) };
    const names = { ...(await noteNamesItem.getValue()) };
    if (text) {
      notes[buyerId] = text;
      names[buyerId] = buyer?.textContent?.trim() || names[buyerId] || '';
    } else {
      delete notes[buyerId];
      delete names[buyerId];
    }
    await notesItem.setValue(notes);
    await noteNamesItem.setValue(names);
  };
  field.addEventListener('input', () => {
    edited = true;
    clearTimeout(timer);
    timer = window.setTimeout(save, 500);
  });
  field.addEventListener('blur', () => {
    if (edited) {
      save();
    }
  });
  block.append(title, field);
  detail.prepend(block);
  notesItem.getValue().then((notes) => {
    if (!edited) {
      field.value = notes[buyerId] ?? '';
    }
  });
}

export default defineContentScript({
  matches: ['https://funpay.com/chat/*', 'https://funpay.com/en/chat/*', 'https://funpay.com/uk/chat/*'],
  runAt: 'document_idle',
  main() {
    const raw = document.body?.getAttribute('data-app-data');
    const myId = String(raw ? parseAppDataJson(raw)?.userId ?? '' : '');
    const run = () => {
      addContactTools();
      tidyPreviews();
      shortenTimes();
      if (myId) {
        markOwnMessages(myId);
      }
      keepAtBottom();
      captionImages();
      addBuyerNote();
      addBuyerCard(Number(myId));
      warnImpersonation(myId);
    };
    run();
    const root = document.querySelector('.chat-full') ?? document.body;
    let queued = false;
    new MutationObserver(() => {
      if (queued) {
        return;
      }
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        run();
      });
    }).observe(root, { childList: true, subtree: true });
  },
});
