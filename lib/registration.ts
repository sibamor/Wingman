import { parseFunPayDate } from './fpdate.ts';
import { decodeHtml } from './funpay.ts';

export const YOUNG_ACCOUNT_DAYS = 7;
const DAY = 86_400_000;

export function registrationFromLines(lines: string[], now = Date.now()): number | null {
  for (const line of lines) {
    const at = parseFunPayDate(line, now);
    if (at !== null) {
      return at;
    }
  }
  return null;
}

export function parseRegistration(html: string, now = Date.now()): number | null {
  const header = html.indexOf('class="profile-header');
  const start = header < 0 ? -1 : html.indexOf('class="param-item', header);
  if (start < 0) {
    return null;
  }
  const next = html.indexOf('class="param-item', start + 1);
  const block = html.slice(start, next < 0 ? start + 1000 : Math.min(next, start + 1000));
  const text = block
    .replace(/^[^>]*>/, '')
    .replace(/<br\s*\/?>|<\/(?:div|h5)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  const lines = decodeHtml(text)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return registrationFromLines(lines, now);
}

export function isYoungAccount(registeredAt: number, now = Date.now()): boolean {
  return now - registeredAt < YOUNG_ACCOUNT_DAYS * DAY;
}
