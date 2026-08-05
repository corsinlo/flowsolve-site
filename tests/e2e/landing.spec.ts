import { expect, test } from '@playwright/test';
import { installRequestGuard, isAllowedStaticPath } from './request-guard';

const SITE_ORIGIN = 'https://corsinlo.github.io';
const REQUEST_PILOT_URL = 'https://github.com/corsinlo/flowsolve-site/issues/new';
const PILOT_SIGN_IN_URL = 'https://www.linkedin.com/login';
const DELAYED_OUTBOUND_PROBE_URL = 'https://delayed-review-probe.invalid/collect';

const locales = {
  en: {
    h1: 'From messy request to evidence-backed quote draft.',
    futureStatus: 'Under evaluation',
    pageNavigation: 'Page navigation',
    languageNavigation: 'Choose language',
    storyLink: 'Resolution story',
    requestPilot: 'Request a pilot',
    signIn: 'Pilot sign in',
  },
  it: {
    h1: 'Da una richiesta confusa a una bozza di preventivo supportata da evidenze.',
    futureStatus: 'In fase di valutazione',
    pageNavigation: 'Navigazione della pagina',
    languageNavigation: 'Scegli la lingua',
    storyLink: 'Flusso di risoluzione',
    requestPilot: 'Richiedi un pilota',
    signIn: 'Accedi al pilota',
  },
  nl: {
    h1: 'Van een rommelige aanvraag naar een offerteconcept met onderbouwing.',
    futureStatus: 'In onderzoek',
    pageNavigation: 'Paginanavigatie',
    languageNavigation: 'Kies een taal',
    storyLink: 'Oplossingsverhaal',
    requestPilot: 'Pilot aanvragen',
    signIn: 'Inloggen op pilot',
  },
} as const;

