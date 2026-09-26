type Translator = { translate(text: string): Promise<string> };
type TranslatorFactory = { create(options: { sourceLanguage: string; targetLanguage: string }): Promise<Translator>; availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string> };
type Detector = { detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> };
type DetectorFactory = { create(): Promise<Detector> };

const api = globalThis as unknown as { Translator?: TranslatorFactory; LanguageDetector?: DetectorFactory };
const translators = new Map<string, Promise<Translator>>();
let detector: Promise<Detector> | null = null;

export function canTranslate(): boolean {
  return Boolean(api.Translator);
}

export async function detectLanguage(text: string): Promise<string> {
  if (/[а-яё]/i.test(text) && !/[іїєґ]/i.test(text)) {
    return 'ru';
  }
  if (api.LanguageDetector) {
    try {
      detector ??= api.LanguageDetector.create();
      const [top] = await (await detector).detect(text);
      if (top && top.confidence > 0.4 && top.detectedLanguage !== 'und') {
        return top.detectedLanguage;
      }
    } catch {}
  }
  return /[іїєґ]/i.test(text) ? 'uk' : 'en';
}

export async function translate(text: string, target: string, source?: string): Promise<string> {
  if (!api.Translator) {
    throw new Error('Браузер не умеет переводить');
  }
  const from = source ?? (await detectLanguage(text));
  if (from === target) {
    return text;
  }
  const key = `${from}>${target}`;
  const factory = api.Translator;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let translator = translators.get(key);
    if (!translator) {
      translator = factory.create({ sourceLanguage: from, targetLanguage: target });
      translators.set(key, translator);
    }
    try {
      return await (await translator).translate(text);
    } catch {
      translators.delete(key);
      const state = await factory.availability({ sourceLanguage: from, targetLanguage: target }).catch(() => 'unavailable');
      if (state === 'unavailable') {
        throw new Error('Этот язык браузер переводить не умеет');
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('Модель перевода ещё скачивается, нажмите ещё раз');
}
