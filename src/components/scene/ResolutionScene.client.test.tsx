// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Children, isValidElement, useEffect, useRef } from 'react';
import { BufferGeometry, Material } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneMode } from '../../scene/model';
import { chooseSceneMode, readCapabilities } from '../../scene/capabilities';
import { deriveSceneSnapshot } from '../../scene/scene-machine';
import { observeStoryProgress } from '../../scene/story-progress';
import { ResolutionScene } from './ResolutionScene.client';
import {
  createSceneRegistry,
  dampSceneScales,
  getSceneRegistryCounts,
  ResolutionWorld,
  resolveGroupTargets,
  SCENE_GROUP_IDS,
} from './ResolutionWorld';

const canvasState = vi.hoisted(() => ({
  created: 0,
  loseContextOnCreate: false,
  props: [] as Array<Record<string, unknown>>,
  lightProps: [] as Array<Record<string, unknown>>,
}));
const worldState = vi.hoisted(() => ({
  fail: false,
  mounts: 0,
  unmounts: 0,
}));
const renderState = vi.hoisted(() => ({
  frame: undefined as undefined | ((state: unknown, delta: number) => void),
  invalidations: 0,
}));

vi.mock('../../scene/capabilities', () => ({
  chooseSceneMode: vi.fn(),
  readCapabilities: vi.fn(),
}));

vi.mock('../../scene/story-progress', () => ({
  observeStoryProgress: vi.fn(),
}));

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, onCreated, ...props }: {
    children?: ReactNode;
    onCreated?: (state: { gl: { domElement: HTMLCanvasElement } }) => void;
  }) => {
    const canvas = useRef<HTMLCanvasElement>(null);
    canvasState.created += 1;
    canvasState.props.push(props);
    useEffect(() => {
      if (canvas.current) {
        onCreated?.({ gl: { domElement: canvas.current } });
        if (canvasState.loseContextOnCreate) {
          canvas.current.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
        }
      }
    }, [onCreated]);
    const world = Children.toArray(children).find((child) => (
      isValidElement(child) && 'snapshot' in (child as ReactElement<Record<string, unknown>>).props
    ));
    const light = Children.toArray(children).find((child) => (
      isValidElement(child) && child.type === 'directionalLight'
    )) as ReactElement<Record<string, unknown>> | undefined;
    if (light) canvasState.lightProps.push(light.props);
    const worldProps = world as ReactElement<{
      active: boolean;
      snapshot: { stage: string; localProgress: number };
    }> | undefined;
    useEffect(() => {
      worldState.mounts += 1;
      return () => { worldState.unmounts += 1; };
    }, []);
    if (worldState.fail) throw new Error('scene render failed');
    return (
      <>
        <canvas ref={canvas} data-resolution-canvas="" />
        {worldProps && (
          <output
            data-world-active={String(worldProps.props.active)}
            data-world-stage={worldProps.props.snapshot.stage}
            data-world-progress={worldProps.props.snapshot.localProgress}
          />
        )}
      </>
    );
  },
  invalidate: () => { renderState.invalidations += 1; },
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    renderState.frame = callback;
  },
}));

type ObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0];

let intersectionCallback: ObserverCallback;
let progressPublisher: ((progress: number) => void) | undefined;
let stopProgress: ReturnType<typeof vi.fn<() => void>>;
let disconnectObserver: ReturnType<typeof vi.fn<() => void>>;

function setMode(mode: SceneMode) {
  vi.mocked(readCapabilities).mockReturnValue({
    reducedMotion: mode === 'poster',
    webglAvailable: mode !== 'poster',
    saveData: false,
    coarsePointer: mode === 'low',
    narrowViewport: false,
    contextLost: false,
  });
  vi.mocked(chooseSceneMode).mockReturnValue(mode);
}

function lastCanvasProps() {
  return canvasState.props.at(-1) as ComponentProps<typeof import('@react-three/fiber').Canvas>;
}

function publish(progress: number) {
  act(() => progressPublisher?.(progress));
}

