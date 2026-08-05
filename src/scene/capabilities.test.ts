import { describe, expect, it } from 'vitest';
import { chooseSceneMode, type SceneCapabilities } from './capabilities';

const capable: SceneCapabilities = {
  reducedMotion: false,
  webglAvailable: true,
  saveData: false,
  coarsePointer: false,
  narrowViewport: false,
  contextLost: false,
};

describe('chooseSceneMode', () => {
  it.each([
    ['reduced motion', { reducedMotion: true }],
    ['unavailable WebGL', { webglAvailable: false }],
    ['save-data', { saveData: true }],
    ['2 GB device memory', { deviceMemory: 2 }],
    ['2 logical CPUs', { hardwareConcurrency: 2 }],
    ['lost WebGL context', { contextLost: true }],
  ])('uses the poster for %s', (_reason, override) => {
    expect(chooseSceneMode({ ...capable, ...override })).toBe('poster');
  });

  it.each([
    ['a coarse pointer', { coarsePointer: true }],
    ['a narrow viewport', { narrowViewport: true }],
    ['4 GB device memory', { deviceMemory: 4 }],
    ['4 logical CPUs', { hardwareConcurrency: 4 }],
  ])('uses low mode for %s', (_reason, override) => {
    expect(chooseSceneMode({ ...capable, ...override })).toBe('low');
  });

  it('keeps WebGL eligible when optional capability APIs are unavailable', () => {
    expect(chooseSceneMode(capable)).toBe('full');
  });
});
