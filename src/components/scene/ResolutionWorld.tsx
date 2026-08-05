import { invalidate, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  BoxGeometry,
  BufferGeometry,
  LineBasicMaterial,
  MathUtils,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Group,
} from 'three';
import type { SceneSnapshot } from '../../scene/model';

const IVORY = '#f4f0e6';
const AMBER = '#f0b84c';
const LIME = '#b8f45d';

export const SCENE_GROUP_IDS = [
  'fragments',
  'core',
  'missing',
  'candidates',
  'gate',
  'quote',
] as const;

type SceneGroupId = (typeof SCENE_GROUP_IDS)[number];
export type SceneGroupScales = Record<SceneGroupId, number>;

export interface SceneRegistry {
  geometries: {
    card: ShapeGeometry;
    bar: BoxGeometry;
    ring: TorusGeometry;
    sphere: SphereGeometry;
    line: BufferGeometry;
  };
  materials: {
    ivory: MeshStandardMaterial;
    amber: MeshStandardMaterial;
    lime: MeshStandardMaterial;
    line: LineBasicMaterial;
  };
  dispose: () => void;
}

function roundedCard(width: number, height: number, radius: number): ShapeGeometry {
  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;
  const shape = new Shape();
  shape.moveTo(left + radius, bottom);
  shape.lineTo(right - radius, bottom);
  shape.quadraticCurveTo(right, bottom, right, bottom + radius);
  shape.lineTo(right, top - radius);
  shape.quadraticCurveTo(right, top, right - radius, top);
  shape.lineTo(left + radius, top);
  shape.quadraticCurveTo(left, top, left, top - radius);
  shape.lineTo(left, bottom + radius);
  shape.quadraticCurveTo(left, bottom, left + radius, bottom);
  return new ShapeGeometry(shape, 8);
}

