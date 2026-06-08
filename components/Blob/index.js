import React, { useMemo, useRef } from "react";
import vertexShader from "./vertexShader";
import fragmentShader from "./fragmentShader";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, MathUtils, Vector2, Vector3 } from "three";

const Blob = () => {
  const mesh = useRef();
  const hover = useRef({ mode: "idle", uv: new Vector2(0.5, 0.5) });
  const activity = useRef(0);
  const worldPosition = useRef(new Vector3());
  const screenCenter = useRef(new Vector3());
  const pointerPx = useRef(new Vector2());
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

  useFrame((state, delta) => {
    const { camera, pointer, size } = state;
    if (mesh.current) {
      worldPosition.current.setFromMatrixPosition(mesh.current.matrixWorld);
      screenCenter.current.copy(worldPosition.current).project(camera);

      pointerPx.current.set(
        ((pointer.x + 1) * 0.5) * size.width,
        ((1 - pointer.y) * 0.5) * size.height
      );

      const centerPxX = ((screenCenter.current.x + 1) * 0.5) * size.width;
      const centerPxY = ((1 - screenCenter.current.y) * 0.5) * size.height;
      const pointerDistance = Math.hypot(
        pointerPx.current.x - centerPxX,
        pointerPx.current.y - centerPxY
      );
      const nearRadius = 26;

      if (hover.current.mode !== "inside") {
        if (pointerDistance <= nearRadius) {
          hover.current.mode = "near";
          hover.current.uv.set(pointer.x * 0.5 + 0.5, 1.0 - (pointer.y * 0.5 + 0.5));
        } else {
          hover.current.mode = "idle";
        }
      }

      const targetActivity =
        hover.current.mode === "inside"
          ? 1.0
          : hover.current.mode === "near"
          ? 0.55
          : 0.0;

      activity.current = MathUtils.lerp(
        activity.current,
        targetActivity,
        hover.current.mode === "idle" ? 0.04 : 0.08
      );

      mesh.current.material.uniforms.u_time.value +=
        delta * (0.02 + activity.current * 0.09);

      mesh.current.material.uniforms.u_hoverUv.value.copy(hover.current.uv);
      mesh.current.material.uniforms.u_hoverActive.value =
        hover.current.mode === "idle" ? 0.0 : 1.0;
      mesh.current.material.uniforms.u_hoverStrength.value =
        hover.current.mode === "inside" ? 1.0 : hover.current.mode === "near" ? 0.68 : 0.0;
      mesh.current.material.uniforms.u_hoverRadius.value =
        hover.current.mode === "inside" ? 0.24 : hover.current.mode === "near" ? 0.16 : 0.24;

      mesh.current.material.uniforms.u_intensity.value = MathUtils.lerp(
        mesh.current.material.uniforms.u_intensity.value,
        hover.current.mode === "inside"
          ? 0.36
          : hover.current.mode === "near"
          ? 0.24
          : 0.015,
        hover.current.mode === "idle" ? 0.08 : 0.03
      );
    }
  });
  return (
    <mesh
      ref={mesh}
      scale={1.5}
      position={[0, 0, 0]}
      onPointerOver={(event) => {
        hover.current.mode = "inside";
        if (event.uv) {
          hover.current.uv.set(event.uv.x, event.uv.y);
        }
      }}
      onPointerMove={(event) => {
        hover.current.mode = "inside";
        if (event.uv) {
          hover.current.uv.set(event.uv.x, event.uv.y);
        }
      }}
      onPointerOut={() => {
        hover.current.mode = "idle";
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
