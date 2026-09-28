import { ApplicationIntegrationType, InteractionContextType, ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Message } from 'discord.js';
import { claimsToBeFunPay, findLinks, lookalikeLink } from '../../../lib/scam.ts';
import { guildConfig, save, type ScamMode } from '../store.ts';
import { card, DANGER, short } from '../ui.ts';
import type { Command } from './types.ts';

const MODE_TEXT: Record<ScamMode, string> = {
  off: 'Защита выключена.',
  flag: 'Защита включена: предупреждаю ответом на подозрительные сообщения.',
  delete: 'Защита включена: удаляю подозрительные сообщения.',
};

export function scamReasons(content: string): string[] {
  const hosts = [...new Set(findLinks(content).map((link) => lookalikeLink(link)).filter((host): host is string => Boolean(host)))];
  const reasons = hosts.map((host) => `Ссылка ведёт на \`${host}\`, а не на funpay.com.`);
  if (claimsToBeFunPay(content)) {
    reasons.push('Автор выдаёт себя за администрацию FunPay. Настоящая поддержка FunPay не пишет в Discord и не просит перейти по ссылке или подтвердить аккаунт.');
  }
  return reasons;
}

export const protect: Command = {
  data: new SlashCommandBuilder()
    .setName('protect')
    .setDescription('Защита от мошенников: поддельные сайты FunPay и «администрация FunPay»')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((option) =>
      option
        .setName('режим')
        .setDescription('Что делать с подозрительным сообщением')
        .setRequired(true)
        .addChoices({ name: 'Предупреждать ответом', value: 'flag' }, { name: 'Удалять', value: 'delete' }, { name: 'Выключить', value: 'off' }),
    )
    .addChannelOption((option) => option.setName('журнал').setDescription('Куда пересылать найденные сообщения').addChannelTypes(ChannelType.GuildText))
    .toJSON(),

  async execute(interaction) {
    if (!interaction.guildId) {
      return;
    }
    const config = guildConfig(interaction.guildId);
    config.scam = interaction.options.getString('режим', true) as ScamMode;
    const log = interaction.options.getChannel('журнал');
    if (log) {
      config.logChannelId = log.id;
    }
    save();
    const lines = [MODE_TEXT[config.scam]];
    if (config.scam !== 'off') {
      lines.push(config.logChannelId ? `Найденные сообщения - в <#${config.logChannelId}>.` : 'Журнал не выбран - предупреждения только в чате.');
    }
    return interaction.reply({ flags: MessageFlags.Ephemeral, content: lines.join('\n') });
  },
};

export async function guardMessage(message: Message) {
  if (!message.inGuild() || message.author.bot || !message.content) {
    return;
  }
  const config = guildConfig(message.guildId);
  if (config.scam === 'off') {
    return;
  }
  const reasons = scamReasons(message.content);
  if (!reasons.length) {
    return;
  }
  const warning = card().setColor(DANGER).setTitle('Осторожно: похоже на мошенников').setDescription(reasons.join('\n')).setFooter({ text: 'Настоящий FunPay только на funpay.com' });
  let deleted = false;
  if (config.scam === 'delete' && message.deletable) {
    deleted = await message.delete().then(() => true, () => false);
  }
  if (deleted) {
    await message.channel.send({ content: `Сообщение от <@${message.author.id}> удалено.`, embeds: [warning], allowedMentions: { parse: [] } }).catch(() => null);
  } else {
    await message.reply({ embeds: [warning], allowedMentions: { repliedUser: false } }).catch(() => null);
  }
  if (config.logChannelId) {
    const log = await message.client.channels.fetch(config.logChannelId).catch(() => null);
    if (log?.isSendable()) {
      const entry = card()
        .setColor(DANGER)
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setTitle(deleted ? 'Удалено подозрительное сообщение' : 'Подозрительное сообщение')
        .setDescription(`> ${short(message.content, 900).replace(/\n/g, '\n> ')}`)
        .addFields({ name: 'Почему', value: reasons.join('\n') }, { name: 'Где', value: deleted ? `<#${message.channelId}>` : `[перейти](${message.url})`, inline: true })
        .setTimestamp(new Date());
      await log.send({ embeds: [entry], allowedMentions: { parse: [] } }).catch(() => null);
    }
  }
  save();
}