beforeEach(() => {
  vi.clearAllMocks();
  canvasState.created = 0;
  canvasState.loseContextOnCreate = false;
  canvasState.props = [];
  canvasState.lightProps = [];
  worldState.fail = false;
  worldState.mounts = 0;
  worldState.unmounts = 0;
  renderState.frame = undefined;
  renderState.invalidations = 0;
  stopProgress = vi.fn();
  disconnectObserver = vi.fn();
  progressPublisher = undefined;
  document.body.innerHTML = '<div id="resolution-story"></div>';
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.mocked(observeStoryProgress).mockImplementation((_story, publisher) => {
    progressPublisher = publisher;
    return stopProgress;
  });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: ObserverCallback) {
      intersectionCallback = callback;
    }

    observe = vi.fn();
    disconnect = disconnectObserver;
    unobserve = vi.fn();
    takeRecords = vi.fn(() => []);
    root = null;
    rootMargin = '160px';
    thresholds = [0];
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ResolutionScene capability policy', () => {
  it('never instantiates Canvas in poster mode for reduced motion', async () => {
    setMode('poster');

    const { container } = render(<ResolutionScene storyId="resolution-story" />);

    await waitFor(() => expect(chooseSceneMode).toHaveBeenCalledOnce());
    expect(canvasState.created).toBe(0);
    expect(observeStoryProgress).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('never instantiates Canvas when WebGL is unavailable', async () => {
    setMode('poster');
    vi.mocked(readCapabilities).mockReturnValue({
      reducedMotion: false,
      webglAvailable: false,
      saveData: false,
      coarsePointer: false,
      narrowViewport: false,
      contextLost: false,
    });

    render(<ResolutionScene storyId="resolution-story" />);

    await waitFor(() => expect(readCapabilities).toHaveBeenCalledOnce());
    expect(canvasState.created).toBe(0);
  });

  it.each([
    ['low', [1, 1.25], false],
    ['full', [1, 1.5], true],
  ] as const)('uses bounded %s rendering budgets', async (mode, dpr, shadows) => {
    setMode(mode);

    render(<ResolutionScene storyId="resolution-story" />);

    await waitFor(() => expect(canvasState.created).toBeGreaterThan(0));
    expect(lastCanvasProps()).toMatchObject({ dpr, frameloop: 'demand', shadows });
    expect(canvasState.lightProps.at(-1)).toMatchObject({
      castShadow: shadows,
      'shadow-mapSize': [512, 512],
    });
  });
});

describe('ResolutionScene behavior', () => {
  it.each(['low', 'full'] as const)('renders a decorative, nonfocusable, pointer-inert %s wrapper', async (mode) => {
    setMode(mode);
    const stylesheet = document.createElement('style');
    stylesheet.textContent = readFileSync('src/styles/motion.css', 'utf8');
    document.head.append(stylesheet);

    try {
      const { container } = render(<ResolutionScene storyId="resolution-story" />);

      await waitFor(() => expect(container.querySelector('[data-resolution-scene]')).not.toBeNull());
      const wrapper = container.querySelector('[data-resolution-scene]');
      expect(wrapper).toHaveAttribute('aria-hidden', 'true');
      expect(wrapper).toHaveAttribute('role', 'presentation');
      expect(wrapper).toHaveAttribute('tabindex', '-1');
      expect(wrapper).toHaveStyle({
        pointerEvents: 'none',
        position: 'absolute',
        top: '0px',
        width: '100%',
        aspectRatio: '8 / 5',
      });
    } finally {
      stylesheet.remove();
    }
  });

  it('publishes new snapshots without remounting the island world', async () => {
    setMode('full');
    const { container } = render(<ResolutionScene storyId="resolution-story" />);
    await waitFor(() => expect(progressPublisher).toBeTypeOf('function'));

    publish(0.1);
    expect(container.querySelector('[data-world-stage]')).toHaveAttribute('data-world-stage', 'conversation');
    publish(0.9);

    expect(container.querySelector('[data-world-stage]')).toHaveAttribute('data-world-stage', 'quotation');
    expect(worldState.mounts).toBe(1);
    expect(worldState.unmounts).toBe(0);
  });

  it('removes the canvas when the scene throws so the underlying poster can remain', async () => {
    setMode('full');
    worldState.fail = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { container } = render(<ResolutionScene storyId="resolution-story" />);

    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
    expect(consoleError).toHaveBeenCalled();
  });

  it('prevents the lost context default and removes the canvas', async () => {
    setMode('full');
    const removeEventListener = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener');
    const { container } = render(<ResolutionScene storyId="resolution-story" />);
    await waitFor(() => expect(container.querySelector('canvas')).not.toBeNull());
    const event = new Event('webglcontextlost', { cancelable: true });

    act(() => container.querySelector('canvas')?.dispatchEvent(event));

    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
    expect(event.defaultPrevented).toBe(true);
    expect(removeEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
  });

  it('handles context loss fired as soon as Canvas is created', async () => {
    setMode('full');
    canvasState.loseContextOnCreate = true;

    const { container } = render(<ResolutionScene storyId="resolution-story" />);

    await waitFor(() => expect(container.querySelector('canvas')).toBeNull());
  });

  it('pauses demand rendering while offscreen and resumes without remounting', async () => {
    setMode('full');
    render(<ResolutionScene storyId="resolution-story" />);
    await waitFor(() => expect(lastCanvasProps().frameloop).toBe('demand'));

    act(() => intersectionCallback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(lastCanvasProps().frameloop).toBe('never');
    act(() => intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));

    expect(lastCanvasProps().frameloop).toBe('demand');
    expect(worldState.mounts).toBe(1);
  });

  it('pauses demand rendering while the document is hidden', async () => {
    setMode('full');
    render(<ResolutionScene storyId="resolution-story" />);
    await waitFor(() => expect(lastCanvasProps().frameloop).toBe('demand'));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(lastCanvasProps().frameloop).toBe('never');

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(lastCanvasProps().frameloop).toBe('demand');
  });

  it('cleans the progress subscription, observer, and canvas listener on unmount', async () => {
    setMode('full');
    const removeEventListener = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener');
    const { unmount } = render(<ResolutionScene storyId="resolution-story" />);
    await waitFor(() => expect(canvasState.created).toBeGreaterThan(0));

    unmount();

    expect(stopProgress).toHaveBeenCalledOnce();
    expect(disconnectObserver).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    expect(worldState.unmounts).toBe(1);
  });
});

describe('ResolutionWorld procedural registry', () => {
  it.each([
    [0, { fragments: 1, core: 0, missing: 0, candidates: 0, gate: 0, quote: 0 }],
    [1.5 / 6, { fragments: 0.5, core: 0.5, missing: 0, candidates: 0, gate: 0, quote: 0 }],
    [2.5 / 6, { fragments: 0, core: 1, missing: 0.5, candidates: 0, gate: 0, quote: 0 }],
    [3.5 / 6, { fragments: 0, core: 1, missing: 1, candidates: 0.5, gate: 0, quote: 0 }],
    [4.5 / 6, { fragments: 0, core: 1, missing: 1, candidates: 1, gate: 0.5, quote: 0 }],
    [5.5 / 6, { fragments: 0, core: 1, missing: 1, candidates: 1, gate: 1, quote: 0.5 }],
  ])('maps the procedural group targets at progress %s', (progress, expected) => {
    expect(resolveGroupTargets(deriveSceneSnapshot(progress))).toEqual(expected);
  });

  it('keeps six mounted groups and fixed registry counts across every story stage', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const registry = createSceneRegistry();
    const counts = getSceneRegistryCounts(registry);
    expect(SCENE_GROUP_IDS).toEqual(['fragments', 'core', 'missing', 'candidates', 'gate', 'quote']);
    expect(counts).toEqual({ geometries: 5, materials: 4 });

    const { container, rerender } = render(
      <ResolutionWorld active snapshot={deriveSceneSnapshot(0)} />,
    );
    const groups = SCENE_GROUP_IDS.map((id) => container.querySelector(`[name="resolution-${id}"]`));
    expect(groups.every(Boolean)).toBe(true);

    for (const progress of [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1]) {
      rerender(<ResolutionWorld active snapshot={deriveSceneSnapshot(progress)} />);
      expect(getSceneRegistryCounts(registry)).toEqual(counts);
      SCENE_GROUP_IDS.forEach((id, index) => {
        expect(container.querySelector(`[name="resolution-${id}"]`)).toBe(groups[index]);
      });
    }
    registry.dispose();
    consoleError.mockRestore();
  });

  it('settles damping in a bounded number of demand frames', () => {
    let scales = { fragments: 1, core: 0, missing: 0, candidates: 0, gate: 0, quote: 0 };
    const targets = resolveGroupTargets(deriveSceneSnapshot(1));
    let settled = false;
    let frames = 0;

    while (!settled && frames < 180) {
      ({ scales, settled } = dampSceneScales(scales, targets, 1 / 60));
      frames += 1;
    }

    expect(settled).toBe(true);
    expect(frames).toBeLessThan(180);
    expect(scales).toEqual(targets);
  });

  it('invalidates once for an active snapshot change or resume, never while paused', () => {
    const first = deriveSceneSnapshot(0);
    const { rerender } = render(<ResolutionWorld active snapshot={first} />);
    expect(renderState.invalidations).toBe(1);

    rerender(<ResolutionWorld active snapshot={deriveSceneSnapshot(0.5)} />);
    expect(renderState.invalidations).toBe(2);
    rerender(<ResolutionWorld active={false} snapshot={deriveSceneSnapshot(0.75)} />);
    expect(renderState.invalidations).toBe(2);
    rerender(<ResolutionWorld active snapshot={deriveSceneSnapshot(0.75)} />);
    expect(renderState.invalidations).toBe(3);
  });

  it('disposes every bounded registry resource on unmount', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const geometryDispose = vi.spyOn(BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(Material.prototype, 'dispose');
    const { unmount } = render(<ResolutionWorld active snapshot={deriveSceneSnapshot(0)} />);

    unmount();

    expect(geometryDispose).toHaveBeenCalledTimes(5);
    expect(materialDispose).toHaveBeenCalledTimes(4);
    consoleError.mockRestore();
  });
});
