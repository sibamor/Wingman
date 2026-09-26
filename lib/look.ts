export type ThemeId = 'default' | 'dark' | 'black' | 'oled' | 'midnight';

export const THEMES: { id: ThemeId; name: string; bg: string; surface: string; text: string }[] = [
  { id: 'default', name: 'FunPay', bg: '#ffffff', surface: '#f3f3f3', text: '#222222' },
  { id: 'dark', name: 'Тёмная', bg: '#1c1d21', surface: '#2a2c31', text: '#ececee' },
  { id: 'black', name: 'Чёрная', bg: '#121316', surface: '#1f2024', text: '#f2f2f0' },
  { id: 'oled', name: 'OLED', bg: '#000000', surface: '#111111', text: '#ffffff' },
  { id: 'midnight', name: 'Midnight', bg: '#111a2e', surface: '#1c2744', text: '#e8edf7' },
];

export const LOOK_CACHE_KEY = 'wingman:look';

export type Look = { theme: ThemeId; refresh: boolean; privacy: boolean };

export function applyLook(root: HTMLElement, look: Look) {
  if (look.theme === 'default') {
    root.removeAttribute('data-wm-theme');
  } else {
    root.setAttribute('data-wm-theme', look.theme);
  }
  root.toggleAttribute('data-wm-refresh', look.refresh);
  root.toggleAttribute('data-wm-privacy', Boolean(look.privacy));
}
