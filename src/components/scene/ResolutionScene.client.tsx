import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chooseSceneMode, readCapabilities } from '../../scene/capabilities';
import type { SceneMode } from '../../scene/model';
import { deriveSceneSnapshot } from '../../scene/scene-machine';
import { observeStoryProgress } from '../../scene/story-progress';
import { ResolutionWorld } from './ResolutionWorld';
import { SceneErrorBoundary } from './SceneErrorBoundary';

export function ResolutionScene({ storyId }: { storyId: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<SceneMode | null>(null);
  const snapshot = useMemo(() => deriveSceneSnapshot(progress), [progress]);

  useEffect(() => setMode(chooseSceneMode(readCapabilities())), []);

  useEffect(() => {
    if (mode === null || mode === 'poster') return undefined;
    const story = document.getElementById(storyId);
    if (!story) {
      setFailed(true);
      return undefined;
    }
    return observeStoryProgress(story, setProgress);
  }, [mode, storyId]);

  useEffect(() => {
    if (mode === 'poster') return undefined;
    const node = wrapperRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '160px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    const update = () => setDocumentVisible(document.visibilityState === 'visible');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const loseContext = useCallback(function handleWebglContextLost(event: Event) {
    event.preventDefault();
    if (event.currentTarget instanceof HTMLCanvasElement) {
      event.currentTarget.removeEventListener('webglcontextlost', handleWebglContextLost);
    }
    setCanvas(null);
    setFailed(true);
  }, []);

  useEffect(() => {
    if (!canvas) return undefined;
    return () => canvas.removeEventListener('webglcontextlost', loseContext);
  }, [canvas, loseContext]);

  const fail = useCallback(() => setFailed(true), []);
  const captureCanvas = useCallback(({ gl }: { gl: { domElement: HTMLCanvasElement } }) => {
    gl.domElement.addEventListener('webglcontextlost', loseContext);
    setCanvas(gl.domElement);
  }, [loseContext]);

  if (mode === null) {
    return (
      <div
        data-resolution-scene-sentinel=""
        aria-hidden="true"
      />
    );
  }

  if (mode === 'poster' || failed) return null;

  const active = visible && documentVisible;
  const dpr: [number, number] = mode === 'low' ? [1, 1.25] : [1, 1.5];

  return (
    <div
      ref={wrapperRef}
      className="resolution-scene"
      data-resolution-scene=""
      aria-hidden="true"
      role="presentation"
      tabIndex={-1}
    >
      <SceneErrorBoundary onFailure={fail}>
        <Canvas
          dpr={dpr}
          frameloop={active ? 'demand' : 'never'}
          shadows={mode === 'full'}
          camera={{ position: [0, 0, 8], fov: 42 }}
          onCreated={captureCanvas}
        >
          <color attach="background" args={['#111412']} />
          <ambientLight intensity={1.1} />
          <directionalLight
            position={[3, 5, 6]}
            intensity={1.6}
            castShadow={mode === 'full'}
            shadow-mapSize={[512, 512]}
          />
          <ResolutionWorld active={active} snapshot={snapshot} />
        </Canvas>
      </SceneErrorBoundary>
    </div>
  );
}
