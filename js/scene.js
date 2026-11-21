// =============================================================================
// scene.js — Renderer PBR, cielo HDRI con sol orientado, materiales y reservorio
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
  const p = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    if (Math.abs(n.z) > 0.7) { uv[2 * i] = p.x / scale; uv[2 * i + 1] = p.y / scale; }
    else { t.crossVectors(n, Z).normalize(); uv[2 * i] = p.dot(t) / scale; uv[2 * i + 1] = p.z / scale; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function boxMesh(x0, x1, y0, y1, z0, z1, mat, scale = 2.0) {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  planarUV(g, scale);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Gira el HDRI en torno al eje vertical para dejar el sol en el azimut pedido.
// Devuelve la dirección del sol (para la luz direccional y las sombras).
function orientSky(tex, az) {
  const { data, width: w, height: h } = tex.image;
  let best = -1, bi = 0;
  for (let i = 0; i < w * h; i++) {
    const l = data[4 * i] * 0.2126 + data[4 * i + 1] * 0.7152 + data[4 * i + 2] * 0.0722;
    if (l > best) { best = l; bi = i; }
  }
  const row = Math.floor(bi / w), col = bi % w;
  const lat = (1 - (row + 0.5) / h - 0.5) * Math.PI;
  const shift = Math.round(((az / (2 * Math.PI) + 0.5) - (col + 0.5) / w) * w);
  const out = new Float32Array(data.length);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const si = (r * w + c) * 4, di = (r * w + (((c + shift) % w) + w) % w) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
  }
  tex.image.data = out; tex.needsUpdate = true;
  return new THREE.Vector3(Math.cos(lat) * Math.cos(az), Math.sin(lat), Math.cos(lat) * Math.sin(az));
}

// Material de terreno con mezcla de 3 capas: pasto, suelo (taludes) y grava
function terrainMaterial(T) {
  const m = new THREE.MeshStandardMaterial({ map: T.gravelD, normalMap: T.gravelN, roughnessMap: T.gravelR, roughness: 1, envMapIntensity: 0.4 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGD: { value: T.grassD }, tGN: { value: T.grassN }, tGR: { value: T.grassR },
      tSD: { value: T.soilD }, tSN: { value: T.soilN }, tSR: { value: T.soilR } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aMix;\nvarying vec2 vMix;\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMix = aMix;\nvWP = (modelMatrix * vec4(position,1.0)).xyz;');
    const uni = 'uniform sampler2D tGD,tGN,tGR,tSD,tSN,tSR;\nvarying vec2 vMix;\nvarying vec3 vWP;\n';
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + uni)
      .replace('#include <map_fragment>', `
        vec2 uG = vMapUv * 0.55, uS = vMapUv * 0.5;
        float macro = texture2D(tGD, vWP.xz * 0.013).g * 0.7 + texture2D(tGD, vWP.xz * 0.004 + 0.3).g * 0.6;
        vec3 cG = texture2D(tGD, uG).rgb * mix(vec3(0.5, 0.78, 0.3), vec3(0.78, 1.0, 0.45), macro);
        vec3 cS = texture2D(tSD, uS).rgb;
        vec3 cV = texture2D(map, vMapUv).rgb;
        diffuseColor.rgb *= mix(mix(cG, cS, vMix.x), cV, vMix.y);`)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = max(0.82, roughness * mix(mix(texture2D(tGR, uG).g, texture2D(tSR, uS).g, vMix.x), texture2D(roughnessMap, vMapUv).g, vMix.y));`)
      .replace('#include <normal_fragment_maps>', `
        vec3 nG = texture2D(tGN, uG).xyz * 2.0 - 1.0, nS = texture2D(tSN, uS).xyz * 2.0 - 1.0, nV = texture2D(normalMap, vMapUv).xyz * 2.0 - 1.0;
        vec3 mapN = mix(mix(nG, nS, vMix.x), nV, vMix.y);
        mapN.xy *= normalScale;
        normal = normalize(tbn * mapN);`);
  };
  return m;
}

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'labels';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcbdbe8, 70, 320);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.03, 900);
  camera.position.set(6.4, 6.9, 12.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(1.9, 3.0, 0);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 0.35; controls.maxDistance = 70;

  // ---- Sol: dirección tomada del propio HDRI (sombras coherentes con el cielo)
  const sun = new THREE.DirectionalLight(0xfff0dc, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 140 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
  sun.target.position.set(3, 2, 0);
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x5d6b3c, 0.25));
  const setSun = (dir) => { sun.position.copy(sun.target.position).addScaledVector(dir, 60); };
  setSun(new THREE.Vector3(-0.4, 0.62, 0.68).normalize());

  const pmrem = new THREE.PMREMGenerator(renderer);
  const ready = new Promise((resolve) => {
    new RGBELoader().setDataType(THREE.FloatType).load(ASSETS.sky, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      setSun(orientSky(hdr, Math.atan2(0.82, -0.46)));
      scene.background = hdr;
      scene.environment = pmrem.fromEquirectangular(hdr).texture;
      scene.backgroundIntensity = 1.0;
      resolve();
    }, undefined, () => { scene.background = new THREE.Color(0x9fc3e6); resolve(); });
  });

  // ---- Texturas y materiales PBR
  const tl = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (url, srgb) => {
    const t = tl.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const T = {
    gravelD: tex(ASSETS.groundDiff, true), gravelN: tex(ASSETS.groundNor), gravelR: tex(ASSETS.groundRough),
    grassD: tex(ASSETS.grassDiff, true), grassN: tex(ASSETS.grassNor), grassR: tex(ASSETS.grassRough),
    soilD: tex(ASSETS.soilDiff, true), soilN: tex(ASSETS.soilNor), soilR: tex(ASSETS.soilRough),
  };
  const M = {};
  M.terrain = terrainMaterial(T);
  M.concrete = new THREE.MeshStandardMaterial({
    map: tex(ASSETS.concreteDiff, true), normalMap: tex(ASSETS.concreteNor), roughnessMap: tex(ASSETS.concreteRough),
    color: 0xd2d0cb, roughness: 1.0, envMapIntensity: 0.6,
  });
  M.steel = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 1.0, roughness: 0.32 });
  M.galv = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.9, roughness: 0.45 });
  M.pvcFlange = new THREE.MeshPhysicalMaterial({ color: 0x5d6368, roughness: 0.45, clearcoat: 0.3, side: THREE.DoubleSide });
  M.dark = new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.7, side: THREE.DoubleSide });
  M.acrylicOuter = new THREE.MeshPhysicalMaterial({
    color: 0xf4fbff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.10,
    clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, envMapIntensity: 1.6, side: THREE.FrontSide,
  });
  M.acrylicInner = M.acrylicOuter.clone();
  M.acrylicInner.side = THREE.BackSide; M.acrylicInner.opacity = 0.05;

  // ---- Plano base lejano (pasto) ----------------------------------------------
  const groundGeo = new THREE.PlaneGeometry(900, 900);
  groundGeo.rotateX(-Math.PI / 2); groundGeo.translate(0, -0.6, 0);
  planarUV(groundGeo, 1.4);
  groundGeo.setAttribute('aMix', new THREE.BufferAttribute(new Float32Array(groundGeo.attributes.position.count * 2), 2));
  const ground = new THREE.Mesh(groundGeo, M.terrain);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- Reservorio de concreto armado (vista en corte: sin muro frontal) -------
  // El muro de salida (con el pase de la tubería) depende del DN → pipeline.js
  const { floorY, resX0, resZ, resH, wallT } = GEOM;
  const top = floorY + resH;
  const res = new THREE.Group();
  res.add(boxMesh(resX0 - wallT, wallT, floorY - wallT - 0.35, floorY, -resZ - wallT, resZ, M.concrete));
  res.add(boxMesh(resX0 - wallT, wallT, floorY, top, -resZ - wallT, -resZ, M.concrete));
  res.add(boxMesh(resX0 - wallT, resX0, floorY, top, -resZ, resZ, M.concrete));
  res.add(boxMesh(resX0 - wallT, wallT, top, top + 0.2, -resZ - wallT, -resZ * 0.15, M.concrete));
  // baranda perimetral de la losa de techo
  const rail = new THREE.MeshStandardMaterial({ color: 0xd9a21b, roughness: 0.5, metalness: 0.3 });
  const postG = new THREE.CylinderGeometry(0.022, 0.022, 1.0, 10);
  for (let x = resX0 - wallT + 0.1; x <= wallT; x += 0.9) {
    const p = new THREE.Mesh(postG, rail); p.position.set(x, top + 0.7, -resZ * 0.15 - 0.05); p.castShadow = true; res.add(p);
  }
  for (const y of [0.55, 1.15]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, -resX0 + 2 * wallT, 10), rail);
    r.rotation.z = Math.PI / 2; r.position.set((resX0 + wallT) / 2 - wallT / 2, top + y, -resZ * 0.15 - 0.05); r.castShadow = true; res.add(r);
  }
  scene.add(res);

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); labelRenderer.setSize(w, h);
    camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  return { renderer, labelRenderer, scene, camera, controls, sun, M, T, ready, tl, maxAniso };
}
