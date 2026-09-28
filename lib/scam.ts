const IMPERSONATION = /(администраци|поддержк|арбитраж|модератор|служб\S* безопасности|support|administration)[^.!?\n]{0,24}fun\s?pay|fun\s?pay[^.!?\n]{0,24}(администраци|поддержк|арбитраж|модератор|support|administration)/i;

const PRESSURE = /(заблокир|блокиров|подтверд|перейд|ссылк|верифик|код|сним|верн|оплат)/i;

const LOOKALIKE = /f[uyv]n+-?p[aeо]y|funpau|funpai|fumpay/;

export function lookalikeHost(host: string): boolean {
  const value = host.toLowerCase().replace(/\.$/, '');
  return LOOKALIKE.test(value) && !/(^|\.)funpay\.com$/.test(value) && value !== 'sfunpay.com';
}

export function lookalikeLink(href: string, base = 'https://funpay.com/'): string | null {
  try {
    const host = new URL(href, base).hostname;
    return lookalikeHost(host) ? host : null;
  } catch {
    return null;
  }
}

export function claimsToBeFunPay(text: string): boolean {
  return IMPERSONATION.test(text) && PRESSURE.test(text);
}

export function findLinks(text: string): string[] {
  return (text.match(/(?:https?:\/\/|www\.)[^\s<>()]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ru|net|org|shop|site|online|xyz|top|pro|info|me|cc|io)\b[^\s<>()]*/gi) ?? []).map((link) => (/^https?:\/\//i.test(link) ? link : `https://${link}`));
}
