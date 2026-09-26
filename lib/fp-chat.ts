import { decodeHtml, FUNPAY_ORIGIN, stripTags } from './funpay.ts';

export type Contact = { node: string; name: string; preview: string; nodeMsg: number; userMsg: number; unread: boolean };

export type ChatMessage = { id: number; author: number; text: string };

export type RunnerResult = { contacts: Contact[] | null; sellerOrders: number | null };

const HEADERS = { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' };

const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';

const clean = (html: string) => decodeHtml(stripTags(html.replace(/<br\s*\/?>/gi, '\n'))).replace(/[ \t]+/g, ' ').trim();

export function parseContacts(html: string): Contact[] {
  const list: Contact[] = [];
  for (const match of html.matchAll(/<a\b([^>]*class="[^"]*contact-item[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)) {
    const tag = match[1]!;
    const body = match[2]!;
    const node = attr(tag, 'data-id');
    if (!node) {
      continue;
    }
    list.push({
      node,
      name: clean(body.match(/class="media-user-name"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''),
      preview: clean(body.match(/class="contact-item-message"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''),
      nodeMsg: Number(attr(tag, 'data-node-msg')) || 0,
      userMsg: Number(attr(tag, 'data-user-msg')) || 0,
      unread: /class="[^"]*\bunread\b/.test(tag),
    });
  }
  return list;
}

export type ChatEvent = { kind: 'paid' | 'confirmed' | 'review' | 'refund' | 'system'; order: string } | null;

export function systemEvent(preview: string): ChatEvent {
  const order = preview.match(/#([A-Z0-9]{6,12})/)?.[1] ?? '';
  if (/оплатил|paid for|оплатив/i.test(preview)) {
    return { kind: 'paid', order };
  }
  if (/подтвердил успешное выполнение|confirmed the successful|підтвердив успішне/i.test(preview)) {
    return { kind: 'confirmed', order };
  }
  if (/(написал|изменил) отзыв|(wrote|edited) a review|(написав|змінив) відгук/i.test(preview)) {
    return { kind: 'review', order };
  }
  if (/вернул деньги|refunded|повернув гроші/i.test(preview)) {
    return { kind: 'refund', order };
  }
  if (/^(Покупатель|Продавец|The buyer|The seller|Покупець|Продавець) \S+ .*(заказ|order|замовлення)/i.test(preview) && order) {
    return { kind: 'system', order };
  }
  return null;
}

async function postRunner(csrf: string, objects: unknown[], request: unknown = false): Promise<{ objects?: { type: string; id: unknown; data: unknown }[]; response?: { error?: string | null } | false }> {
  const response = await fetch(`${FUNPAY_ORIGIN}/runner/`, {
    method: 'POST',
    credentials: 'include',
    headers: HEADERS,
    body: new URLSearchParams({ objects: JSON.stringify(objects), request: request === false ? 'false' : JSON.stringify(request), csrf_token: csrf }),
  });
  if (!response.ok) {
    throw new Error(`FunPay ответил ${response.status}`);
  }
  return response.json();
}

export async function pollRunner(userId: number, csrf: string): Promise<RunnerResult> {
  const data = await postRunner(csrf, [
    { type: 'chat_bookmarks', id: userId, tag: '00000000', data: false },
    { type: 'orders_counters', id: userId, tag: '00000000', data: false },
  ]);
  let contacts: Contact[] | null = null;
  let sellerOrders: number | null = null;
  for (const object of data.objects ?? []) {
    if (object.type === 'chat_bookmarks') {
      const html = (object.data as { html?: string } | null)?.html;
      contacts = html ? parseContacts(html) : [];
    }
    if (object.type === 'orders_counters') {
      const seller = (object.data as { seller?: number | string } | null)?.seller;
      sellerOrders = seller === undefined ? null : Number(seller) || 0;
    }
  }
  return { contacts, sellerOrders };
}

export async function sendChatMessage(csrf: string, node: string, content: string): Promise<string | null> {
  const data = await postRunner(csrf, [{ type: 'chat_node', id: node, tag: '00000000', data: { node, last_message: -1, content: '' } }], { action: 'chat_message', data: { node, last_message: -1, content } });
  if (!data.response) {
    return 'FunPay не принял сообщение';
  }
  return data.response.error || null;
}

export async function chatHistory(node: string): Promise<ChatMessage[]> {
  const response = await fetch(`${FUNPAY_ORIGIN}/chat/history?node=${encodeURIComponent(node)}&last_message=999999999999999999`, {
    credentials: 'include',
    headers: { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`FunPay ответил ${response.status}`);
  }
  const data = (await response.json()) as { chat?: { messages?: { id: number | string; author: number | string; html: string }[] } };
  return (data.chat?.messages ?? []).map((message) => ({
    id: Number(message.id),
    author: Number(message.author),
    text: clean(message.html.match(/class="chat-msg-text"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? message.html),
  }));
}

export type OrderReview = { rating: number; hasReply: boolean; buyerId: string; buyerName: string };

export async function orderReview(orderId: string): Promise<OrderReview | null> {
  const response = await fetch(`${FUNPAY_ORIGIN}/orders/${orderId}/`, { credentials: 'include' });
  if (!response.ok) {
    return null;
  }
  const html = await response.text();
  const rating = Number(html.match(/review-container[^>]*data-rating="(\d)"/)?.[1] ?? html.match(/class="rating(\d)"/)?.[1] ?? 0);
  const reply = html.match(/review-compiled-reply[^>]*>\s*<div>([\s\S]*?)<\/div>/)?.[1] ?? '';
  const buyer = html.match(/<h5[^>]*>\s*Покупатель\s*<\/h5>[\s\S]*?href="https:\/\/funpay\.com\/users\/(\d+)\/"[^>]*>([^<]+)</);
  return { rating, hasReply: Boolean(stripTags(reply).trim()), buyerId: buyer?.[1] ?? '', buyerName: buyer?.[2]?.trim() ?? '' };
}

export async function replyToReview(csrf: string, userId: number, orderId: string, text: string): Promise<string | null> {
  const response = await fetch(`${FUNPAY_ORIGIN}/orders/review`, {
    method: 'POST',
    credentials: 'include',
    headers: HEADERS,
    body: new URLSearchParams({ authorId: String(userId), orderId, text, rating: '', csrf_token: csrf }),
  });
  if (response.ok) {
    return null;
  }
  try {
    return ((await response.json()) as { msg?: string }).msg ?? `FunPay ответил ${response.status}`;
  } catch {
    return `FunPay ответил ${response.status}`;
  }
}
