"use client";

import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  GOAL_Z, GOAL_W, HALF_W, GOAL_H, POST_R, NET_DEPTH,
  CAM_POS, CAM_LOOK,
} from "@/lib/penalty3d";

// ── Canvas textures (created once, client-side only) ──────────────────────────

function useGrassTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? "#2f8a36" : "#2a7d31";
      g.fillRect(0, i * 32, 512, 32);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 5);
    return t;
  }, []);
}

function useNetTexture(rx: number, ry: number) {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.strokeStyle = "rgba(255,255,255,.55)";
    g.lineWidth = 1.4;
    for (let i = 0; i <= 64; i += 8) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
  }, [rx, ry]);
}

// ── Grass ground ──────────────────────────────────────────────────────────────

function Ground() {
  const map = useGrassTexture();
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial map={map} roughness={1} />
    </mesh>
  );
}

// ── Dark stadium backdrop behind the goal ─────────────────────────────────────

function Backdrop() {
  return (
    <mesh position={[0, 11, GOAL_Z - 7]}>
      <planeGeometry args={[60, 22]} />
      <meshStandardMaterial color="#0c1838" roughness={1} />
    </mesh>
  );
}

// ── Net: back plane + horizontal top + two side planes ───────────────────────

function Net() {
  const backTex = useNetTexture(12, 4);
  const topTex  = useNetTexture(12, 2);
  const sideTex = useNetTexture(2, 4);

  const backMat = useMemo(() => new THREE.MeshBasicMaterial(
    { map: backTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    [backTex]);
  const topMat  = useMemo(() => new THREE.MeshBasicMaterial(
    { map: topTex,  transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    [topTex]);
  const sideMat = useMemo(() => new THREE.MeshBasicMaterial(
    { map: sideTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    [sideTex]);

  return (
    <>
      {/* Back net */}
      <mesh position={[0, GOAL_H / 2, -NET_DEPTH]} material={backMat}>
        <planeGeometry args={[GOAL_W, GOAL_H]} />
      </mesh>
      {/* Top net (horizontal) */}
      <mesh position={[0, GOAL_H, -NET_DEPTH / 2]} rotation={[-Math.PI / 2, 0, 0]} material={topMat}>
        <planeGeometry args={[GOAL_W, NET_DEPTH]} />
      </mesh>
      {/* Left side */}
      <mesh position={[-HALF_W, GOAL_H / 2, -NET_DEPTH / 2]} rotation={[0, Math.PI / 2, 0]} material={sideMat}>
        <planeGeometry args={[NET_DEPTH, GOAL_H]} />
      </mesh>
      {/* Right side */}
      <mesh position={[HALF_W, GOAL_H / 2, -NET_DEPTH / 2]} rotation={[0, -Math.PI / 2, 0]} material={sideMat}>
        <planeGeometry args={[NET_DEPTH, GOAL_H]} />
      </mesh>
    </>
  );
}

// ── Goal: posts + crossbar + net ──────────────────────────────────────────────

function Goal() {
  const postMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "white", roughness: 0.4, metalness: 0.1 }),
    []);

  return (
    <group position={[0, 0, GOAL_Z]}>
      {/* Left post */}
      <mesh position={[-HALF_W, GOAL_H / 2, 0]} castShadow material={postMat}>
        <cylinderGeometry args={[POST_R, POST_R, GOAL_H, 16]} />
      </mesh>
      {/* Right post */}
      <mesh position={[HALF_W, GOAL_H / 2, 0]} castShadow material={postMat}>
        <cylinderGeometry args={[POST_R, POST_R, GOAL_H, 16]} />
      </mesh>
      {/* Crossbar */}
      <mesh position={[0, GOAL_H, 0]} rotation={[0, 0, Math.PI / 2]} castShadow material={postMat}>
        <cylinderGeometry args={[POST_R, POST_R, GOAL_W + POST_R * 2, 16]} />
      </mesh>
      <Net />
    </group>
  );
}

// ── Ball on penalty spot ──────────────────────────────────────────────────────

function Ball() {
  return (
    <mesh position={[0, 0.12, 0]} castShadow>
      <sphereGeometry args={[0.12, 24, 24]} />
      <meshStandardMaterial color="white" roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

// ── Goalkeeper (procedural, matches demo style) ───────────────────────────────

function Keeper() {
  const jersey = useMemo(() => new THREE.MeshStandardMaterial({ color: "#16c79a", roughness: 0.6 }), []);
  const skin   = useMemo(() => new THREE.MeshStandardMaterial({ color: "#f1c27d", roughness: 0.7 }), []);
  const glove  = useMemo(() => new THREE.MeshStandardMaterial({ color: "#ff4d6d", roughness: 0.5 }), []);
  const dark   = useMemo(() => new THREE.MeshStandardMaterial({ color: "#222a44", roughness: 0.8 }), []);

  return (
    <group position={[0, 0, GOAL_Z + 0.45]}>
      {/* Left leg */}
      <mesh position={[-0.13, 0.33, 0]} castShadow material={dark}>
        <cylinderGeometry args={[0.09, 0.09, 0.7, 10]} />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.13, 0.33, 0]} castShadow material={dark}>
        <cylinderGeometry args={[0.09, 0.09, 0.7, 10]} />
      </mesh>
      {/* Torso */}
      <mesh position={[0, 1.05, 0]} castShadow material={jersey}>
        <cylinderGeometry args={[0.26, 0.30, 0.85, 14]} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.62, 0]} castShadow material={skin}>
        <sphereGeometry args={[0.20, 18, 18]} />
      </mesh>
      {/* Left arm — spread out */}
      <mesh position={[-0.34, 1.18, 0]} rotation={[0, 0, 0.95]} castShadow material={jersey}>
        <cylinderGeometry args={[0.07, 0.07, 0.7, 10]} />
      </mesh>
      {/* Right arm — spread out */}
      <mesh position={[0.34, 1.18, 0]} rotation={[0, 0, -0.95]} castShadow material={jersey}>
        <cylinderGeometry args={[0.07, 0.07, 0.7, 10]} />
      </mesh>
      {/* Left glove */}
      <mesh position={[-0.62, 1.42, 0]} castShadow material={glove}>
        <sphereGeometry args={[0.11, 12, 12]} />
      </mesh>
      {/* Right glove */}
      <mesh position={[0.62, 1.42, 0]} castShadow material={glove}>
        <sphereGeometry args={[0.11, 12, 12]} />
      </mesh>
    </group>
  );
}

// ── Penalty spot ──────────────────────────────────────────────────────────────

function PenaltySpot() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
      <circleGeometry args={[0.12, 20]} />
      <meshStandardMaterial color="white" roughness={1} />
    </mesh>
  );
}

