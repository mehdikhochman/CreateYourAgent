import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  Color,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
} from 'three';

import { useFrame } from './fiber';

/*
 * Tiko in 3D, built from the same drawing as the 2D mascot
 * (design/mascot/tiko-hello.svg): every position below is the SVG
 * coordinate (200 × 200 viewBox) converted with `sx`/`sy`.
 */

// Timeline (seconds after the scene starts).
const APPEAR_END = 1.0;
const BURST_AT = 0.75;
const WAVE_START = 1.05;
const WAVE_END = 2.9;
const BLINKS = [1.8, 3.7, 6.3];

const ORANGE = '#F77F00';
const ORANGE_DARK = '#C25E00';
const GREEN = '#00875A';
const GLOW = '#3BE39A';
const INK = '#15161A';
const SHELL = '#FFFFFF';
const CONFETTI_COLORS = [ORANGE, '#FFFFFF', GREEN, '#FFC94D'];
const CONFETTI_COUNT = 90;
const GRAVITY = -5.5;

// SVG units → scene units (SVG y grows downwards).
const K = 0.018;
const sx = (x: number) => (x - 100) * K;
const sy = (y: number) => (100 - y) * K;
const s = (v: number) => v * K;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

/** Rounded rectangle centred on 0,0. */
function roundedRect(w: number, h: number, r: number): Shape {
  const shape = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/**
 * A rounded slab seen from the front exactly like the SVG rectangle
 * (w × h, corner r, in SVG units), `depth` thick with soft bevelled edges.
 */
function slab(w: number, h: number, r: number, depth: number, bevel = 0.06): ExtrudeGeometry {
  const b = Math.min(bevel, depth / 3);
  const geometry = new ExtrudeGeometry(roundedRect(s(w) - 2 * b, s(h) - 2 * b, Math.max(0.01, s(r) - b)), {
    depth: depth - 2 * b,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geometry.center();
  return geometry;
}

/** The chest heart (path from tiko-happy.svg). */
function heartShape(): Shape {
  const p = (x: number, y: number) => [sx(x), sy(y) - sy(148)] as const;
  const shape = new Shape();
  shape.moveTo(...p(100, 155));
  shape.bezierCurveTo(...p(92, 149), ...p(88, 145), ...p(92, 141));
  shape.bezierCurveTo(...p(95, 138), ...p(99, 140), ...p(100, 143));
  shape.bezierCurveTo(...p(101, 140), ...p(105, 138), ...p(108, 141));
  shape.bezierCurveTo(...p(112, 145), ...p(108, 149), ...p(100, 155));
  return shape;
}

function useGeometries() {
  return useMemo(() => {
    const tail = new Shape();
    tail.moveTo(sx(95), sy(17));
    tail.lineTo(sx(95), sy(23));
    tail.lineTo(sx(101), sy(17));
    tail.closePath();
    const heart = new ExtrudeGeometry(heartShape(), { depth: 0.02, bevelEnabled: false, curveSegments: 16 });
    return {
      head: slab(128, 84, 30, 1.3, 0.16),
      visor: slab(100, 56, 20, 0.06, 0.02),
      body: slab(80, 56, 24, 0.95, 0.14),
      chest: slab(40, 24, 10, 0.05, 0.015),
      chestBar: slab(24, 6, 3, 0.03, 0.01),
      scarf: slab(84, 12, 6, 1.05, 0.04),
      bubble: slab(24, 16, 6, 0.16, 0.04),
      tail: new ExtrudeGeometry(tail, { depth: 0.16, bevelEnabled: false }),
      heart,
    };
  }, []);
}

// ---------------------------------------------------------------------------

type Particle = { vx: number; vy: number; vz: number; spinX: number; spinY: number; color: string };

/** Small deterministic random generator, so every launch looks the same. */
function seeded(seed: number) {
  let v = seed;
  return () => {
    v = (v * 16807) % 2147483647;
    return (v - 1) / 2147483646;
  };
}

function Confetti() {
  const mesh = useRef<InstancedMesh>(null);
  const start = useRef<number | null>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const particles = useMemo<Particle[]>(() => {
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
        dummy.position.set(p.vx * t, 0.6 + p.vy * t + 0.5 * GRAVITY * t * t, p.vz * t);
        dummy.rotation.set(p.spinX * t, p.spinY * t, 0);
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
    m.scale.setScalar(0.6 + easeOutCubic(p) * 2.8);
    (m.material as MeshStandardMaterial).opacity = 0.7 * (1 - p);
  });
  return (
    <mesh ref={mesh} position={[0, 0.2, -0.8]} visible={false}>
      <torusGeometry args={[1, 0.035, 12, 64]} />
      <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={0.8} transparent opacity={0} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------

const HEAD_FRONT = 0.65; // half of the head depth
const BODY_FRONT = 0.475;

function Tiko({ reduceMotion }: { reduceMotion: boolean }) {
  const g = useGeometries();
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const start = useRef<number | null>(null);
  const rightArm = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const bubble = useRef<Group>(null);
  const bubbleMat = useRef<MeshStandardMaterial>(null);
  const heart = useRef<Mesh>(null);
  const bar = useRef<Mesh>(null);
  const shadow = useRef<Mesh>(null);

  useFrame((state) => {
    if (start.current === null) start.current = state.clock.elapsedTime;
    const t = reduceMotion ? 3.2 : state.clock.elapsedTime - start.current;
    const r = root.current;
    if (!r) return;

    // Arrival: rises from below, spins one and a quarter turns, pops to size.
    const p = clamp01(t / APPEAR_END);
    const settled = Math.max(0, t - APPEAR_END);
    r.scale.setScalar(Math.max(0.001, easeOutBack(p)));
    r.position.y = -2.6 * (1 - easeOutCubic(p)) + 0.07 * Math.sin(settled * 2.2);
    r.rotation.y = (1 - easeOutCubic(p)) * Math.PI * 2.5 + 0.28 * Math.sin(settled * 0.8);

    // Head tilts a little, like the 2D « coucou » pose.
    if (head.current) head.current.rotation.z = 0.05 * Math.sin(settled * 1.6);

    // Right arm (pointing up in its group) swings from the side to a wave, then rests.
    if (rightArm.current) {
      const REST = Math.PI + 0.21;
      const UP = 2 * Math.PI - 1.0; // out to the side, so the hand shows next to the head
      const up = reduceMotion ? 1 : easeInOut(clamp01((t - WAVE_START) / 0.35)) * (1 - easeInOut(clamp01((t - WAVE_END) / 0.45)));
      const waggle = up * 0.32 * Math.sin((t - WAVE_START) * 10);
      rightArm.current.rotation.z = REST + (UP - REST) * up + waggle;
    }
    if (leftArm.current) leftArm.current.rotation.z = -0.21 - 0.04 * Math.sin(settled * 2.2);

    // Blinks.
    if (eyes.current) {
      const blinking = BLINKS.some((b) => t > b && t < b + 0.14);
      eyes.current.scale.y = blinking ? 0.12 : 1;
    }

    // The message-bubble antenna bobs and glows.
    if (bubble.current) bubble.current.position.y = 0.03 * Math.sin(t * 4);
    if (bubbleMat.current) bubbleMat.current.emissiveIntensity = 0.25 + 0.25 * Math.sin(t * 6);

    // Chest screen: the green bar becomes a heart when the confetti bursts.
    const loved = reduceMotion || t > BURST_AT + 0.1;
    if (heart.current) {
      heart.current.visible = loved;
      heart.current.scale.setScalar(loved ? 1 + 0.08 * Math.sin(t * 5) : 0.001);
    }
    if (bar.current) bar.current.visible = !loved;

    if (shadow.current) shadow.current.scale.setScalar(Math.max(0.001, easeOutCubic(p) - 0.04 * Math.sin(settled * 2.2)));
  });

  const shell = <meshStandardMaterial color={SHELL} roughness={0.38} />;
  // Unlit and not tone-mapped: the eyes keep the exact green of the 2D Tiko.
  const glow = <meshBasicMaterial color={GLOW} toneMapped={false} />;

  return (
    <>
      <mesh ref={shadow} position={[0, sy(193), 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[s(46), 40]} />
        <meshBasicMaterial color={INK} transparent opacity={0.1} />
      </mesh>

      <group ref={root}>
        {/* Arms (behind the body), pivoting at the shoulders */}
        <group ref={leftArm} position={[sx(57), sy(130), -0.1]} rotation={[0, 0, -0.21]}>
          <mesh position={[0, -s(17), 0]}>
            <capsuleGeometry args={[s(7), s(38 - 14), 8, 16]} />
            <meshStandardMaterial color={GREEN} roughness={0.45} />
          </mesh>
        </group>
        <group ref={rightArm} position={[sx(143), sy(130), -0.1]} rotation={[0, 0, Math.PI + 0.21]}>
          <mesh position={[0, s(19), 0]}>
            <capsuleGeometry args={[s(7), s(42 - 14), 8, 16]} />
            <meshStandardMaterial color={GREEN} roughness={0.45} />
          </mesh>
        </group>

        {/* Body, chest screen (bar, then heart) */}
        <mesh geometry={g.body} position={[0, sy(150), 0]}>
          {shell}
        </mesh>
        <mesh geometry={g.chest} position={[0, sy(148), BODY_FRONT + 0.02]}>
          <meshStandardMaterial color={INK} roughness={0.2} />
        </mesh>
        <mesh ref={bar} geometry={g.chestBar} position={[0, sy(148), BODY_FRONT + 0.05]}>
          {glow}
        </mesh>
        <mesh ref={heart} geometry={g.heart} position={[0, sy(148), BODY_FRONT + 0.045]} visible={false}>
          <meshBasicMaterial color={ORANGE} toneMapped={false} />
        </mesh>

        {/* Wax-print scarf: orange band, green diamonds, white dots */}
        <mesh geometry={g.scarf} position={[0, sy(120), 0.02]}>
          <meshStandardMaterial color={ORANGE} roughness={0.5} />
        </mesh>
        {[76, 92, 108, 124].map((x) => (
          <mesh key={x} position={[sx(x), sy(120), 0.55]} rotation={[0, 0, Math.PI / 4]}>
            <boxGeometry args={[s(5.6), s(5.6), 0.02]} />
            <meshStandardMaterial color={GREEN} />
          </mesh>
        ))}
        {[84, 100, 116].map((x) => (
          <mesh key={x} position={[sx(x), sy(120), 0.55]}>
            <circleGeometry args={[s(1.6), 12]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        ))}

        <group ref={head}>
          {/* Antenna and its speech bubble */}
          <mesh position={[0, (sy(22) + sy(36)) / 2, 0]}>
            <cylinderGeometry args={[s(2), s(2), s(14), 12]} />
            <meshStandardMaterial color="#C9C9CF" />
          </mesh>
          <group ref={bubble}>
            <mesh geometry={g.bubble} position={[0, sy(10), 0]}>
              <meshStandardMaterial ref={bubbleMat} color={ORANGE} emissive={ORANGE} emissiveIntensity={0.3} roughness={0.4} />
            </mesh>
            <mesh geometry={g.tail} position={[0, 0, -0.08]}>
              <meshStandardMaterial color={ORANGE} emissive={ORANGE} emissiveIntensity={0.3} roughness={0.4} />
            </mesh>
          </group>

          {/* Orange headphones */}
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (s(64) + 0.1), sy(76), 0]} rotation={[0, 0, Math.PI / 2]}>
              <mesh>
                <cylinderGeometry args={[s(12), s(12), 0.3, 32]} />
                <meshStandardMaterial color={ORANGE} roughness={0.4} />
              </mesh>
              <mesh position={[0, -side * 0.155, 0]}>
                <cylinderGeometry args={[s(5), s(5), 0.02, 24]} />
                <meshStandardMaterial color={ORANGE_DARK} />
              </mesh>
            </group>
          ))}

          {/* Head shell and dark visor */}
          <mesh geometry={g.head} position={[0, sy(76), 0]}>
            {shell}
          </mesh>
          <mesh geometry={g.visor} position={[0, sy(76), HEAD_FRONT + 0.03]}>
            <meshStandardMaterial color={INK} roughness={0.12} metalness={0.1} />
          </mesh>

          {/* Pill eyes, cheeks and smile on the visor */}
          <group ref={eyes} position={[0, sy(74), HEAD_FRONT + 0.07]}>
            {[81, 119].map((x) => (
              <mesh key={x} position={[sx(x), 0, 0]} scale={[1, 1, 0.35]}>
                <capsuleGeometry args={[s(7), s(6), 8, 16]} />
                {glow}
              </mesh>
            ))}
          </group>
          {[64, 136].map((x) => (
            <mesh key={x} position={[sx(x), sy(92), HEAD_FRONT + 0.065]} scale={[1, 0.58, 1]}>
              <circleGeometry args={[s(6), 24]} />
              <meshBasicMaterial color={ORANGE} transparent opacity={0.6} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, sy(90), HEAD_FRONT + 0.07]} rotation={[0, 0, Math.PI]} scale={[1, 0.6, 0.4]}>
            <torusGeometry args={[s(10), s(2), 8, 24, Math.PI]} />
            {glow}
          </mesh>
        </group>
      </group>
    </>
  );
}

/** The whole scene: lights, Tiko, halo and confetti. */
export function TikoScene({ reduceMotion = false }: { reduceMotion?: boolean }) {
  return (
    <>
      <ambientLight intensity={1.1} />
      <hemisphereLight args={['#FFFFFF', ORANGE, 0.55]} />
      <directionalLight position={[3, 5, 4]} intensity={2.1} />
      <directionalLight position={[-4, 2, 3]} intensity={0.6} />
      <Tiko reduceMotion={reduceMotion} />
      {reduceMotion ? null : (
        <>
          <Halo />
          <Confetti />
        </>
      )}
    </>
  );
}
