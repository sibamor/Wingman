import { ApplicationIntegrationType, InteractionContextType, SlashCommandBuilder } from 'discord.js';
import { buyerPrice, sellerPrice } from '../../../lib/commission.ts';
import { card, links, money, LINKS } from '../ui.ts';
import type { Command } from './types.ts';

export const fee: Command = {
  data: new SlashCommandBuilder()
    .setName('fee')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setDescription('Калькулятор комиссии FunPay: сколько получит продавец и заплатит покупатель')
    .addNumberOption((option) => option.setName('цена').setDescription('Цена в рублях').setRequired(true).setMinValue(0.01))
    .addNumberOption((option) => option.setName('комиссия').setDescription('Процент комиссии раздела').setRequired(true).setMinValue(0).setMaxValue(100))
    .toJSON(),

  async execute(interaction) {
    const amount = interaction.options.getNumber('цена', true);
    const percent = interaction.options.getNumber('комиссия', true);
    const embed = card()
      .setTitle(`Комиссия ${percent}%`)
      .addFields(
        { name: `Ставите ${money(amount)}`, value: `покупатель заплатит **${money(buyerPrice(amount, percent))}**`, inline: true },
        { name: `Покупатель платит ${money(amount)}`, value: `вы получите **${money(sellerPrice(amount, percent))}**`, inline: true },
      )
      .setDescription('-# Точный процент раздела FunPay показывает только продавцу в редакторе лота. Wingman выводит его там рядом с ценой.');
    return interaction.reply({ embeds: [embed], components: [links(['Wingman на GitHub', LINKS.github])] });
  },
};
