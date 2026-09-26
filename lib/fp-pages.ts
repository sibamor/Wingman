import { parseFunPayDate } from './fpdate.ts';
import { decodeHtml, stripTags } from './funpay.ts';
import { parseMoney, type Currency } from './money.ts';

export type SaleLite = { id: string; at: number | null; status: 'paid' | 'closed' | 'refunded'; amount: number; currency: Currency; buyerId: string; buyerName: string; title: string };

export type ListingOffer = { offerId: string; userId: string; userName: string; price: number; currency: Currency; online: boolean; filters: string; title: string };

export type ReviewLite = { orderId: string; rating: number; at: number | null };

const inner = (html: string, className: string) => html.match(new RegExp(`class="${className}"[^>]*>([\\s\\S]*?)</div>`))?.[1] ?? '';

const textOf = (html: string) => stripTags(decodeHtml(html));

export function readContinueHtml(html: string): string {
  const all = [...html.matchAll(/<input[^>]*name="continue"[^>]*>/g)];
  const last = all[all.length - 1]?.[0] ?? '';
  return last.match(/value="([^"]*)"/)?.[1] ?? '';
}

export function parseSalesHtml(html: string, now = Date.now()): SaleLite[] {
  const list: SaleLite[] = [];
  for (const chunk of html.split(/<a href="https:\/\/funpay\.com\/orders\//).slice(1)) {
    const head = chunk.match(/^([A-Z0-9]+)\/"\s+class="([^"]*)"/);
    if (!head || !/\btc-item\b/.test(head[2]!)) {
      continue;
    }
    const body = chunk.slice(0, chunk.indexOf('</a>') + 1 || undefined);
    const money = parseMoney(textOf(body.match(/class="tc-price[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''));
    if (!money) {
      continue;
    }
    const classes = head[2]!;
    const user = body.match(/class="media-user-name"[^>]*>\s*<[^>]*data-href="https:\/\/funpay\.com\/users\/(\d+)\/"[^>]*>([\s\S]*?)</);
    const desc = body.match(/class="order-desc"[^>]*>\s*<div>([\s\S]*?)<\/div>/)?.[1] ?? '';
    list.push({
      id: head[1]!,
      at: parseFunPayDate(textOf(inner(body, 'tc-date-time')), now),
      status: /\binfo\b/.test(classes) ? 'paid' : /\bwarning\b/.test(classes) ? 'refunded' : 'closed',
      amount: Math.abs(money.amount),
      currency: money.currency,
      buyerId: user?.[1] ?? '',
      buyerName: textOf(user?.[2] ?? ''),
      title: textOf(desc),
    });
  }
  return list;
}

export function parseListing(html: string): ListingOffer[] {
  const seen = new Set<string>();
  const list: ListingOffer[] = [];
  for (const chunk of html.split(/<a href="https:\/\/funpay\.com\/lots\/offer\?id=/).slice(1)) {
    const offerId = chunk.match(/^(\d+)"/)?.[1] ?? '';
    const tag = chunk.slice(0, chunk.indexOf('>'));
    if (!offerId || !/class="[^"]*\btc-item\b/.test(tag) || seen.has(offerId)) {
      continue;
    }
    const body = chunk.slice(0, chunk.indexOf('</a>') + 1 || undefined);
    const price = Number(body.match(/class="tc-price"[^>]*data-s="([\d.]+)"/)?.[1] ?? NaN);
    if (!Number.isFinite(price)) {
      continue;
    }
    seen.add(offerId);
    const filters = [...tag.matchAll(/data-f-([\w-]+)="([^"]*)"/g)]
      .map((match) => `${match[1]}=${decodeHtml(match[2]!)}`)
      .sort()
      .join('|');
    list.push({
      offerId,
      userId: body.match(/data-href="https:\/\/funpay\.com\/users\/(\d+)\/"/)?.[1] ?? tag.match(/data-user="(\d+)"/)?.[1] ?? '',
      userName: textOf(inner(body, 'media-user-name')),
      price,
      currency: parseMoney(textOf(body.match(/class="tc-price"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''))?.currency ?? 'RUB',
      online: /data-online="1"/.test(tag) || /media-user online/.test(body),
      filters,
      title: textOf(inner(body, 'tc-desc-text')),
    });
  }
  return list;
}

export type OwnPlace = { offerId: string; title: string; price: number; place: number; total: number; cheapest: ListingOffer | null };

export function ownPlaces(offers: ListingOffer[], userId: string): OwnPlace[] {
  return offers
    .filter((offer) => offer.userId === userId)
    .map((own) => {
      const group = offers.filter((offer) => offer.filters === own.filters);
      const rivals = group.filter((offer) => offer.userId !== userId);
      const cheaper = rivals.filter((offer) => offer.price < own.price).sort((a, b) => a.price - b.price);
      return { offerId: own.offerId, title: own.title, price: own.price, place: cheaper.length + 1, total: rivals.length + 1, cheapest: cheaper[0] ?? null };
    });
}

export function parseReviewsHtml(html: string, now = Date.now()): ReviewLite[] {
  return html
    .split('<div class="review-container')
    .slice(1)
    .map((chunk) => {
      const dateText = textOf(inner(chunk, 'review-item-date'));
      return {
        orderId: chunk.match(/\/orders\/([A-Z0-9]+)\//)?.[1] ?? '',
        rating: Number(chunk.match(/class="rating(\d)"/)?.[1] ?? 0),
        at: dateText ? parseFunPayDate(dateText.split(',')[0]!.replace(' в ', ', '), now) : null,
      };
    });
}
