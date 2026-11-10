import { browser, storage } from '#imports';
import type { SoundKind, SoundSettings } from './auto-rules';

export const SOUNDS: { id: string; name: string; file: string }[] = [
  { id: 'fanfare', name: 'Фанфара', file: 'fanfare.ogg' },
  { id: 'coin', name: 'Монетка', file: 'coin.ogg' },
  { id: 'glass', name: 'Стекло', file: 'glass.ogg' },
  { id: 'steps', name: 'Лесенка', file: 'steps.ogg' },
  { id: 'bell', name: 'Колокольчик', file: 'bell.ogg' },
  { id: 'flow', name: 'Перелив', file: 'flow.ogg' },
];

export const SOUND_FILE_LIMIT = 1_000_000;

const extensionUrl = (path: string) => browser.runtime.getURL(path as Parameters<typeof browser.runtime.getURL>[0]);

export const USER_SOUND_LIMIT = 10;

export const USER_SOUNDS_BYTES = 6_000_000;

export type UserSound = { id: string; name: string; data: string };

export const userSoundsItem = storage.defineItem<UserSound[]>('local:userSounds', { fallback: [] });

const legacySoundItem = storage.defineItem<{ name: string; data: string } | null>('local:soundFile', { fallback: null });

export async function migrateSounds(settings: SoundSettings): Promise<SoundSettings | null> {
  const legacy = await legacySoundItem.getValue();
  if (!legacy) {
    return null;
  }
  const id = 'u:legacy';
  await userSoundsItem.setValue([...(await userSoundsItem.getValue()).filter((item) => item.id !== id), { id, name: legacy.name, data: legacy.data }]);
  await legacySoundItem.removeValue();
  const next = { ...settings };
  for (const kind of ['order', 'message', 'money', 'other'] as SoundKind[]) {
    if (next[kind] === 'custom') {
      next[kind] = id;
    }
  }
  return next;
}

export async function soundSource(id: string): Promise<string | null> {
  if (id.startsWith('u:')) {
    return (await userSoundsItem.getValue()).find((item) => item.id === id)?.data ?? null;
  }
  const sound = SOUNDS.find((item) => item.id === id);
  return sound ? extensionUrl(`/sounds/${sound.file}`) : null;
}

let creating: Promise<void> | null = null;

async function offscreenReady() {
  const url = extensionUrl('/offscreen.html');
  const contexts = await browser.runtime.getContexts({ contextTypes: [browser.runtime.ContextType.OFFSCREEN_DOCUMENT], documentUrls: [url] });
  if (contexts.length) {
    return;
  }
  creating ??= browser.offscreen
    .createDocument({ url, reasons: [browser.offscreen.Reason.AUDIO_PLAYBACK], justification: 'Звук уведомления Wingman' })
    .catch(() => null)
    .then(() => {
      creating = null;
    });
  await creating;
}

export async function playSound(src: string, volume: number) {
  if (import.meta.env.FIREFOX) {
    const audio = new Audio(src);
    audio.volume = volume;
    await audio.play().catch(() => null);
    return;
  }
  await offscreenReady();
  await browser.runtime.sendMessage({ type: 'play-sound', src, volume }).catch(() => null);
}

export async function kindSource(settings: SoundSettings, kind: SoundKind): Promise<string | null> {
  const choice = settings[kind];
  return choice === 'system' || choice === 'off' ? null : soundSource(choice);
}
