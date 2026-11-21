// =============================================================================
// vegetation.js — Pasto instanciado con viento, árboles y arbustos procedurales
// (corteza PBR + follaje en tarjetas alfa) y rocas con musgo escaneadas.
// =============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GEOM } from './hydraulics.js';
import { heightAt, gravelAt, fbm } from './terrain.js';
import { ASSETS } from './assets.js';
import { SIGN } from './branding.js';

const wind = { value: 0 };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Viento en espacio mundo (después de la matriz de instancia)
function addWind(mat, amp, heightRef) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vec4 wp = modelMatrix * mvPosition;
      float hh = clamp(position.y / ${heightRef.toFixed(2)}, 0.0, 1.0);
      float sw = sin(uWind * 1.7 + wp.x * 0.32 + wp.z * 0.21) * 0.6 + sin(uWind * 3.1 + wp.x * 1.4 + wp.z * 0.9) * 0.25;
      mvPosition.x += sw * ${amp.toFixed(3)} * hh * hh;
      mvPosition.z += sw * ${(amp * 0.45).toFixed(3)} * hh * hh;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return mat;
}

function leafTexture(seed, palette) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < 95; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 108;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, s = 7 + r() * 11;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    g.fillStyle = palette[Math.floor(r() * palette.length)];
    g.beginPath(); g.ellipse(0, 0, s * 0.42, s, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,40,10,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -s); g.lineTo(0, s); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- árbol
function makeTree(seed, bush = false) {
  const r = rng(seed), wood = [], leaves = [];
  const up = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion();
  const canopyC = new THREE.Vector3(0, bush ? 0.6 : 5.2, 0);
  function cards(at, n, size) {
    for (let i = 0; i < n; i++) {
      const pg = new THREE.PlaneGeometry(size, size);
      pg.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6.3, r() * 6.3, r() * 6.3)));
      const off = new THREE.Vector3(r() - 0.5, r() - 0.3, r() - 0.5).multiplyScalar(size * 0.8);
      pg.translate(at.x + off.x, at.y + off.y, at.z + off.z);
      const p = pg.attributes.position, nn = pg.attributes.normal, v = new THREE.Vector3();
      for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k).sub(canopyC).normalize(); nn.setXYZ(k, v.x, v.y * 0.8 + 0.3, v.z); }
      leaves.push(pg);
    }
  }
  function branch(start, dir, len, rad, depth) {
    let p = start.clone(), d = dir.clone();
    const segs = 3;
    for (let i = 0; i < segs; i++) {
      const sl = len / segs, r0 = rad * (1 - i / segs * 0.45), r1 = rad * (1 - (i + 1) / segs * 0.45);
      const cg = new THREE.CylinderGeometry(r1, r0, sl, 7, 1, true);
      cg.translate(0, sl / 2, 0);
      cg.applyQuaternion(tmpQ.setFromUnitVectors(up, d));
      cg.translate(p.x, p.y, p.z);
      wood.push(cg);
      p = p.clone().addScaledVector(d, sl);
      d.add(new THREE.Vector3(r() - 0.5, (r() - 0.35) * 0.4, r() - 0.5).multiplyScalar(0.35)).normalize();
      if (depth >= 1 && i > 0 && r() < 0.5) cards(p, bush ? 3 : 2, bush ? 0.7 : 1.1);
    }
    if (depth >= (bush ? 2 : 3)) { cards(p, bush ? 4 : 6, bush ? 0.75 : 1.35); return; }
    const kids = 2 + Math.floor(r() * 2) + (depth === 0 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const a = (k / kids) * Math.PI * 2 + r();
      const tilt = (bush ? 0.9 : 0.55) + r() * 0.35;
      const nd = d.clone().applyAxisAngle(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).cross(d).normalize(), tilt).add(up.clone().multiplyScalar(0.25)).normalize();
      branch(p.clone().addScaledVector(d, -len * 0.15 * r()), nd, len * (0.62 + r() * 0.12), rad * 0.58, depth + 1);
    }
  }
  if (bush) branch(new THREE.Vector3(0, -0.05, 0), up.clone(), 0.5, 0.035, 1);
  else branch(new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(r() * 0.1, 1, r() * 0.1).normalize(), 3.2 + r(), 0.2 + r() * 0.06, 0);
  return { wood: mergeGeometries(wood), leaves: mergeGeometries(leaves) };
}

