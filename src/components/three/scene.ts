import * as THREE from 'three';
import { LIGHTING_OPTIONS, type LightingPreset, type MaterialMode, type ThreeDModelOption } from './presets';

/** Builds the mesh group for one sample model. */
export function buildModel(model: ThreeDModelOption, materialMode: MaterialMode, wireframe: boolean): THREE.Group {
  const primaryColor = new THREE.Color(model.primaryColor);
  const glowColor = new THREE.Color(model.glowColor);

  // Material setup
  let meshMat: THREE.Material;

  if (materialMode === 'hologram') {
    meshMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });
  } else if (materialMode === 'gold') {
    meshMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.95,
      roughness: 0.15,
      wireframe,
    });
  } else if (materialMode === 'glass') {
    meshMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.9,
      wireframe,
    });
  } else {
    // PBR Standard
    meshMat = new THREE.MeshStandardMaterial({
      color: primaryColor,
      metalness: 0.6,
      roughness: 0.2,
      wireframe,
    });
  }

  // Build specific 3D Shape based on model selected
  if (model.id === 'sophia-cyber') {
    // Character Avatar Bust
    const group = new THREE.Group();

    // Head (Sphere)
    const headGeo = new THREE.SphereGeometry(0.7, 32, 32);
    const headMesh = new THREE.Mesh(headGeo, meshMat);
    headMesh.position.y = 0.5;
    group.add(headMesh);

    // Cyber Halo / Visor
    const visorGeo = new THREE.TorusGeometry(0.75, 0.05, 16, 64);
    const visorMat = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 0.6 });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.rotation.x = Math.PI / 2.5;
    visorMesh.position.y = 0.55;
    group.add(visorMesh);

    // Neck / Shoulders Base
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.9, 1.2, 32);
    const bodyMesh = new THREE.Mesh(bodyGeo, meshMat);
    bodyMesh.position.y = -0.5;
    group.add(bodyMesh);

    // Floating Hologram HUD Rings
    const hudGeo = new THREE.RingGeometry(1.0, 1.05, 32);
    const hudMat = new THREE.MeshBasicMaterial({ color: glowColor, side: THREE.DoubleSide });
    const hudMesh = new THREE.Mesh(hudGeo, hudMat);
    hudMesh.position.y = 0.1;
    hudMesh.rotation.x = Math.PI / 2;
    group.add(hudMesh);

    return group;
  }
  if (model.id === 'aether-glasses') {
    // Spatial Glasses
    const group = new THREE.Group();

    // Frame
    const frameGeo = new THREE.BoxGeometry(2.2, 0.6, 0.2);
    const frameMesh = new THREE.Mesh(frameGeo, meshMat);
    group.add(frameMesh);

    // Lenses (Left & Right)
    const lensGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.05, 32);
    const lensMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.7,
      roughness: 0.05,
    });

    const leftLens = new THREE.Mesh(lensGeo, lensMat);
    leftLens.rotation.x = Math.PI / 2;
    leftLens.position.set(-0.55, 0, 0.08);
    group.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeo, lensMat);
    rightLens.rotation.x = Math.PI / 2;
    rightLens.position.set(0.55, 0, 0.08);
    group.add(rightLens);

    // Side Temples
    const templeGeo = new THREE.BoxGeometry(0.1, 0.1, 1.5);
    const templeLeft = new THREE.Mesh(templeGeo, meshMat);
    templeLeft.position.set(-1.05, 0, -0.7);
    group.add(templeLeft);

    const templeRight = new THREE.Mesh(templeGeo, meshMat);
    templeRight.position.set(1.05, 0, -0.7);
    group.add(templeRight);

    return group;
  }
  if (model.id === 'genesis-core') {
    // AI Server Pod Cube
    const group = new THREE.Group();

    // Outer Cage
    const outerGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const outerMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, wireframe: true });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    group.add(outerMesh);

    // Inner Glowing Core
    const coreGeo = new THREE.OctahedronGeometry(0.7, 2);
    const coreMat = new THREE.MeshStandardMaterial({
      color: glowColor,
      emissive: glowColor,
      emissiveIntensity: 0.8,
      wireframe,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    group.add(coreMesh);

    // Orbiting Satellites
    for (let i = 0; i < 4; i++) {
      const satGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const satMesh = new THREE.Mesh(satGeo, meshMat);
      const angle = (i / 4) * Math.PI * 2;
      satMesh.position.set(Math.cos(angle) * 1.3, 0, Math.sin(angle) * 1.3);
      group.add(satMesh);
    }

    return group;
  }
  if (model.id === 'aura-trophy') {
    // Diamond Trophy
    const group = new THREE.Group();

    // Top Gem Diamond
    const gemGeo = new THREE.OctahedronGeometry(1.0, 0);
    const gemMesh = new THREE.Mesh(gemGeo, meshMat);
    gemMesh.position.y = 0.5;
    group.add(gemMesh);

    // Pedestal Base
    const baseGeo = new THREE.CylinderGeometry(0.9, 1.1, 0.5, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 });
    const baseMesh = new THREE.Mesh(baseGeo, baseMat);
    baseMesh.position.y = -0.8;
    group.add(baseMesh);

    // Floating Glow Ring
    const ringGeo = new THREE.TorusGeometry(1.2, 0.04, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: glowColor });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.5;
    group.add(ringMesh);

    return group;
  }
  return new THREE.Group();
}

