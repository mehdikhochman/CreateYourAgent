import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';

import { useFrame } from './fiber';

// Timeline (seconds after the scene starts).
const APPEAR_END = 1.0;
const BURST_AT = 0.75;
const WAVE_START = 1.05;
const WAVE_END = 2.7;
const BLINKS = [1.7, 3.6, 6.2];

const ORANGE = '#F77F00';
const GREEN = '#009E60';
const GLOW = '#18E08A';
const CONFETTI_COLORS = [ORANGE, '#FFFFFF', GREEN, '#FFC94D'];
const CONFETTI_COUNT = 90;
const GRAVITY = -5.5;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};
const smoothWindow = (t: number, start: number, end: number, ramp = 0.25) =>
  clamp01((t - start) / ramp) * clamp01((end - t) / ramp);

/** Small deterministic random generator, so every launch looks the same. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

type Particle = { vx: number; vy: number; vz: number; spinX: number; spinY: number; color: string };

function useParticles(): Particle[] {
  return useMemo(() => {
    const rand = seeded(7);
    return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
      const angle = rand() * Math.PI * 2;
      const spread = 1.2 + rand() * 2.6;
      return {
        vx: Math.cos(angle) * spread,
        vy: 3.2 + rand() * 3.4,
        vz: Math.sin(angle) * spread * 0.6,
        spinX: (rand() - 0.5) * 14,
        spinY: (rand() - 0.5) * 14,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      };
    });
  }, []);
}

function Confetti() {
  const mesh = useRef<InstancedMesh>(null);
  const start = useRef<number | null>(null);
  const particles = useParticles();
  const dummy = useMemo(() => new Object3D(), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const color = new Color();
    particles.forEach((p, i) => m.setColorAt(i, color.set(p.color)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [particles]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current - BURST_AT;
    particles.forEach((p, i) => {
      if (t < 0) {
        dummy.scale.setScalar(0);
      } else {
        dummy.position.set(p.vx * t, 0.4 + p.vy * t + 0.5 * GRAVITY * t * t, p.vz * t);
        dummy.rotation.set(p.spinX * t, p.spinY * t, 0);
        // Pieces shrink away after about 2.5 s.
        dummy.scale.setScalar(clamp01(1 - (t - 1.8) / 0.8));
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CONFETTI_COUNT]}>
      <boxGeometry args={[0.09, 0.15, 0.01]} />
      <meshStandardMaterial roughness={0.6} />
    </instancedMesh>
  );
}

function Halo() {
  const mesh = useRef<Mesh>(null);
  const start = useRef<number | null>(null);
  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const p = clamp01((state.clock.elapsedTime - start.current - 0.6) / 1.0);
    m.visible = p > 0 && p < 1;
    m.scale.setScalar(0.6 + easeOutCubic(p) * 2.6);
    (m.material as MeshStandardMaterial).opacity = 0.7 * (1 - p);
  });
  return (
    <mesh ref={mesh} position={[0, 0.1, -0.4]} visible={false}>
      <torusGeometry args={[1, 0.035, 12, 64]} />
      <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={0.8} transparent opacity={0} />
    </mesh>
  );
}

function Robot({ reduceMotion }: { reduceMotion: boolean }) {
  const root = useRef<Group>(null);
  const start = useRef<number | null>(null);
  const rightArm = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const antennaBall = useRef<Mesh>(null);
  const shadow = useRef<Mesh>(null);

  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = reduceMotion ? 3 : state.clock.elapsedTime - start.current;
    const g = root.current;
    if (!g) return;

    // Arrival: rises from below, spins one and a quarter turns, pops to size.
    const p = clamp01(t / APPEAR_END);
    const settled = t > APPEAR_END ? t - APPEAR_END : 0;
    g.scale.setScalar(Math.max(0.001, easeOutBack(p)));
    g.position.y = -2.4 * (1 - easeOutCubic(p)) + 0.08 * Math.sin(settled * 2.2);
    g.rotation.y = (1 - easeOutCubic(p)) * Math.PI * 2.5 + 0.22 * Math.sin(settled * 0.9);

    // Waves hello: the right arm swings out to the side (positive z), then waggles.
    if (rightArm.current) {
      const raise = reduceMotion ? 0 : smoothWindow(t, WAVE_START, WAVE_END);
      rightArm.current.rotation.z = 0.12 + raise * (2.2 + 0.35 * Math.sin((t - WAVE_START) * 11));
    }

    // Blinks.
    if (eyes.current) {
      const blinking = BLINKS.some((b) => t > b && t < b + 0.14);
      eyes.current.scale.y = blinking ? 0.12 : 1;
    }

    // Antenna light pulses.
    if (antennaBall.current) {
      (antennaBall.current.material as MeshStandardMaterial).emissiveIntensity = 0.6 + 0.5 * Math.sin(t * 6);
    }

    if (shadow.current) shadow.current.scale.setScalar(0.9 * easeOutCubic(p) - 0.04 * Math.sin(settled * 2.2));
  });

  return (
    <>
      <mesh ref={shadow} position={[0, -1.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.1} />
      </mesh>

      <group ref={root}>
        {/* Body with a chest badge */}
        <mesh position={[0, -0.55, 0]}>
          <boxGeometry args={[1.05, 0.95, 0.8]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.5, 0.41]}>
          <circleGeometry args={[0.18, 32]} />
          <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={0.25} />
        </mesh>

        {/* Head, face screen, eyes and smile */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1.3, 0.95, 0.95]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.5, 0.48]}>
          <boxGeometry args={[1.05, 0.62, 0.04]} />
          <meshStandardMaterial color="#1B1B1F" roughness={0.2} />
        </mesh>
        <group ref={eyes} position={[0, 0.56, 0.52]}>
          <mesh position={[-0.24, 0, 0]}>
            <sphereGeometry args={[0.1, 24, 24]} />
            <meshStandardMaterial color={GLOW} emissive={GLOW} emissiveIntensity={1.2} />
          </mesh>
          <mesh position={[0.24, 0, 0]}>
            <sphereGeometry args={[0.1, 24, 24]} />
            <meshStandardMaterial color={GLOW} emissive={GLOW} emissiveIntensity={1.2} />
          </mesh>
        </group>
        <mesh position={[0, 0.4, 0.51]} rotation={[0, 0, Math.PI]}>
          <torusGeometry args={[0.13, 0.022, 8, 24, Math.PI]} />
          <meshStandardMaterial color={GLOW} emissive={GLOW} emissiveIntensity={1} />
        </mesh>

        {/* Ears and antenna */}
        <mesh position={[-0.7, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.1, 24]} />
          <meshStandardMaterial color={ORANGE} />
        </mesh>
        <mesh position={[0.7, 0.5, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.1, 24]} />
          <meshStandardMaterial color={ORANGE} />
        </mesh>
        <mesh position={[0, 1.13, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.32, 12]} />
          <meshStandardMaterial color="#C9C9D1" />
        </mesh>
        <mesh ref={antennaBall} position={[0, 1.33, 0]}>
          <sphereGeometry args={[0.1, 24, 24]} />
          <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={0.6} />
        </mesh>

        {/* Arms pivot at the shoulders */}
        <group position={[-0.66, -0.2, 0]} rotation={[0, 0, -0.12]}>
          <mesh position={[0, -0.32, 0]}>
            <capsuleGeometry args={[0.11, 0.42, 8, 16]} />
            <meshStandardMaterial color={GREEN} roughness={0.4} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.66, -0.2, 0]}>
          <mesh position={[0, -0.32, 0]}>
            <capsuleGeometry args={[0.11, 0.42, 8, 16]} />
            <meshStandardMaterial color={GREEN} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </>
  );
}

/** The whole scene: lights, robot, halo and confetti. */
export function RobotScene({ reduceMotion = false }: { reduceMotion?: boolean }) {
  // Each part starts its own clock on the first frame; they all mount together.
  return (
    <>
      <ambientLight intensity={1.15} />
      <hemisphereLight args={['#FFFFFF', ORANGE, 0.6]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <Robot reduceMotion={reduceMotion} />
      {reduceMotion ? null : (
        <>
          <Halo />
          <Confetti />
        </>
      )}
    </>
  );
}
