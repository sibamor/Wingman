import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Client } from 'discord.js';
import type { ListingOffer } from '../../../lib/fp-pages.ts';
import { listing, NotFound, ORIGIN, resolveNodeId } from '../funpay.ts';
import { sectionChoices } from '../sections.ts';
import { save, state, type Watch } from '../store.ts';
import { card, links, money, plural, short } from '../ui.ts';
import { matchesFilter } from './price.ts';
import type { Command } from './types.ts';

const USER_LIMIT = 5;
const GUILD_LIMIT = 25;
const SEEN_LIMIT = 500;
const POLL_EVERY = 10 * 60_000;

function cheaper(watch: Watch, offers: ListingOffer[]): ListingOffer[] {
  return offers.filter((offer) => offer.price <= watch.maxPrice && (!watch.filter || matchesFilter(offer, watch.filter)));
}

function describe(watch: Watch): string {
  const where = watch.channelId ? `в <#${watch.channelId}>` : 'в личные сообщения';
  return `[${short(watch.section, 70)}](${ORIGIN}/lots/${watch.nodeId}/) до **${money(watch.maxPrice)}**${watch.filter ? `, фильтр «${short(watch.filter, 40)}»` : ''}, ${where}`;
}

export const watch: Command = {
  data: new SlashCommandBuilder()
    .setName('watch')
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
    .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
    .setDescription('Сообщать о новых лотах в разделе FunPay не дороже заданной цены')
    .addSubcommand((sub) =>
      sub
        .setName('добавить')
        .setDescription('Следить за ценой в разделе')
        .addStringOption((option) => option.setName('раздел').setDescription('Игра и раздел, ссылка или ID раздела').setRequired(true).setAutocomplete(true))
        .addNumberOption((option) => option.setName('цена').setDescription('Сообщать о лотах не дороже этой цены, в рублях').setRequired(true).setMinValue(0.01))
        .addStringOption((option) => option.setName('фильтр').setDescription('Слова из параметров или названия лота').setMaxLength(80))
        .addStringOption((option) =>
          option.setName('куда').setDescription('Куда присылать уведомления').addChoices({ name: 'Мне в личные сообщения', value: 'dm' }, { name: 'В этот канал', value: 'channel' }),
        ),
    )
    .addSubcommand((sub) => sub.setName('список').setDescription('Мои подписки на цены'))
    .addSubcommand((sub) =>
      sub
        .setName('удалить')
        .setDescription('Перестать следить')
        .addStringOption((option) => option.setName('подписка').setDescription('Какую подписку удалить').setRequired(true).setAutocomplete(true)),
    )
    .toJSON(),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'раздел') {
      return interaction.respond(await sectionChoices(focused.value));
    }
    const mine = state.watches.filter((item) => item.userId === interaction.user.id);
    return interaction.respond(mine.slice(0, 25).map((item) => ({ name: short(`${item.section} до ${money(item.maxPrice)}`, 100), value: item.id })));
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'список') {
      const mine = state.watches.filter((item) => item.userId === interaction.user.id);
      const embed = card().setTitle('Подписки на цены').setDescription(mine.length ? mine.map((item, index) => `${index + 1}. ${describe(item)}`).join('\n') : 'Подписок нет. Добавьте командой `/watch добавить`.');
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
    }
    if (sub === 'удалить') {
      const id = interaction.options.getString('подписка', true);
      const index = state.watches.findIndex((item) => item.id === id && item.userId === interaction.user.id);
      if (index < 0) {
        return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Такой подписки у вас нет.' });
      }
      const [removed] = state.watches.splice(index, 1);
      save();
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Больше не слежу: ${describe(removed!)}` });
    }
    const nodeId = resolveNodeId(interaction.options.getString('раздел', true));
    const maxPrice = interaction.options.getNumber('цена', true);
    const filter = interaction.options.getString('фильтр') ?? '';
    const toChannel = interaction.options.getString('куда') === 'channel';
    if (!nodeId) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Выберите раздел из подсказок или пришлите ссылку вида `https://funpay.com/lots/1000/`.' });
    }
    if (toChannel && !interaction.guild) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Писать в канал могу только на серверах, куда добавлен бот Wingman. Выберите личные сообщения.' });
    }
    if (toChannel && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Присылать уведомления в канал могут только участники с правом «Управлять сообщениями». Выберите личные сообщения.' });
    }
    if (state.watches.filter((item) => item.userId === interaction.user.id).length >= USER_LIMIT) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `Можно следить не больше чем за ${USER_LIMIT} разделами. Удалите лишнее командой \`/watch удалить\`.` });
    }
    if (interaction.guildId && toChannel && state.watches.filter((item) => item.guildId === interaction.guildId && item.channelId).length >= GUILD_LIMIT) {
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: `На сервере уже ${GUILD_LIMIT} подписок с уведомлениями в каналы, больше нельзя.` });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let data;
    try {
      data = await listing(nodeId);
    } catch (error) {
      return interaction.editReply(error instanceof NotFound ? `Раздела \`${nodeId}\` на FunPay нет.` : 'FunPay сейчас не отвечает, попробуйте через минуту.');
    }
    const item: Watch = {
      id: Math.random().toString(36).slice(2, 8),
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: toChannel ? interaction.channelId : null,
      nodeId,
      section: data.title,
      maxPrice,
      filter,
      seen: [],
      failures: 0,
      createdAt: Date.now(),
    };
    const now = cheaper(item, data.offers);
    item.seen = now.map((offer) => offer.offerId).slice(0, SEEN_LIMIT);
    state.watches.push(item);
    save();
    const lines = [`Слежу: ${describe(item)}.`, 'Напишу, когда появится новый лот не дороже этой цены. Раздел проверяю раз в 10 минут.'];
    if (now.length) {
      lines.push(`\nСейчас таких уже ${plural(now.length, 'лот', 'лота', 'лотов')}, самый дешёвый - **${money(Math.min(...now.map((offer) => offer.price)), now[0]!.currency)}**. О них не напишу.`);
    }
    return interaction.editReply(lines.join('\n'));
  },
};

