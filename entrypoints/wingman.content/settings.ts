import { el, formatIn, formatWhen, link } from '../../lib/format';
import { FUNPAY_ORIGIN, parseProfileName } from '../../lib/funpay';
import { TOOL_ICONS } from '../../lib/icons';
import { THEMES, type ThemeId } from '../../lib/look';
import { autoSettingsItem, DEFAULT_AUTO } from '../../lib/auto-settings';
import { mountAutoPanel } from './auto-panel';
import { mountLotsPanel } from './lots-panel';
import { sendMessage, type TaskReply, type UpdateReply } from '../../lib/messages';
import { noteText, whenText } from '../../lib/section-view';
import {
  accountItem,
  autoRaiseItem,
  costsItem,
  walletsItem,
  excludedItem,
  lastErrorItem,
  noteNamesItem,
  notesItem,
  privacyItem,
  quickBarItem,
  refreshItem,
  runningItem,
  sectionsItem,
  templatesItem,
  themeItem,
  updateCheckItem,
  type Account,
  type SectionState,
  type UpdateCheck,
} from '../../lib/storage';

const UPDATE_TEXT: Record<UpdateCheck['status'], string> = {
  update_available: 'Найдена новая версия, установится сама',
  no_update: 'Установлена последняя версия',
  throttled: 'Проверка была недавно, попробуйте позже',
  development: 'Установлено вручную, обновляется пересборкой',
  unavailable: 'Проверка недоступна в этом браузере',
};

