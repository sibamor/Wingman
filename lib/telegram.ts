import { hasTelegramAccess } from './telegram-access';

const API = 'https://api.telegram.org';

const NO_ACCESS = 'Разрешите отправку в Telegram в настройках уведомлений';

export async function sendTelegram(token: string, chatId: string, text: string, silent = false): Promise<string | null> {
  if (!(await hasTelegramAccess())) {
    return NO_ACCESS;
  }
  try {
    const response = await fetch(`${API}/bot${encodeURIComponent(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: silent, disable_web_page_preview: true }),
    });
    const data = (await response.json()) as { ok: boolean; description?: string };
    return data.ok ? null : data.description ?? `Telegram ответил ${response.status}`;
  } catch {
    return 'Telegram недоступен';
  }
}

export async function findTelegramChat(token: string): Promise<{ chatId: string; name: string } | { error: string }> {
  if (!(await hasTelegramAccess())) {
    return { error: NO_ACCESS };
  }
  try {
    const response = await fetch(`${API}/bot${encodeURIComponent(token)}/getUpdates`);
    const data = (await response.json()) as { ok: boolean; description?: string; result?: { message?: { chat: { id: number; first_name?: string; username?: string; title?: string } } }[] };
    if (!data.ok) {
      return { error: data.description ?? 'Неверный токен' };
    }
    const chat = [...(data.result ?? [])].reverse().find((update) => update.message)?.message?.chat;
    if (!chat) {
      return { error: 'Напишите боту /start и нажмите ещё раз' };
    }
    return { chatId: String(chat.id), name: chat.title ?? chat.username ?? chat.first_name ?? String(chat.id) };
  } catch {
    return { error: 'Telegram недоступен' };
  }
}
