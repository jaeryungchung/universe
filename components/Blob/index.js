import React, { useEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, MathUtils, Vector2, Vector3 } from "three";
import { useFrame } from "@react-three/fiber";
import vertexShader from "./vertexShader";
import fragmentShader from "./fragmentShader";

const BURST_COUNT = 18;

const Blob = ({
  tint = "#f2efe7",
  absorbRadius = 112,
  onClick,
  onHoverChange,
  externalHover,
  burstSignal = 0,
  burstColor = "#f2efe7",
  bounceSignal = 0,
  quakeSignal = 0,
  disintegrateSignal = 0,
  onDisintegrateComplete,
  isGone = false,
}) => {
  const root = useRef();
  const mesh = useRef();
  const burstGroup = useRef();
  const dustGroup = useRef();
  const burstProgress = useRef(1);
  const burstColorRef = useRef(new Color(burstColor));
  const bounceProgress = useRef(1.2);
  const quakeProgress = useRef(1.2);
  const hover = useRef({ mode: "idle", uv: new Vector2(0.5, 0.5) });
  const activity = useRef(0);
  const tintColor = useRef(new Color(tint));
  const targetTintColor = useRef(new Color(tint));
  const worldPosition = useRef(new Vector3());
  const screenCenter = useRef(new Vector3());
  const pointerPx = useRef(new Vector2());
  const disintegrateProgress = useRef(1.2);
  const disintegrateDone = useRef(0);
  const uniforms = useRef({
    u_time: { value: 0 },
    u_intensity: { value: 0.18 },
    u_hoverUv: { value: new Vector2(0.5, 0.5) },
    u_hoverStrength: { value: 0.0 },
    u_hoverActive: { value: 0.0 },
    u_hoverRadius: { value: 0.24 },
    u_rippleStrength: { value: 0.0 },
    u_rippleRadius: { value: 0.18 },
    u_tintColor: { value: new Color(tint) },
    u_tintStrength: { value: 0.0 },
    u_alpha: { value: 1.0 },
  });

  useEffect(() => {
    targetTintColor.current.set(tint);
  }, [tint]);

  useEffect(() => {
    burstProgress.current = 0;
    burstColorRef.current.set(burstColor);
  }, [burstColor, burstSignal]);

  useEffect(() => {
    bounceProgress.current = 0;
  }, [bounceSignal]);

  useEffect(() => {
    quakeProgress.current = 0;
  }, [quakeSignal]);

  useEffect(() => {
    if (!disintegrateSignal) {
      return;
    }

    disintegrateProgress.current = 0;
    disintegrateDone.current = 0;
  }, [disintegrateSignal]);

  const burstSeeds = useMemo(
    () =>
      Array.from({ length: BURST_COUNT }, (_, index) => {
        const angle = (Math.PI * 2 * index) / BURST_COUNT;
        return {
          angle,
          radius: 0.32 + (index % 5) * 0.045,
          speed: 0.62 + (index % 4) * 0.15,
          size: 0.02 + (index % 3) * 0.012,
          z: -0.7 - (index % 4) * 0.08,
        };
      }),
    []
  );

  const dustSeeds = useMemo(
    () =>
      Array.from({ length: 180 }, (_, index) => {
        const theta = Math.acos(1 - 2 * ((index + 0.5) / 180));
        const phi = Math.PI * (1 + Math.sqrt(5)) * index;
        const dir = new Vector3(
          Math.sin(theta) * Math.cos(phi),
          Math.sin(theta) * Math.sin(phi),
          Math.cos(theta)
        ).normalize();
        return {
          dir,
          speed: 0.8 + (index % 9) * 0.07,
          swirl: 0.08 + (index % 5) * 0.025,
          delay: (index % 11) * 0.012,
          size: 0.016 + (index % 4) * 0.006,
        };
      }),
    []
  );

  useFrame((state, delta) => {
    const { camera, pointer, size } = state;

    if (!mesh.current) {
      return;
    }

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

    if (isGone || disintegrateProgress.current <= 1) {
      hover.current.mode = "idle";
      onHoverChange?.(false);
    } else if (externalHover?.active) {
      hover.current.mode = "inside";
      hover.current.uv.set(
        externalHover.x * 0.5 + 0.5,
        1.0 - (externalHover.y * 0.5 + 0.5)
      );
    } else if (hover.current.mode !== "inside") {
      if (pointerDistance <= absorbRadius * 0.55) {
        hover.current.mode = "near";
        hover.current.uv.set(pointer.x * 0.5 + 0.5, 1 - (pointer.y * 0.5 + 0.5));
      } else {
        hover.current.mode = "idle";
      }
    }

    const targetActivity =
      hover.current.mode === "inside"
        ? 1
        : hover.current.mode === "near"
        ? 0.55
        : 0;

    activity.current = MathUtils.lerp(
      activity.current,
      targetActivity,
      hover.current.mode === "idle" ? 0.04 : 0.08
    );

    const materialUniforms = mesh.current.material.uniforms;
    materialUniforms.u_time.value += delta * (0.02 + activity.current * 0.09);
    materialUniforms.u_hoverUv.value.copy(hover.current.uv);
    materialUniforms.u_hoverActive.value = hover.current.mode === "idle" ? 0 : 1;
    materialUniforms.u_hoverStrength.value =
      hover.current.mode === "inside" ? 1 : hover.current.mode === "near" ? 0.68 : 0;
    materialUniforms.u_hoverRadius.value =
      hover.current.mode === "inside" ? 0.24 : hover.current.mode === "near" ? 0.16 : 0.24;
    materialUniforms.u_rippleRadius.value =
      hover.current.mode === "inside" ? 0.2 : hover.current.mode === "near" ? 0.16 : 0.2;
    materialUniforms.u_rippleStrength.value = MathUtils.lerp(
      materialUniforms.u_rippleStrength.value,
      hover.current.mode === "inside" ? 1.0 : hover.current.mode === "near" ? 0.45 : 0.0,
      hover.current.mode === "idle" ? 0.08 : 0.16
    );
    materialUniforms.u_intensity.value = MathUtils.lerp(
      materialUniforms.u_intensity.value,
      hover.current.mode === "inside"
        ? 0.36
        : hover.current.mode === "near"
        ? 0.24
        : 0.015,
      hover.current.mode === "idle" ? 0.08 : 0.03
    );

    tintColor.current.lerp(targetTintColor.current, 0.04);
    materialUniforms.u_tintColor.value.copy(tintColor.current);
    materialUniforms.u_tintStrength.value = MathUtils.lerp(
      materialUniforms.u_tintStrength.value,
      tint === "#f2efe7" ? 0 : 0.82,
      0.04
    );

    const bounceT = Math.min(1.1, bounceProgress.current);
    const bounceWave =
      bounceT <= 1
        ? -Math.sin(bounceT * Math.PI) * Math.exp(-3.2 * bounceT) * 0.075
        : 0;

    const quakeT = Math.min(1.1, quakeProgress.current);
    const quakeFade = quakeT <= 1 ? Math.exp(-3.1 * quakeT) : 0;
    const quakeX = quakeFade * Math.sin(quakeT * 42) * 0.08;
    const quakeY = quakeFade * Math.cos(quakeT * 34) * 0.06;

    const disintegrateT = Math.min(1.2, disintegrateProgress.current);
    const disintegrating = disintegrateT <= 1;
    const dissolve = disintegrating ? 1 - Math.pow(disintegrateT, 1.35) : 1;
    materialUniforms.u_alpha.value = isGone ? 0 : dissolve;

    if (root.current) {
      const rootScale =
        (1 + bounceWave) *
        (disintegrating ? 1 + Math.sin(disintegrateT * Math.PI) * 0.08 : 1);
      root.current.scale.setScalar(isGone ? 0.001 : rootScale);
      root.current.position.set(
        quakeX,
        quakeY + (disintegrating ? disintegrateT * 0.12 : 0),
        0
      );
    }

    bounceProgress.current = Math.min(1.2, bounceProgress.current + delta * 2.35);
    quakeProgress.current = Math.min(1.2, quakeProgress.current + delta * 1.8);
    disintegrateProgress.current = Math.min(
      1.2,
      disintegrateProgress.current + delta * 0.9
    );

    if (burstGroup.current) {
      burstProgress.current = Math.min(1.2, burstProgress.current + delta * 1.9);

      burstGroup.current.children.forEach((child, index) => {
        const seed = burstSeeds[index];
        const progress = burstProgress.current;
        const eased = 1 - Math.pow(1 - Math.min(progress, 1), 3);
        const distance = seed.radius + eased * seed.speed * 1.25;
        child.position.set(
          Math.cos(seed.angle) * distance,
          Math.sin(seed.angle) * distance,
          seed.z
        );
        const scale = Math.max(0.001, seed.size * (1.2 - eased * 0.9));
        child.scale.setScalar(scale);
        child.material.opacity = Math.max(0, 0.9 - eased * 0.9);
        child.material.color.copy(burstColorRef.current);
      });
    }

    if (dustGroup.current) {
      dustGroup.current.visible = !isGone && disintegrating;
      dustGroup.current.children.forEach((child, index) => {
        const seed = dustSeeds[index];
        const delayed = Math.max(0, disintegrateT - seed.delay);
        const progress = Math.min(1, delayed / (1 - seed.delay + 0.0001));
        const eased = 1 - Math.pow(1 - progress, 2.6);
        const distance = eased * (1.3 + seed.speed);
        child.position.set(
          seed.dir.x * distance + Math.sin(progress * 9 + index) * seed.swirl,
          seed.dir.y * distance + Math.cos(progress * 8 + index) * seed.swirl,
          seed.dir.z * distance * 0.5
        );
        child.scale.setScalar(seed.size * (1.4 - eased * 0.78));
        child.material.opacity = Math.max(0, 0.9 - eased * 0.9);
        child.material.color.copy(tintColor.current).lerp(new Color("#ffffff"), 0.42);
      });
    }

    if (disintegrating && disintegrateT >= 1 && !disintegrateDone.current) {
      disintegrateDone.current = 1;
      onDisintegrateComplete?.();
    }
  });

  return (
    <group ref={root}>
      <group ref={burstGroup}>
        {burstSeeds.map((seed, index) => (
          <mesh key={index} position={[0, 0, seed.z]}>
            <sphereGeometry args={[1, 6, 6]} />
            <meshBasicMaterial transparent depthWrite={false} opacity={0} />
          </mesh>
        ))}
      </group>

      <group ref={dustGroup} visible={false}>
        {dustSeeds.map((seed, index) => (
          <mesh key={`dust-${index}`} position={[0, 0, 0]}>
            <sphereGeometry args={[1, 4, 4]} />
            <meshBasicMaterial transparent depthWrite={false} opacity={0} />
          </mesh>
        ))}
      </group>

      <mesh
        ref={mesh}
        scale={1.5}
        position={[0, 0, 0]}
        onPointerOver={(event) => {
          hover.current.mode = "inside";
          onHoverChange?.(true);
          if (event.uv) {
            hover.current.uv.set(event.uv.x, event.uv.y);
          }
        }}
        onPointerMove={(event) => {
          hover.current.mode = "inside";
          onHoverChange?.(true);
          if (event.uv) {
            hover.current.uv.set(event.uv.x, event.uv.y);
          }
        }}
        onPointerOut={() => {
          hover.current.mode = "idle";
          onHoverChange?.(false);
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (isGone || disintegrateProgress.current <= 1) {
            return;
          }
          onClick?.();
        }}
      >
        <icosahedronBufferGeometry args={[2, 20]} />
        <shaderMaterial
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms.current}
          transparent
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
};

export default Blob;
