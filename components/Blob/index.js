import React, { useMemo, useRef } from "react";
import vertexShader from "./vertexShader";
import fragmentShader from "./fragmentShader";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, MathUtils, Vector2 } from "three";

const Blob = () => {
  const mesh = useRef();
  const hover = useRef({ active: false, uv: new Vector2(0.5, 0.5) });
  const uniforms = useMemo(() => {
    return {
      u_time: { value: 0 },
      u_intensity: { value: 0.18 },
      u_hoverUv: { value: new Vector2(0.5, 0.5) },
      u_hoverStrength: { value: 0.0 },
      u_hoverActive: { value: 0.0 },
      u_hoverRadius: { value: 0.24 },
    };
  }, []);

  useFrame((state) => {
    const { clock } = state;
    if (mesh.current) {
      mesh.current.material.uniforms.u_time.value =
        (hover.current.active ? 0.12 : 0.01) * clock.getElapsedTime();

      mesh.current.material.uniforms.u_hoverUv.value.copy(hover.current.uv);
      mesh.current.material.uniforms.u_hoverActive.value = hover.current.active
        ? 1.0
        : 0.0;
      mesh.current.material.uniforms.u_hoverStrength.value = hover.current.active
        ? 1.0
        : 0.0;

      mesh.current.material.uniforms.u_intensity.value = MathUtils.lerp(
        mesh.current.material.uniforms.u_intensity.value,
        hover.current.active ? 0.42 : 0.02,
        hover.current.active ? 0.035 : 0.22
      );
    }
  });
  return (
    <mesh
      ref={mesh}
      scale={1.5}
      position={[0, 0, 0]}
      onPointerOver={(event) => {
        hover.current.active = true;
        if (event.uv) {
          hover.current.uv.set(event.uv.x, event.uv.y);
        }
      }}
      onPointerMove={(event) => {
        hover.current.active = true;
        if (event.uv) {
          hover.current.uv.set(event.uv.x, event.uv.y);
        }
      }}
      onPointerOut={() => {
        hover.current.active = false;
      }}
    >
      <icosahedronBufferGeometry args={[2, 20]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
};

export default Blob;
