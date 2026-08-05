import { SITE } from '../config/site';
import type { Locale, PublicLinks } from '../i18n/types';

const pageOrigin = new URL(SITE.origin);
const base = SITE.base.replace(/\/$/, '');

export function withBase(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function localePath(locale: Locale): string {
  return withBase(`/${locale}/`);
}

export function canonicalUrl(locale: Locale): string {
  return new URL(localePath(locale), SITE.origin).href;
}

function parsePublicUrl(value: string | undefined, name: string): URL {
  if (!value) throw new Error(`${name} is required for production builds.`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS URL without credentials, query, or fragment.`);
  }
  if (url.origin === pageOrigin.origin) {
    throw new Error(`${name} must not use the GitHub Pages origin.`);
  }
  return url;
}

export function getPublicLinks(env: ImportMetaEnv): PublicLinks {
  if (env.PUBLIC_PREVIEW_MODE === 'true') {
    if (env.PUBLIC_PILOT_REQUEST_URL !== undefined || env.PUBLIC_PILOT_SIGN_IN_URL !== undefined) {
      throw new Error('PUBLIC_PILOT_REQUEST_URL and PUBLIC_PILOT_SIGN_IN_URL must be absent in preview mode.');
    }
    return { mode: 'preview' };
  }

  if (env.PUBLIC_PREVIEW_MODE) {
    throw new Error('PUBLIC_PREVIEW_MODE must be exactly true when set.');
  }

  return {
    mode: 'live',
    requestPilot: parsePublicUrl(env.PUBLIC_PILOT_REQUEST_URL, 'PUBLIC_PILOT_REQUEST_URL'),
    pilotSignIn: parsePublicUrl(env.PUBLIC_PILOT_SIGN_IN_URL, 'PUBLIC_PILOT_SIGN_IN_URL'),
  };
}
