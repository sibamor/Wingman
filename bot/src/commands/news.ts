import { ApplicationIntegrationType, InteractionContextType, ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type Client } from 'discord.js';
import { guildConfig, save, state } from '../store.ts';
import { card, links, short, LINKS } from '../ui.ts';
import type { Command } from './types.ts';

type Release = { tag_name: string; name: string | null; body: string | null; html_url: string; published_at: string; draft: boolean; prerelease: boolean };

const POLL_EVERY = 30 * 60_000;

async function releases(): Promise<Release[]> {
  const response = await fetch('https://api.github.com/repos/sibamor/Wingman/releases?per_page=5', { headers: { accept: 'application/vnd.github+json', 'user-agent': 'WingmanBot' } });
  if (!response.ok) {
    throw new Error(`GitHub ответил ${response.status}`);
  }
  return ((await response.json()) as Release[]).filter((release) => !release.draft && !release.prerelease);
}

function releaseCard(release: Release) {
  const embed = card()
    .setTitle(release.name || `Wingman ${release.tag_name}`)
    .setURL(release.html_url)
    .setDescription(short((release.body ?? '').replace(/\r/g, ''), 3500) || null)
    .setTimestamp(new Date(release.published_at));
  return { embeds: [embed], components: [links(['Скачать', release.html_url], ['GitHub', LINKS.github])] };
}

export const news: Command = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('Новости Wingman: публиковать новые версии расширения в канал')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((sub) =>
      sub
        .setName('включить')
        .setDescription('Публиковать новости в канал')
        .addChannelOption((option) => option.setName('канал').setDescription('Канал для новостей').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
    )
    .addSubcommand((sub) => sub.setName('выключить').setDescription('Больше не публиковать новости'))
    .toJSON(),

  async execute(interaction) {
    if (!interaction.guildId) {
      return;
    }
    const config = guildConfig(interaction.guildId);
    if (interaction.options.getSubcommand() === 'выключить') {
      config.newsChannelId = null;
      save();
      return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Больше не публикую новости Wingman.' });
    }
    const channel = interaction.options.getChannel('канал', true);
    config.newsChannelId = channel.id;
    save();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const latest = (await releases().catch(() => []))[0];
    const target = await interaction.client.channels.fetch(channel.id).catch(() => null);
    const sent = Boolean(latest && target?.isSendable() && (await target.send(releaseCard(latest)).then(() => true, () => false)));
    return interaction.editReply(
      sent
        ? `Новые версии Wingman будут появляться в <#${channel.id}>. Последнюю я уже опубликовал.`
        : `Новые версии Wingman будут появляться в <#${channel.id}>. Проверьте, что у меня есть право писать в этот канал.`,
    );
  },
};

async function pollNews(client: Client) {
  const list = await releases();
  if (!list.length) {
    return;
  }
  if (!state.newsTag) {
    state.newsTag = list[0]!.tag_name;
    save();
    return;
  }
  const known = list.findIndex((release) => release.tag_name === state.newsTag);
  const fresh = (known < 0 ? list.slice(0, 1) : list.slice(0, known)).reverse();
  if (!fresh.length) {
    return;
  }
  state.newsTag = list[0]!.tag_name;
  save();
  for (const config of Object.values(state.guilds)) {
    if (!config.newsChannelId) {
      continue;
    }
    const channel = await client.channels.fetch(config.newsChannelId).catch(() => null);
    for (const release of fresh) {
      if (channel?.isSendable()) {
        await channel.send(releaseCard(release)).catch(() => null);
      }
    }
  }
}

export function startNews(client: Client) {
  const run = () => pollNews(client).catch((error) => console.error('news', error));
  setInterval(run, POLL_EVERY);
  setTimeout(run, 10_000);
}
