import { el, formatIn, formatWhen, link } from '../../lib/format';
import { FUNPAY_ORIGIN } from '../../lib/funpay';
import { THEMES, type ThemeId } from '../../lib/look';
import { sendMessage, type TaskReply, type UpdateReply } from '../../lib/messages';
import { noteText, whenText } from '../../lib/section-view';
import {
  accountItem,
  autoRaiseItem,
  excludedItem,
  lastErrorItem,
  refreshItem,
  runningItem,
  sectionsItem,
  themeItem,
  updateCheckItem,
  type Account,
  type SectionState,
  type UpdateCheck,
} from '../../lib/storage';

const UPDATE_TEXT: Record<UpdateCheck['status'], string> = {
  update_available: 'Найдена новая версия, установится сама',
  no_update: 'Последняя версия',
  throttled: 'Проверка была недавно, попробуйте позже',
  development: 'Установлено вручную, обновляется пересборкой',
  unavailable: 'Проверка недоступна в этом браузере',
};

function button(className: string, text: string): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

function makeSwitch(label: string): HTMLButtonElement {
  const node = button('wm-switch', '');
  node.setAttribute('role', 'switch');
  node.setAttribute('aria-label', label);
  node.append(el('span', 'wm-knob'));
  return node;
}

function block(title: string): { root: HTMLElement; head: HTMLElement } {
  const root = el('section', 'wm-block');
  const head = el('div', 'wm-block-head');
  head.append(el('h2', 'wm-title', title));
  root.append(head);
  return { root, head };
}

