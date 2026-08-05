import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const locales = ['en', 'it', 'nl'] as const;
const fallbackBaseUrl = process.env.TASK3_PREVIEW_URL ?? 'http://127.0.0.1:4321/flowsolve-site/';

function localeUrl(locale: typeof locales[number], configuredBaseUrl?: string) {
  return new URL(`${locale}/`, configuredBaseUrl ?? fallbackBaseUrl).href;
}

for (const locale of locales) {
  test.describe(`${locale} Task 3 browser regressions`, () => {
    test.use({ viewport: { width: 320, height: 900 } });

    test('reflows without horizontal document overflow at 320px', async ({ page, baseURL }) => {
      await page.goto(localeUrl(locale, baseURL));

      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));

      expect(widths.document, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);
      expect(widths.body, JSON.stringify(widths)).toBeLessThanOrEqual(widths.viewport);
    });

    test('keeps the ivory pack kickers above 4.5:1 contrast', async ({ page, baseURL }) => {
      await page.goto(localeUrl(locale, baseURL));

      const ratios = await page.locator('#automotive .section-kicker, #future-packs .section-kicker').evaluateAll((elements) => {
        function channels(value: string): [number, number, number] {
          const result = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          if (!result || result.length !== 3) throw new Error(`Unsupported color: ${value}`);
          return result as [number, number, number];
        }

        function luminance(value: string) {
          const linear = channels(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        }

        function opaqueBackground(element: Element) {
          let current: Element | null = element;
          while (current) {
            const color = getComputedStyle(current).backgroundColor;
            const alpha = Number(color.match(/[\d.]+/g)?.[3] ?? 1);
            if (alpha > 0) return color;
            current = current.parentElement;
          }
          return 'rgb(255, 255, 255)';
        }

        return elements.map((element) => {
          const foreground = getComputedStyle(element).color;
          const background = opaqueBackground(element);
          const lighter = Math.max(luminance(foreground), luminance(background));
          const darker = Math.min(luminance(foreground), luminance(background));
          return { text: element.textContent?.trim(), foreground, background, ratio: (lighter + 0.05) / (darker + 0.05) };
        });
      });

      expect(ratios).toHaveLength(2);
      for (const result of ratios) expect(result.ratio, JSON.stringify(result)).toBeGreaterThanOrEqual(4.5);
    });

    test('has no serious or critical color-contrast violations', async ({ page, baseURL }) => {
      await page.goto(localeUrl(locale, baseURL));

      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      const severe = results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical');
      const evidence = severe.flatMap((violation) => violation.nodes.map((node) => ({
        id: violation.id,
        impact: violation.impact,
        target: node.target,
        summary: node.failureSummary,
      })));

      expect(evidence).toEqual([]);
    });
  });
}
