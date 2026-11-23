// =============================================================================
// pipeline.js — Tubería acrílica, uniones bridadas (EN 1092-1), caudalímetro
// ISOMAG, muro de salida con pase, apoyos, cámara y terreno.
// Se reconstruye cuando cambian el diámetro o el ángulo θ.
// =============================================================================
import * as THREE from 'three';
import { GEOM } from './hydraulics.js';
import { boxMesh } from './scene.js';
import { buildTerrain, heightAt } from './terrain.js';
import { buildFlowmeter } from './flowmeter.js';

class PipeCurve extends THREE.Curve {
  constructor(path, s0, s1) { super(); this.path = path; this.s0 = s0; this.s1 = s1; this.o = {}; }
  getPoint(u, target = new THREE.Vector3()) {
    const p = this.path.at(this.s0 + u * (this.s1 - this.s0), this.o);
    return target.set(p.x, p.y, 0);
  }
}
const Y = new THREE.Vector3(0, 1, 0);
function frameAt(path, s) {
  const p = path.at(s);
  const q = new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(p.tx, p.ty, 0));
  return { p, q };
}
function flangeGeo(rIn, rOut, thick) {
  const h = thick / 2;
  const pts = [[rIn, -h], [rOut, -h], [rOut, h], [rIn, h], [rIn, -h]].map(([a, b]) => new THREE.Vector2(a, b));
  return new THREE.LatheGeometry(pts, 64);            // eje y
}

