import { describe, expect, it } from 'vitest';
import { deriveSceneLifecycle, type SceneLifecycleState } from './lifecycle';

const active: SceneLifecycleState = {
  documentVisible: true,
  inViewport: true,
  contextLost: false,
};

describe('deriveSceneLifecycle', () => {
  it.each([
    ['the document is hidden', { documentVisible: false }],
    ['the scene is offscreen', { inViewport: false }],
    ['the WebGL context is lost', { contextLost: true }],
  ])('prevents rendering when %s', (_reason, override) => {
    expect(deriveSceneLifecycle(active, { ...active, ...override }).shouldRender).toBe(false);
  });

  it('schedules exactly one demand invalidation when rendering resumes', () => {
    const paused = { ...active, inViewport: false };

    expect(deriveSceneLifecycle(paused, active)).toEqual({
      shouldRender: true,
      shouldInvalidate: true,
    });
    expect(deriveSceneLifecycle(active, active)).toEqual({
      shouldRender: true,
      shouldInvalidate: false,
    });
  });
});
