// =============================================================================
// terrain.js — Relieve natural: meseta del reservorio, talud de corte en el
// corredor de la tubería y laderas más tendidas con ruido fractal alrededor.
// =============================================================================
import * as THREE from 'three';
import { GEOM } from './hydraulics.js';

const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }

// Parámetros del talud que dependen de θ
export function terrainParams(path) {
  const { L1, R } = GEOM;
  const hillTop = GEOM.floorY - GEOM.wallT - 0.35;
  const gap = 0.42;
  const th = path.theta;
  const p2 = path.at(L1 + path.Lb);
  const invX = p2.x - (R + gap) * p2.nx, invY = p2.y - (R + gap) * p2.ny;
  const xEdge = invX - ((invY - hillTop) / Math.sin(th)) * Math.cos(th);
  return { hillTop, th, xEdge, chamberX0: path.end.x - 0.15 };
}

// Altura del terreno en (x, z)
export function heightAt(tp, x, z) {
  const az = Math.abs(z);
  const corridor = sstep(1.6, 6.0, az);                   // 0 en el corredor de la tubería
  const alpha = tp.th * (1 - corridor) + Math.min(tp.th, 0.52) * corridor;
  // la loma baja hacia los lados; hacia la cámara (+z) cae a una quebrada
  const lat = z > 0 ? 1 - 0.92 * sstep(3.5, 15, z) : 1 - 0.45 * sstep(10, 34, az);
  const top = tp.hillTop * lat;
  let h = top - smax(0, (x - tp.xEdge) * Math.tan(alpha), 0.6);
  h = smax(h, 0, 0.8);
  h *= sstep(-62, -38, x);                                 // borde trasero suave
  // ruido fractal fuera de las zonas construidas
  const resMask = (x > GEOM.resX0 - 1.2 && x < 1.0 && az < GEOM.resZ + 1.2) ? 0 : 1;
  const chMask = (x > tp.chamberX0 - 1.2 && x < tp.chamberX0 + 3.4 && az < 2.4) ? 0 : 1;
  const m = Math.min(corridor + 0.08, 1) * resMask * chMask;
  const n = (fbm(x * 0.07, z * 0.07) - 0.5) * 1.6 + (fbm(x * 0.6 + 7, z * 0.6 - 3) - 0.5) * 0.12;
  return h + n * m * (0.35 + 0.65 * sstep(0, 2, h)) * 0.9 + 0.0;
}

export function buildTerrain(stage, path) {
  const tp = terrainParams(path);
  const W = 150, Dz = 120, sx = 300, sz = 240;
  const geo = new THREE.PlaneGeometry(W, Dz, sx, sz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(10, 0, 0);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = heightAt(tp, x, z);
    const edge = Math.min(x + 65, 85 - x, 60 - Math.abs(z));     // fundir con el plano base
    h = h * sstep(0, 12, edge) - 0.6 * (1 - sstep(0, 3, edge));
    pos.setY(i, h);
    uv.setXY(i, x / 1.4, z / 1.4);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, stage.M.ground);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return { mesh, tp };
}