async function deliver(client: Client, item: Watch, offers: ListingOffer[]) {
  const embed = card()
    .setTitle(`До ${money(item.maxPrice)} - ${short(item.section, 180)}`)
    .setURL(`${ORIGIN}/lots/${item.nodeId}/`)
    .setDescription(
      offers
        .slice(0, 5)
        .map((offer) => `[**${money(offer.price, offer.currency)}**](${ORIGIN}/lots/offer?id=${offer.offerId}) - ${offer.userName}${offer.online ? '' : ' (не в сети)'}\n-# ${short(offer.title, 110)}`)
        .join('\n'),
    )
    .setFooter({ text: 'Удалить подписку: /watch удалить' })
    .setTimestamp(new Date());
  const payload = { embeds: [embed], components: [links(['Открыть раздел', `${ORIGIN}/lots/${item.nodeId}/`])] };
  if (item.channelId) {
    const channel = await client.channels.fetch(item.channelId);
    if (!channel?.isSendable()) {
      throw new Error('channel');
    }
    await channel.send(payload);
  } else {
    const user = await client.users.fetch(item.userId);
    await user.send(payload);
  }
}

export async function pollWatches(client: Client) {
  const nodes = [...new Set(state.watches.map((item) => item.nodeId))];
  for (const nodeId of nodes) {
    let data;
    try {
      data = await listing(nodeId);
    } catch {
      continue;
    }
    for (const item of state.watches.filter((entry) => entry.nodeId === nodeId)) {
      const fresh = cheaper(item, data.offers).filter((offer) => !item.seen.includes(offer.offerId));
      if (!fresh.length) {
        continue;
      }
      try {
        await deliver(client, item, fresh.sort((a, b) => a.price - b.price));
        item.failures = 0;
      } catch {
        item.failures += 1;
      }
      item.seen = [...fresh.map((offer) => offer.offerId), ...item.seen].slice(0, SEEN_LIMIT);
    }
  }
  state.watches = state.watches.filter((item) => item.failures < 3);
  save();
}

export function startWatches(client: Client) {
  const run = () => pollWatches(client).catch((error) => console.error('watch', error));
  setInterval(run, POLL_EVERY);
  setTimeout(run, 30_000);
}
