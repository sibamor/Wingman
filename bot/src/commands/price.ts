import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { ListingOffer } from '../../../lib/fp-pages.ts';
import { listing, NotFound, ORIGIN, resolveNodeId } from '../funpay.ts';
import { sectionChoices } from '../sections.ts';
import { card, links, median, money, normalize, plural, short } from '../ui.ts';
import type { Command } from './types.ts';

export function matchesFilter(offer: ListingOffer, filter: string): boolean {
  const words = normalize(filter).split(' ').filter(Boolean);
  const haystack = normalize(`${offer.filters.replace(/\w+=/g, ' ')} ${offer.title}`);
  return words.every((word) => haystack.includes(word));
}

function variantName(filters: string): string {
  return filters
    .split('|')
    .map((part) => part.split('=')[1] ?? '')
    .filter(Boolean)
    .join(', ');
}

export const price: Command = {
  data: new SlashCommandBuilder()
    .setName('price')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setDescription('Цены в разделе FunPay: минимум, медиана, самые дешёвые лоты')
    .addStringOption((option) => option.setName('раздел').setDescription('Игра и раздел, ссылка или ID раздела').setRequired(true).setAutocomplete(true))
    .addStringOption((option) => option.setName('фильтр').setDescription('Слова из параметров или названия лота, например «60 кристаллов»').setMaxLength(80))
    .toJSON(),

  autocomplete: async (interaction) => interaction.respond(await sectionChoices(interaction.options.getFocused())),

  async execute(interaction) {
    const nodeId = resolveNodeId(interaction.options.getString('раздел', true));
    const filter = interaction.options.getString('фильтр') ?? '';
    if (!nodeId) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Выберите раздел из подсказок или пришлите ссылку вида `https://funpay.com/lots/1000/`.' });
    }
    await interaction.deferReply();
    let data;
    try {
      data = await listing(nodeId);
    } catch (error) {
      return interaction.editReply(error instanceof NotFound ? `Раздела \`${nodeId}\` на FunPay нет.` : 'FunPay сейчас не отвечает, попробуйте через минуту.');
    }
    const url = `${ORIGIN}/lots/${nodeId}/`;
    const offers = filter ? data.offers.filter((offer) => matchesFilter(offer, filter)) : data.offers;
    const embed = card().setTitle(`Цены - ${short(data.title, 200)}`).setURL(url);
    if (!offers.length) {
      embed.setDescription(filter ? `По фильтру «${short(filter, 80)}» лотов нет.` : 'В разделе сейчас нет лотов.');
      return interaction.editReply({ embeds: [embed], components: [links(['Открыть раздел', url])] });
    }
    const currency = offers[0]!.currency;
    const prices = offers.map((offer) => offer.price);
    const sellers = new Set(offers.map((offer) => offer.userId));
    const online = new Set(offers.filter((offer) => offer.online).map((offer) => offer.userId));
    if (filter) {
      embed.setDescription(`-# Фильтр: ${short(filter, 80)}`);
    }
    embed.addFields(
      { name: 'Лотов', value: `**${offers.length.toLocaleString('ru-RU')}**`, inline: true },
      { name: 'Продавцов', value: `**${sellers.size.toLocaleString('ru-RU')}**\n-# онлайн ${online.size.toLocaleString('ru-RU')}`, inline: true },
      { name: 'Цена', value: `от **${money(Math.min(...prices), currency)}**\n-# медиана ${money(median(prices), currency)}`, inline: true },
    );
    const cheapest = [...offers].sort((a, b) => a.price - b.price || Number(b.online) - Number(a.online)).slice(0, 5);
    embed.addFields({
      name: 'Дешевле всего',
      value: cheapest
        .map((offer, index) => `${index + 1}. [**${money(offer.price, offer.currency)}**](${ORIGIN}/lots/offer?id=${offer.offerId}) - ${offer.userName}${offer.online ? '' : ' (не в сети)'}\n-# ${short(offer.title, 90)}`)
        .join('\n'),
    });
    const groups = new Map<string, number[]>();
    for (const offer of offers) {
      if (offer.filters) {
        groups.set(offer.filters, [...(groups.get(offer.filters) ?? []), offer.price]);
      }
    }
    if (!filter && groups.size > 1) {
      const top = [...groups].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
      embed.addFields({
        name: 'По вариантам',
        value: top.map(([key, list]) => `${short(variantName(key), 70)}: от **${money(Math.min(...list), currency)}**, ${plural(list.length, 'лот', 'лота', 'лотов')}`).join('\n'),
      });
    }
    embed.setFooter({ text: 'Цены для покупателя, с комиссией FunPay' }).setTimestamp(new Date());
    return interaction.editReply({ embeds: [embed], components: [links(['Открыть раздел', url])] });
  },
};
