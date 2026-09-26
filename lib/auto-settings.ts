import { storage } from '#imports';
import { DEFAULT_AUTO, EMPTY_STATE, type AutoSettings, type AutoState } from './auto-rules.ts';

export * from './auto-rules.ts';

export const autoSettingsItem = storage.defineItem<AutoSettings>('local:auto', { fallback: DEFAULT_AUTO });
export const autoStateItem = storage.defineItem<AutoState>('local:autoState', { fallback: EMPTY_STATE });
