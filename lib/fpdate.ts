const MSK = 3 * 3600_000;
const DAY = 86_400_000;

const MONTHS: Record<string, number> = {};
[
  ['января', 'январь', 'january', 'jan', 'січня', 'січень'],
  ['февраля', 'февраль', 'february', 'feb', 'лютого', 'лютий'],
  ['марта', 'март', 'march', 'mar', 'березня', 'березень'],
  ['апреля', 'апрель', 'april', 'apr', 'квітня', 'квітень'],
  ['мая', 'май', 'may', 'травня', 'травень'],
  ['июня', 'июнь', 'june', 'jun', 'червня', 'червень'],
  ['июля', 'июль', 'july', 'jul', 'липня', 'липень'],
  ['августа', 'август', 'august', 'aug', 'серпня', 'серпень'],
  ['сентября', 'сентябрь', 'september', 'sep', 'вересня', 'вересень'],
  ['октября', 'октябрь', 'october', 'oct', 'жовтня', 'жовтень'],
  ['ноября', 'ноябрь', 'november', 'nov', 'листопада', 'листопад'],
  ['декабря', 'декабрь', 'december', 'dec', 'грудня', 'грудень'],
].forEach((names, index) => {
  for (const name of names) {
    MONTHS[name] = index;
  }
});

export function mskDayStart(at: number): number {
  return Math.floor((at + MSK) / DAY) * DAY - MSK;
}

export function parseFunPayDate(text: string, now = Date.now()): number | null {
  const value = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const time = value.match(/(\d{1,2}):(\d{2})/);
  const hours = time ? Number(time[1]) : 0;
  const minutes = time ? Number(time[2]) : 0;
  const today = new Date(now + MSK);
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  let day = today.getUTCDate();
  if (/^(сегодня|today|сьогодні)/.test(value)) {
    return Date.UTC(year, month, day, hours, minutes) - MSK;
  }
  if (/^(вчера|yesterday|вчора)/.test(value)) {
    return Date.UTC(year, month, day - 1, hours, minutes) - MSK;
  }
  const dayFirst = value.match(/(\d{1,2}) ([a-zа-яёіїє]+)\.?(?:,? (\d{4}))?/);
  const monthFirst = value.match(/([a-zа-яёіїє]+)\.? (\d{1,2})(?!\d)(?:,? (\d{4}))?/);
  const monthYear = value.match(/([a-zа-яёіїє]+) (\d{4})/);
  let parsed: [number, number, string | undefined] | null = null;
  if (dayFirst && MONTHS[dayFirst[2]!] !== undefined) {
    parsed = [Number(dayFirst[1]), MONTHS[dayFirst[2]!]!, dayFirst[3]];
  } else if (monthFirst && MONTHS[monthFirst[1]!] !== undefined) {
    parsed = [Number(monthFirst[2]), MONTHS[monthFirst[1]!]!, monthFirst[3]];
  } else if (monthYear && MONTHS[monthYear[1]!] !== undefined) {
    parsed = [1, MONTHS[monthYear[1]!]!, monthYear[2]];
  }
  if (!parsed) {
    return null;
  }
  [day, month] = parsed;
  if (parsed[2]) {
    year = Number(parsed[2]);
  } else if (Date.UTC(year, month, day) > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + DAY) {
    year -= 1;
  }
  return Date.UTC(year, month, day, hours, minutes) - MSK;
}
