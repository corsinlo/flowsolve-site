import { describe, expect, it } from 'vitest';
import { canonicalUrl, getPublicLinks, localePath, withBase } from './urls';

const envWith = (key: 'PUBLIC_PILOT_REQUEST_URL' | 'PUBLIC_PILOT_SIGN_IN_URL', value: string) => ({
  PUBLIC_PILOT_REQUEST_URL: 'https://request.example.test/pilot',
  PUBLIC_PILOT_SIGN_IN_URL: 'https://app.example.test/sign-in',
  [key]: value,
}) as ImportMetaEnv;

describe('public URLs', () => {
  it('returns an explicit preview state only for a strict CTA-less preview environment', () => {
    expect(getPublicLinks({ PUBLIC_PREVIEW_MODE: 'true' } as ImportMetaEnv)).toEqual({ mode: 'preview' });
    expect(() => getPublicLinks({
      PUBLIC_PREVIEW_MODE: 'true',
      PUBLIC_PILOT_REQUEST_URL: 'https://request.example.test/pilot',
    } as ImportMetaEnv)).toThrow(/must be absent/i);
    expect(() => getPublicLinks({
      PUBLIC_PREVIEW_MODE: 'true',
      PUBLIC_PILOT_SIGN_IN_URL: 'https://app.example.test/sign-in',
    } as ImportMetaEnv)).toThrow(/must be absent/i);
    expect(() => getPublicLinks({ PUBLIC_PREVIEW_MODE: 'TRUE' } as ImportMetaEnv)).toThrow(/PUBLIC_PREVIEW_MODE/);
  });

  it('rejects unsafe conversion destinations', () => {
    expect(() => getPublicLinks(envWith('PUBLIC_PILOT_REQUEST_URL', 'http://example.test'))).toThrow();
    expect(() => getPublicLinks(envWith('PUBLIC_PILOT_REQUEST_URL', 'https://example.test/?email=a@b.test'))).toThrow();
    expect(() => getPublicLinks(envWith('PUBLIC_PILOT_SIGN_IN_URL', 'https://user:pass@example.test/sign-in'))).toThrow();
    expect(() => getPublicLinks(envWith('PUBLIC_PILOT_SIGN_IN_URL', 'https://corsinlo.github.io/flowsolve-site/'))).toThrow();
  });

  it('accepts safe HTTPS destinations and produces base-aware locale URLs', () => {
    const links = getPublicLinks(envWith('PUBLIC_PILOT_REQUEST_URL', 'https://request.example.test/pilot'));
    expect(links).toMatchObject({ mode: 'live' });
    if (links.mode !== 'live') throw new Error('Expected live public links');
    expect(links.requestPilot.href).toBe('https://request.example.test/pilot');
    expect(withBase('/en/')).toBe('/flowsolve-site/en/');
    expect(localePath('it')).toBe('/flowsolve-site/it/');
    expect(canonicalUrl('nl')).toBe('https://corsinlo.github.io/flowsolve-site/nl/');
  });
});
