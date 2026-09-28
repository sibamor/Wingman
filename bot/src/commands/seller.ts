import { ApplicationIntegrationType, InteractionContextType, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { NotFound, ORIGIN, profile, resolveUserId } from '../funpay.ts';
import { card, links, plural, short, stamp } from '../ui.ts';
import type { Command } from './types.ts';

export const seller: Command = {
  data: new SlashCommandBuilder()
    .setName('seller')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setDescription('Проверить продавца FunPay: рейтинг, отзывы, стаж, лоты')
    .addStringOption((option) => option.setName('продавец').setDescription('Ссылка на профиль или ID').setRequired(true).setMaxLength(200))
    .toJSON(),

  async execute(interaction) {
    const input = interaction.options.getString('продавец', true);
    const id = resolveUserId(input);
    if (!id) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Не нашёл такого продавца. Пришлите ссылку на профиль вида `https://funpay.com/users/123456/` или его ID.' });
    }
    await interaction.deferReply();
    let data;
    try {
      data = await profile(id);
    } catch (error) {
      return interaction.editReply(error instanceof NotFound ? `Профиля с ID \`${id}\` на FunPay нет.` : 'FunPay сейчас не отвечает, попробуйте через минуту.');
    }
    const url = `${ORIGIN}/users/${id}/`;
    const embed = card()
      .setTitle(data.name)
      .setURL(url)
      .setDescription(data.online ? '**Онлайн**' : `-# ${data.status || 'Не в сети'}`)
      .addFields(
        { name: 'Рейтинг', value: data.rating === null ? 'Нет оценок' : `**${data.rating} из 5**`, inline: true },
        { name: 'Отзывы', value: `**${data.reviewsCount.toLocaleString('ru-RU')}**`, inline: true },
        { name: 'На FunPay', value: data.registeredAt ? `с **${stamp(data.registeredAt, 'D')}**\n-# ${stamp(data.registeredAt, 'R')}` : 'Неизвестно', inline: true },
      );
    if (data.avatar) {
      embed.setThumbnail(data.avatar);
    }
    if (data.sections.length) {
      const top = [...data.sections].sort((a, b) => b.count - a.count).slice(0, 6);
      const lines = top.map((section, index) => `${index + 1}. [${short(section.name, 60)}](${section.url}) - ${plural(section.count, 'лот', 'лота', 'лотов')}`);
      if (data.sections.length > top.length) {
        lines.push(`-# и ещё ${plural(data.sections.length - top.length, 'раздел', 'раздела', 'разделов')}`);
      }
      embed.addFields({ name: `Лоты: ${data.offers.toLocaleString('ru-RU')} в ${plural(data.sections.length, 'разделе', 'разделах', 'разделах')}`, value: lines.join('\n') });
    } else {
      embed.addFields({ name: 'Лоты', value: 'Сейчас нет активных лотов' });
    }
    const reviews = data.reviews.filter((review) => review.text || review.rating).slice(0, 3);
    if (reviews.length) {
      embed.addFields({
        name: 'Последние отзывы',
        value: reviews
          .map((review) => `**${review.rating || '-'} из 5**${review.detail ? ` - ${short(review.detail, 60)}` : ''}${review.text ? `\n> ${short(review.text, 160)}` : ''}`)
          .join('\n'),
      });
    }
    embed.setFooter({ text: 'Данные с публичной страницы FunPay' }).setTimestamp(new Date());
    return interaction.editReply({ embeds: [embed], components: [links(['Открыть профиль', url])] });
  },
};
