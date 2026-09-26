import '../assets/tools.css';
import { parseAppDataJson } from '../lib/funpay';
import { readAll } from '../lib/history';
import { templatesItem } from '../lib/storage';

const CHECK_ICON =
  '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z"/></svg>';

const COPY_ICON =
  '<svg viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M192,72V216a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V72a8,8,0,0,1,8-8H184A8,8,0,0,1,192,72Zm24-40H72a8,8,0,0,0,0,16H208V184a8,8,0,0,0,16,0V40A8,8,0,0,0,216,32Z"/></svg>';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function flash(node: HTMLElement, label: string, done: string) {
  node.classList.add('wm-done');
  node.setAttribute('aria-label', done);
  node.title = done;
  node.innerHTML = CHECK_ICON;
  setTimeout(() => {
    node.classList.remove('wm-done');
    node.setAttribute('aria-label', label);
    node.title = label;
    node.innerHTML = COPY_ICON;
  }, 1500);
}

function addCopyAll() {
  for (const list of document.querySelectorAll<HTMLElement>('ul.order-secrets-list')) {
    const values = [...list.querySelectorAll<HTMLElement>('a.btn-copy[data-copy]')].map((node) => node.dataset.copy ?? '');
    if (values.length < 2 || list.nextElementSibling?.classList.contains('wm-copy-all')) {
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-default wm-copy-all';
    button.textContent = `Скопировать всё (${values.length})`;
    button.addEventListener('click', async () => {
      if (await copyText(values.join('\n'))) {
        const text = button.textContent;
        button.textContent = 'Скопировано';
        setTimeout(() => (button.textContent = text), 1500);
      }
    });
    list.after(button);
  }
}

function addOrderIdCopy() {
  for (const cell of document.querySelectorAll<HTMLElement>('.tc-item .tc-order')) {
    if (cell.querySelector('.wm-copy-id')) {
      continue;
    }
    const id = (cell.textContent ?? '').trim().replace(/^#/, '');
    if (!/^[A-Z0-9]{6,}$/i.test(id)) {
      continue;
    }
    const label = `Скопировать номер ${id}`;
    const button = document.createElement('span');
    button.className = 'wm-copy-id';
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = COPY_ICON;
    const copy = async (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (await copyText(id)) {
        flash(button, label, 'Скопировано');
      }
    };
    button.addEventListener('click', copy);
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        copy(event);
      }
    });
    cell.append(button);
  }
}

function markFinanceSigns() {
  for (const cell of document.querySelectorAll<HTMLElement>('.tc-finance .tc-price')) {
    const text = (cell.textContent ?? '').trim();
    cell.classList.toggle('wm-income', text.startsWith('+'));
    cell.classList.toggle('wm-outcome', /^[-−–]/.test(text));
  }
}

let templates: string[] = [];

function counterpart(field: HTMLTextAreaElement): { id: string; name: string } {
  const scope = field.closest('.chat') ?? document;
  const link = scope.querySelector<HTMLAnchorElement>('.chat-header .media-user-name a') ?? document.querySelector<HTMLAnchorElement>('.chat-header .media-user-name a');
  return { id: link?.getAttribute('href')?.match(/\/users\/(\d+)/)?.[1] ?? '', name: link?.textContent?.trim() ?? '' };
}

async function lastOrder(buyerId: string): Promise<string> {
  const fromPage = location.pathname.match(/\/orders\/([A-Z0-9]{6,12})\/?$/)?.[1];
  if (fromPage) {
    return fromPage;
  }
  const raw = document.body.getAttribute('data-app-data');
  const userId = Number(raw ? parseAppDataJson(raw)?.userId ?? 0 : 0);
  if (!userId || !buyerId) {
    return '';
  }
  const sales = (await readAll(userId, 'sales').catch(() => [])).filter((sale) => sale.buyerId === buyerId).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return (sales.find((sale) => sale.status === 'paid') ?? sales[0])?.id ?? '';
}

