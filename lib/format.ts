const NBSP = ' ';

export function formatIn(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 0) {
    return 'сейчас';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) {
    return `через ${rest}${NBSP}мин`;
  }
  return rest ? `через ${hours}${NBSP}ч ${rest}${NBSP}мин` : `через ${hours}${NBSP}ч`;
}

export function formatWhen(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return `в ${time}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `вчера в ${time}`;
  }
  return `${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} в ${time}`;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function link(className: string, text: string, href: string): HTMLAnchorElement {
  const node = el('a', className, text);
  node.href = href;
  node.target = '_blank';
  return node;
}
