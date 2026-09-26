import { autoSettingsItem, autoStateItem, DEFAULT_AUTO, fillTemplate, matchKeyword, type AutoLogEntry, type AutoSettings, type KeywordRule } from '../../lib/auto-settings';
import { el, formatWhen, link } from '../../lib/format';
import { FUNPAY_ORIGIN } from '../../lib/funpay';
import { TOOL_ICONS } from '../../lib/icons';

const KIND_TEXT: Record<AutoLogEntry['kind'], string> = {
  greeting: 'Приветствие',
  keyword: 'Ответ',
  thanks: 'Благодарность',
  review: 'Ответ на отзыв',
  order: 'Новый заказ',
  error: 'Ошибка',
};

type Parts = {
  button: (className: string, text: string) => HTMLButtonElement;
  iconButton: (icon: string, label: string, className?: string) => HTMLButtonElement;
  makeSwitch: (label: string) => HTMLButtonElement;
  textArea: (value: string, label: string, placeholder: string, max: number) => HTMLTextAreaElement;
  flash: (node: HTMLElement) => void;
};

export function mountAutoPanel(panel: HTMLElement, aside: HTMLElement, parts: Parts) {
  let settings: AutoSettings = DEFAULT_AUTO;
  let saved = '';
  let timer = 0;

  const head = el('div', 'wm-panel-head');
  const saveMark = el('span', 'wm-saved wm-push');
  head.append(el('h2', 'wm-title', 'Автоответы'), saveMark);
  const master = parts.makeSwitch('Автоответы');
  const masterRow = el('div', 'wm-hero');
  const masterText = el('div', 'wm-hero-main');
  const masterLabel = el('div', 'wm-hero-text');
  const masterStatus = el('p', 'wm-hero-status');
  masterLabel.append(el('span', 'wm-hero-label', 'Отвечать покупателям'), masterStatus);
  masterText.append(master, masterLabel);
  masterRow.append(masterText);
  const body = el('div', 'wm-auto-body');
  const logBox = el('div', 'wm-auto-log');
  panel.append(head, masterRow, body, logBox);

  function save(render = false) {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      saved = JSON.stringify(settings);
      await autoSettingsItem.setValue(structuredClone(settings));
      parts.flash(saveMark);
      if (render) {
        renderBody();
      }
    }, 350);
  }

  function section(title: string, toggle: { on: boolean; set: (value: boolean) => void } | null, content: HTMLElement[]): HTMLElement {
    const root = el('section', 'wm-auto-section');
    const top = el('div', 'wm-setting');
    const text = el('div', 'wm-setting-text');
    text.append(el('span', 'wm-setting-label', title));
    top.append(text);
    if (toggle) {
      const sw = parts.makeSwitch(title);
      sw.setAttribute('aria-checked', String(toggle.on));
      sw.addEventListener('click', () => {
        toggle.set(!toggle.on);
        save(true);
      });
      top.append(sw);
    }
    const inner = el('div', 'wm-auto-inner');
    inner.append(...content);
    inner.hidden = Boolean(toggle && !toggle.on);
    root.append(top, inner);
    return root;
  }

  function area(value: string, label: string, placeholder: string, onInput: (text: string) => void): HTMLTextAreaElement {
    const field = parts.textArea(value, label, placeholder, 1000);
    field.addEventListener('input', () => {
      onInput(field.value);
      save();
    });
    return field;
  }

  function ruleRow(rule: KeywordRule, index: number): HTMLElement {
    const row = el('div', 'wm-auto-rule');
    const words = el('input', 'wm-input');
    words.value = rule.words;
    words.placeholder = 'Слова через запятую: наличие, есть ли';
    words.setAttribute('aria-label', `Слова правила ${index + 1}`);
    words.addEventListener('input', () => {
      rule.words = words.value;
      save();
      renderTest();
    });
    const reply = area(rule.text, `Ответ правила ${index + 1}`, 'Ответ покупателю', (text) => {
      rule.text = text;
      renderTest();
    });
    const tools = el('div', 'wm-auto-rule-tools');
    const sw = parts.makeSwitch(`Правило ${index + 1}`);
    sw.setAttribute('aria-checked', String(rule.enabled));
    sw.addEventListener('click', () => {
      rule.enabled = !rule.enabled;
      sw.setAttribute('aria-checked', String(rule.enabled));
      save();
      renderTest();
    });
    const remove = parts.iconButton(TOOL_ICONS.trash, 'Удалить правило', 'wm-danger');
    remove.addEventListener('click', () => {
      settings.keywords.splice(index, 1);
      save(true);
    });
    tools.append(sw, remove);
    row.append(words, reply, tools);
    return row;
  }

  const testInput = el('input', 'wm-input');
  const testResult = el('div', 'wm-auto-test-result');

  function renderTest() {
    const message = testInput.value.trim();
    testResult.replaceChildren();
    if (!message) {
      return;
    }
    const rule = matchKeyword(settings.keywords, message);
    const lines: string[] = [];
    if (settings.greeting.enabled && settings.greeting.text.trim()) {
      lines.push(`Новому покупателю: ${fillTemplate(settings.greeting.text, { buyer: 'Покупатель' })}`);
    }
    lines.push(rule ? `Ответ: ${fillTemplate(rule.text, { buyer: 'Покупатель' })}` : 'Ни одно правило не подходит');
    for (const line of lines) {
      testResult.append(el('p', rule || line.startsWith('Новому') ? '' : 'wm-muted', line));
    }
  }

  testInput.placeholder = 'Сообщение покупателя';
  testInput.setAttribute('aria-label', 'Проверить правила на сообщении');
  testInput.addEventListener('input', renderTest);

  function renderBody() {
    master.setAttribute('aria-checked', String(settings.enabled));
    masterStatus.textContent = settings.enabled ? 'Включено' : 'Выключено';
    masterStatus.className = settings.enabled ? 'wm-hero-status' : 'wm-hero-status wm-muted';
    aside.textContent = settings.enabled ? 'вкл' : '';
    body.replaceChildren();
    const greetingDays = el('input', 'wm-input wm-auto-days');
    greetingDays.type = 'number';
    greetingDays.min = '1';
    greetingDays.max = '365';
    greetingDays.value = String(settings.greeting.everyDays);
    greetingDays.setAttribute('aria-label', 'Интервал приветствия в днях');
    greetingDays.addEventListener('input', () => {
      settings.greeting.everyDays = Math.max(1, Math.min(365, Number(greetingDays.value) || 1));
      save();
    });
    const daysRow = el('label', 'wm-auto-inline');
    daysRow.append('Повторять тому же покупателю не чаще раза в', greetingDays, 'дн.');
    body.append(
      section('Приветствие новому покупателю', { on: settings.greeting.enabled, set: (value) => (settings.greeting.enabled = value) }, [
        area(settings.greeting.text, 'Текст приветствия', 'Здравствуйте, {buyer}!', (text) => (settings.greeting.text = text)),
        daysRow,
      ]),
    );
    const rules = el('div', 'wm-auto-rules');
    settings.keywords.forEach((rule, index) => rules.append(ruleRow(rule, index)));
    const addRule = parts.button('wm-btn wm-secondary', 'Добавить правило');
    addRule.addEventListener('click', () => {
      settings.keywords.push({ id: Math.random().toString(36).slice(2, 10), words: '', text: '', enabled: true });
      save(true);
    });
    const test = el('div', 'wm-auto-test');
    test.append(el('span', 'wm-setting-label', 'Проверка'), testInput, testResult);
    body.append(section('Ответы по ключевым словам', null, [rules, addRule, test]));
    body.append(
      section('Благодарность за подтверждение заказа', { on: settings.thanks.enabled, set: (value) => (settings.thanks.enabled = value) }, [
        area(settings.thanks.text, 'Текст благодарности', 'Спасибо за покупку!', (text) => (settings.thanks.text = text)),
      ]),
    );
    const byRating = el('div', 'wm-auto-ratings');
    for (let rating = 5; rating >= 1; rating -= 1) {
      const row = el('label', 'wm-auto-rating');
      row.append(
        el('span', 'wm-auto-stars', `${rating} ★`),
        area(settings.reviews.byRating[rating - 1] ?? '', `Ответ на отзыв с оценкой ${rating}`, 'Не отвечать', (text) => (settings.reviews.byRating[rating - 1] = text)),
      );
      byRating.append(row);
    }
    body.append(section('Ответы на отзывы', { on: settings.reviews.enabled, set: (value) => (settings.reviews.enabled = value) }, [byRating]));
    const quiet = el('input', 'wm-input wm-auto-days');
    quiet.type = 'number';
    quiet.min = '0';
    quiet.max = '240';
    quiet.value = String(settings.quietMinutes);
    quiet.setAttribute('aria-label', 'Пауза после моего сообщения, минут');
    quiet.addEventListener('input', () => {
      settings.quietMinutes = Math.max(0, Math.min(240, Number(quiet.value) || 0));
      save();
    });
    const quietRow = el('label', 'wm-auto-inline');
    quietRow.append('Не отвечать в чате, где я сам писал за последние', quiet, 'мин.');
    const notify = parts.makeSwitch('Уведомления о новых заказах');
    notify.setAttribute('aria-checked', String(settings.notifyOrders));
    notify.addEventListener('click', () => {
      settings.notifyOrders = !settings.notifyOrders;
      notify.setAttribute('aria-checked', String(settings.notifyOrders));
      save();
    });
    const notifyRow = el('div', 'wm-setting');
    const notifyText = el('div', 'wm-setting-text');
    notifyText.append(el('span', 'wm-setting-label', 'Уведомление о новом заказе'), el('span', 'wm-setting-hint', 'Системное уведомление, даже если вкладка FunPay закрыта'));
    notifyRow.append(notifyText, notify);
    const common = el('section', 'wm-auto-section');
    common.append(quietRow, notifyRow, el('p', 'wm-hint', 'В текстах {buyer} заменяется на ник покупателя, {order} - на номер заказа'));
    body.append(common);
    body.classList.toggle('wm-auto-off', !settings.enabled);
    renderTest();
  }

  async function renderLog() {
    const state = await autoStateItem.getValue();
    logBox.replaceChildren();
    const entries = state.log.slice(0, 20);
    if (!entries.length) {
      return;
    }
    const head = el('div', 'wm-panel-head');
    head.append(el('h2', 'wm-title', 'Журнал'));
    if (state.pausedUntil > Date.now()) {
      head.append(el('span', 'wm-counter wm-push', `Пауза до ${new Date(state.pausedUntil).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`));
    }
    logBox.append(head);
    const list = el('ul', 'wm-list wm-auto-log-list');
    for (const entry of entries) {
      const row = el('li', entry.kind === 'error' ? 'wm-auto-log-row wm-bad' : 'wm-auto-log-row');
      const meta = el('div', 'wm-auto-log-meta');
      meta.append(el('span', 'wm-auto-log-kind', KIND_TEXT[entry.kind]), link('wm-row-name', entry.buyer || 'Чат', `${FUNPAY_ORIGIN}/chat/?node=${entry.node}`), el('span', 'wm-counter', formatWhen(entry.at)));
      row.append(meta, el('p', 'wm-auto-log-text', entry.text));
      list.append(row);
    }
    logBox.append(list);
  }

  master.addEventListener('click', () => {
    settings.enabled = !settings.enabled;
    save(true);
    renderBody();
  });

  autoSettingsItem.getValue().then((value) => {
    settings = structuredClone({ ...DEFAULT_AUTO, ...value });
    saved = JSON.stringify(settings);
    renderBody();
  });
  autoSettingsItem.watch((value) => {
    if (JSON.stringify(value) === saved) {
      return;
    }
    settings = structuredClone({ ...DEFAULT_AUTO, ...value });
    saved = JSON.stringify(settings);
    renderBody();
  });
  autoStateItem.watch(renderLog);
  renderLog();
}
