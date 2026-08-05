import { describe, expect, it } from 'vitest';
import { EN_COPY, assertProductionKeyParity, resolveCopy } from './index';

describe('localized landing copy', () => {
  it('has complete production dictionaries and English fallback', () => {
    expect(assertProductionKeyParity()).toEqual({ en: true, it: true, nl: true });
    expect(resolveCopy('xx').hero.title).toBe(EN_COPY.hero.title);
  });

  it('merges nested partial copy while replacing arrays atomically', () => {
    const copy = resolveCopy('en', {
      en: { problem: { costs: ['Only this cost'] } },
      it: {},
      nl: {},
    });

    expect(copy.problem.costs).toEqual(['Only this cost']);
    expect(copy.problem.heading).toBe(EN_COPY.problem.heading);
  });
});