export function createSceneRegistry(): SceneRegistry {
  const geometries = {
    card: roundedCard(1.5, 0.58, 0.1),
    bar: new BoxGeometry(1, 1, 1),
    ring: new TorusGeometry(0.9, 0.12, 12, 48),
    sphere: new SphereGeometry(0.16, 16, 16),
    line: new BufferGeometry().setFromPoints([
      new Vector3(-0.55, 0, 0),
      new Vector3(0.55, 0, 0),
    ]),
  };
  const materials = {
    ivory: new MeshStandardMaterial({ color: IVORY, roughness: 0.72 }),
    amber: new MeshStandardMaterial({ color: AMBER, roughness: 0.64 }),
    lime: new MeshStandardMaterial({ color: LIME, roughness: 0.58 }),
    line: new LineBasicMaterial({ color: IVORY, transparent: true, opacity: 0.62 }),
  };

  return {
    geometries,
    materials,
    dispose: () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}

export function getSceneRegistryCounts(registry: SceneRegistry) {
  return {
    geometries: Object.keys(registry.geometries).length,
    materials: Object.keys(registry.materials).length,
  };
}

export function resolveGroupTargets(snapshot: SceneSnapshot): SceneGroupScales {
  return {
    fragments: 1 - snapshot.signalConvergence,
    core: snapshot.coreActivation,
    missing: snapshot.missingDataEmphasis,
    candidates: snapshot.candidateReveal,
    gate: snapshot.reviewGateOpen,
    quote: snapshot.quoteReveal,
  };
}

export function dampSceneScales(
  current: SceneGroupScales,
  targets: SceneGroupScales,
  delta: number,
): { scales: SceneGroupScales; settled: boolean } {
  let settled = true;
  const scales = {} as SceneGroupScales;
  for (const id of SCENE_GROUP_IDS) {
    const damped = MathUtils.damp(current[id], targets[id], 8, delta);
    const isSettled = Math.abs(damped - targets[id]) < 0.002;
    scales[id] = isSettled ? targets[id] : damped;
    settled &&= isSettled;
  }
  return { scales, settled };
}

export function ResolutionWorld({
  active,
  snapshot,
}: {
  active: boolean;
  snapshot: SceneSnapshot;
}) {
  const fragments = useRef<Group>(null);
  const core = useRef<Group>(null);
  const missing = useRef<Group>(null);
  const candidates = useRef<Group>(null);
  const gate = useRef<Group>(null);
  const quote = useRef<Group>(null);
  const registry = useMemo(createSceneRegistry, []);
  const initialTargets = useRef(resolveGroupTargets(snapshot)).current;

  useEffect(() => () => registry.dispose(), [registry]);

  useEffect(() => {
    if (active) invalidate();
  }, [active, snapshot]);

  useFrame((_state, delta) => {
    if (!active) return;
    const groups: Record<SceneGroupId, Group | null> = {
      fragments: fragments.current,
      core: core.current,
      missing: missing.current,
      candidates: candidates.current,
      gate: gate.current,
      quote: quote.current,
    };
    const current = {} as SceneGroupScales;
    for (const id of SCENE_GROUP_IDS) current[id] = groups[id]?.scale.x ?? 0;
    const { scales, settled } = dampSceneScales(current, resolveGroupTargets(snapshot), delta);

    for (const id of SCENE_GROUP_IDS) {
      const group = groups[id];
      if (!group) continue;
      group.scale.setScalar(Math.max(0.001, scales[id]));
      group.visible = scales[id] > 0.01;
    }
    if (!settled) invalidate();
  });

  const initialScale = (id: SceneGroupId) => Math.max(0.001, initialTargets[id]);

  return (
    <group dispose={null}>
      <group
        ref={fragments}
        name="resolution-fragments"
        position={[-2.35, 0.7, 0]}
        scale={initialScale('fragments')}
        visible={initialTargets.fragments > 0.01}
      >
        {[
          [-1.05, 0.55, -0.08],
          [-0.7, -0.35, 0],
          [0.25, 0.55, -0.04],
          [0.75, -0.45, -0.12],
        ].map((position, index) => (
          <mesh key={position.join(':')} position={position as [number, number, number]} scale={[0.78, 0.78, 0.78]}>
            <primitive object={registry.geometries.card} attach="geometry" />
            <primitive object={index === 3 ? registry.materials.amber : registry.materials.ivory} attach="material" />
          </mesh>
        ))}
      </group>

      <group
        ref={core}
        name="resolution-core"
        scale={initialScale('core')}
        visible={initialTargets.core > 0.01}
      >
        <mesh>
          <primitive object={registry.geometries.ring} attach="geometry" />
          <primitive object={registry.materials.lime} attach="material" />
        </mesh>
        <mesh scale={2.4}>
          <primitive object={registry.geometries.sphere} attach="geometry" />
          <primitive object={registry.materials.ivory} attach="material" />
        </mesh>
      </group>

      <group
        ref={missing}
        name="resolution-missing"
        position={[0, -1.35, 0]}
        scale={initialScale('missing')}
        visible={initialTargets.missing > 0.01}
      >
        <mesh scale={[1.5, 0.12, 0.12]}>
          <primitive object={registry.geometries.bar} attach="geometry" />
          <primitive object={registry.materials.amber} attach="material" />
        </mesh>
        {[-0.9, 0.9].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <primitive object={registry.geometries.sphere} attach="geometry" />
            <primitive object={registry.materials.amber} attach="material" />
          </mesh>
        ))}
      </group>

      <group
        ref={candidates}
        name="resolution-candidates"
        position={[2.25, 0.65, 0]}
        scale={initialScale('candidates')}
        visible={initialTargets.candidates > 0.01}
      >
        {[-0.85, 0, 0.85].map((y) => (
          <group key={y} position={[0, y, 0]}>
            <mesh>
              <primitive object={registry.geometries.card} attach="geometry" />
              <primitive object={registry.materials.ivory} attach="material" />
            </mesh>
            <lineSegments position={[0, 0, 0.015]} scale={[0.72, 1, 1]}>
              <primitive object={registry.geometries.line} attach="geometry" />
              <primitive object={registry.materials.line} attach="material" />
            </lineSegments>
          </group>
        ))}
      </group>

      <group
        ref={gate}
        name="resolution-gate"
        position={[1.05, 0, 0.35]}
        scale={initialScale('gate')}
        visible={initialTargets.gate > 0.01}
      >
        <mesh scale={[0.14, 3.1, 0.14]}>
          <primitive object={registry.geometries.bar} attach="geometry" />
          <primitive object={registry.materials.lime} attach="material" />
        </mesh>
        <mesh scale={0.32} rotation={[0, 0, Math.PI / 2]}>
          <primitive object={registry.geometries.ring} attach="geometry" />
          <primitive object={registry.materials.amber} attach="material" />
        </mesh>
      </group>

      <group
        ref={quote}
        name="resolution-quote"
        position={[2.35, -0.15, 0]}
        scale={initialScale('quote')}
        visible={initialTargets.quote > 0.01}
      >
        {[
          [0, 1.35, 2.15, 0.1],
          [0, -1.35, 2.15, 0.1],
          [-1.075, 0, 0.1, 2.7],
          [1.075, 0, 0.1, 2.7],
        ].map(([x, y, width, height]) => (
          <mesh key={`${x}:${y}`} position={[x, y, 0]} scale={[width, height, 0.1]}>
            <primitive object={registry.geometries.bar} attach="geometry" />
            <primitive object={registry.materials.ivory} attach="material" />
          </mesh>
        ))}
        <mesh position={[0, 0.75, 0.09]} scale={[1.45, 0.12, 0.04]}>
          <primitive object={registry.geometries.bar} attach="geometry" />
          <primitive object={registry.materials.lime} attach="material" />
        </mesh>
      </group>
    </group>
  );
}
