import { describe, expect, it } from 'vitest';
import { SITE } from './site';

describe('public site deployment contract', () => {
  it('targets the project Pages path as a static build', () => {
    expect(SITE).toEqual({
      origin: 'https://corsinlo.github.io',
      base: '/flowsolve-site',
      output: 'static',
      trailingSlash: 'always',
    });
  });
});