export function mountSettings(container: HTMLElement) {
  const version = browser.runtime.getManifest().version;
  const state = {
    account: null as Account | null,
    checking: false,
    autoRaise: false,
    running: false,
    lastError: null as string | null,
    sections: [] as SectionState[],
    excluded: new Set<string>(),
    updateCheck: null as UpdateCheck | null,
    theme: 'default' as ThemeId,
    refresh: true,
  };

  const page = el('div', 'wm');
  const head = el('header', 'wm-head');
  const brand = el('div', 'wm-brand');
  const logo = el('img', 'wm-logo');
  logo.alt = 'Wingman';
  const funpayLogo = el('img', 'wm-funpay-logo');
  funpayLogo.src = browser.runtime.getURL('/brand/funpay.svg');
  funpayLogo.alt = 'FunPay';
  brand.append(logo, el('span', 'wm-for', 'для'), funpayLogo);
  const accountLine = el('div', 'wm-account');
  head.append(brand, accountLine);

  const signedOut = el('section', 'wm-block wm-signed-out');
  signedOut.append(el('p', 'wm-lead', 'Войдите на FunPay'), link('wm-btn wm-primary', 'Войти', `${FUNPAY_ORIGIN}/account/login`));

  const auto = block('Автоподнятие');
  const autoSwitch = makeSwitch('Автоподнятие');
  auto.head.append(autoSwitch);
  const autoStatus = el('p', 'wm-status');
  const raiseButton = button('wm-btn wm-primary', 'Поднять сейчас');
  auto.root.append(autoStatus, raiseButton);

  const sectionsBlock = block('Поднимать');
  const counter = el('span', 'wm-counter');
  const refreshButton = button('wm-btn wm-secondary', 'Обновить список');
  sectionsBlock.head.append(counter, refreshButton);
  const list = el('ul', 'wm-list');
  sectionsBlock.root.append(list);

  const look = block('Оформление');
  const themeGroup = el('div', 'wm-themes');
  themeGroup.setAttribute('role', 'radiogroup');
  themeGroup.setAttribute('aria-label', 'Тема FunPay');
  const themeButtons = THEMES.map((theme) => {
    const option = button('wm-theme', '');
    option.setAttribute('role', 'radio');
    option.dataset.theme = theme.id;
    const swatch = el('span', 'wm-swatch');
    swatch.style.background = theme.bg;
    swatch.style.borderBottom = `12px solid ${theme.surface}`;
    swatch.style.color = theme.text;
    swatch.textContent = 'Aa';
    option.append(swatch, el('span', 'wm-theme-name', theme.name));
    option.addEventListener('click', () => themeItem.setValue(theme.id));
    themeGroup.append(option);
    return option;
  });
  const refreshRow = el('div', 'wm-row-setting');
  const refreshText = el('div', 'wm-row-text');
  refreshText.append(
    el('span', 'wm-row-label', 'Улучшенный вид'),
    el('span', 'wm-row-hint', 'Закреплённая шапка и заголовок таблицы, крупнее подписи и рейтинг, в разделах без обложки'),
  );
  const refreshSwitch = makeSwitch('Улучшенный вид');
  refreshRow.append(refreshText, refreshSwitch);
  look.root.append(themeGroup, refreshRow);

  const updates = block('Обновления');
  const updateButton = button('wm-btn wm-secondary', 'Проверить');
  updates.head.append(el('span', 'wm-counter', version), updateButton);
  const updateResult = el('p', 'wm-status wm-muted');
  updates.root.append(updateResult);

  const signedInBlocks = [auto.root, sectionsBlock.root];
  page.append(head, signedOut, ...signedInBlocks, look.root, updates.root);
  container.append(page);

  function renderAccount() {
    accountLine.replaceChildren();
    const account = state.account;
    signedOut.hidden = Boolean(account) || state.checking;
    for (const node of signedInBlocks) {
      node.hidden = !account;
    }
    if (state.checking && !account) {
      accountLine.append(el('span', 'wm-muted', 'Проверяю вход…'));
      return;
    }
    if (account) {
      accountLine.append(link('wm-account-link', account.userName || `ID ${account.userId}`, `${FUNPAY_ORIGIN}/users/${account.userId}/`));
    }
  }

  function renderAuto() {
    autoSwitch.setAttribute('aria-checked', String(state.autoRaise));
    raiseButton.disabled = state.running;
    raiseButton.textContent = state.running ? 'Поднимаю…' : 'Поднять сейчас';
    refreshButton.disabled = state.running;
    autoStatus.className = 'wm-status';
    if (state.lastError) {
      autoStatus.classList.add('wm-bad');
      autoStatus.textContent = state.lastError;
      return;
    }
    if (state.running) {
      autoStatus.textContent = 'Поднимаю…';
      return;
    }
    if (!state.autoRaise) {
      autoStatus.classList.add('wm-muted');
      autoStatus.textContent = 'Выключено';
      return;
    }
    const active = state.sections.filter((section) => !state.excluded.has(section.nodeId));
    if (!active.length) {
      autoStatus.classList.add('wm-muted');
      autoStatus.textContent = 'Нет включённых разделов';
      return;
    }
    const nextAt = Math.min(...active.map((section) => section.nextAt));
    autoStatus.textContent = `Следующее поднятие ${formatIn(nextAt - Date.now())}`;
  }

  async function toggleSection(nodeId: string, enabled: boolean) {
    const excluded = new Set(await excludedItem.getValue());
    if (enabled) {
      excluded.delete(nodeId);
    } else {
      excluded.add(nodeId);
    }
    await excludedItem.setValue([...excluded]);
    await sendMessage({ type: 'reschedule' });
  }

  function renderSections() {
    const active = state.sections.filter((section) => !state.excluded.has(section.nodeId)).length;
    counter.textContent = state.sections.length ? `${active} из ${state.sections.length}` : '';
    list.replaceChildren();
    if (!state.sections.length) {
      list.append(el('li', 'wm-empty', 'Разделы не загружены'));
      return;
    }
    const now = Date.now();
    for (const section of state.sections) {
      const off = state.excluded.has(section.nodeId);
      const note = noteText(section);
      const row = el('li', off ? 'wm-row wm-off' : 'wm-row');
      const check = el('input', 'wm-check');
      check.type = 'checkbox';
      check.checked = !off;
      check.setAttribute('aria-label', `Поднимать «${section.name}»`);
      check.addEventListener('change', () => toggleSection(section.nodeId, check.checked));
      const body = el('div', 'wm-row-body');
      body.append(
        link('wm-row-name', section.name, `${FUNPAY_ORIGIN}/lots/${section.nodeId}/trade`),
        el('span', `wm-row-note wm-${note.tone}`, off ? '' : note.text),
      );
      const due = !off && section.nextAt <= now;
      row.append(check, body, el('span', due ? 'wm-row-when wm-due' : 'wm-row-when', whenText(section, now, state.running, off)));
      list.append(row);
    }
  }

  function renderUpdates() {
    const check = state.updateCheck;
    updateResult.hidden = !check;
    updateResult.textContent = check ? `${UPDATE_TEXT[check.status]}, проверено ${formatWhen(check.at)}` : '';
  }

  function renderLook() {
    const dark = state.theme !== 'default';
    logo.src = browser.runtime.getURL(dark ? '/brand/logo-dark.png' : '/brand/logo-light.png');
    funpayLogo.classList.toggle('wm-invert', dark);
    for (const option of themeButtons) {
      option.setAttribute('aria-checked', String(option.dataset.theme === state.theme));
    }
    refreshSwitch.setAttribute('aria-checked', String(state.refresh));
  }

  function renderAll() {
    renderLook();
    renderAccount();
    renderAuto();
    renderSections();
    renderUpdates();
  }

  autoSwitch.addEventListener('click', () => autoRaiseItem.setValue(!state.autoRaise));
  refreshSwitch.addEventListener('click', () => refreshItem.setValue(!state.refresh));
  raiseButton.addEventListener('click', () => sendMessage<TaskReply>({ type: 'raise-now' }));
  refreshButton.addEventListener('click', () => sendMessage<TaskReply>({ type: 'refresh-sections' }));
  updateButton.addEventListener('click', async () => {
    updateButton.disabled = true;
    state.updateCheck = await sendMessage<UpdateReply>({ type: 'check-update' });
    updateButton.disabled = false;
    renderUpdates();
  });

  themeItem.watch((value) => {
    state.theme = value;
    renderLook();
  });
  refreshItem.watch((value) => {
    state.refresh = value;
    renderLook();
  });
  accountItem.watch((value) => {
    state.account = value;
    renderAccount();
  });
  autoRaiseItem.watch((value) => {
    state.autoRaise = value;
    renderAuto();
  });
  runningItem.watch((value) => {
    state.running = value;
    renderAuto();
    renderSections();
  });
  lastErrorItem.watch((value) => {
    state.lastError = value;
    renderAuto();
  });
  sectionsItem.watch((value) => {
    state.sections = value;
    renderAuto();
    renderSections();
  });
  excludedItem.watch((value) => {
    state.excluded = new Set(value);
    renderAuto();
    renderSections();
  });

  (async () => {
    state.theme = await themeItem.getValue();
    state.refresh = await refreshItem.getValue();
    state.account = await accountItem.getValue();
    if (!state.account) {
      state.checking = true;
      renderAll();
      await sendMessage({ type: 'check-account' });
      state.checking = false;
      state.account = await accountItem.getValue();
    }
    state.autoRaise = await autoRaiseItem.getValue();
    state.running = await runningItem.getValue();
    state.lastError = await lastErrorItem.getValue();
    state.sections = await sectionsItem.getValue();
    state.excluded = new Set(await excludedItem.getValue());
    state.updateCheck = await updateCheckItem.getValue();
    renderAll();
    if (state.account && !state.sections.length) {
      sendMessage<TaskReply>({ type: 'refresh-sections' });
    }
  })();

  setInterval(() => {
    renderAuto();
    renderSections();
  }, 20_000);
}
