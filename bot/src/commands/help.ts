import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { card, links, LINKS } from '../ui.ts';
import type { Command } from './types.ts';

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName('wingman')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setDescription('Что умеет бот Wingman')
    .toJSON(),

  async execute(interaction) {
    const embed = card()
      .setTitle('Wingman для FunPay')
      .setDescription(
        [
          '`/seller` - проверить продавца: рейтинг, отзывы, стаж, лоты',
          '`/price` - цены в разделе: минимум, медиана, самые дешёвые лоты',
          '`/watch` - сообщить о новых лотах не дороже заданной цены',
          '`/fee` - сколько получит продавец и заплатит покупатель',
          '',
          '**Для администраторов**',
          '`/protect` - защита от поддельных сайтов FunPay и «администрации FunPay»',
          '`/news` - новые версии расширения Wingman в выбранном канале',
          '',
          '-# Бот читает только публичные страницы FunPay. Расширение Wingman для браузера добавляет продавцу инструменты прямо на funpay.com.',
        ].join('\n'),
      );
    return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed], components: [links(['Расширение и код', LINKS.github], ['Сервер Wingman', LINKS.discord], ['Telegram', LINKS.telegram])] });
  },
};
