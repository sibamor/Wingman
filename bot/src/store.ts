import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ScamMode = 'off' | 'flag' | 'delete';

export type GuildConfig = { scam: ScamMode; logChannelId: string | null; newsChannelId: string | null };

export type Watch = {
  id: string;
  userId: string;
  guildId: string | null;
  channelId: string | null;
  nodeId: string;
  section: string;
  maxPrice: number;
  filter: string;
  seen: string[];
  failures: number;
  createdAt: number;
};

type State = { guilds: Record<string, GuildConfig>; watches: Watch[]; newsTag: string; nicks: Record<string, string> };

const FILE = join(import.meta.dirname, '..', 'data', 'state.json');
const NICK_LIMIT = 50_000;

function load(): State {
  const empty: State = { guilds: {}, watches: [], newsTag: '', nicks: {} };
  try {
    return { ...empty, ...JSON.parse(readFileSync(FILE, 'utf8')) };
  } catch {
    return empty;
  }
}

export const state = load();

let timer: NodeJS.Timeout | null = null;

export function save() {
  if (timer) {
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    mkdirSync(dirname(FILE), { recursive: true });
    writeFileSync(`${FILE}.tmp`, JSON.stringify(state));
    renameSync(`${FILE}.tmp`, FILE);
  }, 500);
}

export function guildConfig(guildId: string): GuildConfig {
  state.guilds[guildId] ??= { scam: 'flag', logChannelId: null, newsChannelId: null };
  return state.guilds[guildId]!;
}

export function rememberNicks(pairs: [string, string][]) {
  let changed = false;
  for (const [name, id] of pairs) {
    const key = name.toLowerCase();
    if (name && id && state.nicks[key] !== id) {
      delete state.nicks[key];
      state.nicks[key] = id;
      changed = true;
    }
  }
  const keys = Object.keys(state.nicks);
  for (const key of keys.slice(0, Math.max(0, keys.length - NICK_LIMIT))) {
    delete state.nicks[key];
  }
  if (changed) {
    save();
  }
}
