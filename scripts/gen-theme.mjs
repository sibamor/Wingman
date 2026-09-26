import { readFileSync, writeFileSync } from 'node:fs';
import postcss from 'postcss';

const OUT = new URL('../assets/funpay-theme.css', import.meta.url);
const SCOPE = 'html[data-wm-theme]';
const COLOR_RE = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black|silver)\b/gi;
const COLOR_PROP_RE = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow)$/;
const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], silver: [192, 192, 192, 1] };

async function loadCss() {
  const local = process.argv[2];
  if (local) {
    return readFileSync(local, 'utf8');
  }
  const home = await (await fetch('https://funpay.com/')).text();
  const href = home.match(/href="(https:\/\/funpay\.com\/[^"]*\/css\/main\.css)"/)?.[1];
  if (!href) {
    throw new Error('main.css не найден на главной FunPay');
  }
  console.log(`Стили: ${href}`);
  return (await fetch(href)).text();
}

function parseColor(raw) {
  const text = raw.toLowerCase();
  if (NAMED[text]) {
    return NAMED[text];
  }
  if (text.startsWith('#')) {
    let hex = text.slice(1);
    if (hex.length <= 4) {
      hex = [...hex].map((c) => c + c).join('');
    }
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  const parts = text.replace(/rgba?\(|\)/g, '').split(/[\s,/]+/).filter(Boolean).map(Number);
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function describe([r, g, b, a]) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  return { lightness, saturation, alpha: a, neutral: max - min < 0.08 };
}

const SHORTHAND_COLOR = {
  background: 'background-color',
  border: 'border-color',
  'border-top': 'border-top-color',
  'border-right': 'border-right-color',
  'border-bottom': 'border-bottom-color',
  'border-left': 'border-left-color',
  outline: 'outline-color',
};

function colorPart(prop, value) {
  const longhand = SHORTHAND_COLOR[prop];
  if (!longhand) {
    if (prop === 'background-image' && !value.match(COLOR_RE)) {
      return null;
    }
    return { prop, value };
  }
  const found = value.match(COLOR_RE);
  if (found) {
    return { prop: longhand, value: found[found.length - 1] };
  }
  if (prop === 'background') {
    return { prop: longhand, value: 'transparent' };
  }
  return null;
}

function roleOf(prop) {
  if (prop.startsWith('background')) {
    return 'bg';
  }
  if (prop.startsWith('border') || prop.startsWith('outline')) {
    return 'line';
  }
  if (prop.includes('shadow')) {
    return 'shadow';
  }
  return 'text';
}

function isBrandBlue([r, g, b]) {
  return b > r + 60 && b > g + 30 && b > 120;
}

function hasBrightBg(rule) {
  let bright = false;
  rule.each((decl) => {
    if (decl.type !== 'decl' || roleOf(decl.prop) !== 'bg') {
      return;
    }
    for (const raw of decl.value.match(COLOR_RE) ?? []) {
      const rgba = parseColor(raw);
      const { lightness, saturation, alpha, neutral } = describe(rgba);
      if (alpha === 1 && !neutral && saturation > 0.3 && lightness >= 0.45 && lightness < 0.7) {
        bright = true;
      }
    }
  });
  return bright;
}

function isInverse(rule) {
  let darkBg = false;
  let lightText = false;
  rule.each((decl) => {
    if (decl.type !== 'decl') {
      return;
    }
    for (const raw of decl.value.match(COLOR_RE) ?? []) {
      const { lightness, alpha, neutral } = describe(parseColor(raw));
      if (!neutral || alpha < 1) {
        continue;
      }
      if (roleOf(decl.prop) === 'bg' && lightness <= 0.45) darkBg = true;
      if (decl.prop === 'color' && lightness >= 0.9) lightText = true;
    }
  });
  return darkBg && lightText;
}

function mapInverse(raw, role) {
  const { lightness, alpha, neutral } = describe(parseColor(raw));
  if (!neutral || alpha < 1) {
    return raw;
  }
  if ((role === 'bg' || role === 'line') && lightness <= 0.45) {
    return lightness <= 0.2 ? 'var(--wm-inverse-bg)' : 'var(--wm-inverse-bg-hover)';
  }
  if (role === 'text' && lightness >= 0.9) {
    return 'var(--wm-inverse-text)';
  }
  return raw;
}

function mapColor(raw, role) {
  const rgba = parseColor(raw);
  const { lightness, saturation, alpha, neutral } = describe(rgba);
  if (alpha === 0 || role === 'shadow') {
    return raw;
  }
  if (alpha < 1) {
    if (neutral && role === 'line' && rgba[0] === 0) {
      return 'var(--wm-line)';
    }
    return raw;
  }
  if (neutral) {
    if (role === 'bg') {
      if (lightness >= 0.99) return 'var(--wm-bg)';
      if (lightness >= 0.95) return 'var(--wm-bg-2)';
      if (lightness >= 0.86) return 'var(--wm-bg-3)';
      if (lightness >= 0.7) return 'var(--wm-bg-4)';
      return raw;
    }
    if (role === 'line') {
      if (lightness >= 0.8) return 'var(--wm-line)';
      if (lightness >= 0.55) return 'var(--wm-line-2)';
      return raw;
    }
    if (lightness <= 0.22) return 'var(--wm-text)';
    if (lightness <= 0.62) return 'var(--wm-text-2)';
    if (lightness <= 0.8) return 'var(--wm-text-3)';
    return raw;
  }
  if (role === 'text' && isBrandBlue(rgba)) {
    return lightness < 0.45 ? 'var(--wm-link-hover)' : 'var(--wm-link)';
  }
  if (lightness >= 0.7 && saturation > 0.1 && role !== 'text') {
    const base = role === 'line' ? 'var(--wm-line)' : 'var(--wm-bg)';
    return `color-mix(in srgb, ${raw} var(--wm-tint), ${base})`;
  }
  if (role === 'text' && lightness < 0.45) {
    return `color-mix(in srgb, ${raw} var(--wm-deep-text), var(--wm-text))`;
  }
  if (role === 'text' && saturation > 0.3 && lightness < 0.62) {
    return `color-mix(in srgb, ${raw} var(--wm-mid-text), var(--wm-text))`;
  }
  return raw;
}

function scopeSelector(selector) {
  return selector
    .split(',')
    .map((part) => {
      const s = part.trim();
      if (/^html\b/.test(s)) return s.replace(/^html/, SCOPE);
      if (/^:root\b/.test(s)) return s.replace(/^:root/, SCOPE);
      return `${SCOPE} ${s}`;
    })
    .join(',');
}

function insideSkipped(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (p.type === 'atrule' && (/keyframes|font-face/.test(p.name) || (p.name === 'media' && /print/.test(p.params)))) {
      return true;
    }
  }
  return false;
}