/** Recolours the key, fill and rim lights of a stage. */
export function applyLighting(lights: THREE.Group, preset: LightingPreset) {
  const colors = LIGHTING_OPTIONS.find((o) => o.id === preset)?.colors;
  if (!colors) return;
  colors.forEach((hex, i) => (lights.children[i + 1] as THREE.Light | undefined)?.color.setHex(hex));
}

export interface StageControls {
  autoRotate: boolean;
  rotationSpeed: number;
}

export interface Stage {
  model: THREE.Group;
  lights: THREE.Group;
  rotateBy(dx: number, dy: number): void;
  zoomBy(delta: number): void;
  dispose(): void;
}

/**
 * Creates the scene, camera, renderer, lights, floor and particles inside `container`, starts the
 * render loop and pointer controls. `controls()` is read every frame, so toggles apply immediately.
 */
export function createStage(
  container: HTMLElement,
  controls: () => StageControls,
  onFps: (fps: number) => void,
): Stage {
  const width = container.clientWidth || 600;
  const height = container.clientHeight || 440;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090d16);
  scene.fog = new THREE.FogExp2(0x090d16, 0.08);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 1.2, 5.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const lights = new THREE.Group();
  scene.add(lights);
  lights.add(new THREE.AmbientLight(0xffffff, 0.8));
  const keyLight = new THREE.DirectionalLight(0x6366f1, 2.5);
  keyLight.position.set(5, 8, 5);
  keyLight.castShadow = true;
  lights.add(keyLight);
  const fillLight = new THREE.PointLight(0x38bdf8, 2, 20);
  fillLight.position.set(-4, 3, -2);
  lights.add(fillLight);
  const rimLight = new THREE.PointLight(0xa855f7, 3, 15);
  rimLight.position.set(0, -3, -4);
  lights.add(rimLight);

  const grid = new THREE.GridHelper(12, 24, 0x334155, 0x1e293b);
  grid.position.y = -1.2;
  scene.add(grid);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 1.7, 64),
    new THREE.MeshBasicMaterial({ color: 0x6366f1, side: THREE.DoubleSide }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.19;
  scene.add(ring);

  const model = new THREE.Group();
  scene.add(model);

  const particleGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(200 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (Math.random() - 0.5) * 12;
    positions[i + 1] = (Math.random() - 0.5) * 8;
    positions[i + 2] = (Math.random() - 0.5) * 12;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({
      size: 0.03,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    }),
  );
  scene.add(particles);

  let dragging = false;
  let last = { x: 0, y: 0 };
  let frame = 0;
  let frames = 0;
  let lastFpsAt = performance.now();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const animate = (time: number) => {
    frame = requestAnimationFrame(animate);
    frames++;
    if (time - lastFpsAt >= 1000) {
      onFps(Math.round((frames * 1000) / (time - lastFpsAt)));
      frames = 0;
      lastFpsAt = time;
    }
    const c = controls();
    if (c.autoRotate && !dragging && !reducedMotion) model.rotation.y += c.rotationSpeed;
    if (!reducedMotion) particles.rotation.y += 0.001;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(animate);

  const rotateBy = (dx: number, dy: number) => {
    model.rotation.y += dx;
    model.rotation.x += dy;
  };
  const zoomBy = (delta: number) => {
    camera.position.z = Math.max(2.5, Math.min(camera.position.z + delta, 9));
  };
  const onDown = (e: PointerEvent) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    rotateBy((e.clientX - last.x) * 0.008, (e.clientY - last.y) * 0.008);
    last = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => {
    dragging = false;
  };
  const onWheel = (e: WheelEvent) => zoomBy(e.deltaY * 0.003);
  const dom = renderer.domElement;
  dom.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  dom.addEventListener('wheel', onWheel, { passive: true });

  const resize = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resize.observe(container);

  return {
    model,
    lights,
    rotateBy,
    zoomBy,
    dispose() {
      cancelAnimationFrame(frame);
      resize.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dom.removeEventListener('wheel', onWheel);
      if (container.contains(dom)) container.removeChild(dom);
      renderer.dispose();
    },
  };
}
