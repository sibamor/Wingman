import '../assets/chat.css';
import { claimsToBeFunPay, lookalikeLink } from '../lib/scam';
import { FIND_KEY, matchesTerms, mountChatSearch, searchTerms, type ChatSearch } from '../lib/chat-search';
import { FUNPAY_ORIGIN, parseAppDataJson } from '../lib/funpay';
import { readAll } from '../lib/history';
import { plural, shortDate } from '../lib/ins-ui';
import { formatMoney } from '../lib/money';
import { mainCurrency } from '../lib/stats';
import { canTranslate, detectLanguage, fromLanguage, translate, TranslateError } from '../lib/translate';
import { blacklistItem, chatMarksItem, noteNamesItem, notesItem, translateAutoItem, type BlacklistEntry, type ChatMarks } from '../lib/storage';

function userIdFromHref(href: string | null | undefined): string | null {
  return href?.match(/\/users\/(\d+)\//)?.[1] ?? null;
}

const TAGS = [
  { id: 'regular', name: 'Постоянный' },
  { id: 'problem', name: 'Проблемный' },
  { id: 'important', name: 'Важный' },
];

type Marks = ChatMarks;
let marks: Marks = { pinned: [], tags: {} };
let blacklist: Record<string, BlacklistEntry> = {};

function contactName(item: HTMLElement): string {
  const name = item.querySelector('.media-user-name');
  return [...(name?.childNodes ?? [])].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())?.textContent?.trim() ?? '';
}
const markListeners = new Set<() => void>();

function setMarks(next: Marks) {
  marks = next;
  chatMarksItem.setValue(next);
  for (const listener of markListeners) {
    listener();
  }
}

type ContactFilter = 'all' | 'unread' | 'paid' | 'pinned' | 'tagged';