const source = postcss.parse(await loadCss());
const output = postcss.root();
let rules = 0;
let decls = 0;

source.walkRules((rule) => {
  if (insideSkipped(rule)) {
    return;
  }
  const mapped = [];
  const inverse = isInverse(rule);
  const brightBg = hasBrightBg(rule);
  rule.each((decl) => {
    if (decl.type !== 'decl' || !COLOR_PROP_RE.test(decl.prop)) {
      return;
    }
    const part = colorPart(decl.prop, decl.value);
    if (!part) {
      return;
    }
    const role = roleOf(part.prop);
    const value = part.value.replace(COLOR_RE, (c) => {
      if (brightBg && role === 'text') {
        return c;
      }
      const swapped = inverse ? mapInverse(c, role) : c;
      return swapped !== c ? swapped : mapColor(c, role);
    });
    mapped.push(postcss.decl({ prop: part.prop, value, important: decl.important }));
  });
  if (!mapped.length) {
    return;
  }
  const clone = postcss.rule({ selector: scopeSelector(rule.selector) });
  clone.append(mapped);
  let target = output;
  const chain = [];
  for (let p = rule.parent; p && p.type === 'atrule'; p = p.parent) {
    chain.unshift(p);
  }
  for (const at of chain) {
    const wrapper = postcss.atRule({ name: at.name, params: at.params });
    target.append(wrapper);
    target = wrapper;
  }
  target.append(clone);
  rules += 1;
  decls += mapped.length;
});

writeFileSync(OUT, output.toString());
console.log(`Правил: ${rules}, цветовых объявлений: ${decls}`);