const TABS = [
  { id: 'raise', name: 'Поднятие' },
  { id: 'lots', name: 'Лоты' },
  { id: 'templates', name: 'Шаблоны' },
  { id: 'auto', name: 'Автоответы' },
  { id: 'notify', name: 'Уведомления' },
  { id: 'notes', name: 'Заметки' },
  { id: 'look', name: 'Оформление' },
  { id: 'about', name: 'Расширение' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const MAX_TEMPLATES = 12;

function button(className: string, text: string): HTMLButtonElement {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

function iconButton(icon: string, label: string, className = ''): HTMLButtonElement {
  const node = button(`wm-icon-btn ${className}`.trim(), '');
  node.innerHTML = icon;
  node.setAttribute('aria-label', label);
  node.title = label;
  return node;
}

function makeSwitch(label: string): HTMLButtonElement {
  const node = button('wm-switch', '');
  node.setAttribute('role', 'switch');
  node.setAttribute('aria-label', label);
  node.append(el('span', 'wm-knob'));
  return node;
}

function settingRow(label: string, hint: string, control: HTMLElement): HTMLElement {
  const row = el('div', 'wm-setting');
  const text = el('div', 'wm-setting-text');
  text.append(el('span', 'wm-setting-label', label), el('span', 'wm-setting-hint', hint));
  row.append(text, control);
  return row;
}

function autoGrow(field: HTMLTextAreaElement) {
  const fit = () => {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight + 2}px`;
  };
  field.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

function textArea(value: string, label: string, placeholder: string, max: number): HTMLTextAreaElement {
  const field = el('textarea', 'wm-input wm-area');
  field.rows = 1;
  field.value = value;
  field.maxLength = max;
  field.placeholder = placeholder;
  field.setAttribute('aria-label', label);
  autoGrow(field);
  return field;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((item) => typeof item === 'string');
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
    privacy: false,
    quickBar: true,
    templates: [] as string[],
    notes: {} as Record<string, string>,
    noteNames: {} as Record<string, string>,
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

  const body = el('div', 'wm-body');
  const nav = el('nav', 'wm-nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Разделы настроек');
  const main = el('div', 'wm-main');
  body.append(nav, main);
  page.append(head, body);
  container.append(page);

  const tabs = new Map<TabId, { tab: HTMLAnchorElement; aside: HTMLElement; panel: HTMLElement }>();
  for (const { id, name } of TABS) {
    const tab = el('a', 'wm-tab');
    tab.href = `#${id}`;
    tab.id = `wm-tab-${id}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `wm-panel-${id}`);
    const aside = el('span', 'wm-tab-aside');
    tab.append(el('span', 'wm-tab-name', name), aside);
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      openTab(id, true);
    });
    tab.addEventListener('keydown', (event) => {
      const order = TABS.map((item) => item.id);
      const step = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) {
        return;
      }
      event.preventDefault();
      const next = order[(order.indexOf(id) + step + order.length) % order.length]!;
      openTab(next, true);
      tabs.get(next)?.tab.focus();
    });
    nav.append(tab);
    const panel = el('section', 'wm-panel');
    panel.id = `wm-panel-${id}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    main.append(panel);
    tabs.set(id, { tab, aside, panel });
  }

  function currentTab(): TabId {
    const hash = location.hash.slice(1);
    return TABS.some((tab) => tab.id === hash) ? (hash as TabId) : 'raise';
  }

  function openTab(id: TabId, push: boolean) {
    if (id === 'notes') {
      loadMissingNames();
    }
    for (const [key, { tab, panel }] of tabs) {
      const active = key === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
    }
    const active = tabs.get(id)!.tab;
    if (nav.scrollWidth > nav.clientWidth) {
      const left = active.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth) {
        nav.scrollLeft = left - 16;
      }
    }
    if (push && location.hash !== `#${id}`) {
      history.replaceState(null, '', `#${id}`);
    }
  }

  window.addEventListener('hashchange', () => openTab(currentTab(), false));

  const raisePanel = tabs.get('raise')!.panel;
  const signedOut = el('div', 'wm-signed-out');
  signedOut.append(el('p', 'wm-lead', 'Поднятие работает после входа на FunPay'), link('wm-btn wm-primary', 'Войти', `${FUNPAY_ORIGIN}/account/login`));
  const hero = el('div', 'wm-hero');
  const heroMain = el('div', 'wm-hero-main');
  const autoSwitch = makeSwitch('Автоподнятие');
  const heroText = el('div', 'wm-hero-text');
  const autoStatus = el('p', 'wm-hero-status');
  heroText.append(el('span', 'wm-hero-label', 'Автоподнятие'), autoStatus);
  heroMain.append(autoSwitch, heroText);
  const raiseButton = button('wm-btn wm-primary', 'Поднять сейчас');
  hero.append(heroMain, raiseButton);

  const sectionsHead = el('div', 'wm-panel-head');
  sectionsHead.classList.add('wm-sections-head');
  const allCheck = el('input', 'wm-check');
  allCheck.type = 'checkbox';
  allCheck.setAttribute('aria-label', 'Выбрать все разделы');
  const counter = el('span', 'wm-counter wm-push');
  const refreshButton = iconButton(TOOL_ICONS.refresh, 'Обновить список разделов');
  sectionsHead.append(allCheck, el('h2', 'wm-title', 'Разделы'), counter, refreshButton);
  const list = el('ul', 'wm-list');
  raisePanel.append(signedOut, hero, sectionsHead, list);

  const templatesPanel = tabs.get('templates')!.panel;
  const templatesHead = el('div', 'wm-panel-head');
  const templatesSaved = el('span', 'wm-saved wm-push');
  templatesHead.append(el('h2', 'wm-title', 'Шаблоны ответов'), templatesSaved);
  const templatesHint = el('p', 'wm-hint');
  templatesHint.append('Появляются кнопками над полем ввода ', link('wm-inline-link', 'в чате', `${FUNPAY_ORIGIN}/chat/`), ' и вставляют текст');
  const templateList = el('ol', 'wm-list wm-templates');
  const templateAdd = button('wm-btn wm-secondary', 'Добавить шаблон');
  const undoBar = el('div', 'wm-undo');
  undoBar.hidden = true;
  const undoButton = button('wm-link-btn', 'Вернуть');
  undoBar.append(el('span', '', 'Шаблон удалён'), undoButton);
  const templatesVars = el('p', 'wm-hint', '{buyer} - ник собеседника, {order} - номер его последнего заказа. В чате Alt+1…9 вставляет шаблон по номеру, «/» в начале строки открывает поиск');
  templatesPanel.append(templatesHead, templatesHint, templatesVars, templateList, templateAdd, undoBar);

  const flash = (node: HTMLElement) => {
    node.textContent = 'Сохранено';
    node.classList.add('wm-shown');
    clearTimeout(Number(node.dataset.timer));
    node.dataset.timer = String(window.setTimeout(() => node.classList.remove('wm-shown'), 1600));
  };
  mountAutoPanel(tabs.get('auto')!.panel, tabs.get('auto')!.aside, { button, iconButton, makeSwitch, textArea, flash }, tabs.get('notify')!.panel);
  mountLotsPanel(tabs.get('lots')!.panel, tabs.get('lots')!.aside, { button });

  const notesPanel = tabs.get('notes')!.panel;
  const notesHead = el('div', 'wm-panel-head');
  const notesSaved = el('span', 'wm-saved wm-push');
  const notesCounter = el('span', 'wm-counter');
  notesHead.append(el('h2', 'wm-title', 'Заметки о покупателях'), notesCounter, notesSaved);
  const notesUndo = el('div', 'wm-undo');
  notesUndo.hidden = true;
  const notesUndoButton = button('wm-link-btn', 'Вернуть');
  notesUndo.append(el('span', '', 'Заметка удалена'), notesUndoButton);
  const notesSearch = el('input', 'wm-input wm-search');
  notesSearch.type = 'search';
  notesSearch.placeholder = 'Поиск по нику и тексту';
  notesSearch.setAttribute('aria-label', 'Поиск по заметкам');
  const notesList = el('ul', 'wm-list wm-notes');
  const notesEmpty = el('div', 'wm-empty-state');
  notesEmpty.append(el('p', 'wm-lead', 'Заметок нет'), el('p', 'wm-hint', 'Заметка пишется в чате, в правой колонке рядом с покупателем'), link('wm-btn wm-secondary', 'Открыть сообщения', `${FUNPAY_ORIGIN}/chat/`));
  notesPanel.append(notesHead, notesSearch, notesList, notesEmpty, notesUndo);

  const lookPanel = tabs.get('look')!.panel;
  const lookHead = el('div', 'wm-panel-head');
  lookHead.append(el('h2', 'wm-title', 'Тема FunPay'));
  const themeGroup = el('div', 'wm-themes');
  themeGroup.setAttribute('role', 'radiogroup');
  themeGroup.setAttribute('aria-label', 'Тема FunPay');
  const themeButtons = THEMES.map((theme) => {
    const option = button('wm-theme', '');
    option.setAttribute('role', 'radio');
    option.dataset.theme = theme.id;
    const preview = el('span', 'wm-preview');
    preview.style.background = theme.bg;
    preview.style.color = theme.text;
    const bar = el('span', 'wm-preview-bar');
    bar.style.background = theme.surface;
    const lineA = el('span', 'wm-preview-line');
    const lineB = el('span', 'wm-preview-line wm-preview-short');
    const accent = el('span', 'wm-preview-accent');
    preview.append(bar, lineA, lineB, accent);
    option.append(preview, el('span', 'wm-theme-name', theme.name));
    option.addEventListener('click', () => themeItem.setValue(theme.id));
    themeGroup.append(option);
    return option;
  });
  const refreshSwitch = makeSwitch('Улучшенный вид');
  const quickBarSwitch = makeSwitch('Полоса продавца');
  const privacySwitch = makeSwitch('Режим приватности');
  const settingsHead = el('div', 'wm-panel-head');
  settingsHead.append(el('h2', 'wm-title', 'Интерфейс'));
  const settingsList = el('div', 'wm-settings');
  settingsList.append(
    settingRow('Улучшенный вид', 'Закреплённая шапка, крупнее подписи и рейтинг, компактные разделы', refreshSwitch),
    settingRow('Полоса продавца', 'Продажи, сообщения, лоты, поднятие и баланс под шапкой', quickBarSwitch),
    settingRow('Режим приватности', 'Размывает ники, суммы, реквизиты и номера заказов на всех страницах', privacySwitch),
  );
  lookPanel.append(lookHead, themeGroup, settingsHead, settingsList);

  const aboutPanel = tabs.get('about')!.panel;
  const aboutHead = el('div', 'wm-panel-head');
  aboutHead.append(el('h2', 'wm-title', 'Обновления'), el('span', 'wm-counter wm-push', version));
  const updateButton = button('wm-btn wm-secondary', 'Проверить');
  const updateResult = el('p', 'wm-hint');
  const updateRow = el('div', 'wm-actions');
  updateRow.append(updateButton, updateResult);
  const backupHead = el('div', 'wm-panel-head');
  backupHead.append(el('h2', 'wm-title', 'Резервная копия'));
  const exportButton = button('wm-btn wm-secondary', 'Сохранить в файл');
  const importButton = button('wm-btn wm-secondary', 'Загрузить из файла');
  const importInput = el('input');
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.hidden = true;
  const backupResult = el('p', 'wm-hint');
  const backupRow = el('div', 'wm-actions');
  backupRow.append(exportButton, importButton, importInput, backupResult);
  aboutPanel.append(
    aboutHead,
    updateRow,
    backupHead,
    el('p', 'wm-hint', 'Шаблоны, автоответы, заметки, реквизиты, себестоимость, тема и выбор разделов'),
    backupRow,
  );

  function activeSections() {
    return state.sections.filter((section) => !state.excluded.has(section.nodeId));
  }

  function renderAccount() {
    accountLine.replaceChildren();
    const account = state.account;
    signedOut.hidden = Boolean(account) || state.checking;
    for (const node of [hero, sectionsHead, list]) {
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

  function raiseSummary(): { text: string; tone: '' | 'wm-bad' | 'wm-muted' } {
    if (!state.account) {
      return { text: state.checking ? '' : 'нужен вход', tone: 'wm-muted' };
    }
    if (state.lastError) {
      return { text: state.lastError, tone: 'wm-bad' };
    }
    if (state.running) {
      return { text: 'Поднимаю…', tone: '' };
    }
    if (!state.autoRaise) {
      return { text: 'Выключено', tone: 'wm-muted' };
    }
    const active = activeSections();
    if (!active.length) {
      return { text: 'Нет выбранных разделов', tone: 'wm-muted' };
    }
    const nextAt = Math.min(...active.map((section) => section.nextAt));
    return { text: `Следующее ${formatIn(nextAt - Date.now())}`, tone: '' };
  }

  function renderAuto() {
    autoSwitch.setAttribute('aria-checked', String(state.autoRaise));
    raiseButton.disabled = state.running || !activeSections().length;
    raiseButton.textContent = state.running ? 'Поднимаю…' : 'Поднять сейчас';
    refreshButton.disabled = state.running;
    const summary = raiseSummary();
    autoStatus.className = `wm-hero-status ${summary.tone}`.trim();
    autoStatus.textContent = summary.text;
    autoStatus.hidden = Boolean(state.account) && !state.autoRaise && !state.lastError;
    const aside = tabs.get('raise')!.aside;
    aside.className = `wm-tab-aside ${summary.tone}`.trim();
    aside.replaceChildren();
    if (state.lastError) {
      aside.innerHTML = TOOL_ICONS.warning;
      aside.setAttribute('aria-label', 'Ошибка поднятия');
    } else {
      aside.removeAttribute('aria-label');
      const active = activeSections();
      const counting = state.account && state.autoRaise && !state.running && active.length;
      aside.textContent = counting ? formatIn(Math.min(...active.map((section) => section.nextAt)) - Date.now()) : summary.text.toLowerCase();
    }
  }

  async function setExcluded(ids: string[], enabled: boolean) {
    const excluded = new Set(await excludedItem.getValue());
    for (const id of ids) {
      if (enabled) {
        excluded.delete(id);
      } else {
        excluded.add(id);
      }
    }
    await excludedItem.setValue([...excluded]);
    await sendMessage({ type: 'reschedule' });
  }

  function renderSections() {
    const active = activeSections().length;
    const total = state.sections.length;
    counter.textContent = total ? `${active} из ${total}` : '';
    allCheck.hidden = total < 2;
    allCheck.checked = total > 0 && active === total;
    allCheck.indeterminate = active > 0 && active < total;
    list.replaceChildren();
    if (!total) {
      list.append(el('li', 'wm-empty', state.running ? 'Загружаю разделы…' : 'Разделы не загружены'));
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
      check.addEventListener('change', () => setExcluded([section.nodeId], check.checked));
      const rowBody = el('div', 'wm-row-body');
      rowBody.append(link('wm-row-name', section.name, `${FUNPAY_ORIGIN}/lots/${section.nodeId}/trade`));
      if (!off) {
        rowBody.append(el('span', `wm-row-note wm-${note.tone}`, note.text));
      }
      const due = !off && section.nextAt <= now;
      row.append(check, rowBody, el('span', due ? 'wm-row-when wm-due' : 'wm-row-when', whenText(section, now, state.running, off)));
      list.append(row);
    }
  }

  let drafts: string[] = [];
  let removed: { text: string; index: number } | null = null;
  let undoTimer = 0;

  function cleanTemplates(values: string[]) {
    return values.map((text) => text.trim()).filter(Boolean);
  }

  async function saveTemplates() {
    const next = cleanTemplates(drafts);
    if (JSON.stringify(next) === JSON.stringify(state.templates)) {
      return;
    }
    state.templates = next;
    renderTemplateCount();
    await templatesItem.setValue(next);
    flash(templatesSaved);
  }

  function renderTemplates() {
    templateList.replaceChildren();
    drafts.forEach((text, index) => {
      const row = el('li', 'wm-template');
      const field = textArea(text, `Шаблон ${index + 1}`, 'Текст шаблона', 500);
      let timer = 0;
      field.addEventListener('input', () => {
        drafts[index] = field.value;
        clearTimeout(timer);
        timer = window.setTimeout(saveTemplates, 400);
      });
      field.addEventListener('blur', () => {
        clearTimeout(timer);
        saveTemplates();
      });
      const tools = el('div', 'wm-template-tools');
      const up = iconButton(TOOL_ICONS.up, 'Выше');
      up.disabled = index === 0;
      up.addEventListener('click', () => moveTemplate(index, -1));
      const down = iconButton(TOOL_ICONS.down, 'Ниже');
      down.disabled = index === drafts.length - 1;
      down.addEventListener('click', () => moveTemplate(index, 1));
      const remove = iconButton(TOOL_ICONS.trash, 'Удалить', 'wm-danger');
      remove.addEventListener('click', () => removeTemplate(index));
      tools.append(up, down, remove);
      row.append(field, tools);
      templateList.append(row);
    });
    if (!drafts.length) {
      templateList.append(el('li', 'wm-empty', 'Шаблонов нет'));
    }
    templateAdd.disabled = drafts.length >= MAX_TEMPLATES;
    templateAdd.textContent = templateAdd.disabled ? `Не больше ${MAX_TEMPLATES} шаблонов` : 'Добавить шаблон';
    renderTemplateCount();
  }

  function renderTemplateCount() {
    tabs.get('templates')!.aside.textContent = state.templates.length ? String(state.templates.length) : '';
  }

  function moveTemplate(index: number, step: number) {
    const target = index + step;
    [drafts[index], drafts[target]] = [drafts[target]!, drafts[index]!];
    renderTemplates();
    const tools = templateList.querySelectorAll('.wm-template-tools')[target];
    const same = tools?.querySelectorAll('button')[step < 0 ? 0 : 1];
    (same && !same.disabled ? same : tools?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    saveTemplates();
  }

  function removeTemplate(index: number) {
    removed = { text: drafts[index] ?? '', index };
    drafts.splice(index, 1);
    renderTemplates();
    saveTemplates();
    undoBar.hidden = !removed.text.trim();
    clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => {
      undoBar.hidden = true;
      removed = null;
    }, 8000);
  }

  undoButton.addEventListener('click', () => {
    if (!removed) {
      return;
    }
    drafts.splice(Math.min(removed.index, drafts.length), 0, removed.text);
    removed = null;
    undoBar.hidden = true;
    renderTemplates();
    saveTemplates();
  });

  templateAdd.addEventListener('click', () => {
    drafts.push('');
    renderTemplates();
    templateList.querySelector<HTMLTextAreaElement>('.wm-template:last-child textarea')?.focus();
  });

  function chatLink(buyerId: string): string | null {
    const me = state.account?.userId;
    if (!me) {
      return null;
    }
    const [a, b] = [Number(buyerId), me].sort((x, y) => x - y);
    return `${FUNPAY_ORIGIN}/chat/?node=users-${a}-${b}`;
  }

  async function saveNote(buyerId: string, text: string) {
    const notes = { ...(await notesItem.getValue()) };
    const names = { ...(await noteNamesItem.getValue()) };
    if (text.trim()) {
      notes[buyerId] = text.trim();
    } else {
      delete notes[buyerId];
      delete names[buyerId];
    }
    state.notes = notes;
    state.noteNames = names;
    await notesItem.setValue(notes);
    await noteNamesItem.setValue(names);
    flash(notesSaved);
    if (!text.trim()) {
      renderNotes();
    }
  }

  function renderNotes() {
    const ids = Object.keys(state.notes);
    const query = notesSearch.value.trim().toLowerCase();
    notesCounter.textContent = ids.length >= 4 ? String(ids.length) : '';
    tabs.get('notes')!.aside.textContent = ids.length ? String(ids.length) : '';
    notesSearch.hidden = ids.length < 4;
    notesEmpty.hidden = ids.length > 0;
    notesList.replaceChildren();
    for (const id of ids) {
      const name = state.noteNames[id] || `ID ${id}`;
      const text = state.notes[id] ?? '';
      if (query && !`${name} ${text}`.toLowerCase().includes(query)) {
        continue;
      }
      const row = el('li', 'wm-note');
      const top = el('div', 'wm-note-top');
      top.append(link('wm-row-name', name, `${FUNPAY_ORIGIN}/users/${id}/`));
      const chat = chatLink(id);
      if (chat) {
        top.append(link('wm-note-chat', 'Чат', chat));
      }
      const remove = iconButton(TOOL_ICONS.trash, `Удалить заметку о ${name}`, 'wm-danger');
      remove.addEventListener('click', () => removeNote(id));
      top.append(remove);
      const field = textArea(text, `Заметка о ${name}`, 'Текст заметки', 1000);
      let timer = 0;
      field.addEventListener('input', () => {
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (field.value.trim()) {
            saveNote(id, field.value);
          }
        }, 500);
      });
      row.append(top, field);
      notesList.append(row);
    }
    if (ids.length && !notesList.children.length) {
      notesList.append(el('li', 'wm-empty', 'Ничего не найдено'));
    }
  }

  notesSearch.addEventListener('input', renderNotes);

  let removedNote: { id: string; text: string; name: string } | null = null;
  let notesUndoTimer = 0;

  async function removeNote(id: string) {
    removedNote = { id, text: state.notes[id] ?? '', name: state.noteNames[id] ?? '' };
    await saveNote(id, '');
    notesUndo.hidden = false;
    clearTimeout(notesUndoTimer);
    notesUndoTimer = window.setTimeout(() => {
      notesUndo.hidden = true;
      removedNote = null;
    }, 8000);
  }

  notesUndoButton.addEventListener('click', async () => {
    if (!removedNote) {
      return;
    }
    const { id, text, name } = removedNote;
    removedNote = null;
    notesUndo.hidden = true;
    if (name) {
      state.noteNames = { ...(await noteNamesItem.getValue()), [id]: name };
      await noteNamesItem.setValue(state.noteNames);
    }
    await saveNote(id, text);
    renderNotes();
  });

  let namesLoading = false;

  async function loadMissingNames() {
    if (namesLoading) {
      return;
    }
    namesLoading = true;
    const missing = Object.keys(state.notes)
      .filter((id) => !state.noteNames[id])
      .slice(0, 20);
    for (const id of missing) {
      try {
        const response = await fetch(`${FUNPAY_ORIGIN}/users/${id}/`, { credentials: 'include' });
        const name = response.ok ? parseProfileName(await response.text()) : '';
        if (name) {
          state.noteNames = { ...(await noteNamesItem.getValue()), [id]: name };
          await noteNamesItem.setValue(state.noteNames);
          renderNotes();
        }
      } catch {
        break;
      }
    }
    namesLoading = false;
  }

  function renderUpdates() {
    const check = state.updateCheck;
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
    privacySwitch.setAttribute('aria-checked', String(state.privacy));
    quickBarSwitch.setAttribute('aria-checked', String(state.quickBar));
  }

  function renderAll() {
    renderLook();
    renderTemplates();
    renderNotes();
    renderAccount();
    renderAuto();
    renderSections();
    renderUpdates();
  }

  exportButton.addEventListener('click', async () => {
    const data = {
      wingman: 1,
      version,
      theme: await themeItem.getValue(),
      refresh: await refreshItem.getValue(),
      quickBar: await quickBarItem.getValue(),
      privacy: await privacyItem.getValue(),
      templates: await templatesItem.getValue(),
      notes: await notesItem.getValue(),
      noteNames: await noteNamesItem.getValue(),
      excluded: await excludedItem.getValue(),
      wallets: await walletsItem.getValue(),
      costs: await costsItem.getValue(),
      auto: await autoSettingsItem.getValue(),
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = el('a');
    anchor.href = url;
    anchor.download = `wingman-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    backupResult.className = 'wm-hint';
    backupResult.textContent = 'Файл сохранён';
  });

  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) {
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      if (data?.wingman !== 1) {
        throw new Error();
      }
      if (THEMES.some((theme) => theme.id === data.theme)) {
        await themeItem.setValue(data.theme);
      }
      for (const [item, value] of [
        [refreshItem, data.refresh],
        [quickBarItem, data.quickBar],
        [privacyItem, data.privacy],
      ] as const) {
        if (typeof value === 'boolean') {
          await item.setValue(value);
        }
      }
      if (isStringList(data.templates)) {
        await templatesItem.setValue(cleanTemplates(data.templates).slice(0, MAX_TEMPLATES));
      }
      if (isStringRecord(data.notes)) {
        await notesItem.setValue({ ...(await notesItem.getValue()), ...data.notes });
      }
      if (isStringRecord(data.noteNames)) {
        await noteNamesItem.setValue({ ...(await noteNamesItem.getValue()), ...data.noteNames });
      }
      if (data.wallets && typeof data.wallets === 'object' && !Array.isArray(data.wallets)) {
        await walletsItem.setValue({ ...(await walletsItem.getValue()), ...data.wallets });
      }
      if (data.costs && typeof data.costs === 'object' && !Array.isArray(data.costs) && Object.values(data.costs).every((value) => typeof value === 'number')) {
        await costsItem.setValue({ ...(await costsItem.getValue()), ...data.costs });
      }
      if (data.auto && typeof data.auto === 'object' && !Array.isArray(data.auto)) {
        await autoSettingsItem.setValue({ ...DEFAULT_AUTO, ...data.auto, enabled: false });
      }
      if (isStringList(data.excluded)) {
        await excludedItem.setValue(data.excluded);
        await sendMessage({ type: 'reschedule' });
      }
      backupResult.className = 'wm-hint';
      backupResult.textContent = 'Настройки загружены';
    } catch {
      backupResult.className = 'wm-hint wm-bad';
      backupResult.textContent = 'Это не файл настроек Wingman';
    }
  });

  autoSwitch.addEventListener('click', () => autoRaiseItem.setValue(!state.autoRaise));
  refreshSwitch.addEventListener('click', () => refreshItem.setValue(!state.refresh));
  privacySwitch.addEventListener('click', () => privacyItem.setValue(!state.privacy));
  quickBarSwitch.addEventListener('click', () => quickBarItem.setValue(!state.quickBar));
  allCheck.addEventListener('change', () =>
    setExcluded(
      state.sections.map((section) => section.nodeId),
      allCheck.checked,
    ),
  );
  raiseButton.addEventListener('click', () => sendMessage<TaskReply>({ type: 'raise-now' }));
  refreshButton.addEventListener('click', () => sendMessage<TaskReply>({ type: 'refresh-sections' }));
  updateButton.addEventListener('click', async () => {
    updateButton.disabled = true;
    updateButton.textContent = 'Проверяю…';
    state.updateCheck = await sendMessage<UpdateReply>({ type: 'check-update' });
    updateButton.disabled = false;
    updateButton.textContent = 'Проверить';
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
  privacyItem.watch((value) => {
    state.privacy = value;
    renderLook();
  });
  quickBarItem.watch((value) => {
    state.quickBar = value;
    renderLook();
  });
  templatesItem.watch((value) => {
    if (JSON.stringify(value) === JSON.stringify(cleanTemplates(drafts))) {
      state.templates = value;
      return;
    }
    state.templates = value;
    drafts = [...value];
    renderTemplates();
  });
  notesItem.watch((value) => {
    const same = JSON.stringify(value) === JSON.stringify(state.notes);
    state.notes = value;
    if (!same) {
      renderNotes();
    }
  });
  noteNamesItem.watch((value) => {
    const same = JSON.stringify(value) === JSON.stringify(state.noteNames);
    state.noteNames = value;
    if (!same) {
      renderNotes();
    }
  });
  accountItem.watch((value) => {
    state.account = value;
    renderAccount();
    renderAuto();
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

  openTab(currentTab(), false);

  (async () => {
    state.theme = await themeItem.getValue();
    state.refresh = await refreshItem.getValue();
    state.privacy = await privacyItem.getValue();
    state.quickBar = await quickBarItem.getValue();
    state.templates = await templatesItem.getValue();
    drafts = [...state.templates];
    state.notes = await notesItem.getValue();
    state.noteNames = await noteNamesItem.getValue();
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
    if (currentTab() === 'notes') {
      loadMissingNames();
    }
    if (state.account && !state.sections.length) {
      sendMessage<TaskReply>({ type: 'refresh-sections' });
    }
  })();

  setInterval(() => {
    renderAuto();
    renderSections();
  }, 10_000);
}