export function createVegetation(stage) {
  const { scene, M } = stage;
  const group = new THREE.Group();
  scene.add(group);
  const leafA = addWind(new THREE.MeshStandardMaterial({ map: leafTexture(3, ['#3f7a2a', '#5b9a35', '#2e5e22', '#78ad45', '#4d8a2c']), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, envMapIntensity: 0.6 }), 0.22, 9);
  const leafB = addWind(new THREE.MeshStandardMaterial({ map: leafTexture(8, ['#55752a', '#6f8f33', '#3d5f22', '#8aa448']), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.6 }), 0.08, 1.6);
  const trees = [0, 1, 2].map((i) => makeTree(101 + i * 17));
  const bushes = [0, 1].map((i) => makeTree(501 + i * 31, true));

  // pasto: matas de 7 hojas curvas con degradé base→punta (normales hacia arriba)
  const bladeH = 0.42;
  const parts = [], tr = rng(9);
  for (let b = 0; b < 7; b++) {
    const h = 0.22 + tr() * 0.2, w = 0.03 + tr() * 0.018, lean = 0.06 + tr() * 0.14;
    const pg = new THREE.PlaneGeometry(w, h, 1, 3);
    pg.translate(0, h / 2, 0);
    const bp = pg.attributes.position, cols = new Float32Array(bp.count * 3);
    for (let i = 0; i < bp.count; i++) {
      const t = bp.getY(i) / h;
      bp.setX(i, bp.getX(i) * (1 - t * 0.9));
      bp.setZ(i, t * t * lean);
      cols[3 * i] = 0.05 + 0.32 * t; cols[3 * i + 1] = 0.14 + 0.46 * t; cols[3 * i + 2] = 0.03 + 0.1 * t;
    }
    pg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    pg.rotateY(tr() * Math.PI * 2);
    pg.translate((tr() - 0.5) * 0.07, 0, (tr() - 0.5) * 0.07);
    parts.push(pg);
  }
  const bg = mergeGeometries(parts);
  const nrm = bg.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const grassMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.5 }), 0.1, bladeH);

  let rockMeshes = null;
  new GLTFLoader().load(ASSETS.rocks, (gltf) => {
    rockMeshes = [];
    gltf.scene.traverse((o) => { if (o.isMesh) { o.geometry.center(); rockMeshes.push(o); } });
    if (lastTp) placeRocks(lastTp);
  });
  const rockGroup = new THREE.Group(); group.add(rockGroup);
  let lastTp = null;

  function okSpot(tp, x, z, clear) {
    const { resX0, resZ } = GEOM;
    if (x > resX0 - 1.5 && x < 1.2 && Math.abs(z) < resZ + 1.5) return false;
    if (Math.abs(z) < clear && x > -1 && x < tp.chamberX0 + 3.2) return false;
    if (gravelAt(tp, x, z) > 0.15) return false;
    if (Math.hypot(x - SIGN.x, z - SIGN.z) < Math.max(1.4, clear)) return false;   // letrero de obra
    return true;
  }
  function placeRocks(tp) {
    rockGroup.clear();
    if (!rockMeshes) return;
    const r = rng(77);
    let n = 0;
    for (let tries = 0; tries < 400 && n < 26; tries++) {
      const x = -18 + r() * 44, z = -16 + r() * 30;
      if (!okSpot(tp, x, z, 2.5) || (z > 4 && x > -6 && x < 12)) continue;   // nada frente a la cámara
      const src = rockMeshes[Math.floor(r() * rockMeshes.length)];
      const m = new THREE.Mesh(src.geometry, src.material);
      const s = 0.22 + r() * 0.5;
      m.scale.setScalar(s); m.rotation.set(r() * 0.3, r() * 6.3, r() * 0.3);
      m.position.set(x, heightAt(tp, x, z) + 0.05 * s, z);
      m.castShadow = true; m.receiveShadow = true;
      rockGroup.add(m); n++;
    }
  }

  let grass = null;
  function rebuild(tp, density = 1) {
    lastTp = tp;
    // árboles y arbustos
    for (const o of [...group.children]) if (o !== rockGroup) group.remove(o);
    const r = rng(2024);
    const zones = [[-17, -6, -15, -4, 5], [-26, -13, -10, 9, 4], [14, 32, -16, -4, 5], [16, 30, 6, 15, 2], [-12, 8, -26, -16, 5]];
    for (const [x0, x1, z0, z1, n] of zones) {
      for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
        const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
        if (!okSpot(tp, x, z, 3)) continue;
        const t = trees[Math.floor(r() * trees.length)], s = 0.8 + r() * 0.45, y = heightAt(tp, x, z);
        const w = new THREE.Mesh(t.wood, M.bark), l = new THREE.Mesh(t.leaves, leafA);
        for (const m of [w, l]) { m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = r() * 6.3; m.castShadow = true; m.receiveShadow = true; group.add(m); }
        i++;
      }
    }
    for (let i = 0, tries = 0; i < 34 && tries < 400; tries++) {
      const x = -20 + r() * 48, z = -18 + r() * 32;
      if (!okSpot(tp, x, z, 1.6)) continue;
      const b = bushes[Math.floor(r() * bushes.length)], s = 0.7 + r() * 0.9, y = heightAt(tp, x, z);
      const w = new THREE.Mesh(b.wood, M.bark), l = new THREE.Mesh(b.leaves, leafB);
      for (const m of [w, l]) { m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = r() * 6.3; m.castShadow = true; m.receiveShadow = true; group.add(m); }
      i++;
    }
    placeRocks(tp);

    // pasto
    const N = Math.round(30000 * density);
    if (!grass || grass.instanceMatrix.count < N) {
      if (grass) { grass.dispose(); }
      grass = new THREE.InstancedMesh(bg, grassMat, N);
      grass.receiveShadow = true; grass.frustumCulled = false;
    }
    group.add(grass);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    const pal = [0xb4d870, 0x9ccc5c, 0xc6dc7e, 0x8fc053, 0xd6d08a, 0xa8d466];
    let k = 0;
    for (let tries = 0; k < N && tries < N * 3; tries++) {
      const x = -24 + r() * 60, z = -24 + r() * 42;
      if (!okSpot(tp, x, z, 0.9)) continue;
      const patch = fbm(x * 0.35, z * 0.35);
      if (r() > 0.45 + patch) continue;                       // matas, no alfombra uniforme
      const y = heightAt(tp, x, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.3);
      const h = (0.6 + r() * 0.6) * (0.75 + patch * 0.5);
      const wdt = 0.8 + r() * 0.7;
      sc.set(wdt, h, wdt);
      p.set(x, y - 0.02, z);
      m4.compose(p, q, sc); grass.setMatrixAt(k, m4);
      grass.setColorAt(k, col.setHex(pal[Math.floor(r() * pal.length)]));
      k++;
    }
    grass.count = k;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  }

  return { rebuild, update(t) { wind.value = t; }, group };
}