function addContactTools(myId: number) {
  const contacts = document.querySelector('.chat-contacts');
  const list = contacts?.querySelector<HTMLElement>('.contact-list');
  if (!contacts || !list || contacts.querySelector('.wm-contact-tools')) {
    return;
  }
  const tools = document.createElement('div');
  tools.className = 'wm-contact-tools';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'form-control wm-contact-search';
  search.placeholder = 'Ник или слова из переписки';
  search.setAttribute('aria-label', 'Поиск по диалогам и переписке');
  let finder: ChatSearch | null = null;
  const chips = document.createElement('div');
  chips.className = 'wm-contact-chips';
  let filter: ContactFilter = 'all';
  const defs: { id: ContactFilter; name: string }[] = [
    { id: 'unread', name: 'Непрочитанные' },
    { id: 'paid', name: 'Оплатили' },
    { id: 'pinned', name: 'Закреплённые' },
    { id: 'tagged', name: 'С меткой' },
  ];
  const buttons = defs.map((def) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'wm-contact-unread';
    chip.textContent = def.name;
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      filter = filter === def.id ? 'all' : def.id;
      for (const item of buttons) {
        item.chip.setAttribute('aria-pressed', String(item.def.id === filter));
      }
      apply();
    });
    chips.append(chip);
    return { def, chip };
  });
  const empty = document.createElement('div');
  empty.className = 'wm-contact-empty';
  empty.hidden = true;
  const matches = (item: HTMLElement) => {
    const node = item.getAttribute('data-id') ?? '';
    const preview = item.querySelector('.contact-item-message')?.textContent ?? '';
    switch (filter) {
      case 'unread':
        return item.classList.contains('unread');
      case 'paid':
        return /оплатил|paid for|оплатив/i.test(preview);
      case 'pinned':
        return marks.pinned.includes(node);
      case 'tagged':
        return Boolean(marks.tags[node]);
      default:
        return true;
    }
  };
  const apply = () => {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    const items = [...list.querySelectorAll<HTMLElement>('a.contact-item')];
    const blocked = new Set(Object.values(blacklist).map((entry) => entry.name.toLowerCase()));
    for (const item of items) {
      const node = item.getAttribute('data-id') ?? '';
      const black = blocked.has(contactName(item).toLowerCase());
      if (item.classList.contains('wm-blacklisted') !== black) {
        item.classList.toggle('wm-blacklisted', black);
      }
      const found = (item.textContent?.toLowerCase() ?? '').includes(query) || Boolean(finder?.hits.has(node));
      const hidden = (query && !found) || !matches(item);
      if (item.classList.contains('wm-hidden') !== Boolean(hidden)) {
        item.classList.toggle('wm-hidden', Boolean(hidden));
      }
      shown += hidden ? 0 : 1;
      const pinned = marks.pinned.includes(node);
      if (item.classList.contains('wm-pinned') !== pinned) {
        item.classList.toggle('wm-pinned', pinned);
      }
      const tag = marks.tags[node]?.tag ?? '';
      const badge = item.querySelector<HTMLElement>('.wm-contact-tag');
      if ((badge?.dataset.tag ?? '') !== tag) {
        badge?.remove();
        const name = TAGS.find((item) => item.id === tag)?.name;
        if (name) {
          const node2 = document.createElement('span');
          node2.className = `wm-contact-tag wm-tag-${tag}`;
          node2.dataset.tag = tag;
          node2.textContent = name;
          item.querySelector('.media-user-name')?.append(node2);
        }
      }
    }
    const pinnedItems = marks.pinned.map((node) => items.find((item) => item.getAttribute('data-id') === node)).filter((item): item is HTMLElement => Boolean(item));
    const inPlace = pinnedItems.every((item, index) => list.children[index] === item);
    if (!inPlace) {
      for (const item of [...pinnedItems].reverse()) {
        list.prepend(item);
      }
    }
    const text = filter === 'unread' && !query ? 'Непрочитанных нет' : 'Ничего не найдено';
    if (empty.hidden !== shown > 0) {
      empty.hidden = shown > 0;
    }
    if (empty.textContent !== text) {
      empty.textContent = text;
    }
  };
  search.addEventListener('input', apply);
  markListeners.add(apply);
  new MutationObserver(apply).observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  tools.append(search, chips);
  list.before(tools);
  tools.after(empty);
  if (myId) {
    finder = mountChatSearch(
      myId,
      search,
      tools,
      () =>
        [...list.querySelectorAll<HTMLElement>('a.contact-item')].map((item) => ({
          node: item.getAttribute('data-id') ?? '',
          name: contactName(item),
          lastId: Number(item.getAttribute('data-node-msg')) || 0,
        })).filter((contact) => contact.node),
      apply,
    );
  }
  apply();
}

let translateAuto = true;
let translateQueue: Promise<void> = Promise.resolve();

function updateChatLanguage() {
  const chat = document.querySelector<HTMLElement>('.chat');
  if (!chat) {
    return;
  }
  const latest = [...document.querySelectorAll<HTMLElement>('.chat-message-list .chat-msg-item[data-wm-lang]')].reverse().find((item) => item.dataset.wmLang !== 'und');
  const lang = latest && latest.dataset.wmLang !== 'ru' ? latest.dataset.wmLang! : '';
  if ((chat.dataset.wmLang ?? '') !== lang) {
    if (lang) {
      chat.dataset.wmLang = lang;
    } else {
      delete chat.dataset.wmLang;
    }
  }
}

function translationBox(lang: string, text: string): HTMLElement {
  const box = document.createElement('div');
  box.className = 'wm-translation';
  const label = document.createElement('span');
  label.className = 'wm-tr-label';
  label.textContent = `Перевод с ${fromLanguage(lang)}`;
  const body = document.createElement('span');
  body.className = 'wm-tr-text';
  body.textContent = text;
  box.append(label, body);
  return box;
}

function translateButton(textNode: HTMLElement, text: string, lang: string): HTMLButtonElement {
  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'wm-tr-button';
  const idle = `Перевести с ${fromLanguage(lang)}`;
  action.textContent = idle;
  action.addEventListener('click', async () => {
    action.disabled = true;
    action.textContent = 'Перевожу…';
    try {
      const result = await translate(text, 'ru', { source: lang, onProgress: (percent) => (action.textContent = `Скачиваю переводчик ${percent}%`) });
      action.replaceWith(translationBox(lang, result));
    } catch (error) {
      action.disabled = false;
      action.textContent = error instanceof Error ? error.message : 'Не удалось перевести';
      setTimeout(() => {
        if (!action.disabled) {
          action.textContent = idle;
        }
      }, 4000);
    }
  });
  return action;
}

