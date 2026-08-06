import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const viewports = [
  { name: '320px', width: 320, height: 900 },
  { name: '768px', width: 768, height: 900 },
  { name: '1440px', width: 1440, height: 1000 },
  { name: '1280px at 200% equivalent', width: 640, height: 900 },
] as const;

for (const viewport of viewports) {
  test(`English page stays accessible at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('en/');

    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(widths.document, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);
    expect(widths.body, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);

    const headings = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll((nodes) => nodes.map((node) => ({
      level: Number(node.tagName.slice(1)),
      text: node.textContent?.trim(),
    })));
    expect(headings[0]?.level, JSON.stringify(headings)).toBe(1);
    for (let index = 1; index < headings.length; index += 1) {
      expect(headings[index].level, JSON.stringify(headings[index])).toBeLessThanOrEqual(headings[index - 1].level + 1);
    }

    await expect(page.locator('nav.section-navigation')).toHaveAttribute('aria-label', 'Page navigation');
    await expect(page.locator('nav[data-locale-navigation]')).toHaveAttribute('aria-label', 'Choose language');

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to content' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();
    const focusStyle = await skipLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe('none');
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator('#main-content')).toBeFocused();
    await page.keyboard.press('Tab');
    const firstCta = page.getByRole('link', { name: /^Request a pilot/ }).first();
    await expect(firstCta).toBeFocused();
    const ctaFocusStyle = await firstCta.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(ctaFocusStyle.outlineStyle).not.toBe('none');
    expect(Number.parseFloat(ctaFocusStyle.outlineWidth)).toBeGreaterThan(0);

    const ordinaryFocusTargets = [
      page.locator('nav[data-locale-navigation] a:visible').first(),
      ...(viewport.width === 1440 ? [page.locator('nav.section-navigation a').first()] : []),
    ];
    for (const target of ordinaryFocusTargets) {
      await target.focus();
      await expect(target).toBeFocused();
      const ordinaryFocusStyle = await target.evaluate((element) => {
        const style = getComputedStyle(element);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      expect(ordinaryFocusStyle.outlineStyle).not.toBe('none');
      expect(Number.parseFloat(ordinaryFocusStyle.outlineWidth)).toBeGreaterThan(0);
    }

    const stages = page.locator('[data-story-stage]');
    await expect(stages).toHaveCount(6);
    for (const stage of await stages.all()) await expect(stage).toBeVisible();
    await expect(page.locator('#trust')).toBeVisible();
    await expect(page.locator('#resolution-story > .scene-poster-shell')).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const severe = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
    const evidence = severe.flatMap((violation) => violation.nodes.map((node) => ({
      id: violation.id,
      impact: violation.impact,
      target: node.target,
      summary: node.failureSummary,
    })));
    expect(evidence).toEqual([]);
  });
}
