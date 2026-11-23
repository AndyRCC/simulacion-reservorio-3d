// =============================================================================
// terrain.js — Relieve natural: meseta del reservorio, talud de corte en el
// corredor de la tubería, laderas tendidas con ruido fractal y máscaras de
// material (pasto / suelo expuesto en taludes / grava en accesos y plataformas).
// =============================================================================
import * as THREE from 'three';
import { GEOM } from './hydraulics.js';

const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * vnoise(x * f, z * f); f *= 2.03; a *= 0.5; } return s; }

export function terrainParams(path) {
  const { R } = GEOM;
  const hillTop = GEOM.floorY - GEOM.wallT - 0.35;
  const gap = 0.42;
  const th = path.theta;
  const p2 = path.at(path.sBendEnd);
  const invX = p2.x - (R + gap) * p2.nx, invY = p2.y - (R + gap) * p2.ny;
  const xEdge = invX - ((invY - hillTop) / Math.sin(th)) * Math.cos(th);
  const tp = { hillTop, th, xEdge, chamberX0: path.end.x - 0.15, trench: null };
  if (path.kind === 'goose') {                    // zanja de grava bajo el tramo bajo del cuello de cisne
    const a = path.at(path.sLow0), b = path.at(path.sLow1);
    const bottom = a.y - R - GEOM.flangeOD / 2 - 0.12;
    tp.trench = { x0: a.x - 0.35, x1: b.x + 0.35, depth: Math.max(0, hillTop - bottom) };
  }
  return tp;
}

// eje del camino de acceso (grava) que sube por detrás del reservorio
const roadX = (z) => -5.4 + 1.8 * Math.sin(z * 0.11);

export function heightAt(tp, x, z) {
  const az = Math.abs(z);
  const corridor = sstep(1.6, 6.0, az);
  const alpha = tp.th * (1 - corridor) + Math.min(tp.th, 0.5) * corridor;
  const lat = z > 0 ? 1 - 0.92 * sstep(3.5, 15, z) : 1 - 0.45 * sstep(10, 34, az);
  const top = tp.hillTop * lat;
  let h = top - smax(0, (x - tp.xEdge) * Math.tan(alpha), 0.6);
  h = smax(h, 0, 0.8);
  h *= sstep(-62, -38, x);
  const resMask = (x > GEOM.resX0 - 1.2 && x < 1.0 && az < GEOM.resZ + 1.2) ? 0 : 1;
  const chMask = (x > tp.chamberX0 - 1.2 && x < tp.chamberX0 + 3.4 && az < 2.4) ? 0 : 1;
  const road = 1 - sstep(1.4, 3.0, Math.abs(x - roadX(z))) * (z < 1 ? 1 : 0);
  const m = Math.min(corridor + 0.08, 1) * resMask * chMask * (1 - 0.8 * road);
  const n = (fbm(x * 0.07, z * 0.07) - 0.5) * 1.6 + (fbm(x * 0.6 + 7, z * 0.6 - 3) - 0.5) * 0.12;
  h += n * m * (0.35 + 0.65 * sstep(0, 2, h)) * 0.9;
  const tr = tp.trench;
  if (tr && tr.depth > 0) {
    const dx = Math.max(tr.x0 - x, 0, x - tr.x1);
    h -= tr.depth * (1 - sstep(0.0, 0.9, dx)) * (1 - sstep(0.9, 1.8, az));
  }
  return h;
}

// Máscara de grava (plataformas, corredor, camino) en (x, z)
export function gravelAt(tp, x, z) {
  const { resX0, resZ, wallT } = GEOM;
  const dx = Math.max(resX0 - wallT - x, 0, x - wallT), dz = Math.max(-resZ - wallT - z, 0, z - resZ);
  let g = 1 - sstep(0.9, 1.7, Math.hypot(dx, dz));                                     // plataforma del reservorio
  g = Math.max(g, (1 - sstep(0.7, 1.2, Math.abs(z))) * (1 - sstep(tp.xEdge, tp.xEdge + 0.5, x)) * sstep(-0.5, 0, x));
  const cdx = Math.max(tp.chamberX0 - x, 0, x - tp.chamberX0 - 2.2), cdz = Math.max(Math.abs(z) - 1.1, 0);
  g = Math.max(g, 1 - sstep(0.6, 1.4, Math.hypot(cdx, cdz)));                         // plataforma de la cámara
  if (z < 1.5) g = Math.max(g, (1 - sstep(1.2, 1.9, Math.abs(x - roadX(z)))) * sstep(-45, -38, z) * 1.0);
  const n = fbm(x * 1.7, z * 1.7);
  return Math.min(1, Math.max(0, g * (0.75 + 0.5 * n) - 0.1));
}

export function buildTerrain(stage, path) {
  const tp = terrainParams(path);
  const W = 150, Dz = 120, sx = 380, sz = 300;
  const geo = new THREE.PlaneGeometry(W, Dz, sx, sz);
  geo.rotateX(-Math.PI / 2);
  geo.translate(10, 0, 0);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = heightAt(tp, x, z);
    const edge = Math.min(x + 65, 85 - x, 60 - Math.abs(z));
    h = h * sstep(0, 12, edge) - 0.6 * (1 - sstep(0, 3, edge));
    pos.setY(i, h);
    uv.setXY(i, x / 1.4, z / 1.4);
  }
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const mix = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), ny = nor.getY(i);
    const brk = fbm(x * 0.9 + 3, z * 0.9);
    mix[2 * i] = Math.min(1, sstep(0.95, 0.8, ny) * (0.7 + 0.6 * brk));           // suelo en taludes
    mix[2 * i + 1] = gravelAt(tp, x, z);
  }
  geo.setAttribute('aMix', new THREE.BufferAttribute(mix, 2));
  const mesh = new THREE.Mesh(geo, stage.M.terrain);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return { mesh, tp };
}
