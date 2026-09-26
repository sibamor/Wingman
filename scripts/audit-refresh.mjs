import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postcss from 'postcss';

const funpayPath = process.argv[2];
if (!funpayPath) {
  console.log('Использование: node scripts/audit-refresh.mjs <путь к main.css FunPay> [ещё папки или файлы с HTML FunPay]');
  process.exit(1);
}

const assets = new URL('../assets/', import.meta.url);
const LAYERS = ['refresh.css', 'refresh-global.css', 'refresh-buyer.css', 'refresh-seller.css', 'refresh-responsive.css', 'quickbar.css', 'tools.css'];
const LAYOUT = /^(display|position|top|bottom|left|right|width|height|min-|max-|margin|padding|flex|order|float|overflow|font-size|line-height|border-radius|border-(top|bottom)-(left|right)-radius|z-index|visibility|opacity|transform)/;
const LEGACY_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

function htmlFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).filter((file) => file.endsWith('.html')).map((file) => join(path, file));
}

const seen = new Map();
const together = new Map();
for (const file of [dirname(funpayPath), ...process.argv.slice(3)].flatMap(htmlFiles)) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<([a-z][\w-]*)\b[^>]*?\sclass="([^"]*)"/gi)) {
    const list = [...new Set(match[2].split(/\s+/).filter(Boolean).map((cls) => `.${cls}`))];
    for (const key of [...list, `<${match[1].toLowerCase()}>`]) {
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (!together.has(key)) together.set(key, new Map());
      for (const other of list) together.get(key).set(other, (together.get(key).get(other) ?? 0) + 1);
    }
  }
}

function coClasses(key) {
  return [...(together.get(key)?.keys() ?? [])];
}

function implied(key) {
  return [...(together.get(key) ?? [])].filter(([, count]) => count === seen.get(key)).map(([cls]) => cls);
}

function splitTop(text, sep) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function splitCompounds(selector) {
  const parts = [];
  let depth = 0;
  let current = '';
  let comb = ' ';
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (current) parts.push({ comb, text: current });
      if (current) comb = ' ';
      current = '';
      if (!/\s/.test(ch)) comb = ch;
      continue;
    }
    current += ch;
  }
  if (current) parts.push({ comb, text: current });
  return parts;
}

