import '@fontsource/unbounded/latin-700.css';
import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/latin-600.css';
import { el, link } from '../../lib/format';
import { FUNPAY_ORIGIN } from '../../lib/funpay';
import { sendMessage, type TaskReply } from '../../lib/messages';
import { noteText, whenText } from '../../lib/section-view';
import { openSettings } from '../../lib/settings-tab';
import {
  accountItem,
  autoRaiseItem,
  excludedItem,
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
const settingsButton = document.getElementById('settings')!;
const errorBox = document.getElementById('error')!;
const sectionsList = document.getElementById('sections')!;

let checking = false;
let running = false;
let autoRaise = false;
let sections: SectionState[] = [];
let excluded = new Set<string>();

function renderAccount(account: Account | null) {
  accountBox.replaceChildren();
  accountBox.classList.toggle('signed-out', !account);
  raiseBox.hidden = !account;
  if (!account && checking) {
    accountBox.append(el('p', 'muted', 'Проверяю вход…'));
    return;
  }
  if (!account) {
    accountBox.append(el('p', 'signed-out-text', 'Войдите на FunPay'), link('primary', 'Открыть FunPay', `${FUNPAY_ORIGIN}/account/login`));
    return;
  }
  accountBox.append(
    el('span', 'account-name', account.userName || 'Аккаунт FunPay'),
    link('account-id', `ID ${account.userId}`, `${FUNPAY_ORIGIN}/users/${account.userId}/`),
  );
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
    const off = excluded.has(section.nodeId);
    const due = !off && section.nextAt <= now;
    const note = off ? { text: 'Выключен', tone: 'muted' } : noteText(section);
    const item = el('li', off ? 'off' : '');
    item.append(
      link('section-name', section.name, `${FUNPAY_ORIGIN}/lots/${section.nodeId}/trade`),
      el('span', due ? 'section-when due' : 'section-when', whenText(section, now, running, off)),
      el('span', `section-note ${note.tone}`, note.text),
    );
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

function setExcluded(value: string[]) {
  excluded = new Set(value);
  renderSections();
}

autoSwitch.addEventListener('click', async () => {
  await autoRaiseItem.setValue(!(await autoRaiseItem.getValue()));
});

raiseButton.addEventListener('click', async () => {
  renderRunning(true);
  const reply = await sendMessage<TaskReply>({ type: 'raise-now' });
  renderError(reply?.error ?? null);
});

settingsButton.addEventListener('click', async () => {
  await openSettings();
  window.close();
});

accountItem.watch(renderAccount);
autoRaiseItem.watch(renderAuto);
sectionsItem.watch(setSections);
excludedItem.watch(setExcluded);
lastErrorItem.watch(renderError);
runningItem.watch(renderRunning);

if (!(await accountItem.getValue())) {
  checking = true;
  renderAccount(null);
  await sendMessage({ type: 'check-account' });
  checking = false;
}
renderAccount(await accountItem.getValue());
setExcluded(await excludedItem.getValue());
renderAuto(await autoRaiseItem.getValue());
setSections(await sectionsItem.getValue());
renderError(await lastErrorItem.getValue());
renderRunning(await runningItem.getValue());

setInterval(renderSections, 20_000);