for (const [locale, copy] of Object.entries(locales)) {
  test(`${locale} exposes a localized, self-contained navigation journey`, async ({ page, baseURL }) => {
    if (locale === 'en') {
      for (const path of [
        '/flowsolve-site/en/',
        '/flowsolve-site/_astro/client.A1b2C3.js',
        '/flowsolve-site/_astro/BaseLayout.D4e5F6.css',
        '/flowsolve-site/brand/flowsolve-logo-horizontal-reversed.svg',
        '/flowsolve-site/favicon.svg',
      ]) expect(isAllowedStaticPath(path), path).toBe(true);

      for (const path of [
        '/flowsolve-site/api/events',
        '/flowsolve-site/tracking/collect.js',
        '/flowsolve-site/en/track',
        '/flowsolve-site/unrecognized',
        '/flowsolve-site/_astro/extensionless',
        '/flowsolve-site/_astro/executable.bin',
        '/outside-the-site/app.js',
      ]) expect(isAllowedStaticPath(path), path).toBe(false);
    }

    const guard = installRequestGuard(page, baseURL!);

    await page.goto(`${locale}/`);

    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByRole('heading', { level: 1, name: copy.h1 })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${SITE_ORIGIN}/flowsolve-site/${locale}/`,
    );

    for (const alternateLocale of Object.keys(locales)) {
      await expect(page.locator(`link[rel="alternate"][hreflang="${alternateLocale}"]`)).toHaveAttribute(
        'href',
        `${SITE_ORIGIN}/flowsolve-site/${alternateLocale}/`,
      );
    }
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      'href',
      `${SITE_ORIGIN}/flowsolve-site/en/`,
    );

    await expect(page.locator('[data-status="under-evaluation"] .pack-status')).toHaveCount(3);
    await expect(page.locator('[data-status="under-evaluation"] .pack-status')).toHaveText([
      copy.futureStatus,
      copy.futureStatus,
      copy.futureStatus,
    ]);

    const pageNavigation = page.getByRole('navigation', { name: copy.pageNavigation });
    await expect(pageNavigation.getByRole('link', { name: copy.storyLink })).toHaveAttribute('href', '#story');
    for (const anchor of ['story', 'how', 'automotive', 'trust']) {
      await pageNavigation.locator(`a[href="#${anchor}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/#${anchor}$`));
      const target = page.locator(`#${anchor}`);
      await expect.poll(() => target.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(120);
      await expect.poll(() => target.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
      await expect(target).toBeInViewport();
    }

    const localeNavigation = page.getByRole('navigation', { name: copy.languageNavigation });
    await expect(localeNavigation).toBeVisible();
    for (const alternateLocale of Object.keys(locales)) {
      await expect(localeNavigation.getByRole('link', { name: alternateLocale.toUpperCase() }).first()).toHaveAttribute(
        'href',
        `/flowsolve-site/${alternateLocale}/#trust`,
      );
    }
    const pilotLinks = page.getByRole('link', { name: new RegExp(`^${copy.requestPilot}`) });
    const signInLinks = page.getByRole('link', { name: new RegExp(`^${copy.signIn}`) });
    await expect(pilotLinks).toHaveCount(2);
    await expect(signInLinks).toHaveCount(2);
    for (const link of await pilotLinks.all()) await expect(link).toHaveAttribute('href', REQUEST_PILOT_URL);
    for (const link of await signInLinks.all()) await expect(link).toHaveAttribute('href', PILOT_SIGN_IN_URL);

    await page.waitForLoadState('networkidle');
    expect(guard.crossOriginRequests).toEqual([]);
    expect(guard.disallowedSameOriginRequests).toEqual([]);
    expect(guard.failedSameOriginRequests).toEqual([]);
    expect(guard.nonOkSameOriginResponses).toEqual([]);

    const previewOrigin = new URL(baseURL!).origin;
    const abortedStaticProbeUrl = `${previewOrigin}/flowsolve-site/_astro/aborted-review-probe.js`;
    const delayedSameOriginProbeUrl = `${previewOrigin}/flowsolve-site/api/events`;
    const missingStaticProbeUrl = `${previewOrigin}/flowsolve-site/_astro/missing-review-probe.js`;
    if (locale === 'en') {
      await page.route(DELAYED_OUTBOUND_PROBE_URL, (route) => route.abort('blockedbyclient'));
      await page.route(abortedStaticProbeUrl, (route) => route.abort('failed'));
      await page.route(delayedSameOriginProbeUrl, (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      }));
      await page.evaluate(({ abortedUrl, delayedSameOriginUrl, delayedUrl, missingUrl }) => {
        const scope = globalThis as typeof globalThis & {
          __connectSrcViolations: Array<{ blockedUri: string; directive: string }>;
        };
        scope.__connectSrcViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          scope.__connectSrcViolations.push({
            blockedUri: event.blockedURI,
            directive: event.violatedDirective,
          });
        });
        void fetch(abortedUrl).catch(() => undefined);
        void fetch(missingUrl).catch(() => undefined);
        setTimeout(() => {
          void fetch(delayedUrl).catch(() => undefined);
          void fetch(delayedSameOriginUrl).catch(() => undefined);
        }, 1_200);
      }, {
        abortedUrl: abortedStaticProbeUrl,
        delayedSameOriginUrl: delayedSameOriginProbeUrl,
        delayedUrl: DELAYED_OUTBOUND_PROBE_URL,
        missingUrl: missingStaticProbeUrl,
      });
    }

    await page.waitForTimeout(1_300);
    if (locale === 'en') {
      const violations = await page.evaluate(() => (
        globalThis as typeof globalThis & {
          __connectSrcViolations: Array<{ blockedUri: string; directive: string }>;
        }
      ).__connectSrcViolations);
      expect(violations).toHaveLength(4);
      expect(violations.map(({ directive }) => directive)).toEqual([
        'connect-src',
        'connect-src',
        'connect-src',
        'connect-src',
      ]);
      expect(violations.map(({ blockedUri }) => blockedUri)).toEqual(expect.arrayContaining([
        abortedStaticProbeUrl,
        delayedSameOriginProbeUrl,
        DELAYED_OUTBOUND_PROBE_URL,
        missingStaticProbeUrl,
      ]));
    }
    expect({
      crossOrigin: guard.crossOriginRequests,
      disallowedSameOrigin: guard.disallowedSameOriginRequests,
      requestFailed: guard.failedSameOriginRequests,
      responseNonOk: guard.nonOkSameOriginResponses,
    }).toEqual({ crossOrigin: [], disallowedSameOrigin: [], requestFailed: [], responseNonOk: [] });
  });
}

test('keyboard locale navigation preserves the active section', async ({ page }) => {
  await page.goto('en/#how');

  const italianLink = page.locator(
    '[data-locale-navigation] .locale-switcher__set[data-preserves-section="how"] a[hreflang="it"]',
  );
  await expect(italianLink).toBeVisible();
  await expect(italianLink).toHaveAttribute('href', '/flowsolve-site/it/#how');
  await italianLink.focus();
  await expect(italianLink).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/flowsolve-site\/it\/#how$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Da una richiesta confusa a una bozza di preventivo supportata da evidenze.',
  })).toBeVisible();
  const target = page.locator('#how');
  await expect.poll(() => target.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(120);
  await expect.poll(() => target.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await expect(target).toBeInViewport();
  await page.waitForLoadState('networkidle');
});
