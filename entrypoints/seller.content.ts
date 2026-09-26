import '../assets/tools.css';
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

function addPaidCounter() {
  if (!location.pathname.startsWith('/orders/trade')) {
    return;
  }
  const table = document.querySelector('.tc-item')?.closest('.tc');
  const paid = document.querySelectorAll('a.tc-item.info').length;
  if (!table || !paid || document.querySelector('.wm-paid-bar')) {
    return;
  }
  const bar = document.createElement('div');
  bar.className = 'wm-paid-bar';
  const count = document.createElement('span');
  count.className = 'wm-paid-count';
  count.textContent = `Ждут выдачи: ${paid}`;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn btn-default wm-paid-toggle';
  toggle.setAttribute('aria-pressed', 'false');
  toggle.textContent = 'Показать только их';
  toggle.addEventListener('click', () => {
    const on = document.documentElement.classList.toggle('wm-only-paid');
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = on ? 'Показать все' : 'Показать только их';
  });
  const copyIds = document.createElement('button');
  copyIds.type = 'button';
  copyIds.className = 'btn btn-default';
  copyIds.textContent = 'Скопировать номера';
  copyIds.addEventListener('click', async () => {
    const ids = [...document.querySelectorAll('a.tc-item.info .tc-order')].map((node) => (node.textContent ?? '').trim());
    if (await copyText(ids.join(' '))) {
      copyIds.textContent = 'Скопировано';
      setTimeout(() => (copyIds.textContent = 'Скопировать номера'), 1500);
    }
  });
  bar.append(count, toggle, copyIds);
  table.before(bar);
}

function markFinanceSigns() {
  for (const cell of document.querySelectorAll<HTMLElement>('.tc-finance .tc-price')) {
    const text = (cell.textContent ?? '').trim();
    cell.classList.toggle('wm-income', text.startsWith('+'));
    cell.classList.toggle('wm-outcome', /^[-−–]/.test(text));
  }
}

let templates: string[] = [];

function insertTemplate(field: HTMLTextAreaElement, text: string) {
  field.value = field.value.trim() ? `${field.value.trimEnd()} ${text}` : text;
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
    for (const text of templates) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'wm-template';
      chip.textContent = text;
      chip.title = text;
      chip.addEventListener('click', () => insertTemplate(field, text));
      row.append(chip);
    }
    holder.before(row);
  }
}

function run() {
  renderTemplates();
  addCopyAll();
  addOrderIdCopy();
  addPaidCounter();
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
