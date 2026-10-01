import { Canvas, useFrame } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  PresentationControls,
  useGLTF,
} from "@react-three/drei";
import { Suspense, useRef } from "react";
import * as THREE from "three";

function Shoe() {
  const group = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/shoe.glb");

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (!group.current) return;
    group.current.rotation.y += dt * 0.35;
    group.current.position.y =
      Math.sin(state.clock.elapsedTime * 0.9) * 0.15 - 0.1;
  });

  return (
    <group ref={group} scale={7.5} rotation={[0.15, 0, 0.05]}>
      <primitive object={scene} />
    </group>
  );
}

if (typeof window !== "undefined") {
  useGLTF.preload("/models/shoe.glb");
}

export default function ShoeScene() {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.4, 4.2], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={2.4} castShadow />
      <directionalLight position={[-5, 2, -3]} intensity={1.2} color="#ff7a45" />
      <Suspense fallback={null}>
        <PresentationControls
          global
          polar={[-0.3, 0.3]}
          azimuth={[-0.7, 0.7]}
          snap
        >
          <Shoe />
        </PresentationControls>
        <Environment>
          <Lightformer
            intensity={2.4}
            position={[0, 4, 2]}
            scale={[8, 8, 1]}
            color="#ffffff"
          />
          <Lightformer
            intensity={1.6}
            color="#ff6a2b"
            position={[-4, 1, -2]}
            rotation-y={Math.PI / 2}
            scale={[14, 2, 1]}
          />
        </Environment>
      </Suspense>
      <ContactShadows
        position={[0, -1.35, 0]}
        opacity={0.55}
        scale={7.5}
        blur={2.6}
        far={3}
      />
    </Canvas>
  );
}
