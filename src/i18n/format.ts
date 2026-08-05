import type { Locale } from './types';

const numberLocales: Record<Locale, string> = { en: 'en-GB', it: 'it-IT', nl: 'nl-NL' };

function formatter(locale: Locale) {
  return new Intl.NumberFormat(numberLocales[locale], {
    style: 'currency',
    currency: 'EUR',
    currencyDisplay: 'symbol',
  });
}

export function formatCurrency(locale: Locale, amountMinor: number): string {
  return formatter(locale).format(amountMinor / 100);
}

export function formatCurrencyParts(locale: Locale, amountMinor: number): Intl.NumberFormatPart[] {
  return formatter(locale).formatToParts(amountMinor / 100);
}