async function translateMessage(item: HTMLElement, textNode: HTMLElement, text: string) {
  const lang = await detectLanguage(text);
  item.dataset.wmLang = lang;
  updateChatLanguage();
  if (lang === 'ru' || lang === 'und' || !item.isConnected) {
    return;
  }
  if (translateAuto) {
    try {
      const result = await translate(text, 'ru', { source: lang });
      if (item.isConnected && !item.querySelector('.wm-translation')) {
        textNode.after(translationBox(lang, result));
      }
      return;
    } catch (error) {
      if (!(error instanceof TranslateError && error.needsClick)) {
        return;
      }
    }
  }
  if (item.isConnected && !item.querySelector('.wm-translation, .wm-tr-button')) {
    textNode.after(translateButton(textNode, text, lang));
  }
}

function addTranslateButtons(myId: string) {
  if (!canTranslate()) {
    return;
  }
  let own = false;
  let system = false;
  for (const item of document.querySelectorAll<HTMLElement>('.chat-message-list .chat-msg-item')) {
    if (item.classList.contains('chat-msg-with-head')) {
      own = userIdFromHref(item.querySelector<HTMLAnchorElement>('a.chat-msg-author-link')?.getAttribute('href')) === myId;
      system = !item.querySelector('a.chat-msg-author-link') || Boolean(item.querySelector('.chat-msg-author-label'));
    }
    if (own || system || item.dataset.wmTr) {
      continue;
    }
    item.dataset.wmTr = '1';
    const textNode = item.querySelector<HTMLElement>('.chat-msg-text');
    const text = textNode?.textContent?.trim() ?? '';
    if (!textNode || text.replace(/[^\p{L}]/gu, '').length < 3) {
      continue;
    }
    translateQueue = translateQueue.then(() => translateMessage(item, textNode, text)).catch(() => {});
  }
}

let marksRender: (() => void) | null = null;

