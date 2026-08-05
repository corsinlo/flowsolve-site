import { describe, expect, it } from 'vitest';
import { formatCurrency, formatCurrencyParts } from './format';

describe('currency formatting', () => {
  it('formats illustrative EUR values in the selected locale', () => {
    expect(formatCurrencyParts('it', 129900)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'currency', value: '€' }),
    ]));
    expect(formatCurrency('nl', 129900)).toBe(new Intl.NumberFormat('nl-NL', {
      style: 'currency', currency: 'EUR', currencyDisplay: 'symbol',
    }).format(1299));
  });
});