export function buildPipeline(stage, path) {
  const { M } = stage;
  const g = new THREE.Group();
  const { R, wall, sensorLen, wallT, flangeOD, flangeT, pcd, bolts, boltD } = GEOM;
  const { sSensor, sBrink, sBendEnd } = path;
  const goose = path.kind === 'goose';
  const Ro = R + wall;
  const sB0 = sSensor - sensorLen / 2, sB1 = sSensor + sensorLen / 2;

  // ---- Tubo acrílico en dos tramos (el caudalímetro va entre ambos) --------
  for (const [s0, s1] of [[0, sB0 - flangeT], [sB1 + flangeT, path.total]]) {
    const curve = new PipeCurve(path, s0, s1);
    const segs = Math.max(8, Math.ceil((s1 - s0) * 40));
    const outer = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, Ro, 64, false), M.acrylicOuter);
    const inner = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, R + 0.0008, 64, false), M.acrylicInner);
    outer.renderOrder = 3; inner.renderOrder = 2;
    g.add(outer, inner);
  }

  // ---- Uniones bridadas: par de bridas + pernos pasantes con tuercas -------
  const joints = [{ s: wallT + 0.08, pair: true }, { s: sB0, pair: false }, { s: sB1, pair: false },
    { s: sBrink - 0.08, pair: true }, { s: sBendEnd + 0.08, pair: true }];
  if (goose) {                                           // uniones bridadas en los codos del cuello de cisne
    joints.push({ s: path.sDrop0 - 0.04, pair: true }, { s: path.sLow0 + 0.04, pair: true },
      { s: path.sLow1 - 0.04, pair: true }, { s: path.sCrest0 + 0.04, pair: true });
  }
  for (let s = sBendEnd + 3.0; s < path.total - 1.0; s += 3.0) joints.push({ s, pair: true });
  const fGeo = flangeGeo(Ro - 0.001, flangeOD / 2, flangeT);
  const boltLen = 2 * flangeT + 0.03;
  const bolt = new THREE.InstancedMesh(new THREE.CylinderGeometry(boltD * 0.45, boltD * 0.45, boltLen, 10), M.galv, joints.length * bolts);
  const nuts = new THREE.InstancedMesh(new THREE.CylinderGeometry(boltD * 0.85, boltD * 0.85, boltD * 0.8, 6), M.galv, joints.length * bolts * 2);
  const tmp = new THREE.Object3D();
  let bi = 0, ni = 0;
  for (const j of joints) {
    const { p, q } = frameAt(path, j.s);
    // brida del lado de la tubería (en el caudalímetro solo la contrabrida)
    const offs = j.pair ? [-flangeT / 2, flangeT / 2] : [j.s === sB0 ? -flangeT / 2 : flangeT / 2];
    for (const o of offs) {
      const f = new THREE.Mesh(fGeo, M.pvcFlange);
      f.position.set(p.x + p.tx * o, p.y + p.ty * o, 0); f.quaternion.copy(q); f.castShadow = true; g.add(f);
    }
    for (let k = 0; k < bolts; k++) {
      const a = (k + 0.5) * 2 * Math.PI / bolts;
      const loc = new THREE.Vector3(Math.cos(a) * pcd / 2, 0, Math.sin(a) * pcd / 2).applyQuaternion(q);
      tmp.position.set(p.x + loc.x, p.y + loc.y, loc.z); tmp.quaternion.copy(q); tmp.updateMatrix();
      bolt.setMatrixAt(bi++, tmp.matrix);
      for (const d of [-flangeT - boltD * 0.4, flangeT + boltD * 0.4]) {
        tmp.position.set(p.x + loc.x + p.tx * d, p.y + loc.y + p.ty * d, loc.z); tmp.updateMatrix();
        nuts.setMatrixAt(ni++, tmp.matrix);
      }
    }
  }
  bolt.count = bi; nuts.count = ni;
  bolt.castShadow = nuts.castShadow = true;
  g.add(bolt, nuts);

  // ---- Caudalímetro ISOMAG MS2500 + MV145 ---------------------------------
  const fm = buildFlowmeter(M);
  const pS = path.at(sSensor);
  fm.group.position.set(pS.x, pS.y, 0);
  g.add(fm.group);

  // ---- Muro de salida del reservorio con pase de la tubería ----------------
  const { floorY, resZ, resH, yAxis } = GEOM;
  const top = floorY + resH, hole = Ro + 0.03;
  g.add(boxMesh(0, wallT, floorY, yAxis - hole, -resZ, resZ, M.concrete));
  g.add(boxMesh(0, wallT, yAxis + hole, top, -resZ, resZ, M.concrete));
  g.add(boxMesh(0, wallT, yAxis - hole, yAxis + hole, -resZ, -hole, M.concrete));
  g.add(boxMesh(0, wallT, yAxis - hole, yAxis + hole, hole, resZ, M.concrete));
  const seal = new THREE.Mesh(flangeGeo(Ro, hole + 0.02, 0.02), M.dark);      // sello del pase
  seal.position.set(wallT + 0.01, yAxis, 0); seal.rotation.z = -Math.PI / 2; g.add(seal);

  // ---- Terreno ---------------------------------------------------------------
  const terrain = buildTerrain(stage, path);
  g.add(terrain.mesh);

  // ---- Apoyos de concreto con abrazadera -------------------------------------
  const strapGeo = new THREE.TorusGeometry(Ro + 0.006, 0.006 + 0.02 * GEOM.D, 8, 48, Math.PI);
  strapGeo.rotateZ(Math.PI);
  const supportS = goose
    ? [0.55, path.sLow0 + 0.22, path.sLow1 - 0.22, path.sCrest0 + path.Lc * 0.75]
    : [1.0, 3.3];
  for (let s = sBendEnd + 1.2; s < path.total - 0.9; s += 1.8) supportS.push(s);
  const pw = Math.max(0.14, flangeOD * 0.45), pd = Math.max(0.24, flangeOD * 0.7);
  const groundAt = (x) => Math.min(heightAt(terrain.tp, x, -pd / 2), heightAt(terrain.tp, x, pd / 2), heightAt(terrain.tp, x, 0));
  for (const s of supportS) {
    const p = path.at(s);
    const by = p.y - Ro / Math.cos(p.phi);
    g.add(boxMesh(p.x - pw / 2, p.x + pw / 2, groundAt(p.x) - 0.3, by - 0.004, -pd / 2, pd / 2, M.concrete, 1.5));
    const strap = new THREE.Mesh(strapGeo, M.galv);
    const t = new THREE.Vector3(p.tx, p.ty, 0), n = new THREE.Vector3(p.nx, p.ny, 0);
    strap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(n, t), n, t));
    strap.position.set(p.x, p.y, 0); strap.castShadow = true;
    g.add(strap);
  }

  // ---- Ventosa / rompe-vacío en la cresta del cuello de cisne -----------------
  let vent = null;
  if (goose) {
    vent = new THREE.Group();
    const pv = path.at(path.sVent);
    const blue = new THREE.MeshPhysicalMaterial({ color: 0x1f4f9a, roughness: 0.4, clearcoat: 0.5 });
    const rN = Math.max(0.03, 0.25 * R);                                   // derivación DN50 aprox.
    const nip = new THREE.Mesh(new THREE.CylinderGeometry(rN, rN, 0.16, 24), M.galv);
    nip.position.set(0, Ro + 0.08, 0);
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(rN + 0.035, rN + 0.035, 0.02, 24), blue);
    fl.position.set(0, Ro + 0.165, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.16, 32), blue);
    body.position.set(0, Ro + 0.255, 0);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), blue);
    cap.position.set(0, Ro + 0.335, 0);
    const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), M.galv);
    outlet.position.set(0, Ro + 0.41, 0);
    vent.add(nip, fl, body, cap, outlet);
    vent.traverse((o) => { o.castShadow = true; });
    vent.position.set(pv.x, pv.y, 0);
    g.add(vent);
  }

  // ---- Cámara de llegada con tapa ---------------------------------------------
  const pe = path.end;
  const cx0 = pe.x - 0.15, cw = 2.2, cTop = pe.y + R + 0.55;
  g.add(boxMesh(cx0, cx0 + cw, -0.4, cTop, -1.1, 1.1, M.concrete, 1.5));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 48), M.galv);
  lid.position.set(cx0 + cw / 2, cTop + 0.025, 0); lid.castShadow = true;
  g.add(lid);

  stage.scene.add(g);
  return {
    group: g, terrain, electrodes: fm.electrodes, display: fm.display, flowmeter: fm, vent,
    dispose() {
      stage.scene.remove(g);
      fm.dispose();
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
