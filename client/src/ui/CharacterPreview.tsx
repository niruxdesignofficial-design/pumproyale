import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getCharacterGltf, getClips, preloadCharacters } from "../game/characterModel";

/**
 * A small self-contained renderer that shows one character slowly rotating with
 * its idle animation. Used on the character-select screen. Owns its own WebGL
 * context for the component's lifetime.
 */
export function CharacterPreview({ characterId }: { characterId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let raf = 0;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb9d0c0, 0.7));
    const key = new THREE.DirectionalLight(0xfff4e6, 1.2);
    key.position.set(2, 4, 3);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 1.1, 3.6);
    camera.lookAt(0, 1.0, 0);

    const group = new THREE.Group();
    scene.add(group);
    let mixer: THREE.AnimationMixer | null = null;

    const resize = () => {
      const w = canvas.clientWidth || 280;
      const h = canvas.clientHeight || 340;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const build = () => {
      const gltf = getCharacterGltf(characterId);
      if (!gltf || disposed) return;
      const model = cloneSkeleton(gltf.scene);
      group.add(model);
      mixer = new THREE.AnimationMixer(model);
      const clips = getClips();
      const idle = clips.find((c) => c.name === "Idle_A") ?? clips[0];
      if (idle) mixer.clipAction(idle).play();
    };

    const clock = new THREE.Clock();
    const tick = () => {
      if (disposed) return;
      const dt = clock.getDelta();
      group.rotation.y += dt * 0.7;
      mixer?.update(dt);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    // Characters may still be loading; wait for the preload then build.
    void preloadCharacters().then(() => {
      if (disposed) return;
      build();
    });

    resize();
    window.addEventListener("resize", resize);
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    };
  }, [characterId]);

  return <canvas ref={canvasRef} className="char-preview-canvas" />;
}
