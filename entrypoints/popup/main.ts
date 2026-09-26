import '@fontsource/unbounded/latin-700.css';
import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/latin-600.css';
import { FUNPAY_ORIGIN } from '../../lib/funpay';
import { sendMessage, type RaiseNowReply } from '../../lib/messages';
import {
  accountItem,
  autoRaiseItem,
  lastErrorItem,
  runningItem,
  sectionsItem,
  type Account,
  type SectionState,
} from '../../lib/storage';

const accountBox = document.getElementById('account')!;
const raiseBox = document.getElementById('raise')!;
const autoSwitch = document.getElementById('auto')!;
const raiseButton = document.getElementById('raise-now') as HTMLButtonElement;
const errorBox = document.getElementById('error')!;
const sectionsList = document.getElementById('sections')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

const NBSP = ' ';

function formatIn(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 0) {
    return 'сейчас';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) {
    return `через ${rest}${NBSP}мин`;
  }
  return rest ? `через ${hours}${NBSP}ч ${rest}${NBSP}мин` : `через ${hours}${NBSP}ч`;
}

function formatWhen(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) {
    return `в ${time}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `вчера в ${time}`;
  }
  return `${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} в ${time}`;
}

let checking = false;
let running = false;
let autoRaise = false;
let sections: SectionState[] = [];

function renderAccount(account: Account | null) {
  accountBox.replaceChildren();
  accountBox.classList.toggle('signed-out', !account);
  raiseBox.hidden = !account;
  if (!account && checking) {
    accountBox.append(el('p', 'muted', 'Проверяю вход…'));
    return;
  }
  if (!account) {
    const login = el('a', 'primary', 'Открыть FunPay');
    login.href = `${FUNPAY_ORIGIN}/account/login`;
    login.target = '_blank';
    accountBox.append(el('p', 'signed-out-text', 'Войдите на FunPay'), login);
    return;
  }
  const profile = el('a', 'account-id', `ID ${account.userId}`);
  profile.href = `${FUNPAY_ORIGIN}/users/${account.userId}/`;
  profile.target = '_blank';
  accountBox.append(el('span', 'account-name', account.userName || 'Аккаунт FunPay'), profile);
}

function whenText(section: SectionState, now: number): string {
  if (running && section.nextAt <= now) {
    return 'поднимаю…';
  }
  const text = formatIn(section.nextAt - now);
  return section.status === 'error' && section.nextAt > now ? `повтор ${text}` : text;
}

function noteFor(section: SectionState): HTMLElement {
  if (section.status === 'error') {
    return el('span', 'section-note bad', section.message);
  }
  if (section.lastRaisedAt) {
    return el('span', 'section-note good', `Поднято ${formatWhen(section.lastRaisedAt)}`);
  }
  return el('span', 'section-note', 'Ещё не поднимался');
}

function renderSections() {
  sectionsList.replaceChildren();
  sectionsList.classList.toggle('paused', !autoRaise);
  if (!sections.length) {
    sectionsList.append(el('li', 'empty', 'Разделы появятся после первого поднятия'));
    return;
  }
  const now = Date.now();
  for (const section of sections) {
    const item = el('li', '');
    const name = el('a', 'section-name', section.name);
    name.href = `${FUNPAY_ORIGIN}/lots/${section.nodeId}/trade`;
    name.target = '_blank';
    const due = section.nextAt <= now;
    item.append(name, el('span', due ? 'section-when due' : 'section-when', whenText(section, now)), noteFor(section));
    sectionsList.append(item);
  }
}

function renderError(message: string | null) {
  errorBox.hidden = !message;
  errorBox.textContent = message ?? '';
}

function renderRunning(value: boolean) {
  running = value;
  raiseButton.disabled = value;
  raiseButton.textContent = value ? 'Поднимаю…' : 'Поднять сейчас';
  renderSections();
}

function renderAuto(enabled: boolean) {
  autoRaise = enabled;
  autoSwitch.setAttribute('aria-checked', String(enabled));
  renderSections();
}

function setSections(value: SectionState[]) {
  sections = value;
  renderSections();
}

autoSwitch.addEventListener('click', async () => {
  await autoRaiseItem.setValue(!(await autoRaiseItem.getValue()));
});

raiseButton.addEventListener('click', async () => {
  renderRunning(true);
  const reply = await sendMessage<RaiseNowReply>({ type: 'raise-now' });
  renderError(reply?.error ?? null);
});

accountItem.watch(renderAccount);
autoRaiseItem.watch(renderAuto);
sectionsItem.watch(setSections);
lastErrorItem.watch(renderError);
runningItem.watch(renderRunning);

const savedAccount = await accountItem.getValue();
if (!savedAccount) {
  checking = true;
  renderAccount(null);
  await sendMessage({ type: 'check-account' });
  checking = false;
}
renderAccount(await accountItem.getValue());
renderAuto(await autoRaiseItem.getValue());
setSections(await sectionsItem.getValue());
renderError(await lastErrorItem.getValue());
renderRunning(await runningItem.getValue());

setInterval(renderSections, 20_000);
