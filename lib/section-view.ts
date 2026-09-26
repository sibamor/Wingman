import { formatIn, formatWhen } from './format';
import type { SectionState } from './storage';

export type Tone = 'good' | 'bad' | 'muted';

export function whenText(section: SectionState, now: number, running: boolean, excluded: boolean): string {
  if (excluded) {
    return '';
  }
  if (running && section.nextAt <= now) {
    return 'поднимаю…';
  }
  return formatIn(section.nextAt - now);
}

export function noteText(section: SectionState): { text: string; tone: Tone } {
  if (section.status === 'error') {
    return { text: section.message, tone: 'bad' };
  }
  if (section.lastRaisedAt) {
    return { text: `Поднято ${formatWhen(section.lastRaisedAt)}`, tone: 'good' };
  }
  return { text: 'Ещё не поднимался', tone: 'muted' };
}
