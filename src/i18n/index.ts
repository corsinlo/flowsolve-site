import { EN_COPY } from './en';
import { IT_COPY } from './it';
import { NL_COPY } from './nl';
import { LOCALES, STORY_STAGE_IDS, type DeepPartial, type LandingCopy, type Locale } from './types';

export { EN_COPY, IT_COPY, LOCALES, NL_COPY, STORY_STAGE_IDS };
export type { DeepPartial, LandingCopy, Locale, PublicLinks } from './types';

const productionCopy: Record<Locale, LandingCopy> = { en: EN_COPY, it: IT_COPY, nl: NL_COPY };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

function mergeCopy<T>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override as T;
  if (typeof base !== 'object' || base === null || typeof override !== 'object' || override === null) return override as T;

  const merged = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) merged[key] = mergeCopy((base as Record<string, unknown>)[key], value as never);
  }
  return merged as T;
}

export function resolveCopy(locale: string, dictionaries: Record<Locale, DeepPartial<LandingCopy>> = productionCopy): LandingCopy {
  const preferred = isLocale(locale) ? dictionaries[locale] : dictionaries.en;
  return mergeCopy(EN_COPY, preferred);
}

function sameShape(reference: unknown, candidate: unknown): boolean {
  if (Array.isArray(reference)) {
    return Array.isArray(candidate) && reference.length === candidate.length && reference.every((item, index) => sameShape(item, candidate[index]));
  }
  if (typeof reference !== 'object' || reference === null) return candidate !== undefined;
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return false;
  const referenceRecord = reference as Record<string, unknown>;
  const candidateRecord = candidate as Record<string, unknown>;
  return Object.keys(referenceRecord).length === Object.keys(candidateRecord).length
    && Object.keys(referenceRecord).every((key) => key in candidateRecord && sameShape(referenceRecord[key], candidateRecord[key]));
}

export function assertProductionKeyParity(): Record<Locale, boolean> {
  return Object.fromEntries(LOCALES.map((locale) => [locale, sameShape(EN_COPY, productionCopy[locale])])) as Record<Locale, boolean>;
}
