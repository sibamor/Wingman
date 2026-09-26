export const FUNPAY_ORIGIN = 'https://funpay.com';

export type AppData = {
  userId: number;
  csrfToken: string;
  locale: string;
};

export type LotSection = {
  nodeId: string;
  name: string;
};

export type RaiseButton = {
  gameId: string;
  nodeId: string;
};

export type RaiseStatus = 'raised' | 'wait' | 'error';

export type RaiseResult = {
  status: RaiseStatus;
  waitSeconds: number;
  message: string;
};

export type RaiseResponse =
  | { kind: 'modal'; modal: string }
  | { kind: 'done'; result: RaiseResult };

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
};

const DEFAULT_WAIT_SECONDS = 3600;
const RETRY_WAIT_SECONDS = 600;
const REJECTED_WAIT_SECONDS = 7200;

export function decodeHtml(text: string): string {
  return text.replace(/&(?:amp|quot|#0?39|lt|gt|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

export function stripTags(text: string): string {
  return decodeHtml(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function parseAppDataJson(raw: string): AppData | null {
  try {
    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed) ? parsed[0] : parsed;
    return {
      userId: Number(data.userId) || 0,
      csrfToken: String(data['csrf-token'] ?? ''),
      locale: String(data.locale ?? 'ru'),
    };
  } catch {
    return null;
  }
}

export function parseAppData(html: string): AppData | null {
  const match = html.match(/<body[^>]*\sdata-app-data="([^"]*)"/);
  if (!match) {
    return null;
  }
  return parseAppDataJson(decodeHtml(match[1]!));
}

export function parseUserName(html: string): string {
  const match = html.match(/class="user-link-name"[^>]*>([^<]+)</);
  return match ? decodeHtml(match[1]!).trim() : '';
}

export function parseLotSections(html: string): LotSection[] {
  const sections = new Map<string, LotSection>();
  const pattern = /<div class="offer-list-title">\s*<h3>\s*<a href="[^"]*?\/lots\/(\d+)\/"[^>]*>([^<]+)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const nodeId = match[1]!;
    if (!sections.has(nodeId)) {
      sections.set(nodeId, { nodeId, name: decodeHtml(match[2]!).trim() });
    }
  }
  return [...sections.values()];
}

export function parseRaiseButton(html: string): RaiseButton | null {
  const tag = html.match(/<button[^>]*\bjs-lot-raise\b[^>]*>/);
  if (!tag) {
    return null;
  }
  const game = tag[0].match(/data-game="(\d+)"/);
  const node = tag[0].match(/data-node="(\d+)"/);
  if (!game || !node) {
    return null;
  }
  return { gameId: game[1]!, nodeId: node[1]! };
}

export function parseModalNodeIds(modal: string): string[] {
  const ids = new Set<string>();
  for (const match of modal.matchAll(/<div class="checkbox"[^>]*>[\s\S]*?<input[^>]*value="(\d+)"/g)) {
    ids.add(match[1]!);
  }
  return [...ids];
}

export function waitFromMessage(message: string): number | null {
  const match = message.match(/(\d+)\s*([^\d\s.,!]+)/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  if (unit.startsWith('с') || unit.startsWith('s')) {
    return amount;
  }
  if (unit.startsWith('м') || unit.startsWith('m') || unit.startsWith('хв')) {
    return Math.max(amount - 1, 1) * 60;
  }
  if (unit.startsWith('ч') || unit.startsWith('h') || unit.startsWith('год')) {
    return Math.round((amount - 0.5) * 3600);
  }
  return null;
}

export function parseRaiseResponse(status: number, body: string): RaiseResponse {
  let parsed: any = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  if (parsed?.modal) {
    return { kind: 'modal', modal: String(parsed.modal) };
  }
  const wait = Number(parsed?.wait) || null;
  const message = parsed?.msg ? stripTags(String(parsed.msg)) : '';
  if (parsed && parsed.error === false) {
    return { kind: 'done', result: { status: 'raised', waitSeconds: wait ?? DEFAULT_WAIT_SECONDS, message: message || 'Подняты' } };
  }
  if (parsed?.url && !parsed?.error) {
    return { kind: 'done', result: { status: 'error', waitSeconds: REJECTED_WAIT_SECONDS, message: 'FunPay не принял запрос' } };
  }
  if (status === 429 || parsed?.error) {
    const cooldown = wait ?? waitFromMessage(message);
    return {
      kind: 'done',
      result: {
        status: cooldown ? 'wait' : 'error',
        waitSeconds: cooldown ?? RETRY_WAIT_SECONDS,
        message: message || `FunPay ответил ${status}`,
      },
    };
  }
  return { kind: 'done', result: { status: 'error', waitSeconds: RETRY_WAIT_SECONDS, message: `FunPay ответил ${status}` } };
}
