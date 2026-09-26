import { readFileSync } from 'node:fs';
import postcss from 'postcss';

const themeCss = readFileSync(new URL('../assets/funpay-theme.css', import.meta.url), 'utf8');
const tokenCss = readFileSync(new URL('../assets/themes.css', import.meta.url), 'utf8');
const themeName = process.argv[2] ?? 'dark';

function tokensFor(name) {
  const tokens = {};
  postcss.parse(tokenCss).walkRules((rule) => {
    if (rule.selector === 'html[data-wm-theme]' || rule.selector === `html[data-wm-theme='${name}']`) {
      rule.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) tokens[decl.prop] = decl.value.trim();
      });
    }
  });
  return tokens;
}

const tokens = tokensFor(themeName);

function parse(raw) {
  const text = raw.trim().toLowerCase();
  if (text === 'white') return [255, 255, 255, 1];
  if (text === 'black') return [0, 0, 0, 1];
  if (text === 'transparent') return [0, 0, 0, 0];
  if (text.startsWith('#')) {
    let hex = text.slice(1);
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1];
  }
  const m = text.match(/rgba?\(([^)]*)\)/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}

function resolve(value, depth = 0) {
  let v = value.trim();
  if (depth > 5) return null;
  const varMatch = v.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  if (varMatch) {
    const t = tokens[varMatch[1]];
    return t ? resolve(t, depth + 1) : varMatch[2] ? resolve(varMatch[2], depth + 1) : null;
  }
  const mix = v.match(/^color-mix\(in srgb,\s*(.+?)\s+(var\([^)]+\)|[\d.]+%),\s*(.+)\)$/);
  if (mix) {
    const a = resolve(mix[1], depth + 1);
    const pctRaw = mix[2].startsWith('var') ? resolve2(mix[2]) : mix[2];
    const b = resolve(mix[3], depth + 1);
    const pct = parseFloat(pctRaw) / 100;
    if (!a || !b || Number.isNaN(pct)) return null;
    return [0, 1, 2].map((i) => a[i] * pct + b[i] * (1 - pct)).concat(1);
  }
  return parse(v);
}

function resolve2(value) {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  return m ? tokens[m[1]] : value;
}

function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const page = resolve('var(--wm-bg)');
const issues = { lightBg: [], darkText: [], pair: [] };

postcss.parse(themeCss).walkRules((rule) => {
  let bg = null;
  let fg = null;
  rule.walkDecls((decl) => {
    if (decl.prop === 'background-color') bg = resolve(decl.value);
    if (decl.prop === 'color') fg = resolve(decl.value);
  });
  const sel = rule.selector.replace(/html\[data-wm-theme\] /g, '').slice(0, 140);
  if (bg && bg[3] > 0.5 && luminance(bg) > 0.35 && !(fg && contrast(bg, fg) >= 4.5)) {
    issues.lightBg.push(`${sel}  bg=${bg.slice(0, 3).map(Math.round)}`);
  }
  if (fg && !bg && fg[3] > 0.5 && contrast(fg, page) < 3) {
    issues.darkText.push(`${sel}  fg=${fg.slice(0, 3).map(Math.round)}  ${contrast(fg, page).toFixed(2)}`);
  }
  if (fg && bg && bg[3] > 0.5 && contrast(fg, bg) < 3) {
    issues.pair.push(`${sel}  ${contrast(fg, bg).toFixed(2)}`);
  }
});

for (const [name, list] of Object.entries(issues)) {
  console.log(`\n== ${name} (${list.length})`);
  for (const line of list) console.log(line);
}
