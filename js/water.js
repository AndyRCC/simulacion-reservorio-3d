// =============================================================================
// water.js — Agua dentro de la tubería (malla de superficie libre deformable),
// espuma y burbujas lagrangianas, flujo de aire en la clave y reservorio.
// =============================================================================
import * as THREE from 'three';
import { GEOM, waveOffset } from './hydraulics.js';
import { ASSETS } from './assets.js';

const K_ARC = 40, K_SRF = 16, RING = K_ARC + K_SRF, DS = 0.035;

export function createWater(stage) {
  const { scene, tl, maxAniso } = stage;
  const nTex = tl.load(ASSETS.waterNormals);
  nTex.wrapS = nTex.wrapT = THREE.RepeatWrapping;
  nTex.anisotropy = maxAniso;
  const nTex2 = tl.load(ASSETS.waterNormals);
  nTex2.wrapS = nTex2.wrapT = THREE.RepeatWrapping;

  const pipeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.035, metalness: 0, transmission: 1, thickness: 0.22, ior: 1.333,
    attenuationColor: new THREE.Color(0x3aa9cf), attenuationDistance: 0.42,
    normalMap: nTex, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.25,
  });
  nTex.repeat.set(3, 1);
  const resMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 1, thickness: 1.2, ior: 1.333,
    attenuationColor: new THREE.Color(0x6fc2d2), attenuationDistance: 3.5,
    normalMap: nTex2, normalScale: new THREE.Vector2(0.18, 0.18), envMapIntensity: 1.1,
  });
  nTex2.repeat.set(1.2, 1.2);

  // ------------------------------------------------ malla del agua en tubería
  let mesh = null, geo = null, Ns = 0, stations = null;
  const frames = [];
  function rebuild(path) {
    if (mesh) { scene.remove(mesh); geo.dispose(); }
    Ns = Math.ceil(path.total / DS) + 1;
    stations = new Float32Array(Ns);
    frames.length = 0;
    for (let i = 0; i < Ns; i++) {
      const s = Math.min(path.total, i * DS);
      stations[i] = s;
      frames.push(path.at(s, {}));
    }
    geo = new THREE.BufferGeometry();
    const pos = new Float32Array(Ns * RING * 3), nor = new Float32Array(Ns * RING * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(Ns * RING * 2);
    for (let i = 0; i < Ns; i++) for (let k = 0; k < RING; k++) {
      uv[2 * (i * RING + k)] = stations[i] * 0.9;
      uv[2 * (i * RING + k) + 1] = k < K_ARC ? k / (K_ARC - 1) : (k - K_ARC) / (K_SRF - 1) * 0.6;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    const strip = (k0, k1) => {
      for (let i = 0; i < Ns - 1; i++) for (let k = k0; k < k1 - 1; k++) {
        const a = i * RING + k, b = (i + 1) * RING + k, c = i * RING + k + 1, d = (i + 1) * RING + k + 1;
        idx.push(a, b, c, b, d, c);
      }
    };
    strip(0, K_ARC); strip(K_ARC, RING);
    geo.setIndex(idx);
    mesh = new THREE.Mesh(geo, pipeMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
  }

  let r = GEOM.R * 0.988;
  function updateMesh(sol, t) {
    r = GEOM.R * 0.988;
    const pos = geo.attributes.position.array, nor = geo.attributes.normal.array;
    for (let i = 0; i < Ns; i++) {
      const s = stations[i], F = frames[i];
      const full = sol.sample(s, sol.f) > 0.999;
      let f = sol.sample(s, sol.f);
      if (!full) f += waveOffset(s, t, sol) * Math.min(1, (1 - f) * 12) * Math.min(1, f * 6);
      f = Math.max(0.01, Math.min(1, f));
      const ws = Math.min(r, -r + 2 * r * f);
      const b0 = Math.acos(Math.max(-1, Math.min(1, -ws / r)));
      const nx = F.nx, ny = F.ny;
      let o = i * RING * 3;
      for (let k = 0; k < K_ARC; k++) {
        const be = -b0 + 2 * b0 * k / (K_ARC - 1);
        const u = r * Math.sin(be), w = -r * Math.cos(be);
        pos[o] = F.x + nx * w; pos[o + 1] = F.y + ny * w; pos[o + 2] = u;
        const ru = Math.sin(be), rw = -Math.cos(be);
        nor[o] = nx * rw; nor[o + 1] = ny * rw; nor[o + 2] = ru;
        o += 3;
      }
      const c = r * Math.sin(b0);
      const sup = s > GEOM.L1 || sol.regime === 'B';
      for (let k = 0; k < K_SRF; k++) {
        const u = c - 2 * c * k / (K_SRF - 1);
        const edge = 1 - Math.pow(Math.abs(u) / Math.max(1e-4, c), 2);
        const cross = sup ? 0.006 * Math.sin(u * 60 + s * 9 - t * 14) * edge : 0.0015 * Math.sin(u * 40 - t * 5) * edge;
        const w = ws + cross + (sup ? 0.004 : 0.0015) * edge;     // leve abombamiento (menisco)
        pos[o] = F.x + nx * w; pos[o + 1] = F.y + ny * w; pos[o + 2] = u;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = 0;
        o += 3;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
  }

  // ------------------------------------------- espuma y burbujas (lagrangianas)
  const NP = 2600;
  const foamGeo = new THREE.IcosahedronGeometry(1, 0);
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xf3f8fa, roughness: 0.85, metalness: 0, envMapIntensity: 0.9 });
  const bubMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f6ff, roughness: 0.08, metalness: 0, clearcoat: 1, envMapIntensity: 1.6 });
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, NP);
  const bub = new THREE.InstancedMesh(foamGeo, bubMat, NP);
  foam.frustumCulled = bub.frustumCulled = false;
  foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bub.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(foam, bub);
  const P = Array.from({ length: NP }, () => ({ s: 0, xi: 0, eta: 0, size: 0, life: 0, age: 0, kind: 0 }));
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296);

  function spawn(p, sol, warm) {
    const L1 = GEOM.L1, tot = sol.path.total;
    const u = rand();
    if (sol.regime === 'B' && u < 0.22) p.s = 0.15 + rand() * 0.9;               // chorro contraído
    else if (u < 0.5) p.s = L1 - 0.15 + rand() * 0.7;                             // quiebre / codo
    else p.s = L1 + rand() * (tot - L1);                                         // auto-aireación en la rápida
    if (warm) p.s = rand() * tot;
    p.xi = rand() * 2 - 1;
    p.kind = rand() < 0.55 ? 0 : 1;                       // 0 espuma superficial, 1 burbuja
    p.eta = p.kind === 0 ? 0 : 0.15 + 0.8 * rand();
    const k = Math.min(1, 0.45 + GEOM.D * 1.8);           // espuma proporcional al diámetro
    p.size = (p.kind === 0 ? 0.004 + 0.011 * rand() * rand() : 0.0018 + 0.004 * rand()) * k;
    p.life = 1.5 + 3 * rand();
    p.age = warm ? rand() * p.life : 0;
  }
  let inited = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const Yv = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3(), F = {};
  function updateParticles(sol, t, dt, visible) {
    foam.visible = bub.visible = visible;
    if (!visible) return;
    if (!inited) { P.forEach((p) => spawn(p, sol, true)); inited = true; }
    const tot = sol.path.total;
    let nf = 0, nb = 0;
    for (const p of P) {
      const f0 = sol.sample(p.s, sol.f);
      const v = sol.sample(p.s, sol.v);
      p.s += v * dt * (p.kind === 0 ? 1.0 : 0.92);
      p.age += dt;
      if (p.kind === 1) p.eta = Math.max(0, p.eta - dt * (0.25 + 0.4 * rand()));
      const aer = p.s > GEOM.L1 - 0.2 || (sol.regime === 'B' && p.s < 1.4);
      if (p.s > tot || p.age > p.life || f0 > 0.999 || (!aer && rand() < dt * 2)) { spawn(p, sol, false); continue; }
      let f = f0 + waveOffset(p.s, t, sol);
      f = Math.max(0.02, Math.min(0.995, f));
      sol.path.at(p.s, F);
      const ws = -r + 2 * r * f;
      let w, u;
      if (p.kind === 0) { w = ws + 0.002; u = p.xi * Math.sqrt(Math.max(0, r * r - ws * ws)) * 0.92; }
      else { w = ws - p.eta * (ws + r) * 0.9 - p.size; u = p.xi * Math.sqrt(Math.max(0, r * r - w * w)) * 0.85; }
      pv.set(F.x + F.nx * w, F.y + F.ny * w, u);
      nv.set(F.nx, F.ny, 0);
      q.setFromUnitVectors(Yv, nv);
      const fade = Math.min(1, p.age * 4, (p.life - p.age) * 3);
      if (p.kind === 0) {
        const k = p.size * fade;
        sc.set(k * (1.8 + Math.min(2.5, v * 0.3)), k * 0.3, k);
        m4.compose(pv, q, sc); foam.setMatrixAt(nf++, m4);
      } else {
        const k = p.size * fade;
        sc.set(k, k, k);
        m4.compose(pv, q, sc); bub.setMatrixAt(nb++, m4);
      }
    }
    foam.count = nf; bub.count = nb;
    foam.instanceMatrix.needsUpdate = true; bub.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------- aire que entra por la descarga (contracorriente)
  const NA = 260;
  const airGeo = new THREE.BufferGeometry();
  const airPos = new Float32Array(NA * 3);
  airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3).setUsage(THREE.DynamicDrawUsage));
  const air = new THREE.Points(airGeo, new THREE.PointsMaterial({ color: 0xfff2c4, size: 0.014, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true }));
  air.frustumCulled = false; air.renderOrder = 4;
  scene.add(air);
  const A = Array.from({ length: NA }, () => ({ s: rand() * 6, a: rand(), b: rand() }));
  function updateAir(sol, t, dt, visible) {
    air.visible = visible;
    if (!visible) return;
    for (let i = 0; i < NA; i++) {
      const p = A[i];
      p.s -= dt * (0.6 + 0.9 * p.b);
      const f = sol.sample(Math.max(0, p.s), sol.f);
      if (p.s < 0.05 || f > 0.97) { p.s = GEOM.L1 + sol.path.Lb + rand() * 3.5; p.a = rand(); p.b = rand(); }
      sol.path.at(p.s, F);
      const ws = -r + 2 * r * Math.min(0.97, f);
      const w = ws + (r - ws) * (0.25 + 0.6 * p.a);
      const u = (p.b * 2 - 1) * Math.sqrt(Math.max(0, r * r - w * w)) * 0.8;
      airPos[3 * i] = F.x + F.nx * w; airPos[3 * i + 1] = F.y + F.ny * w; airPos[3 * i + 2] = u;
    }
    airGeo.attributes.position.needsUpdate = true;
  }

  // ------------------------------------------------------------ reservorio
  const { resX0, resZ, floorY, invertAboveFloor } = GEOM;
  const resGeo = new THREE.BoxGeometry(1, 1, 1);
  resGeo.translate(0.5, 0.5, 0.5);
  const res = new THREE.Mesh(resGeo, resMat);
  res.position.set(resX0 + 0.002, floorY + 0.002, -resZ + 0.002);
  res.scale.set(-resX0 - 0.004, 1, 2 * resZ - 0.004);
  scene.add(res);
  function setReservoir(H) { res.scale.y = Math.max(0.01, invertAboveFloor + H); }

  return {
    rebuild, setReservoir,
    update(sol, t, dt, opts) {
      nTex.offset.x = -t * 0.9 * Math.min(4, sol.sensor.v);
      nTex.offset.y = t * 0.05;
      nTex2.offset.set(t * 0.012, t * 0.017);
      updateMesh(sol, t);
      updateParticles(sol, t, dt, opts.particles);
      updateAir(sol, t, dt, opts.air);
    },
  };
}
