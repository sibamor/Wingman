browser.runtime.onMessage.addListener((message: { type?: string; src?: string; volume?: number }) => {
  if (message.type !== 'play-sound' || !message.src) {
    return false;
  }
  const audio = new Audio(message.src);
  audio.volume = Math.max(0, Math.min(1, message.volume ?? 1));
  audio.play().catch(() => null);
  return false;
});
