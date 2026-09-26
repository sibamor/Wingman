export type ThemeId = 'default' | 'dark' | 'black' | 'oled' | 'midnight';

export const THEMES: { id: ThemeId; name: string; bg: string; surface: string; text: string }[] = [
  { id: 'default', name: 'FunPay', bg: '#ffffff', surface: '#f3f3f3', text: '#222222' },
  { id: 'dark', name: 'Тёмная', bg: '#16171b', surface: '#26282e', text: '#ececee' },
  { id: 'black', name: 'Чёрная', bg: '#0b0c0e', surface: '#1b1c20', text: '#f2f2f0' },
  { id: 'oled', name: 'OLED', bg: '#000000', surface: '#131313', text: '#ffffff' },
  { id: 'midnight', name: 'Midnight', bg: '#0d1321', surface: '#1a2440', text: '#e8edf7' },
];

export const LOOK_CACHE_KEY = 'wingman:look';

export type Look = { theme: ThemeId; refresh: boolean };

export function applyLook(root: HTMLElement, look: Look) {
  if (look.theme === 'default') {
    root.removeAttribute('data-wm-theme');
  } else {
    root.setAttribute('data-wm-theme', look.theme);
  }
  root.toggleAttribute('data-wm-refresh', look.refresh);
}
