import type { AutocompleteInteraction, ChatInputCommandInteraction, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

export type Command = {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<unknown>;
};
