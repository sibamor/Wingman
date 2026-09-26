import { el, link } from './format.ts';

export function button(className: string, text: string): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

export function segmented<T extends string>(items: { id: T; name: string }[], label: string, onPick: (id: T) => void): { root: HTMLElement; set: (id: T) => void; buttons: Map<T, HTMLButtonElement> } {
  const root = el('div', 'wm-ins-seg');
  root.setAttribute('role', 'tablist');
  root.setAttribute('aria-label', label);
  const buttons = new Map<T, HTMLButtonElement>();
  for (const item of items) {
    const option = button('wm-ins-seg-btn', item.name);
    option.setAttribute('role', 'tab');
    option.addEventListener('click', () => onPick(item.id));
    buttons.set(item.id, option);
    root.append(option);
  }
  return {
    root,
    buttons,
    set: (id) => {
      for (const [key, option] of buttons) {
        option.setAttribute('aria-selected', String(key === id));
      }
    },
  };
}

export function metric(label: string, value: string, sub = '', href = ''): HTMLElement {
  const root = href ? link('wm-ins-metric wm-ins-metric-link', '', href) : el('div', 'wm-ins-metric');
  if (href) {
    root.removeAttribute('target');
  }
  root.append(el('span', 'wm-ins-metric-label', label), el('span', 'wm-ins-metric-value', value));
  if (sub) {
    root.append(el('span', 'wm-ins-metric-sub', sub));
  }
  return root;
}

export function keyValue(label: string, value: string): HTMLElement {
  const row = el('div', 'wm-ins-kv');
  row.append(el('span', 'wm-ins-kv-label', label), el('span', 'wm-ins-kv-value', value));
  return row;
}

export function shortDate(at: number): string {
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '');
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${count.toLocaleString('ru-RU')} ${word}`;
}

