import { expect, test } from '@playwright/test';
import {
  classifyInteraction,
  measureSettledInteraction,
  nearestRankP75,
} from './performance-interactions';

test('selects the nearest-rank p75 across page-view samples without mutating them', () => {
  const pageViewSamples = [240, 40, 72, 48, 56];

  expect(nearestRankP75(pageViewSamples)).toBe(72);
  expect(pageViewSamples).toEqual([240, 40, 72, 48, 56]);
});

test('rejects an empty page-view sample set', () => {
  expect(() => nearestRankP75([])).toThrow('At least one page-view sample is required');
});

test('classifies a counted interaction below the Event Timing reporting floor', () => {
  expect(classifyInteraction({
    label: 'locale switch',
    beforeInteractionCount: 2,
    afterInteractionCount: 3,
    beforeIds: new Set([11]),
    durations: new Map([[11, 32]]),
  })).toEqual({
    label: 'locale switch',
    durationLabel: '<16ms',
    upperBoundMs: 16,
    interactionIds: [],
  });
});

test('attributes a delayed qualifying Event Timing entry after rendering settles', async () => {
  let interactionCount = 2;
  let renderingSettled = false;
  const result = await measureSettledInteraction({
    label: 'locale switch',
    before: {
      interactionCount: 2,
      ids: new Set([11]),
    },
    waitForInteractionCountIncrease: async (beforeInteractionCount) => {
      interactionCount = beforeInteractionCount + 1;
    },
    settleRenderingAndObserver: async () => {
      renderingSettled = interactionCount > 2;
    },
    readInteractionState: async () => ({
      interactionCount,
      durations: renderingSettled
        ? new Map([[11, 32], [22, 248]])
        : new Map([[11, 32]]),
    }),
  });

  expect(result.measurement).toEqual({
    label: 'locale switch',
    durationLabel: '248ms',
    upperBoundMs: 248,
    interactionIds: [22],
  });
});
