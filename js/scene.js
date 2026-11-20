// =============================================================================
// scene.js — Renderer PBR, iluminación HDRI, materiales y reservorio
// =============================================================================
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GEOM } from './hydraulics.js';
import { ASSETS } from './assets.js';

// UV planares en metros (evita texturas estiradas en cajas y prismas)
export function planarUV(geo, scale = 2.0) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    if (Math.abs(n.z) > 0.7) { uv[2 * i] = p.x / scale; uv[2 * i + 1] = p.y / scale; }
    else {
      t.crossVectors(n, Z).normalize();
      uv[2 * i] = p.dot(t) / scale; uv[2 * i + 1] = p.z / scale;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Caja con coordenadas min/max en mundo (UV ya en metros)
export function boxMesh(x0, x1, y0, y1, z0, z1, mat, scale = 2.0) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  planarUV(g, scale);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xb9c6d2, 45, 190);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 800);
  camera.position.set(6.4, 6.9, 12.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(1.9, 3.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 0.6;
  controls.maxDistance = 60;

  // ---- Iluminación: HDRI real (cielo parcialmente nublado) + sol con sombras
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ready = new Promise((resolve) => {
    new RGBELoader().load(ASSETS.sky, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.background = hdr;
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.backgroundIntensity = 0.9;
      scene.environmentIntensity = 0.9;
      resolve();
    }, undefined, () => { scene.background = new THREE.Color(0x9fb4c8); resolve(); });
  });

  const sun = new THREE.DirectionalLight(0xfff1dd, 3.4);
  sun.position.set(14, 22, 12);
  sun.target.position.set(3, 2, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 22; sc.top = 16; sc.bottom = -12; sc.near = 1; sc.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x5b5146, 0.2));

  // ---- Materiales PBR
  const tl = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (url, srgb) => {
    const t = tl.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const M = {};
  M.concrete = new THREE.MeshStandardMaterial({
    map: tex(ASSETS.concreteDiff, true), normalMap: tex(ASSETS.concreteNor),
    roughnessMap: tex(ASSETS.concreteRough), color: 0xc4c4c2, roughness: 1.0,
  });
  M.ground = new THREE.MeshStandardMaterial({
    map: tex(ASSETS.groundDiff, true), normalMap: tex(ASSETS.groundNor),
    roughnessMap: tex(ASSETS.groundRough), color: 0x8f8a80, roughness: 1.0,
    normalScale: new THREE.Vector2(1.4, 1.4),
  });
  M.concrete.envMapIntensity = 0.55;
  M.ground.envMapIntensity = 0.45;
  M.steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 1.0, roughness: 0.32 });
  M.galv = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.9, roughness: 0.5 });
  M.paintBlue = new THREE.MeshPhysicalMaterial({
    color: 0x1d4f91, metalness: 0.25, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25,
  });
  M.liner = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.55, side: THREE.DoubleSide });
  M.acrylicOuter = new THREE.MeshPhysicalMaterial({
    color: 0xf4fbff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.10,
    clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, envMapIntensity: 1.6, side: THREE.FrontSide,
  });
  M.acrylicInner = M.acrylicOuter.clone();
  M.acrylicInner.side = THREE.BackSide;
  M.acrylicInner.opacity = 0.05;
  M.electrode = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.2, emissive: 0x00ff66, emissiveIntensity: 0 });

  // ---- Terreno base (plano lejano) ----------------------------------------
  const groundGeo = new THREE.PlaneGeometry(600, 600);
  groundGeo.rotateX(-Math.PI / 2);
  groundGeo.translate(0, -0.6, 0);
  planarUV(groundGeo, 1.4);
  const ground = new THREE.Mesh(groundGeo, M.ground);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Reservorio de concreto armado (vista en corte: sin muro frontal) ---
  const res = new THREE.Group();
  const { floorY, resX0, resZ, resH, wallT, yInvert, yAxis, R } = GEOM;
  const top = floorY + resH;
  const hole = R + GEOM.wall + 0.04;
  res.add(boxMesh(resX0 - wallT, wallT, floorY - wallT - 0.35, floorY, -resZ - wallT, resZ, M.concrete));   // losa de fondo
  res.add(boxMesh(resX0 - wallT, wallT, floorY, top, -resZ - wallT, -resZ, M.concrete));                   // muro posterior
  res.add(boxMesh(resX0 - wallT, resX0, floorY, top, -resZ, resZ, M.concrete));                            // muro izquierdo
  // muro de salida (derecho) con pase de tubería
  res.add(boxMesh(0, wallT, floorY, yAxis - hole, -resZ, resZ, M.concrete));
  res.add(boxMesh(0, wallT, yAxis + hole, top, -resZ, resZ, M.concrete));
  res.add(boxMesh(0, wallT, yAxis - hole, yAxis + hole, -resZ, -hole, M.concrete));
  res.add(boxMesh(0, wallT, yAxis - hole, yAxis + hole, hole, resZ, M.concrete));
  // losa de techo parcial (posterior) para dar contexto constructivo
  res.add(boxMesh(resX0 - wallT, wallT, top, top + 0.2, -resZ - wallT, -resZ * 0.15, M.concrete));
  scene.add(res);

  // ---- Redimensionado
  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    labelRenderer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  return { THREE, renderer, labelRenderer, scene, camera, controls, sun, M, ready, tl, maxAniso };
}