// ── Lights ────────────────────────────────────────────────────────────────────

function Lights() {
  return (
    <>
      <hemisphereLight args={[0x88aaff as unknown as THREE.ColorRepresentation, 0x223b1f as unknown as THREE.ColorRepresentation, 0.55]} />
      {/* Key light — stadium flood from upper-left front */}
      <directionalLight
        position={[-6, 12, 6]}
        intensity={1.15}
        castShadow
        shadow-bias={-0.0004}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      {/* Rim — blue fill from right-back */}
      <directionalLight position={[6, 8, -10]} intensity={0.5} color="#bcd2ff" />
    </>
  );
}

// ── Camera rig: applies lookAt once after mount ───────────────────────────────

function CameraRig() {
  const camera = useThree(s => s.camera);
  useEffect(() => {
    camera.lookAt(CAM_LOOK[0], CAM_LOOK[1], CAM_LOOK[2]);
  }, [camera]);
  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

function Scene() {
  return (
    <>
      <Lights />
      <Ground />
      <Backdrop />
      <Goal />
      <PenaltySpot />
      <Ball />
      <Keeper />
    </>
  );
}

// ── Canvas export (loaded via next/dynamic with ssr:false) ────────────────────

export default function PenaltyScene3D() {
  return (
    <div style={{ width: "100%", height: 320 }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [CAM_POS[0], CAM_POS[1], CAM_POS[2]], fov: 50 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <color attach="background" args={["#0a1330"]} />
        <fog attach="fog" args={["#0a1330", 14, 34]} />
        <Scene />
        <CameraRig />
      </Canvas>
    </div>
  );
}
