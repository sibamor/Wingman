import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { fee } from './commands/fee.ts';
import { help } from './commands/help.ts';
import { news, startNews } from './commands/news.ts';
import { price } from './commands/price.ts';
import { guardMessage, protect } from './commands/protect.ts';
import { seller } from './commands/seller.ts';
import type { Command } from './commands/types.ts';
import { startWatches, watch } from './commands/watch.ts';
import { sections } from './funpay.ts';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Нет DISCORD_TOKEN в .env');
  process.exit(1);
}

const commands = new Map<string, Command>([seller, price, watch, fee, protect, news, help].map((command) => [command.data.name, command]));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, async (ready) => {
  const body = [...commands.values()].map((command) => command.data);
  const devGuild = process.env.DEV_GUILD_ID;
  if (devGuild) {
    await ready.application.commands.set(body, devGuild);
  } else {
    await ready.application.commands.set(body);
  }
  ready.user.setActivity({ name: 'funpay.com', type: ActivityType.Watching });
  console.log(`Wingman запущен как ${ready.user.tag}, серверов: ${ready.guilds.cache.size}, команды: ${devGuild ? `сервер ${devGuild}` : 'глобально'}`);
  sections().catch((error) => console.error('sections', error));
  startWatches(ready);
  startNews(ready);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    await commands.get(interaction.commandName)?.autocomplete?.(interaction).catch(() => interaction.respond([]).catch(() => null));
    return;
  }
  if (!interaction.isChatInputCommand()) {
    return;
  }
  const command = commands.get(interaction.commandName);
  if (!command) {
    return;
  }
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(interaction.commandName, error);
    const reply = { content: 'Что-то пошло не так, попробуйте ещё раз.', flags: MessageFlags.Ephemeral } as const;
    await (interaction.deferred || interaction.replied ? interaction.followUp(reply) : interaction.reply(reply)).catch(() => null);
  }
});

client.on(Events.MessageCreate, (message) => {
  guardMessage(message).catch((error) => console.error('protect', error));
});

client.login(token);