function add(x, y) {
  return [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
}

function compare(x, y) {
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

function strongest(list) {
  return list.map(specificity).sort((x, y) => compare(y, x))[0] ?? [0, 0, 0];
}

function parseCompound(text) {
  const out = { tag: '', classes: [], attrs: [], states: [], elements: [], negations: [], options: [], spec: [0, 0, 0] };
  let i = 0;
  const word = () => {
    const found = /^[\w-]+/.exec(text.slice(i))?.[0] ?? '';
    i += found.length;
    return found;
  };
  const group = () => {
    if (text[i] !== '(') return '';
    const start = i;
    let depth = 0;
    for (; i < text.length; i++) {
      if (text[i] === '(') depth++;
      if (text[i] === ')' && --depth === 0) break;
    }
    i++;
    return text.slice(start + 1, i - 1);
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '.' || ch === '#') {
      i++;
      out.classes.push(ch + word());
      out.spec = add(out.spec, ch === '#' ? [1, 0, 0] : [0, 1, 0]);
    } else if (ch === '[') {
      const end = text.indexOf(']', i);
      out.attrs.push(text.slice(i, end + 1));
      out.spec = add(out.spec, [0, 1, 0]);
      i = end + 1;
    } else if (ch === ':') {
      const double = text[i + 1] === ':';
      i += double ? 2 : 1;
      const name = word().toLowerCase();
      const arg = group();
      const alternatives = splitTop(arg, ',');
      if (double || LEGACY_ELEMENTS.has(name)) {
        out.elements.push(`::${name}`);
        out.spec = add(out.spec, [0, 0, 1]);
      } else if (name === 'not') {
        out.negations.push(...alternatives);
        out.spec = add(out.spec, strongest(alternatives));
      } else if (name === 'where' || name === 'is') {
        if (name === 'is') out.spec = add(out.spec, strongest(alternatives));
        if (alternatives.length === 1 && splitCompounds(arg).length === 1) {
          const inner = parseCompound(arg);
          for (const key of ['classes', 'attrs', 'states', 'elements', 'negations', 'options']) out[key].push(...inner[key]);
          out.tag ||= inner.tag;
        } else if (alternatives.every((alt) => /^\.[\w-]+$/.test(alt))) {
          out.options.push(...alternatives);
        } else {
          out.states.push(`:${name}(${arg})`);
        }
      } else {
        out.states.push(arg ? `:${name}(${arg})` : `:${name}`);
        out.spec = add(out.spec, name === 'has' ? strongest(alternatives) : [0, 1, 0]);
      }
    } else if (ch === '*') {
      i++;
    } else {
      const tag = word();
      if (tag) {
        out.tag = tag.toLowerCase();
        out.spec = add(out.spec, [0, 0, 1]);
      } else {
        i++;
      }
    }
  }
  return out;
}

function specificity(selector) {
  return splitCompounds(selector).map(({ text }) => parseCompound(text).spec).reduce(add, [0, 0, 0]);
}

function parseSelector(selector) {
  const compounds = splitCompounds(selector).map(({ comb, text }) => ({ comb, ...parseCompound(text) }));
  return { compounds, subject: compounds[compounds.length - 1] };
}

function widthRange(media) {
  let min = 0;
  let max = Infinity;
  for (const match of media.matchAll(/(min|max)-width:\s*(\d+)px/g)) {
    if (match[1] === 'min') min = Math.max(min, Number(match[2]));
    else max = Math.min(max, Number(match[2]));
  }
  return [min, max];
}

function contains(outer, inner) {
  return outer[0] <= inner[0] && inner[1] <= outer[1];
}

function intersect(a, b) {
  return [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
}

function collect(root, layer = '') {
  const rules = [];
  root.walkRules((rule) => {
    let parent = rule.parent;
    const chain = [];
    while (parent && parent.type === 'atrule') {
      chain.unshift(`@${parent.name} ${parent.params}`);
      parent = parent.parent;
    }
    if (chain.some((at) => /keyframes|font-face|print/.test(at))) return;
    const props = new Map();
    rule.walkDecls((decl) => {
      if (LAYOUT.test(decl.prop)) props.set(decl.prop, { value: decl.value, important: decl.important });
    });
    if (!props.size) return;
    const media = chain.join(' ');
    for (const selector of splitTop(rule.selector, ',')) {
      const parsed = parseSelector(selector);
      if (!parsed.subject) continue;
      rules.push({ layer, block: rule, selector, media, range: widthRange(media), props, spec: specificity(selector), parsed });
    }
  });
  return rules;
}

function norm(value) {
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\b0px\b/g, '0').trim();
}

function overlaps(a, b) {
  const radius = /^border-(top|bottom)-(left|right)-radius$/;
  return a === b || b.startsWith(`${a}-`) || a.startsWith(`${b}-`) || (a === 'border-radius' && radius.test(b)) || (b === 'border-radius' && radius.test(a));
}

function describe(ours) {
  const allowed = new Set();
  const compounds = ours.parsed.compounds;
  for (const compound of compounds) {
    for (const cls of [...compound.classes, ...compound.options]) {
      allowed.add(cls);
      for (const extra of implied(cls)) allowed.add(extra);
    }
    if (compound.tag) for (const extra of implied(`<${compound.tag}>`)) allowed.add(extra);
  }
  const subject = ours.parsed.subject;
  const element = new Set(subject.classes);
  for (const cls of subject.classes) for (const other of coClasses(cls)) element.add(other);
  if (!subject.classes.length && subject.tag) {
    for (const other of coClasses(`<${subject.tag}>`)) if (utilities.has(other)) element.add(other);
  }
  return {
    allowed,
    element,
    states: new Set(compounds.flatMap((compound) => compound.states)),
    attrs: new Set(compounds.flatMap((compound) => compound.attrs)),
    tags: new Set(compounds.map((compound) => compound.tag).filter(Boolean)),
  };
}

function extraConditions(theirs, ours, info) {
  const extra = [];
  for (const compound of theirs.parsed.compounds) {
    extra.push(...compound.classes.filter((cls) => !info.allowed.has(cls)));
    extra.push(...compound.states.filter((state) => !info.states.has(state)));
    extra.push(...compound.attrs.filter((attr) => !info.attrs.has(attr)));
    if (compound.tag && compound.tag !== 'html' && compound.tag !== 'body' && !info.tags.has(compound.tag)) extra.push(compound.tag);
  }
  if (!contains(theirs.range, ours.range)) extra.push('@media');
  return extra;
}

function excludedBy(negation, theirs, ours) {
  const needs = parseSelector(negation).compounds;
  if (!needs.length || needs.some((c) => c.states.length || c.negations.length || c.options.length)) return false;
  if (!needs.some((c) => c.classes.length || c.tag || c.attrs.length)) return false;
  const last = needs[needs.length - 1];
  const mine = ours.parsed.subject;
  const target = theirs.parsed.subject;
  if (!last.classes.every((cls) => target.classes.includes(cls) || mine.classes.includes(cls))) return false;
  if (!last.attrs.every((attr) => target.attrs.includes(attr) || mine.attrs.includes(attr))) return false;
  if (last.tag && last.tag !== target.tag && last.tag !== mine.tag) return false;
  const ancestors = theirs.parsed.compounds.slice(0, -1);
  const ancestorClasses = new Set(ancestors.flatMap((c) => c.classes));
  const ancestorTags = new Set(ancestors.map((c) => c.tag).filter(Boolean));
  return needs.slice(0, -1).every((c) => c.classes.every((cls) => ancestorClasses.has(cls)) && (!c.tag || ancestorTags.has(c.tag)));
}

function insideExcluded(negation, theirs) {
  const needs = parseSelector(negation).compounds;
  const last = needs[needs.length - 1];
  if (needs.length < 2 || last.classes.length || last.tag || last.attrs.length) return false;
  if (needs.some((c) => c.states.length || c.negations.length || c.options.length || (c !== needs[0] && !/[ >]/.test(c.comb)))) return false;
  const ancestors = theirs.parsed.compounds.slice(0, -1);
  const classes = new Set(ancestors.flatMap((c) => c.classes));
  return needs.slice(0, -1).every((c) => c.classes.every((cls) => classes.has(cls)));
}

function excluded(theirs, ours) {
  const { compounds } = ours.parsed;
  return compounds.some((compound, i) =>
    compound.negations.some((negation) => (i === compounds.length - 1 ? excludedBy(negation, theirs, ours) : insideExcluded(negation, theirs))),
  );
}

function childChain(parsed) {
  const chain = [];
  const { compounds } = parsed;
  for (let i = compounds.length - 1; i > 0 && compounds[i].comb === '>'; i--) chain.push(compounds[i - 1]);
  return chain;
}

function foreignParent(theirs, ours, info) {
  const mine = childChain(ours.parsed);
  const bare = !ours.parsed.subject.classes.length;
  return childChain(theirs.parsed).some((compound, depth) =>
    compound.classes.some(
      (cls) =>
        !info.allowed.has(cls) &&
        (mine[depth]?.classes ?? []).some((own) => (seen.has(own) && seen.has(cls) ? !together.get(own).has(cls) : bare)),
    ),
  );
}

const funpay = collect(postcss.parse(readFileSync(funpayPath, 'utf8')));
const utilities = new Set(funpay.filter((rule) => /^html\s*>\s*body\s/.test(rule.selector)).flatMap((rule) => rule.parsed.subject.classes));
const index = new Map();
for (const rule of funpay) {
  const { classes, tag } = rule.parsed.subject;
  for (const key of classes.length ? classes : tag ? [`<${tag}>`] : []) {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(rule);
  }
}

const ourRules = LAYERS.flatMap((layer) => collect(postcss.parse(readFileSync(new URL(layer, assets), 'utf8')), layer));
ourRules.forEach((rule, order) => {
  rule.order = order;
});

function beats(a, b) {
  const diff = compare(a.spec, b.spec);
  return diff > 0 || (diff === 0 && a.order > b.order);
}

function classesOf(rule) {
  return new Set(rule.parsed.compounds.flatMap((compound) => [...compound.classes, ...compound.options]));
}

function coveredElsewhere(theirs, ours, prop, extra) {
  const need = intersect(theirs.range, ours.range);
  const pool = new Set([...classesOf(ours), ...classesOf(theirs)]);
  const wanted = extra.filter((condition) => /^[.#]/.test(condition));
  return ourRules.some((other) => {
    if (other === ours || !beats(other, ours) || !contains(other.range, need)) return false;
    if (![...other.props.keys()].some((key) => overlaps(key, prop))) return false;
    const own = classesOf(other);
    if (!wanted.every((cls) => own.has(cls)) || ![...own].every((cls) => pool.has(cls))) return false;
    return !excluded(theirs, other);
  });
}

const report = new Map();
for (const ours of ourRules) {
  const subject = ours.parsed.subject;
  if (!subject.classes.length && !subject.tag) continue;
  const info = describe(ours);
  const keys = [...info.element, ...(subject.tag ? [`<${subject.tag}>`] : [])];
  const pool = new Set(keys.flatMap((key) => index.get(key) ?? []));
  const lines = [];
  for (const theirs of pool) {
    const target = theirs.parsed.subject;
    if (!target.classes.every((cls) => info.element.has(cls))) continue;
    if (!target.classes.length && (target.tag !== subject.tag || (subject.classes.length && theirs.parsed.compounds.length > 1))) continue;
    if (target.tag && subject.tag && target.tag !== subject.tag) continue;
    if (target.elements.join('') !== subject.elements.join('')) continue;
    if (compare(theirs.spec, ours.spec) >= 0) continue;
    const range = intersect(theirs.range, ours.range);
    if (range[0] > range[1]) continue;
    if (excluded(theirs, ours)) continue;
    if (foreignParent(theirs, ours, info)) continue;
    const extra = extraConditions(theirs, ours, info);
    if (!extra.length) continue;
    const clashes = [];
    for (const [prop, mine] of ours.props) {
      for (const [other, theirsDecl] of theirs.props) {
        if (!overlaps(prop, other) || theirsDecl.important) continue;
        if (prop === other && norm(mine.value) === norm(theirsDecl.value)) continue;
        if (coveredElsewhere(theirs, ours, prop, extra)) continue;
        clashes.push(`${prop === other ? prop : `${prop}/${other}`}: наше ${mine.value} / FunPay ${theirsDecl.value}`);
      }
    }
    if (!clashes.length) continue;
    lines.push(`   ${theirs.selector}${theirs.media ? `  [${theirs.media}]` : ''}  (${extra.join(' ')})\n      ${clashes.join('; ')}`);
  }
  if (!lines.length) continue;
  if (!report.has(ours.block)) report.set(ours.block, { head: `${ours.layer}${ours.media ? `  [${ours.media}]` : ''}`, selectors: new Set(), lines: new Set() });
  const entry = report.get(ours.block);
  entry.selectors.add(ours.selector.replace(/^html\[data-wm-refresh\]\s+/, ''));
  for (const line of lines) entry.lines.add(line);
}

let total = 0;
for (const { head, selectors, lines } of report.values()) {
  total += lines.size;
  console.log(`${head}: ${[...selectors].join(', ')}`);
  console.log([...lines].join('\n'));
}
console.log(`\nВсего подозрительных перекрытий: ${total} в ${report.size} наших правилах`);
