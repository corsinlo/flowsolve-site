import type { SceneMode } from './model';

export interface SceneCapabilities {
  reducedMotion: boolean;
  webglAvailable: boolean;
  saveData: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  coarsePointer: boolean;
  narrowViewport: boolean;
  contextLost: boolean;
}

type NavigatorCapabilities = Navigator & {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
};

function mediaQueryMatches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

function webglIsAvailable(): boolean {
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function readCapabilities(): SceneCapabilities {
  const navigatorCapabilities = typeof navigator === 'undefined'
    ? undefined
    : navigator as NavigatorCapabilities;

  return {
    reducedMotion: mediaQueryMatches('(prefers-reduced-motion: reduce)'),
    webglAvailable: webglIsAvailable(),
    saveData: navigatorCapabilities?.connection?.saveData === true,
    deviceMemory: navigatorCapabilities?.deviceMemory,
    hardwareConcurrency: navigatorCapabilities?.hardwareConcurrency,
    coarsePointer: mediaQueryMatches('(pointer: coarse)'),
    narrowViewport: typeof window !== 'undefined' && window.innerWidth <= 768,
    contextLost: false,
  };
}

export function chooseSceneMode(capabilities: SceneCapabilities): SceneMode {
  if (
    capabilities.reducedMotion
    || !capabilities.webglAvailable
    || capabilities.saveData
    || capabilities.contextLost
    || (capabilities.deviceMemory !== undefined && capabilities.deviceMemory <= 2)
    || (capabilities.hardwareConcurrency !== undefined && capabilities.hardwareConcurrency <= 2)
  ) return 'poster';

  if (
    capabilities.coarsePointer
    || capabilities.narrowViewport
    || (capabilities.deviceMemory !== undefined && capabilities.deviceMemory <= 4)
    || (capabilities.hardwareConcurrency !== undefined && capabilities.hardwareConcurrency <= 4)
  ) return 'low';

  return 'full';
}
