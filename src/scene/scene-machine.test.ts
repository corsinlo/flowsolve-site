import { describe, expect, it } from 'vitest';
import { deriveSceneSnapshot } from './scene-machine';

describe('deriveSceneSnapshot', () => {
  it.each([
    [0, 'conversation'],
    [1 / 6, 'extraction'],
    [2 / 6, 'missing-data'],
    [3 / 6, 'candidates'],
    [4 / 6, 'approval'],
    [5 / 6, 'quotation'],
    [1, 'quotation'],
  ] as const)('maps %s to %s', (progress, stage) => {
    expect(deriveSceneSnapshot(progress).stage).toBe(stage);
  });

  it.each([
    [0, {
      stage: 'conversation', localProgress: 0, signalConvergence: 0, coreActivation: 0,
      missingDataEmphasis: 0, candidateReveal: 0, reviewGateOpen: 0, quoteReveal: 0, accent: 'ivory',
    }],
    [1 / 6, {
      stage: 'extraction', localProgress: 0, signalConvergence: 0, coreActivation: 0,
      missingDataEmphasis: 0, candidateReveal: 0, reviewGateOpen: 0, quoteReveal: 0, accent: 'ivory',
    }],
    [2 / 6, {
      stage: 'missing-data', localProgress: 0, signalConvergence: 1, coreActivation: 1,
      missingDataEmphasis: 0, candidateReveal: 0, reviewGateOpen: 0, quoteReveal: 0, accent: 'amber',
    }],
    [3 / 6, {
      stage: 'candidates', localProgress: 0, signalConvergence: 1, coreActivation: 1,
      missingDataEmphasis: 1, candidateReveal: 0, reviewGateOpen: 0, quoteReveal: 0, accent: 'ivory',
    }],
    [4 / 6, {
      stage: 'approval', localProgress: 0, signalConvergence: 1, coreActivation: 1,
      missingDataEmphasis: 1, candidateReveal: 1, reviewGateOpen: 0, quoteReveal: 0, accent: 'lime',
    }],
    [5 / 6, {
      stage: 'quotation', localProgress: 0, signalConvergence: 1, coreActivation: 1,
      missingDataEmphasis: 1, candidateReveal: 1, reviewGateOpen: 1, quoteReveal: 0, accent: 'lime',
    }],
    [1, {
      stage: 'quotation', localProgress: 1, signalConvergence: 1, coreActivation: 1,
      missingDataEmphasis: 1, candidateReveal: 1, reviewGateOpen: 1, quoteReveal: 1, accent: 'lime',
    }],
  ] as const)('derives every scene field at %s', (progress, expected) => {
    expect(deriveSceneSnapshot(progress)).toEqual(expected);
  });

  it('clamps progress outside the story range', () => {
    expect(deriveSceneSnapshot(-0.1)).toMatchObject({
      stage: 'conversation', localProgress: 0, signalConvergence: 0,
    });
    expect(deriveSceneSnapshot(1.1)).toMatchObject({
      stage: 'quotation', localProgress: 1, quoteReveal: 1,
    });
  });

  it('uses amber to emphasize the unresolved missing-data stage', () => {
    const snapshot = deriveSceneSnapshot(2.5 / 6);

    expect(snapshot).toMatchObject({
      stage: 'missing-data', accent: 'amber', missingDataEmphasis: 0.5,
    });
  });

  it('keeps conversation fragments unordered until extraction starts', () => {
    expect(deriveSceneSnapshot(0.5 / 6).signalConvergence).toBe(0);
    expect(deriveSceneSnapshot(1.5 / 6).signalConvergence).toBe(0.5);
  });

  it('keeps the review gate closed until approval begins', () => {
    expect(deriveSceneSnapshot((4 / 6) - Number.EPSILON).reviewGateOpen).toBe(0);
    expect(deriveSceneSnapshot(4.5 / 6).reviewGateOpen).toBe(0.5);
  });

  it('never reveals a quote before the quotation stage', () => {
    expect(deriveSceneSnapshot(0.8).quoteReveal).toBe(0);
  });
});