function addChatMarks() {
  const detail = document.querySelector('.chat-detail-list');
  const node = document.querySelector('.chat')?.getAttribute('data-id') ?? '';
  const name = document.querySelector('.chat-header .media-user-name a')?.textContent?.trim() ?? '';
  if (!detail || !node) {
    return;
  }
  let box = detail.querySelector<HTMLElement>('.wm-marks');
  if (box?.dataset.node === node) {
    return;
  }
  box?.remove();
  box = document.createElement('div');
  box.className = 'param-item wm-marks';
  box.dataset.node = node;
  const title = document.createElement('h5');
  title.textContent = 'Метка';
  const row = document.createElement('div');
  row.className = 'wm-marks-row';
  const render = () => {
    row.replaceChildren();
    for (const tag of TAGS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `wm-mark wm-tag-${tag.id}`;
      chip.textContent = tag.name;
      chip.setAttribute('aria-pressed', String(marks.tags[node]?.tag === tag.id));
      chip.addEventListener('click', () => {
        const tags = { ...marks.tags };
        if (tags[node]?.tag === tag.id) {
          delete tags[node];
        } else {
          tags[node] = { tag: tag.id, name };
        }
        setMarks({ ...marks, tags });
      });
      row.append(chip);
    }
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'wm-mark wm-pin';
    const pinned = marks.pinned.includes(node);
    pin.textContent = pinned ? 'Открепить' : 'Закрепить';
    pin.setAttribute('aria-pressed', String(pinned));
    pin.addEventListener('click', () => {
      setMarks({ ...marks, pinned: pinned ? marks.pinned.filter((item) => item !== node) : [...marks.pinned, node] });
    });
    row.append(pin);
    const buyerId = userIdFromHref(document.querySelector('.chat-header .media-user-name a')?.getAttribute('href'));
    if (buyerId) {
      const listed = Boolean(blacklist[buyerId]);
      const black = document.createElement('button');
      black.type = 'button';
      black.className = 'wm-mark wm-black';
      black.textContent = listed ? 'Убрать из чёрного списка' : 'В чёрный список';
      black.setAttribute('aria-pressed', String(listed));
      black.title = listed ? '' : 'Его сообщения и заказы всегда приходят уведомлением, автоответы ему не уходят';
      black.addEventListener('click', () => {
        const next = { ...blacklist };
        if (listed) {
          delete next[buyerId];
        } else {
          next[buyerId] = { name, at: Date.now() };
        }
        blacklistItem.setValue(next);
      });
      row.append(black);
    }
  };
  if (marksRender) {
    markListeners.delete(marksRender);
  }
  marksRender = render;
  markListeners.add(render);
  render();
  box.append(title, row);
  detail.prepend(box);
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

function beforeForm(node: HTMLElement): boolean {
  const form = document.querySelector('.chat-form');
  if (!form) {
    return false;
  }
  const templates = form.previousElementSibling?.classList.contains('wm-templates') ? form.previousElementSibling : null;
  (templates ?? form).before(node);
  return true;
}

function revealFound() {
  let find: { node: string; query: string; id: number; at: number } | null = null;
  try {
    find = JSON.parse(sessionStorage.getItem(FIND_KEY) ?? 'null');
  } catch {}
  const node = document.querySelector('.chat')?.getAttribute('data-id') ?? '';
  const items = [...document.querySelectorAll<HTMLElement>('.chat-message-list .chat-msg-item')];
  if (!find || find.node !== node || !items.length) {
    return;
  }
  try {
    sessionStorage.removeItem(FIND_KEY);
  } catch {}
  if (Date.now() - find.at > 60_000) {
    return;
  }
  const target = document.getElementById(`message-${find.id}`) ?? [...items].reverse().find((item) => matchesTerms(item.querySelector('.chat-msg-text')?.textContent ?? '', searchTerms(find!.query)));
  if (target) {
    stick = false;
    target.classList.add('wm-find-hit');
    for (const delay of [0, 150, 500, 1000]) {
      setTimeout(() => {
        stick = false;
        target.scrollIntoView({ block: 'center' });
      }, delay);
    }
    return;
  }
  const note = document.createElement('div');
  note.className = 'wm-find-miss';
  note.textContent = 'Сообщение ещё не загружено, прокрутите чат вверх';
  if (beforeForm(note)) {
    setTimeout(() => note.remove(), 8000);
  }
}

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
    const claim = claimsToBeFunPay(text);
    if (!claim && ![...links, ...plain].some((href) => lookalikeLink(href, location.href))) {
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

function addBlacklistBanner() {
  const form = document.querySelector('.chat-form');
  const buyerId = userIdFromHref(document.querySelector('.chat-header .media-user-name a')?.getAttribute('href')) ?? '';
  const entry = blacklist[buyerId];
  const banner = document.querySelector<HTMLElement>('.wm-black-banner');
  if (!form || !entry) {
    banner?.remove();
    return;
  }
  if (banner?.dataset.user === buyerId) {
    return;
  }
  banner?.remove();
  const box = document.createElement('div');
  box.className = 'wm-black-banner';
  box.dataset.user = buyerId;
  box.textContent = `В чёрном списке с ${shortDate(entry.at)}`;
  beforeForm(box);
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
  async main() {
    const raw = document.body?.getAttribute('data-app-data');
    const myId = String(raw ? parseAppDataJson(raw)?.userId ?? '' : '');
    const run = () => {
      addContactTools(Number(myId));
      addChatMarks();
      tidyPreviews();
      shortenTimes();
      if (myId) {
        markOwnMessages(myId);
      }
      keepAtBottom();
      revealFound();
      captionImages();
      addBuyerNote();
      addBlacklistBanner();
      addBuyerCard(Number(myId));
      warnImpersonation(myId);
      addTranslateButtons(myId);
    };
    marks = await chatMarksItem.getValue();
    translateAuto = await translateAutoItem.getValue();
    translateAutoItem.watch((value) => (translateAuto = value));
    blacklist = await blacklistItem.getValue();
    blacklistItem.watch((value) => {
      blacklist = value;
      for (const listener of markListeners) {
        listener();
      }
      addBlacklistBanner();
    });
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
