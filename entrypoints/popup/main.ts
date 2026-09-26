import '@fontsource/unbounded/latin-700.css';
import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/latin-600.css';
import { activeAutoParts, autoSettingsItem, autoStateItem, withDefaults } from '../../lib/auto-settings';
import { confirmAction } from '../../lib/confirm';
import { FUNPAY_ORIGIN } from '../../lib/funpay';
import { sendMessage, type TaskReply } from '../../lib/messages';
import { openSettings } from '../../lib/settings-tab';
import { accountItem, autoRaiseItem, excludedItem, lastErrorItem, privacyItem, runningItem, sectionsItem, type Account } from '../../lib/storage';
import type { Summary } from '../../lib/summary';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const nick = byId<HTMLAnchorElement>('nick');
const signedOut = byId('signed-out');
const main = byId('main');
const orders = byId('orders');
const unread = byId('unread');
const raiseSwitch = byId('raise');
const raiseNote = byId('raise-note');
const retry = byId<HTMLButtonElement>('retry');
const autoSwitch = byId('auto');
const autoNote = byId('auto-note');
const privacySwitch = byId('privacy');
const lots = byId<HTMLAnchorElement>('lots');

const SENT_KINDS = new Set(['greeting', 'keyword', 'thanks', 'review', 'away']);

function times(count: number): string {
  const word = count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? 'раза' : 'раз';
  return `${count} ${word}`;
}

function setNote(node: HTMLElement, text: string, tone = '') {
  node.hidden = !text;
  node.textContent = text;
  node.title = text;
  node.className = `row-note ${tone}`.trim();
  if (tone === 'link') {
    node.tabIndex = 0;
    node.setAttribute('role', 'link');
  } else {
    node.removeAttribute('tabindex');
    node.removeAttribute('role');
  }
}

function renderAccount(account: Account | null, checking: boolean) {
  nick.hidden = !account;
  signedOut.hidden = Boolean(account) || checking;
  main.hidden = !account && !checking;
  main.classList.toggle('pending', !account);
  if (account) {
    nick.textContent = account.userName || `ID ${account.userId}`;
    nick.href = `${FUNPAY_ORIGIN}/users/${account.userId}/`;
    lots.href = `${FUNPAY_ORIGIN}/users/${account.userId}/`;
  }
}

function renderCount(node: HTMLElement, value: number | null) {
  node.textContent = value === null ? '-' : String(value);
  node.closest('.tile')!.classList.toggle('active', Boolean(value));
}

async function renderSummary() {
  const summary = await sendMessage<Summary>({ type: 'summary' }).catch(() => null);
  const ok = summary && !('error' in summary);
  renderCount(orders, ok ? summary.orders : null);
  renderCount(unread, ok ? summary.unread : null);
}

async function renderRaise() {
  const [enabled, running, error, sections, excluded] = await Promise.all([
    autoRaiseItem.getValue(),
    runningItem.getValue(),
    lastErrorItem.getValue(),
    sectionsItem.getValue(),
    excludedItem.getValue(),
  ]);
  raiseSwitch.setAttribute('aria-checked', String(enabled));
  retry.hidden = true;
  if (running) {
    setNote(raiseNote, 'Поднимаю…');
    return;
  }
  if (error) {
    setNote(raiseNote, `Не поднялось: ${error}`, 'bad');
    retry.hidden = false;
    return;
  }
  if (!enabled) {
    setNote(raiseNote, '');
    return;
  }
  const active = sections.filter((section) => !excluded.includes(section.nodeId));
  if (!active.length) {
    setNote(raiseNote, 'Выберите разделы', 'link');
    return;
  }
  const next = Math.min(...active.map((section) => section.nextAt));
  setNote(raiseNote, next <= Date.now() ? 'Поднимет сейчас' : `Поднимет в ${new Date(next).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`);
}

async function renderAuto() {
  const settings = withDefaults(await autoSettingsItem.getValue());
  const state = await autoStateItem.getValue();
  autoSwitch.setAttribute('aria-checked', String(settings.enabled));
  if (settings.away.enabled) {
    setNote(autoNote, 'Режим «Не на месте»');
    return;
  }
  if (!settings.enabled) {
    setNote(autoNote, '');
    return;
  }
  if (!activeAutoParts(settings).length) {
    setNote(autoNote, 'Заполните ответы', 'link');
    return;
  }
  const dayStart = new Date().setHours(0, 0, 0, 0);
  const sent = (state.log ?? []).filter((entry) => entry.at >= dayStart && SENT_KINDS.has(entry.kind)).length;
  setNote(autoNote, sent ? `Сегодня ответил ${times(sent)}` : '');
}

async function renderPrivacy() {
  privacySwitch.setAttribute('aria-checked', String(await privacyItem.getValue()));
}

raiseSwitch.addEventListener('click', async () => {
  await autoRaiseItem.setValue(!(await autoRaiseItem.getValue()));
});

retry.addEventListener('click', async () => {
  retry.disabled = true;
  setNote(raiseNote, 'Поднимаю…');
  retry.hidden = true;
  await sendMessage<TaskReply>({ type: 'raise-now' });
  retry.disabled = false;
  renderRaise();
});

autoSwitch.addEventListener('click', async () => {
  const settings = withDefaults(await autoSettingsItem.getValue());
  if (!settings.enabled) {
    const parts = activeAutoParts(settings);
    const ok = await confirmAction({
      title: 'Включить автоответы?',
      text: parts.length
        ? 'Wingman будет писать покупателям от вашего имени, пока открыт браузер. Включено:'
        : 'Ответы не заполнены - покупателям ничего не уйдёт, пока вы их не впишете.',
      points: parts,
      confirm: 'Включить',
    });
    if (!ok) {
      return;
    }
  }
  await autoSettingsItem.setValue({ ...settings, enabled: !settings.enabled });
});

privacySwitch.addEventListener('click', async () => {
  await privacyItem.setValue(!(await privacyItem.getValue()));
});

for (const [node, tab] of [
  [raiseNote, 'raise'],
  [autoNote, 'auto'],
] as const) {
  const open = async () => {
    if (node.classList.contains('link')) {
      await openSettings(tab);
      window.close();
    }
  };
  node.addEventListener('click', open);
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}

byId('settings').addEventListener('click', async () => {
  await openSettings();
  window.close();
});

accountItem.watch((account) => renderAccount(account, false));
for (const item of [autoRaiseItem, runningItem, lastErrorItem, sectionsItem, excludedItem]) {
  item.watch(renderRaise);
}
autoSettingsItem.watch(renderAuto);
autoStateItem.watch(renderAuto);
privacyItem.watch(renderPrivacy);

renderRaise();
renderAuto();
renderPrivacy();

let account = await accountItem.getValue();
if (!account) {
  renderAccount(null, true);
  await sendMessage({ type: 'check-account' });
  account = await accountItem.getValue();
}
renderAccount(account, false);
if (account) {
  renderSummary();
}
