import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { formatMoney, type Currency } from '../../lib/money.ts';

export const BRAND = 0xffc21a;
export const DANGER = 0xe5484d;

export const LINKS = {
  github: 'https://github.com/sibamor/Wingman',
  discord: 'https://discord.gg/spKJKAcuTc',
  telegram: 'https://t.me/wingman_funpay',
};

export function card(): EmbedBuilder {
  return new EmbedBuilder().setColor(BRAND);
}

export function links(...items: [string, string][]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(items.map(([label, url]) => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url)));
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${count.toLocaleString('ru-RU')} ${word}`;
}

export function money(amount: number, currency: Currency = 'RUB'): string {
  return formatMoney(amount, currency);
}

export function short(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function stamp(at: number, style: 'd' | 'D' | 'f' | 'R' = 'D'): string {
  return `<t:${Math.floor(at / 1000)}:${style}>`;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
