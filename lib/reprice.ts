import { sellerPrice } from './commission.ts';
import type { ListingOffer } from './fp-pages.ts';
import type { Currency } from './money.ts';

export const MAX_PLACE = 10;

export type PlaceTarget = { rival: ListingOffer; price: number };

export function priceStep(price: number, currency: Currency): number {
  return currency === 'RUB' && price >= 10 && Number.isInteger(price) ? 1 : 0.01;
}

export function rivalsFor(offers: ListingOffer[], offerId: string, userId: string): ListingOffer[] {
  const own = offers.find((offer) => offer.offerId === offerId);
  if (!own) {
    return [];
  }
  return offers.filter((offer) => offer.filters === own.filters && offer.userId !== userId).sort((a, b) => a.price - b.price);
}

export function undercutPrice(rivalBuyerPrice: number, percent: number, currency: Currency): number {
  const rival = sellerPrice(rivalBuyerPrice, percent);
  return Math.round((rival - priceStep(rival, currency)) * 100) / 100;
}

export function placeTarget(offers: ListingOffer[], offerId: string, userId: string, place: number, percent: number): PlaceTarget | null {
  const rival = rivalsFor(offers, offerId, userId)[place - 1];
  return rival ? { rival, price: undercutPrice(rival.price, percent, rival.currency) } : null;
}