async function fillVariables(field: HTMLTextAreaElement, text: string): Promise<string> {
  const who = counterpart(field);
  let result = text.replace(/\{buyer\}/g, who.name).replace(/\{myname\}/g, document.querySelector('.user-link-name')?.textContent?.trim() ?? '');
  if (result.includes('{order}')) {
    const order = await lastOrder(who.id);
    result = result.replace(/\{order\}/g, order ? `#${order}` : '');
  }
  return result.replace(/\s+([!?.,])/g, '$1').replace(/[ \t]{2,}/g, ' ');
}

async function insertTemplate(field: HTMLTextAreaElement, template: string, replaceSlash = false) {
  const text = await fillVariables(field, template);
  const base = replaceSlash ? field.value.replace(/(^|\n)\/[^\n]*$/, '$1') : field.value;
  field.value = base.trim() ? `${base.trimEnd()} ${text}` : text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

function renderTemplates() {
  for (const field of document.querySelectorAll<HTMLTextAreaElement>('.chat-form-input textarea[name="content"]')) {
    const holder = field.closest('.chat-form') ?? field.closest('.chat-form-input');
    if (!holder) {
      continue;
    }
    let row = holder.previousElementSibling?.classList.contains('wm-templates') ? (holder.previousElementSibling as HTMLElement) : null;
    const key = JSON.stringify(templates);
    if (row?.dataset.key === key) {
      continue;
    }
    row?.remove();
    if (!templates.length) {
      continue;
    }
    row = document.createElement('div');
    row.className = 'wm-templates';
    row.dataset.key = key;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'Шаблоны ответов');
    templates.forEach((text, index) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wm-template';
      chip.textContent = text;
      chip.title = index < 9 ? `${text}\nAlt+${index + 1}` : text;
      chip.addEventListener('click', () => insertTemplate(field, text));
      row!.append(chip);
    });
    holder.before(row);
    bindTemplateKeys(field);
  }
}

function bindTemplateKeys(field: HTMLTextAreaElement) {
  if (field.dataset.wmKeys) {
    return;
  }
  field.dataset.wmKeys = '1';
  const menu = document.createElement('ul');
  menu.className = 'wm-slash';
  menu.hidden = true;
  let active = 0;
  let shown: string[] = [];
  const holder = field.closest('.chat-form-input') ?? field.parentElement!;
  holder.classList.add('wm-slash-host');
  holder.append(menu);
  const close = () => {
    menu.hidden = true;
    shown = [];
  };
  const render = () => {
    const match = field.value.match(/(?:^|\n)\/([^\n]*)$/);
    if (!match || !templates.length) {
      close();
      return;
    }
    const query = match[1]!.toLowerCase();
    shown = templates.filter((text) => text.toLowerCase().includes(query)).slice(0, 8);
    if (!shown.length) {
      close();
      return;
    }
    active = Math.min(active, shown.length - 1);
    menu.replaceChildren(
      ...shown.map((text, index) => {
        const item = document.createElement('li');
        item.className = index === active ? 'wm-slash-item wm-slash-active' : 'wm-slash-item';
        item.textContent = text;
        item.addEventListener('mousedown', (event) => {
          event.preventDefault();
          insertTemplate(field, text, true);
          close();
        });
        return item;
      }),
    );
    menu.hidden = false;
  };
  field.addEventListener('input', () => {
    active = 0;
    render();
  });
  field.addEventListener('blur', () => setTimeout(close, 100));
  field.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey && !event.ctrlKey && /^Digit[1-9]$/.test(event.code)) {
        const text = templates[Number(event.code.slice(5)) - 1];
        if (text) {
          event.preventDefault();
          insertTemplate(field, text);
        }
        return;
      }
      if (menu.hidden) {
        return;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        active = (active + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        render();
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        event.stopImmediatePropagation();
        insertTemplate(field, shown[active]!, true);
        close();
      } else if (event.key === 'Escape') {
        close();
      }
    },
    true,
  );
}

function run() {
  renderTemplates();
  addCopyAll();
  addOrderIdCopy();
  markFinanceSigns();
}

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_idle',
  async main() {
    templates = await templatesItem.getValue();
    templatesItem.watch((value) => {
      templates = value;
      renderTemplates();
    });
    run();
    let pending = 0;
    new MutationObserver(() => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(run);
    }).observe(document.body, { childList: true, subtree: true });
  },
});
