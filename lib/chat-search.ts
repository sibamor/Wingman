import { normalize } from './auto-rules.ts';
import { chatHistory } from './fp-chat.ts';
import { readChats, saveChat, type ArchivedChat, type ArchivedMessage } from './history.ts';
import { plural } from './ins-ui.ts';

export const FIND_KEY = 'wingman:find';

const GAP = 700;
const DEEP_PAGES = 3;
const FRESH_FOR = 10 * 60_000;
const SHOWN = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Contact = { node: string; name: string; lastId: number };

type Hit = { chat: ArchivedChat; message: ArchivedMessage };

export type ChatSearch = { hits: Set<string>; update: () => void };

export function searchTerms(query: string): string[] {
  return normalize(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2)
    .map((word) => (word.length >= 6 ? word.slice(0, -2) : word.length >= 4 ? word.slice(0, -1) : word));
}

export function matchesTerms(text: string, terms: string[]): boolean {
  const value = normalize(text);
  return terms.length > 0 && terms.every((term) => value.includes(term));
}

function snippet(text: string, terms: string[]): (string | HTMLElement)[] {
  const lower = text.toLowerCase().replace(/ё/g, 'е');
  const ranges: [number, number][] = [];
  for (const term of terms) {
    let from = lower.indexOf(term);
    while (from >= 0) {
      const tail = lower.slice(from + term.length).match(/^[\p{L}\p{N}]*/u)?.[0].length ?? 0;
      ranges.push([from, from + term.length + tail]);
      from = lower.indexOf(term, from + term.length);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const first = ranges[0]?.[0] ?? 0;
  const start = Math.max(0, first - 50);
  const end = Math.min(text.length, Math.max(first + 140, start + 160));
  const parts: (string | HTMLElement)[] = [start ? '…' : ''];
  let at = start;
  for (const [from, to] of ranges) {
    if (from < at || to > end) {
      continue;
    }
    parts.push(text.slice(at, from));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(from, to);
    parts.push(mark);
    at = to;
  }
  parts.push(text.slice(at, end), end < text.length ? '…' : '');
  return parts;
}

export function mountChatSearch(userId: number, search: HTMLInputElement, anchor: HTMLElement, contacts: () => Contact[], onHits: () => void): ChatSearch {
  const box = document.createElement('div');
  box.className = 'wm-find';
  box.hidden = true;
  const head = document.createElement('div');
  head.className = 'wm-find-head';
  const title = document.createElement('span');
  title.className = 'wm-find-title';
  const status = document.createElement('span');
  status.className = 'wm-find-status';
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'wm-find-refresh';
  refresh.textContent = 'Обновить архив';
  head.append(title, status, refresh);
  const list = document.createElement('div');
  list.className = 'wm-find-list';
  box.append(head, list);
  anchor.after(box);

  const hits = new Set<string>();
  let chats: ArchivedChat[] | null = null;
  let updating = false;
  let updatedAt = 0;
  let timer = 0;

  const load = async () => {
    chats = await readChats(userId).catch(() => []);
    return chats;
  };

  const render = async () => {
    const query = normalize(search.value);
    const terms = searchTerms(query);
    hits.clear();
    if (query.length < 3 || !terms.length) {
      box.hidden = true;
      onHits();
      return;
    }
    const all = chats ?? (await load());
    const found: Hit[] = [];
    for (const chat of all) {
      for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
        const message = chat.messages[index]!;
        if (matchesTerms(message.text, terms)) {
          found.push({ chat, message });
          hits.add(chat.node);
        }
      }
    }
    found.sort((a, b) => b.message.id - a.message.id);
    box.hidden = false;
    title.textContent = found.length ? `В переписке: ${plural(found.length, 'совпадение', 'совпадения', 'совпадений')}` : 'В переписке ничего не найдено';
    status.textContent = updating ? status.textContent : all.length ? `сохранено ${plural(all.length, 'чат', 'чата', 'чатов')}` : 'чаты ещё не сохранены';
    list.replaceChildren(
      ...found.slice(0, SHOWN).map(({ chat, message }) => {
        const row = document.createElement('a');
        row.className = 'wm-find-row';
        row.href = `/chat/?node=${encodeURIComponent(chat.node)}`;
        const name = document.createElement('span');
        name.className = 'wm-find-name';
        name.textContent = message.author === userId ? `Вы, чат с ${chat.name}` : chat.name;
        const text = document.createElement('span');
        text.className = 'wm-find-text';
        text.append(...snippet(message.text, terms));
        row.append(name, text);
        row.addEventListener('click', () => {
          try {
            sessionStorage.setItem(FIND_KEY, JSON.stringify({ node: chat.node, query, id: message.id, at: Date.now() }));
          } catch {}
        });
        return row;
      }),
    );
    if (found.length > SHOWN) {
      const more = document.createElement('div');
      more.className = 'wm-find-more';
      more.textContent = `и ещё ${found.length - SHOWN}, уточните запрос`;
      list.append(more);
    }
    onHits();
  };

  const updateArchive = async (force: boolean) => {
    if (updating || (!force && Date.now() - updatedAt < FRESH_FOR)) {
      return;
    }
    updating = true;
    refresh.disabled = true;
    const stored = new Map((await load()).map((chat) => [chat.node, chat]));
    const queue = contacts().filter((contact) => {
      const known = stored.get(contact.node);
      return !known || (contact.lastId ? contact.lastId > known.lastId : force || Date.now() - known.at > FRESH_FOR);
    });
    for (const [index, contact] of queue.entries()) {
      status.textContent = `обновление: ${index + 1} из ${queue.length}`;
      try {
        const known = stored.get(contact.node);
        const byId = new Map((known?.messages ?? []).map((message) => [message.id, message]));
        let page = await chatHistory(contact.node);
        for (let depth = 0; ; depth += 1) {
          const fresh = page.filter((message) => !byId.has(message.id));
          for (const message of page) {
            byId.set(message.id, { id: message.id, author: message.author, text: message.text });
          }
          if (known || depth + 1 >= DEEP_PAGES || !page.length || !fresh.length) {
            break;
          }
          await sleep(GAP);
          page = await chatHistory(contact.node, String(Math.min(...page.map((message) => message.id))));
        }
        const messages = [...byId.values()].filter((message) => message.text).sort((a, b) => a.id - b.id);
        await saveChat(userId, { node: contact.node, name: contact.name || known?.name || '', lastId: Math.max(contact.lastId, ...messages.map((message) => message.id), 0), messages, at: Date.now() });
      } catch {}
      if (index < queue.length - 1) {
        await sleep(GAP);
      }
    }
    updating = false;
    updatedAt = Date.now();
    refresh.disabled = false;
    await load();
    status.textContent = '';
    render();
  };

  search.addEventListener('focus', () => updateArchive(false), { once: true });
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(render, 250);
  });
  refresh.addEventListener('click', () => updateArchive(true));
  return { hits, update: render };
}
