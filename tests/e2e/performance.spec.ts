import { expect, test, type Page } from '@playwright/test';
import {
  measureSettledInteraction,
  nearestRankP75,
  type InteractionMeasurement,
} from './performance-interactions';
import {
  installLowPowerSceneProfile,
} from './scene-capabilities';

const DESKTOP_VIEWPORT = { width: 1280, height: 480 };
const LAB_PAGE_VIEW_SAMPLES = 20;

async function settleRendering(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  }));
}

async function installInteractionDiagnostics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const diagnostics = {
      interactionDurations: {} as Record<string, number>,
      settleEventTiming: () => {},
    };
    Object.defineProperty(window, '__flowsolveInteractionPerformanceDiagnostics', {
      value: diagnostics,
    });

    const recordEventTiming = (entry: PerformanceEntry) => {
      const event = entry as PerformanceEventTiming;
      if (event.interactionId !== 0) {
        const id = String(event.interactionId);
        diagnostics.interactionDurations[id] = Math.max(
          diagnostics.interactionDurations[id] ?? 0,
          event.duration,
        );
      }
    };
    const eventTimingObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) recordEventTiming(entry);
    });
    diagnostics.settleEventTiming = () => {
      for (const entry of eventTimingObserver.takeRecords()) recordEventTiming(entry);
    };
    eventTimingObserver.observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit & { durationThreshold: number });
  });
}

test('keeps the static resolution poster available alongside every story stage', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('en/');

  const poster = page.locator('#resolution-story > .scene-poster-shell');
  await expect(poster).toBeVisible();
  await expect(page.locator('[data-resolution-scene]')).toHaveCount(0);

  const laterStage = page.locator('[data-story-stage="candidates"]');
  await laterStage.scrollIntoViewIfNeeded();
  await expect(laterStage).toBeInViewport();
  await expect(poster).toBeAttached();
  await expect(poster).toBeInViewport();
  const posterBounds = await poster.boundingBox();
  expect(posterBounds?.width).toBeGreaterThan(0);
  expect(posterBounds?.height).toBeGreaterThan(0);
});

test('production low-power fallback interactions stay within the lab INP proxy budget', {
  tag: '@lab-inp',
}, async ({ page }) => {
  test.setTimeout(120_000);
  await installLowPowerSceneProfile(page);
  await installInteractionDiagnostics(page);

  const readInteractionState = async () => {
    const state = await page.evaluate(() => {
      const diagnostics = (window as typeof window & {
        __flowsolveInteractionPerformanceDiagnostics: {
          interactionDurations: Record<string, number>;
          settleEventTiming: () => void;
        };
      }).__flowsolveInteractionPerformanceDiagnostics;
      diagnostics.settleEventTiming();
      const interactionCount = (performance as Performance & {
        interactionCount?: number;
      }).interactionCount;
      return {
        interactionCount: typeof interactionCount === 'number' ? interactionCount : null,
        durations: Object.entries(diagnostics.interactionDurations).map(([id, duration]) => [
          Number(id),
          duration,
        ] as const),
      };
    });
    expect(state.interactionCount, 'performance.interactionCount support is required').not.toBeNull();
    return {
      interactionCount: state.interactionCount!,
      durations: new Map(state.durations),
    };
  };
  const snapshotInteraction = async () => {
    const state = await readInteractionState();
    return {
      interactionCount: state.interactionCount,
      ids: new Set(state.durations.keys()),
    };
  };
  const measuredInteraction = async (
    before: Awaited<ReturnType<typeof snapshotInteraction>>,
    label: string,
  ): Promise<InteractionMeasurement> => {
    const { measurement, state: after } = await measureSettledInteraction({
      label,
      before,
      waitForInteractionCountIncrease: async (beforeInteractionCount) => {
        await expect.poll(
          async () => (await readInteractionState()).interactionCount,
          { message: `${label} did not increase performance.interactionCount`, timeout: 2_000 },
        ).toBeGreaterThan(beforeInteractionCount);
      },
      settleRenderingAndObserver: () => settleRendering(page),
      readInteractionState,
    });
    for (const id of measurement.interactionIds) {
      expect(after.durations.get(id), `${label} interaction ${id}`).toBeGreaterThan(0);
    }
    return measurement;
  };

  await page.setViewportSize(DESKTOP_VIEWPORT);
  const pageViewUpperBounds: number[] = [];
  const pageViewSummaries: string[] = [];

  for (let sampleIndex = 0; sampleIndex < LAB_PAGE_VIEW_SAMPLES; sampleIndex += 1) {
    await page.goto('en/');
    expect(await page.evaluate(() => ({
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
    }))).toEqual({ deviceMemory: 8, hardwareConcurrency: 2 });

    await expect(page.locator('#resolution-story > .scene-poster-shell')).toBeVisible();

    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
    });
    await page.bringToFront();
    await settleRendering(page);
    await page.locator('#main-content').focus();
    await settleRendering(page);

    const measurements: InteractionMeasurement[] = [];
    let beforeInteraction = await snapshotInteraction();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /^Request a pilot/ }).first()).toBeFocused();
    measurements.push(await measuredInteraction(beforeInteraction, 'CTA keyboard focus'));

    const howLink = page.locator('.section-navigation a[href="#how"]');
    await howLink.focus();
    await settleRendering(page);
    beforeInteraction = await snapshotInteraction();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/en\/#how$/);
    measurements.push(await measuredInteraction(beforeInteraction, 'section keyboard navigation'));

    const italianLink = page.locator(
      '[data-locale-navigation] .locale-switcher__set[data-preserves-section="how"] a[hreflang="it"]',
    );
    await expect(italianLink).toHaveAttribute('href', '/flowsolve-site/it/#how');
    expect(await italianLink.getAttribute('target')).toBeNull();
    await italianLink.evaluate((element) => {
      element.addEventListener('click', (event) => event.preventDefault(), { once: true });
    });
    await italianLink.focus();
    await settleRendering(page);
    beforeInteraction = await snapshotInteraction();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/en\/#how$/);
    measurements.push(await measuredInteraction(beforeInteraction, 'locale link keyboard activation'));

    expect(measurements.map(({ label }) => label)).toEqual([
      'CTA keyboard focus',
      'section keyboard navigation',
      'locale link keyboard activation',
    ]);
    const nativeInteractionIds = measurements.flatMap(({ interactionIds }) => interactionIds);
    expect(
      new Set(nativeInteractionIds).size,
      'reported native interaction IDs must be distinct across actions',
    ).toBe(nativeInteractionIds.length);

    const pageViewUpperBound = Math.max(...measurements.map(({ upperBoundMs }) => upperBoundMs));
    const measurementSummary = measurements
      .map(({ label, durationLabel }) => `${label}: ${durationLabel}`)
      .join('; ');
    pageViewUpperBounds.push(pageViewUpperBound);
    pageViewSummaries.push(
      `view ${sampleIndex + 1}: ${pageViewUpperBound.toFixed(0)}ms (${measurementSummary})`,
    );
  }

  const labInpProxy = nearestRankP75(pageViewUpperBounds);
  const aggregateSummary = pageViewSummaries.join(' | ');
  console.info(`lab INP p75 proxy: ${labInpProxy.toFixed(0)} ms (${aggregateSummary})`);
  test.info().annotations.push({
    type: 'lab INP p75 proxy',
    description: `${labInpProxy.toFixed(0)} ms; ${aggregateSummary}`,
  });
  expect(labInpProxy, `lab INP p75 proxy (${aggregateSummary})`).toBeLessThanOrEqual(200);
});
