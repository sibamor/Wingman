import { activeAutoParts, autoSettingsItem, autoStateItem, DEFAULT_AUTO, fillTemplate, matchKeyword, withDefaults, type AutoLogEntry, type AutoSettings, type KeywordRule } from '../../lib/auto-settings';
import { el, formatWhen, link } from '../../lib/format';
import { FUNPAY_ORIGIN } from '../../lib/funpay';
import { confirmAction } from '../../lib/confirm';
import { TOOL_ICONS } from '../../lib/icons';
import { sendMessage } from '../../lib/messages';

const KIND_TEXT: Record<AutoLogEntry['kind'], string> = {
  greeting: 'Приветствие',
  keyword: 'Ответ',
  thanks: 'Благодарность',
  review: 'Ответ на отзыв',
  order: 'Новый заказ',
  away: 'Не на месте',
  error: 'Ошибка',
};

type Parts = {
  button: (className: string, text: string) => HTMLButtonElement;
  iconButton: (icon: string, label: string, className?: string) => HTMLButtonElement;
  makeSwitch: (label: string) => HTMLButtonElement;
  textArea: (value: string, label: string, placeholder: string, max: number) => HTMLTextAreaElement;
  flash: (node: HTMLElement) => void;
};

export function mountAutoPanel(panel: HTMLElement, aside: HTMLElement, parts: Parts, notifyPanel: HTMLElement) {
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
  const extra = el('div', 'wm-auto-body');
  const logBox = el('div', 'wm-auto-log');
  panel.append(head, masterRow, body, extra, logBox);
  const notifyHead = el('div', 'wm-panel-head');
  const notifySaved = el('span', 'wm-saved wm-push');
  notifyHead.append(el('h2', 'wm-title', 'Уведомления'), notifySaved);
  const notifyBody = el('div', 'wm-auto-body');
  notifyPanel.append(notifyHead, notifyBody);

  function save(render = false) {
    clearTimeout(timer);
    timer = window.setTimeout(async () => {
      saved = JSON.stringify(settings);
      await autoSettingsItem.setValue(structuredClone(settings));
      parts.flash(saveMark);
      parts.flash(notifySaved);
      renderStatus();
      if (render) {
        renderBody();
      }
    }, 350);
  }

  type Toggle = { on: boolean; set: (value: boolean) => void; confirmOn?: () => Promise<boolean> };

  function section(title: string, hint: string, toggle: Toggle | null, content: HTMLElement[]): HTMLElement {
    const root = el('section', 'wm-auto-section');
    const top = el('div', 'wm-setting');
    const text = el('div', 'wm-setting-text');
    text.append(el('span', 'wm-setting-label', title));
    if (hint) {
      text.append(el('span', 'wm-setting-hint', hint));
    }
    top.append(text);
    if (toggle) {
      const sw = parts.makeSwitch(title);
      sw.setAttribute('aria-checked', String(toggle.on));
      sw.addEventListener('click', async () => {
        if (!toggle.on && toggle.confirmOn && !(await toggle.confirmOn())) {
          return;
        }
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
    remove.addEventListener('click', async () => {
      if (rule.words.trim() || rule.text.trim()) {
        const ok = await confirmAction({
          title: 'Удалить правило?',
          text: 'Правило пропадёт сразу, вернуть его можно только вписав заново.',
          points: [`Слова: ${rule.words.trim() || 'не указаны'}`, `Ответ: ${rule.text.trim() || 'не указан'}`],
          confirm: 'Удалить правило',
          danger: true,
        });
        if (!ok) {
          return;
        }
      }
      settings.keywords.splice(settings.keywords.indexOf(rule), 1);
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

  const activeParts = () => activeAutoParts(settings);

  function renderStatus() {
    const active = activeParts();
    masterStatus.textContent = !settings.enabled
      ? 'Выключено - покупателям ничего не отправляется'
      : active.length
        ? `Включено - ${active.join(', ')}`
        : 'Включено, но ответы пусты - ничего не уходит';
  }

  function renderBody() {
    master.setAttribute('aria-checked', String(settings.enabled));
    renderStatus();
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
      section('Приветствие новому покупателю', 'Уходит в чат, когда покупатель пишет вам впервые', { on: settings.greeting.enabled, set: (value) => (settings.greeting.enabled = value) }, [
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
    body.append(section('Ответы по ключевым словам', 'Если в сообщении есть слово из правила, уходит ответ. Каждое правило срабатывает в чате не чаще раза в 30 минут', null, [rules, addRule, test]));
    body.append(
      section('Благодарность за подтверждение заказа', 'Уходит в чат заказа', { on: settings.thanks.enabled, set: (value) => (settings.thanks.enabled = value) }, [
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
    body.append(
      section(
        'Ответы на отзывы',
        'Ответ публикуется под отзывом на вашем профиле, его видят все. Пустое поле - такие отзывы без ответа',
        {
          on: settings.reviews.enabled,
          set: (value) => (settings.reviews.enabled = value),
          confirmOn: () =>
            confirmAction({
              title: 'Отвечать на отзывы автоматически?',
              text: 'Ответ появится под новым отзывом на вашем профиле, его увидят все. Изменить опубликованный ответ можно только на FunPay.',
              points: settings.reviews.byRating
                .map((text, index) => (text.trim() ? `${index + 1} ★: ${text.trim()}` : ''))
                .filter(Boolean)
                .reverse(),
              confirm: 'Включить ответы',
            }),
        },
        [byRating],
      ),
    );
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
    const common = el('section', 'wm-auto-section');
    common.append(quietRow, el('p', 'wm-hint', 'В текстах {buyer} заменяется на ник покупателя, {order} - на номер заказа'));
    body.append(common);
    body.classList.toggle('wm-auto-off', !settings.enabled);
    renderExtra();
    renderTest();
  }

  function toggleRow(label: string, hint: string, get: () => boolean, set: (value: boolean) => void): HTMLElement {
    const sw = parts.makeSwitch(label);
    sw.setAttribute('aria-checked', String(get()));
    sw.addEventListener('click', () => {
      set(!get());
      sw.setAttribute('aria-checked', String(get()));
      save();
    });
    const row = el('div', 'wm-setting');
    const text = el('div', 'wm-setting-text');
    text.append(el('span', 'wm-setting-label', label));
    if (hint) {
      text.append(el('span', 'wm-setting-hint', hint));
    }
    row.append(text, sw);
    return row;
  }

  function numberInput(value: number, min: number, max: number, label: string, onInput: (value: number) => void): HTMLInputElement {
    const input = el('input', 'wm-input wm-auto-days');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => {
      onInput(Math.max(min, Math.min(max, Number(input.value) || min)));
      save();
    });
    return input;
  }

  function inline(...parts: (string | HTMLElement)[]): HTMLElement {
    const row = el('label', 'wm-auto-inline');
    row.append(...parts);
    return row;
  }

  function timeInput(value: string, label: string, onInput: (text: string) => void): HTMLInputElement {
    const input = el('input', 'wm-input wm-auto-time');
    input.type = 'time';
    input.value = value;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => {
      onInput(input.value);
      save();
    });
    return input;
  }

  function renderExtra() {
    extra.replaceChildren();
    const awayHours = el('input', 'wm-input wm-auto-days');
    awayHours.type = 'number';
    awayHours.min = '1';
    awayHours.max = '72';
    awayHours.value = String(settings.away.everyHours);
    awayHours.setAttribute('aria-label', 'Интервал ответа, часов');
    awayHours.addEventListener('input', () => {
      settings.away.everyHours = Math.max(1, Math.min(72, Number(awayHours.value) || 1));
      save();
    });
    const awayRow = el('label', 'wm-auto-inline');
    awayRow.append('Тому же покупателю не чаще раза в', awayHours, 'ч.');
    extra.append(
      section('Не на месте', 'Отвечает всем, кто пишет, даже при выключенных автоответах. Приветствие при этом не уходит', {
        on: settings.away.enabled,
        set: (value) => (settings.away.enabled = value),
        confirmOn: () =>
          confirmAction({
            title: 'Включить «Не на месте»?',
            text: settings.away.text.trim()
              ? 'Пока режим включён, каждый, кто вам напишет, получит ответ:'
              : 'Текст ответа пустой, поэтому ничего не отправится, пока вы его не впишете.',
            points: settings.away.text.trim() ? [settings.away.text.trim()] : [],
            confirm: 'Включить',
          }),
      }, [
        area(settings.away.text, 'Текст ответа, пока меня нет', 'Отвечу, как только вернусь', (text) => (settings.away.text = text)),
        awayRow,
      ]),
    );
    notifyBody.replaceChildren();
    const notifications = el('section', 'wm-auto-section');
    notifications.append(
      toggleRow('Новый заказ', 'Системное уведомление, даже если вкладка FunPay закрыта', () => settings.notifyOrders, (value) => (settings.notifyOrders = value)),
      toggleRow('Новое сообщение', '', () => settings.notifyMessages, (value) => (settings.notifyMessages = value)),
      toggleRow('Деньги зачислены', 'Когда оплата по заказу перестаёт ждать и становится доступной', () => settings.notifyUnfreeze, (value) => (settings.notifyUnfreeze = value)),
    );
    const quietHours = el('div', 'wm-auto-inline');
    quietHours.append(
      'Тихие часы с',
      timeInput(settings.quietFrom, 'Начало тихих часов', (text) => (settings.quietFrom = text)),
      'до',
      timeInput(settings.quietTo, 'Конец тихих часов', (text) => (settings.quietTo = text)),
    );
    notifications.append(quietHours);
    notifyBody.append(notifications);
    const work = el('section', 'wm-auto-section');
    work.append(
      toggleRow('Заказ ждёт выдачи', 'Одно напоминание на каждый оплаченный, но не выданный заказ', () => settings.deadline.enabled, (value) => (settings.deadline.enabled = value)),
      inline('Напомнить через', numberInput(settings.deadline.hours, 1, 72, 'Через сколько часов напомнить', (value) => (settings.deadline.hours = value)), 'ч'),
      toggleRow(
        'Вашу цену перебили',
        'Раз в час сравнивает ваши лоты с чужими лотами тех же параметров. Цены не меняет',
        () => settings.watch.enabled,
        (value) => (settings.watch.enabled = value),
      ),
      inline('Сообщать, если лот выпал из первых', numberInput(settings.watch.top, 1, 20, 'Сколько первых мест отслеживать', (value) => (settings.watch.top = value)), 'мест'),
      toggleRow(
        'Покупатель из чёрного списка',
        'Сообщения и заказы от него приходят, даже если остальные уведомления выключены',
        () => settings.notifyBlacklist,
        (value) => (settings.notifyBlacklist = value),
      ),
    );
    notifyBody.append(work);
    const tg = el('section', 'wm-auto-section');
    const token = el('input', 'wm-input');
    token.type = 'password';
    token.autocomplete = 'off';
    token.placeholder = 'Токен бота от @BotFather';
    token.value = settings.telegram.token;
    token.setAttribute('aria-label', 'Токен Telegram-бота');
    token.addEventListener('input', () => {
      settings.telegram = { token: token.value.trim(), chatId: '', chatName: '' };
      chatLine.textContent = '';
      save();
    });
    const tgStatus = el('span', 'wm-hint');
    const chatLine = el('span', 'wm-setting-hint', settings.telegram.chatId ? `Чат: ${settings.telegram.chatName || settings.telegram.chatId}` : '');
    const find = parts.button('wm-btn wm-secondary', 'Найти чат');
    find.addEventListener('click', async () => {
      if (!settings.telegram.token) {
        tgStatus.textContent = 'Вставьте токен бота';
        return;
      }
      find.disabled = true;
      const result = await sendMessage<{ chatId: string; name: string } | { error: string }>({ type: 'telegram-find', token: settings.telegram.token });
      find.disabled = false;
      if ('error' in result) {
        tgStatus.textContent = result.error;
        return;
      }
      settings.telegram = { ...settings.telegram, chatId: result.chatId, chatName: result.name };
      chatLine.textContent = `Чат: ${result.name}`;
      tgStatus.textContent = '';
      save();
    });
    const test = parts.button('wm-btn wm-secondary', 'Отправить тест');
    test.addEventListener('click', async () => {
      if (!settings.telegram.token || !settings.telegram.chatId) {
        tgStatus.textContent = 'Сначала найдите чат';
        return;
      }
      test.disabled = true;
      const result = await sendMessage<{ error: string | null }>({ type: 'telegram-test', token: settings.telegram.token, chatId: settings.telegram.chatId });
      test.disabled = false;
      tgStatus.textContent = result.error ?? 'Сообщение отправлено';
    });
    const actions = el('div', 'wm-actions');
    actions.append(find, test, tgStatus);
    const summaryHint = settings.telegram.chatId ? 'Продажи, возвраты, невыданные заказы и отзывы' : 'Сначала подключите Telegram: итоги приходят только туда';
    tg.append(
      el('span', 'wm-setting-label', 'Telegram'),
      el('span', 'wm-setting-hint', 'Создайте бота у @BotFather, вставьте токен, напишите боту /start и нажмите «Найти чат». Работает, пока открыт браузер'),
      token,
      chatLine,
      actions,
      toggleRow('Итоги дня', summaryHint, () => settings.summary.enabled, (value) => (settings.summary.enabled = value)),
      inline('Присылать в', timeInput(settings.summary.time, 'Время итогов дня', (text) => (settings.summary.time = text))),
    );
    notifyBody.append(tg);
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

  master.addEventListener('click', async () => {
    if (!settings.enabled) {
      const active = activeParts();
      const ok = await confirmAction({
        title: 'Включить автоответы?',
        text: active.length
          ? 'Wingman будет писать покупателям от вашего имени, пока открыт браузер. Включено:'
          : 'Ответы не заполнены - покупателям ничего не уйдёт, пока вы их не впишете.',
        points: active,
        confirm: 'Включить',
      });
      if (!ok) {
        return;
      }
    }
    settings.enabled = !settings.enabled;
    save(true);
    renderBody();
  });

  autoSettingsItem.getValue().then((value) => {
    settings = structuredClone(withDefaults(value));
    saved = JSON.stringify(settings);
    renderBody();
  });
  autoSettingsItem.watch((value) => {
    if (JSON.stringify(value) === saved) {
      return;
    }
    settings = structuredClone(withDefaults(value));
    saved = JSON.stringify(settings);
    renderBody();
  });
  autoStateItem.watch(renderLog);
  renderLog();
}
