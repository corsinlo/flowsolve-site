import type { Page } from '@playwright/test';

export interface RequestGuard {
  crossOriginRequests: string[];
  disallowedSameOriginRequests: string[];
  failedSameOriginRequests: string[];
  nonOkSameOriginResponses: string[];
}

const PUBLIC_ASSET_PATHS = new Set([
  '/flowsolve-site/brand/flowsolve-app-icon.svg',
  '/flowsolve-site/brand/flowsolve-logo-horizontal-reversed.svg',
  '/flowsolve-site/brand/flowsolve-logo-horizontal.svg',
  '/flowsolve-site/brand/flowsolve-logo-monochrome.svg',
  '/flowsolve-site/brand/flowsolve-mark.svg',
  '/flowsolve-site/favicon.svg',
  '/flowsolve-site/flowsolve-og.png',
]);

export function isAllowedStaticPath(pathname: string): boolean {
  return /^\/flowsolve-site\/(?:en|it|nl)\/$/.test(pathname)
    || /^\/flowsolve-site\/_astro\/[^/]+\.(?:css|js)$/.test(pathname)
    || PUBLIC_ASSET_PATHS.has(pathname);
}

export function installRequestGuard(
  page: Page,
  baseURL: string,
  allowedExternalUrls: readonly string[] = [],
): RequestGuard {
  const previewOrigin = new URL(baseURL).origin;
  const allowedExternal = new Set(allowedExternalUrls);
  const guard: RequestGuard = {
    crossOriginRequests: [],
    disallowedSameOriginRequests: [],
    failedSameOriginRequests: [],
    nonOkSameOriginResponses: [],
  };

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== previewOrigin) {
      if (!allowedExternal.has(request.url())) guard.crossOriginRequests.push(request.url());
    } else if (!isAllowedStaticPath(url.pathname)) {
      guard.disallowedSameOriginRequests.push(request.url());
    }
  });

  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    if (url.origin === previewOrigin) {
      guard.failedSameOriginRequests.push(`${request.failure()?.errorText ?? 'unknown'} ${request.url()}`);
    }
  });

  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === previewOrigin && !response.ok()) {
      guard.nonOkSameOriginResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  return guard;
}
