import { parseHTML } from 'linkedom';
import { parseListing, type ListingOffer } from '../../lib/fp-pages.ts';
import { parseFunPayDate } from '../../lib/fpdate.ts';
import { parseReviews, type Review } from '../../lib/rows.ts';
import { rememberNicks, state } from './store.ts';

export const ORIGIN = 'https://funpay.com';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 WingmanBot/1.0 (+https://github.com/sibamor/Wingman)';
const GAP = 1500;
const LISTING_TTL = 4 * 60_000;
const PROFILE_TTL = 10 * 60_000;
const GAMES_TTL = 12 * 3_600_000;

export class NotFound extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let chain: Promise<unknown> = Promise.resolve();
let lastAt = 0;

function request(path: string): Promise<string> {
  const run = chain.then(async () => {
    const wait = lastAt + GAP - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastAt = Date.now();
    const response = await fetch(ORIGIN + path, { headers: { 'user-agent': USER_AGENT, 'accept-language': 'ru-RU,ru;q=0.9' }, redirect: 'follow' });
    if (response.status === 404) {
      throw new NotFound(path);
    }
    if (!response.ok) {
      throw new Error(`FunPay ответил ${response.status}`);
    }
    return response.text();
  });
  chain = run.catch(() => null);
  return run;
}

const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) {
    return hit.value as Promise<T>;
  }
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

const text = (node: Element | null | undefined) => node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

export type Section = { nodeId: string; game: string; name: string };

export function parseGames(html: string): Section[] {
  const { document } = parseHTML(html);
  const seen = new Set<string>();
  const list: Section[] = [];
  for (const item of document.querySelectorAll('.promo-game-item')) {
    const game = text(item.querySelector('.game-title a'));
    for (const link of item.querySelectorAll('ul a[href*="/lots/"]')) {
      const nodeId = link.getAttribute('href')?.match(/\/lots\/(\d+)\//)?.[1] ?? '';
      if (!nodeId || seen.has(nodeId)) {
        continue;
      }
      seen.add(nodeId);
      list.push({ nodeId, game, name: text(link) });
    }
  }
  return list;
}

export function sections(): Promise<Section[]> {
  return cached('games', GAMES_TTL, async () => parseGames(await request('/')));
}

export function sectionTitle(section: Section): string {
  return `${section.game} - ${section.name}`;
}

export type Listing = { nodeId: string; title: string; offers: ListingOffer[] };

export function listing(nodeId: string): Promise<Listing> {
  return cached(`lots:${nodeId}`, LISTING_TTL, async () => {
    const html = await request(`/lots/${nodeId}/`);
    const offers = parseListing(html);
    rememberNicks(offers.map((offer) => [offer.userName, offer.userId]));
    const known = (await sections().catch(() => [])).find((section) => section.nodeId === nodeId);
    const heading = parseHTML(html).document.querySelector('h1');
    return { nodeId, title: known ? sectionTitle(known) : text(heading) || `Раздел ${nodeId}`, offers };
  });
}

export type ProfileSection = { name: string; url: string; count: number };

export type Profile = {
  id: string;
  name: string;
  online: boolean;
  status: string;
  avatar: string | null;
  registeredAt: number | null;
  rating: number | null;
  reviewsCount: number;
  sections: ProfileSection[];
  offers: number;
  reviews: Review[];
};

export function parseProfile(html: string, id: string, now = Date.now()): Profile {
  const { document } = parseHTML(html);
  const heading = document.querySelector('.profile h1');
  const avatarStyle = document.querySelector('.profile-header .avatar-photo, .avatar .avatar-photo')?.getAttribute('style') ?? '';
  const registered = [...document.querySelectorAll('.param-item')].find((item) => /регистрац|registration/i.test(text(item.querySelector('h5'))));
  const registeredText = registered?.querySelector('div')?.childNodes[0]?.textContent?.trim() ?? '';
  const ratingText = text(document.querySelector('.rating-value .big'));
  const sectionsList = [...document.querySelectorAll('.offer')].map((offer) => {
    const link = offer.querySelector('.offer-list-title a');
    return { name: text(link), url: link?.getAttribute('href') ?? '', count: offer.querySelectorAll('a.tc-item').length };
  }).filter((section) => section.name);
  const avatar = avatarStyle.match(/url\(([^)]+)\)/)?.[1]?.replace(/['"]/g, '') ?? null;
  return {
    id,
    name: text(heading?.querySelector('.mr4')) || text(heading),
    online: Boolean(heading?.classList.contains('online')),
    status: text(heading?.querySelector('.media-user-status')),
    avatar: avatar && !avatar.includes('/img/layout/avatar') ? avatar : null,
    registeredAt: registeredText ? parseFunPayDate(registeredText, now) : null,
    rating: ratingText && Number.isFinite(Number(ratingText.replace(',', '.'))) ? Number(ratingText.replace(',', '.')) : null,
    reviewsCount: Number(text(document.querySelector('.rating-full-count')).replace(/\D/g, '')) || 0,
    sections: sectionsList,
    offers: sectionsList.reduce((sum, section) => sum + section.count, 0),
    reviews: parseReviews(document, now),
  };
}

export function profile(id: string): Promise<Profile> {
  return cached(`user:${id}`, PROFILE_TTL, async () => {
    const result = parseProfile(await request(`/users/${id}/`), id);
    if (!result.name) {
      throw new NotFound(id);
    }
    rememberNicks([[result.name, id]]);
    return result;
  });
}

export function resolveUserId(input: string): string | null {
  const value = input.trim();
  const fromLink = value.match(/funpay\.com\/(?:en\/|uk\/)?users\/(\d+)/)?.[1];
  if (fromLink) {
    return fromLink;
  }
  if (/^\d{1,10}$/.test(value)) {
    return value;
  }
  return state.nicks[value.replace(/^@/, '').toLowerCase()] ?? null;
}

export function resolveNodeId(input: string): string | null {
  const value = input.trim();
  return value.match(/funpay\.com\/(?:en\/|uk\/)?lots\/(\d+)/)?.[1] ?? (/^\d{1,6}$/.test(value) ? value : null);
}
