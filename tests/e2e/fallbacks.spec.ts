import { expect, test } from '@playwright/test';
import { installRequestGuard } from './request-guard';
import { installHighCapabilitySceneProfile } from './scene-capabilities';

const REQUEST_PILOT_URL = 'https://github.com/corsinlo/flowsolve-site/issues/new';
const PILOT_SIGN_IN_URL = 'https://www.linkedin.com/login';

test('keeps the complete journey usable when enhancement is unavailable', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'get-context-null') {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.getContext = () => null;
    });
  }
  if (testInfo.project.name === 'webgl-context-lost') {
    await installHighCapabilitySceneProfile(page);
  }

  const guard = installRequestGuard(page, testInfo.project.use.baseURL as string, [
    REQUEST_PILOT_URL,
    PILOT_SIGN_IN_URL,
  ]);
  await page.goto('en/');

  if (testInfo.project.name === 'reduced-motion' || testInfo.project.name === 'get-context-null') {
    const island = page.locator('#resolution-story > astro-island[client="visible"]');
    await expect(island).toBeVisible();
    await island.scrollIntoViewIfNeeded();
    await expect(island).not.toHaveAttribute('ssr', '');
  }

  if (testInfo.project.name === 'webgl-context-lost') {
    const island = page.locator('#resolution-story > astro-island[client="visible"]');
    await expect(island).toBeVisible();
    await island.scrollIntoViewIfNeeded();
    const canvas = page.locator('[data-resolution-scene] canvas');
    await expect(canvas).toBeVisible();
    await canvas.dispatchEvent('webglcontextlost', { cancelable: true });
    await expect(canvas).toHaveCount(0);
  }

  if (testInfo.project.name === 'reduced-motion') {
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await expect(page.locator('[data-resolution-scene]')).toHaveCount(0);
  }
  if (testInfo.project.name === 'get-context-null') {
    await expect(page.locator('[data-resolution-scene] canvas')).toHaveCount(0);
  }

  const stages = page.locator('[data-story-stage]');
  await expect(stages).toHaveCount(6);
  for (const stage of await stages.all()) await expect(stage).toBeVisible();

  await expect(page.getByRole('heading', { level: 2, name: 'Evidence first. Human controlled.' })).toBeVisible();
  const localeNavigation = page.getByRole('navigation', { name: 'Choose language' });
  await expect(localeNavigation).toBeVisible();
  await expect(localeNavigation.getByRole('link', { name: 'IT' }).first()).toHaveAttribute(
    'href',
    '/flowsolve-site/it/',
  );

  const pilotLinks = page.getByRole('link', { name: /^Request a pilot/ });
  const signInLinks = page.getByRole('link', { name: /^Pilot sign in/ });
  await expect(pilotLinks).toHaveCount(2);
  await expect(signInLinks).toHaveCount(2);
  for (const link of await pilotLinks.all()) {
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', REQUEST_PILOT_URL);
  }
  for (const link of await signInLinks.all()) {
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', PILOT_SIGN_IN_URL);
  }

  const activatedUrls: string[] = [];
  await page.context().route((url) => (
    url.href === REQUEST_PILOT_URL || url.href === PILOT_SIGN_IN_URL
  ), async (route) => {
    activatedUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Flowsolve CTA test target</title>',
    });
  });

  const pointerCta = signInLinks.first();
  const pointerPopup = page.waitForEvent('popup');
  await pointerCta.click();
  const pointerPopupPage = await pointerPopup;
  await pointerPopupPage.waitForLoadState('domcontentloaded');
  await expect(pointerPopupPage).toHaveURL(PILOT_SIGN_IN_URL);
  await pointerPopupPage.close();
  await expect.poll(() => activatedUrls).toContain(PILOT_SIGN_IN_URL);

  const keyboardCta = pilotLinks.first();
  await keyboardCta.focus();
  await expect(keyboardCta).toBeFocused();
  const keyboardPopup = page.waitForEvent('popup');
  await page.keyboard.press('Enter');
  const keyboardPopupPage = await keyboardPopup;
  await keyboardPopupPage.waitForLoadState('domcontentloaded');
  await expect(keyboardPopupPage).toHaveURL(REQUEST_PILOT_URL);
  await keyboardPopupPage.close();
  await expect.poll(() => activatedUrls).toContain(REQUEST_PILOT_URL);

  await localeNavigation.getByRole('link', { name: 'IT' }).first().click();
  await expect(page).toHaveURL(/\/flowsolve-site\/it\/$/);
  await expect(page.getByRole('heading', {
    level: 1,
    name: 'Da una richiesta confusa a una bozza di preventivo supportata da evidenze.',
  })).toBeVisible();
  expect(guard.crossOriginRequests).toEqual([]);
  expect(guard.disallowedSameOriginRequests).toEqual([]);
  expect(guard.failedSameOriginRequests).toEqual([]);
  expect(guard.nonOkSameOriginResponses).toEqual([]);
});
