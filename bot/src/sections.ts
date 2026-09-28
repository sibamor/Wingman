import type { ApplicationCommandOptionChoiceData } from 'discord.js';
import { resolveNodeId, sectionTitle, sections } from './funpay.ts';
import { normalize, short } from './ui.ts';

export async function sectionChoices(query: string): Promise<ApplicationCommandOptionChoiceData<string>[]> {
  const direct = resolveNodeId(query);
  const all = await sections().catch(() => []);
  if (direct) {
    const known = all.find((section) => section.nodeId === direct);
    return [{ name: known ? short(sectionTitle(known), 100) : `Раздел ${direct}`, value: direct }];
  }
  const words = normalize(query).split(' ').filter(Boolean);
  if (!words.length) {
    return [];
  }
  return all
    .map((section) => ({ section, haystack: normalize(`${section.game} ${section.name}`), game: normalize(section.game) }))
    .filter((item) => words.every((word) => item.haystack.includes(word)))
    .sort((a, b) => Number(b.game.startsWith(words[0]!)) - Number(a.game.startsWith(words[0]!)) || a.haystack.length - b.haystack.length)
    .slice(0, 25)
    .map((item) => ({ name: short(sectionTitle(item.section), 100), value: item.section.nodeId }));
}
