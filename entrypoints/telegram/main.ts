import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/latin-600.css';
import { hasTelegramAccess, requestTelegramAccess } from '../../lib/telegram-access';

const allow = document.getElementById('allow') as HTMLButtonElement;
const later = document.getElementById('later') as HTMLButtonElement;
const status = document.getElementById('status')!;

async function closeTab() {
  const tab = await browser.tabs.getCurrent();
  if (tab?.id !== undefined) {
    await browser.tabs.remove(tab.id);
  }
}

function showDone() {
  status.hidden = false;
  status.textContent = 'Разрешение выдано, можно вернуться к настройкам';
  allow.hidden = true;
  later.textContent = 'Закрыть';
}

allow.addEventListener('click', async () => {
  allow.disabled = true;
  const granted = await requestTelegramAccess().catch(() => false);
  allow.disabled = false;
  if (granted) {
    showDone();
    setTimeout(closeTab, 1500);
    return;
  }
  status.hidden = false;
  status.textContent = 'Разрешение не выдано, уведомления в Telegram не отправляются';
});

later.addEventListener('click', closeTab);

if (await hasTelegramAccess()) {
  showDone();
}
