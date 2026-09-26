import '../assets/funpay-theme.css';
import '../assets/themes.css';
import '../assets/refresh.css';
import '../assets/refresh-global.css';
import '../assets/refresh-buyer.css';
import '../assets/refresh-seller.css';
import '../assets/refresh-responsive.css';
import '../assets/privacy.css';
import { applyLook, LOOK_CACHE_KEY, type Look } from '../lib/look';
import { privacyItem, refreshItem, themeItem } from '../lib/storage';

function readCache(): Look | null {
  try {
    const raw = localStorage.getItem(LOOK_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(look: Look) {
  try {
    localStorage.setItem(LOOK_CACHE_KEY, JSON.stringify(look));
  } catch {}
}

function commonTail(texts: string[]): string[] {
  const words = texts.map((text) => text.trim().split(/\s+/));
  const tail: string[] = [];
  for (let i = 1; ; i++) {
    const word = words[0]![words[0]!.length - i];
    if (!word || words.some((list) => list.length <= i || list[list.length - i] !== word)) {
      return tail;
    }
    tail.unshift(word);
  }
}

function shortenQuantityChips(enabled: boolean) {
  for (const box of document.querySelectorAll('.lot-field-radio-box')) {
    const buttons = [...box.querySelectorAll<HTMLButtonElement>('button.btn')].filter((button) => /^\d/.test(button.value));
    if (!enabled) {
      for (const button of buttons) {
        if (button.dataset.wmFull) {
          button.textContent = button.dataset.wmFull;
          delete button.dataset.wmFull;
          button.removeAttribute('title');
        }
      }
      continue;
    }
    if (buttons.length < 2 || buttons.some((button) => button.dataset.wmFull)) {
      continue;
    }
    const tail = commonTail(buttons.map((button) => button.textContent ?? ''));
    if (!tail.length) {
      continue;
    }
    for (const button of buttons) {
      const full = (button.textContent ?? '').trim();
      button.dataset.wmFull = full;
      button.title = full;
      button.textContent = full.split(/\s+/).slice(0, -tail.length).join(' ');
    }
  }
}

function trackHeaderHeight(root: HTMLElement) {
  const header = document.getElementById('header');
  if (!header) {
    return;
  }
  const update = () => root.style.setProperty('--wm-header-h', `${header.offsetHeight}px`);
  update();
  new ResizeObserver(update).observe(header);
}

export default defineContentScript({
  matches: ['https://funpay.com/*'],
  runAt: 'document_start',
  async main() {
    const root = document.documentElement;
    let look: Look = readCache() ?? { theme: 'default', refresh: true, privacy: false };
    applyLook(root, look);

    const onReady = (callback: () => void) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', callback, { once: true });
      } else {
        callback();
      }
    };

    const sync = async () => {
      look = { theme: await themeItem.getValue(), refresh: await refreshItem.getValue(), privacy: await privacyItem.getValue() };
      applyLook(root, look);
      writeCache(look);
      onReady(() => shortenQuantityChips(look.refresh));
    };

    themeItem.watch(sync);
    refreshItem.watch(sync);
    privacyItem.watch(sync);
    await sync();
    onReady(() => trackHeaderHeight(root));
  },
});
