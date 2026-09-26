import '../assets/chat.css';
import { parseAppDataJson } from '../lib/funpay';
import { notesItem } from '../lib/storage';

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

async function addBuyerNote() {
  const detail = document.querySelector('.chat-detail-list');
  const buyerId = userIdFromHref(document.querySelector<HTMLAnchorElement>('.chat-header .media-user-name a')?.getAttribute('href'));
  if (!detail || !buyerId) {
    return;
  }
  let block = detail.querySelector<HTMLElement>('.wm-note');
  if (block?.dataset.user === buyerId) {
    return;
  }
  block?.remove();
  block = document.createElement('div');
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
  field.value = (await notesItem.getValue())[buyerId] ?? '';
  let timer = 0;
  const save = async () => {
    const notes = { ...(await notesItem.getValue()) };
    if (field.value.trim()) {
      notes[buyerId] = field.value.trim();
    } else {
      delete notes[buyerId];
    }
    await notesItem.setValue(notes);
  };
  field.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(save, 500);
  });
  field.addEventListener('blur', save);
  block.append(title, field);
  detail.prepend(block);
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
      addBuyerNote();
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
