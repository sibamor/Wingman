type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';
type Pair = { sourceLanguage: string; targetLanguage: string };
type Monitor = { addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void };
type Translator = { translate(text: string): Promise<string> };
type TranslatorFactory = { create(options: Pair & { monitor?: (monitor: Monitor) => void }): Promise<Translator>; availability(options: Pair): Promise<Availability> };
type Detector = { detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> };
type DetectorFactory = { create(): Promise<Detector>; availability?(): Promise<Availability> };
type I18n = { detectLanguage?(text: string): Promise<{ isReliable: boolean; languages: { language: string; percentage: number }[] }> };

const api = globalThis as unknown as { Translator?: TranslatorFactory; LanguageDetector?: DetectorFactory; chrome?: { i18n?: I18n } };

const NAMES: Record<string, string> = {
  en: 'английский',
  uk: 'украинский',
  be: 'белорусский',
  kk: 'казахский',
  uz: 'узбекский',
  de: 'немецкий',
  fr: 'французский',
  es: 'испанский',
  it: 'итальянский',
  pt: 'португальский',
  pl: 'польский',
  cs: 'чешский',
  tr: 'турецкий',
  nl: 'нидерландский',
  ro: 'румынский',
  bg: 'болгарский',
  lt: 'литовский',
  zh: 'китайский',
  ja: 'японский',
  ko: 'корейский',
  ar: 'арабский',
  vi: 'вьетнамский',
  id: 'индонезийский',
  th: 'тайский',
  he: 'иврит',
  hi: 'хинди',
};

const translators = new Map<string, Promise<Translator>>();
const cache = new Map<string, string>();
let detector: Promise<Detector> | null = null;

export class TranslateError extends Error {
  readonly needsClick: boolean;

  constructor(message: string, needsClick = false) {
    super(message);
    this.needsClick = needsClick;
  }
}

export function canTranslate(): boolean {
  return Boolean(api.Translator);
}

export function languageName(code: string): string {
  return NAMES[code] ?? code;
}

export function fromLanguage(code: string): string {
  const name = languageName(code);
  return name.endsWith('ий') ? `${name.slice(0, -2)}ого` : name === 'иврит' ? 'иврита' : name;
}

export function markerLanguage(text: string): string | null {
  if (/[әғқңөұүһ]/i.test(text)) {
    return 'kk';
  }
  if (/[ў]/i.test(text)) {
    return 'be';
  }
  if (/[іїєґ]/i.test(text)) {
    return /[ыэъё]/i.test(text) ? 'be' : 'uk';
  }
  return null;
}

async function readyDetector(): Promise<Detector | null> {
  if (!api.LanguageDetector) {
    return null;
  }
  if (!detector) {
    const state = await api.LanguageDetector.availability?.().catch(() => 'unavailable' as const);
    if (state !== 'available') {
      return null;
    }
    detector = api.LanguageDetector.create();
  }
  return detector.catch(() => {
    detector = null;
    return null;
  });
}

export async function detectLanguage(text: string): Promise<string> {
  const marked = markerLanguage(text);
  if (marked) {
    return marked;
  }
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) {
    return 'und';
  }
  const found = await readyDetector();
  if (found) {
    try {
      const [top] = await found.detect(text);
      if (top && top.confidence > 0.5 && top.detectedLanguage !== 'und') {
        return top.detectedLanguage.split('-')[0]!;
      }
    } catch {}
  }
  try {
    const result = await api.chrome?.i18n?.detectLanguage?.(text);
    const top = result?.languages?.[0];
    if (result?.isReliable && top && top.language !== 'und') {
      return top.language.split('-')[0]!;
    }
  } catch {}
  return /[а-яё]/i.test(letters) ? 'ru' : /^[a-z]+$/i.test(letters) ? 'en' : 'und';
}

function chunks(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if (current && current.length + line.length > 900) {
      parts.push(current);
      current = '';
    }
    current = current ? `${current}\n${line}` : line;
  }
  parts.push(current);
  return parts;
}

function translator(pair: Pair, onProgress?: (percent: number) => void): Promise<Translator> {
  const key = `${pair.sourceLanguage}>${pair.targetLanguage}`;
  let found = translators.get(key);
  if (!found) {
    found = api.Translator!.create({
      ...pair,
      monitor: (monitor) => monitor.addEventListener('downloadprogress', (event) => onProgress?.(Math.round(event.loaded * 100))),
    });
    translators.set(key, found);
    found.catch(() => translators.delete(key));
  }
  return found;
}

export async function translate(text: string, target: string, options: { source?: string; onProgress?: (percent: number) => void } = {}): Promise<string> {
  if (!api.Translator) {
    throw new TranslateError('Перевод работает в Chrome 138+ и Edge 148+ на компьютере');
  }
  const source = options.source ?? (await detectLanguage(text));
  if (source === 'und') {
    throw new TranslateError('Не удалось определить язык');
  }
  if (source === target) {
    return text;
  }
  const key = `${source}>${target}|${text}`;
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let result: string;
  try {
    const worker = await translator({ sourceLanguage: source, targetLanguage: target }, options.onProgress);
    const parts: string[] = [];
    for (const part of chunks(text)) {
      parts.push(part.trim() ? await worker.translate(part) : part);
    }
    result = parts.join('\n');
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError') {
      throw new TranslateError(`Нажмите, чтобы скачать перевод с ${fromLanguage(source)}`, true);
    }
    if (name === 'NotSupportedError') {
      throw new TranslateError(`Браузер не переводит с ${fromLanguage(source)} на ${languageName(target)}`);
    }
    throw new TranslateError('Не удалось перевести, попробуйте ещё раз');
  }
  if (cache.size > 500) {
    cache.delete(cache.keys().next().value!);
  }
  cache.set(key, result);
  return result;
}
