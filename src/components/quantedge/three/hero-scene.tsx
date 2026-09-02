"use client";

// DEEYOUNG PRO — WebGL hero: a crimson "market city" of 3D candlesticks.
// Plain react-three-fiber (no drei) to keep the bundle lean.
// Degrades gracefully: if WebGL is unavailable the parent shows a static CSS banner.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type Candle = { x: number; z: number; bodyH: number; bodyY: number; wickH: number; wickY: number; up: boolean };

/** Deterministic pseudo-random walk so SSR/CSR agree and the skyline feels "authored". */
function buildCandles(count: number): Candle[] {
  let price = 5.2;
  const candles: Candle[] = [];
  let seed = 42;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 7) * 0.42;
    const open = price;
    const close = Math.max(1.2, Math.min(9.4, open + (rnd() - 0.46) * 1.7 + drift * 0.35));
    const high = Math.max(open, close) + rnd() * 0.9;
    const low = Math.max(0.6, Math.min(open, close) - rnd() * 0.9);
    const x = (i - count / 2) * 1.02;
    const z = Math.sin(i / 5.2) * 1.9;
    const bodyH = Math.max(0.14, Math.abs(close - open));
    candles.push({
      x,
      z,
      bodyH,
      bodyY: (open + close) / 2,
      wickH: Math.max(0.1, high - low),
      wickY: (high + low) / 2,
      up: close >= open,
    });
    price = close;
  }
  return candles;
}

function MarketCity({ spin }: { spin: boolean }) {
  const group = useRef<THREE.Group>(null);
  const candles = useMemo(() => buildCandles(46), []);

  useFrame((state, delta) => {
    if (!group.current) return;
    if (spin) {
      group.current.rotation.y += delta * 0.12;
      group.current.position.y = Math.sin(state.clock.elapsedTime * 0.55) * 0.22;
    }
  });

  return (
    <group ref={group}>
      {candles.map((c, i) => (
        <group key={i} position={[c.x, 0, c.z]}>
          {/* body */}
          <mesh position={[0, c.bodyY, 0]} castShadow={false}>
            <boxGeometry args={[0.56, c.bodyH, 0.56]} />
            <meshStandardMaterial
              color={c.up ? "#f5f5f5" : "#dc2626"}
              emissive={c.up ? "#ffffff" : "#dc2626"}
              emissiveIntensity={c.up ? 0.16 : 0.34}
              roughness={0.32}
              metalness={0.24}
            />
          </mesh>
          {/* wick */}
          <mesh position={[0, c.wickY, 0]}>
            <boxGeometry args={[0.085, c.wickH, 0.085]} />
            <meshStandardMaterial
              color={c.up ? "#d4d4d4" : "#b91c1c"}
              emissive={c.up ? "#e5e5e5" : "#ef4444"}
              emissiveIntensity={0.3}
              roughness={0.5}
              metalness={0.3}
            />
          </mesh>
        </group>
      ))}
      {/* base plinth */}
      <mesh position={[0, -0.55, 0]}>
        <boxGeometry args={[50, 0.18, 7.4]} />
        <meshStandardMaterial color="#111111" roughness={0.42} metalness={0.55} />
      </mesh>
      {/* crimson edge light along the plinth */}
      <mesh position={[0, -0.44, 3.68]}>
        <boxGeometry args={[50, 0.05, 0.05]} />
        <meshBasicMaterial color="#ef4444" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Camera drifts with the pointer — the scene feels alive without any input. */
function ParallaxRig({ enabled }: { enabled: boolean }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    if (!enabled) return;
    // Three.js objects are mutable by design (R3F useFrame idiom).
    // eslint-disable-next-line react-hooks/immutability
    camera.position.x += (pointer.x * 2.4 - camera.position.x) * 0.045;
    camera.position.y += (1.9 + pointer.y * 0.9 - camera.position.y) * 0.045;
    camera.lookAt(0, 2.4, 0);
  });
  return null;
}

export default function HeroScene() {
  // Client-only component (dynamic ssr:false) → window access in initializers is safe.
  const [webglOk] = useState(() => {
    try {
      const c = document.createElement("canvas");
      return !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      return false;
    }
  });
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!webglOk) {
    // No WebGL → static drawn skyline keeps the brand moment intact.
    return (
      <div className="absolute inset-0" aria-hidden>
        <div className="qe-banner absolute inset-0" />
        <svg viewBox="0 0 800 260" preserveAspectRatio="xMidYMax meet" className="absolute inset-x-0 bottom-0 h-full w-full opacity-70">
          {buildCandles(30).map((c, i) => (
            <g key={i} transform={`translate(${80 + i * 22}, 0)`}>
              <rect x={-3} y={180 - c.wickY * 14} width={1.6} height={Math.max(6, c.wickH * 14)} fill={c.up ? "#d4d4d4" : "#7f1d1d"} />
              <rect x={-8} y={176 - c.bodyY * 14} width={16} height={Math.max(4, c.bodyH * 14)} fill={c.up ? "#f5f5f5" : "#dc2626"} opacity={0.92} />
            </g>
          ))}
          <rect x={40} y={224} width={720} height={2} fill="#27272a" />
        </svg>
      </div>
    );
  }

  return (
    <div className="absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 1.9, 13.5], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => gl.setClearColor("#0a0a0a", 0)}
      >
        <fog attach="fog" args={["#0a0a0a", 16, 38]} />
        <ambientLight intensity={0.32} />
        <directionalLight position={[6, 10, 6]} intensity={1.1} color="#ffffff" />
        <pointLight position={[-8, 4, -4]} intensity={52} distance={26} color="#dc2626" />
        <pointLight position={[9, 3, 5]} intensity={30} distance={22} color="#ef4444" />
        <MarketCity spin={!reducedMotion} />
        <ParallaxRig enabled={!reducedMotion} />
      </Canvas>
      {/* vignette + bottom fade so the canvas melts into the page */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_65%_at_50%_42%,transparent_40%,rgba(10,10,10,0.72)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
