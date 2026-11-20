// =============================================================================
// pipeline.js — Tubería acrílica, bridas, caudalímetro, apoyos, talud y cámara
// Se reconstruye cuando cambia el ángulo θ de la bajada.
// =============================================================================
import * as THREE from 'three';
import { GEOM } from './hydraulics.js';
import { boxMesh } from './scene.js';
import { buildTerrain, heightAt } from './terrain.js';

class PipeCurve extends THREE.Curve {
  constructor(path, s0 = 0, s1 = path.total) { super(); this.path = path; this.s0 = s0; this.s1 = s1; this.o = {}; }
  getPoint(u, target = new THREE.Vector3()) {
    const p = this.path.at(this.s0 + u * (this.s1 - this.s0), this.o);
    return target.set(p.x, p.y, 0);
  }
}

const Y = new THREE.Vector3(0, 1, 0);
function placeAlong(obj, path, s, offN = 0) {
  const p = path.at(s);
  obj.position.set(p.x + p.nx * offN, p.y + p.ny * offN, 0);
  obj.quaternion.setFromUnitVectors(Y, new THREE.Vector3(p.tx, p.ty, 0));
  return obj;
}

// Brida anular (perfil revolucionado) — hueca para no tapar el agua
function flangeGeometry(rIn, rOut, thick) {
  const h = thick / 2;
  const pts = [new THREE.Vector2(rIn, -h), new THREE.Vector2(rOut, -h), new THREE.Vector2(rOut, h), new THREE.Vector2(rIn, h), new THREE.Vector2(rIn, -h)];
  return new THREE.LatheGeometry(pts, 64);
}

export function buildPipeline(stage, path) {
  const { M } = stage;
  const g = new THREE.Group();
  const { R, wall, D, sSensor, sensorLen, L1, wallT, floorY } = GEOM;
  const Ro = R + wall;
  const segs = Math.ceil(path.total * 40);

  // ---- Tubo acrílico (dos cáscaras: exterior e interior) -------------------
  const outer = new THREE.Mesh(new THREE.TubeGeometry(new PipeCurve(path), segs, Ro, 64, false), M.acrylicOuter);
  const inner = new THREE.Mesh(new THREE.TubeGeometry(new PipeCurve(path), segs, R + 0.001, 64, false), M.acrylicInner);
  outer.renderOrder = 3; inner.renderOrder = 2;
  g.add(outer, inner);

  // ---- Bridas con pernos ---------------------------------------------------
  const sB0 = sSensor - sensorLen / 2, sB1 = sSensor + sensorLen / 2;
  const flangeS = [wallT + 0.06, sB0, sB1, L1 - 0.06, L1 + path.Lb + 0.06];
  for (let s = L1 + path.Lb + 3.0; s < path.total - 1.0; s += 3.0) flangeS.push(s);
  const fGeo = flangeGeometry(Ro - 0.002, R + 0.085, 0.032);
  const boltGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.07, 10);
  const nutGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.014, 6);
  const bolts = new THREE.InstancedMesh(boltGeo, M.galv, flangeS.length * 8);
  const nuts = new THREE.InstancedMesh(nutGeo, M.galv, flangeS.length * 16);
  const tmp = new THREE.Object3D();
  let bi = 0, ni = 0;
  flangeS.forEach((s) => {
    const isSensor = Math.abs(s - sB0) < 1e-6 || Math.abs(s - sB1) < 1e-6;
    const f = placeAlong(new THREE.Mesh(fGeo, isSensor ? M.paintBlue : M.steel), path, s);
    f.castShadow = true; g.add(f);
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) * Math.PI / 4;
      placeAlong(tmp, path, s);
      const local = new THREE.Vector3(Math.cos(a) * (R + 0.062), 0, Math.sin(a) * (R + 0.062)).applyQuaternion(tmp.quaternion);
      const base = tmp.position.clone().add(local);
      tmp.position.copy(base); tmp.updateMatrix(); bolts.setMatrixAt(bi++, tmp.matrix);
      for (const d of [-0.026, 0.026]) {
        const ax = new THREE.Vector3(0, d, 0).applyQuaternion(tmp.quaternion);
        tmp.position.copy(base).add(ax); tmp.updateMatrix(); nuts.setMatrixAt(ni++, tmp.matrix);
      }
    }
  });
  bolts.castShadow = nuts.castShadow = true;
  g.add(bolts, nuts);

  // ---- Caudalímetro electromagnético (carcasa con ventana de corte) --------
  const sensor = new THREE.Group();
  const bodyLen = sensorLen - 0.04;
  const win = Math.PI * 0.62;                       // ventana frontal (+z)
  const shell = new THREE.CylinderGeometry(R + 0.07, R + 0.07, bodyLen, 64, 1, true, win / 2, 2 * Math.PI - win);
  const shellIn = new THREE.CylinderGeometry(R + 0.004, R + 0.004, bodyLen, 64, 1, true, win / 2, 2 * Math.PI - win);
  const body = new THREE.Mesh(shell, M.paintBlue); body.castShadow = true;
  const liner = new THREE.Mesh(shellIn, M.liner);
  // tapas laterales de la ventana (espesor de la carcasa)
  const capGeo = new THREE.PlaneGeometry(0.066, bodyLen);
  for (const sgn of [-1, 1]) {
    const a = sgn * win / 2, rm = R + 0.037;
    const cap = new THREE.Mesh(capGeo, M.paintBlue);
    cap.position.set(Math.sin(a) * rm, 0, Math.cos(a) * rm);
    cap.rotation.y = a + Math.PI / 2;
    cap.material.side = THREE.DoubleSide;
    sensor.add(cap);
  }
  sensor.add(body, liner);
  // electrodos: E1/E2 a las 3 y 9 en punto, EPD en la clave
  const eGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.03, 20);
  const e1 = new THREE.Mesh(eGeo, M.electrode.clone()); e1.rotation.x = Math.PI / 2; e1.position.set(0, 0, R - 0.008);
  const e2 = new THREE.Mesh(eGeo, M.electrode.clone()); e2.rotation.x = Math.PI / 2; e2.position.set(0, 0, -R + 0.008);
  const epd = new THREE.Mesh(eGeo, M.electrode.clone()); epd.rotation.z = Math.PI / 2; epd.position.set(-(R - 0.008), 0, 0);
  sensor.add(e1, e2, epd);
  placeAlong(sensor, path, sSensor);      // eje local y → tangente; -x local → clave; ventana en +z (cámara)
  g.add(sensor);

  // Transmisor (cuello + cabezal redondo con display)
  const pS = path.at(sSensor);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.26, 32), M.paintBlue);
  neck.position.set(pS.x, pS.y + R + 0.07 + 0.12, 0); neck.castShadow = true;
  const headGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.13, 48);
  headGeo.rotateX(Math.PI / 2);
  const head = new THREE.Mesh(headGeo, M.paintBlue);
  head.position.set(pS.x, neck.position.y + 0.25, 0); head.castShadow = true;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 16, 64), M.steel);
  bezel.position.set(pS.x, head.position.y, 0.066);
  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = 512; dispCanvas.height = 512;
  const dispTex = new THREE.CanvasTexture(dispCanvas);
  dispTex.colorSpace = THREE.SRGBColorSpace;
  const disp = new THREE.Mesh(new THREE.CircleGeometry(0.108, 64),
    new THREE.MeshPhysicalMaterial({ map: dispTex, emissive: 0xffffff, emissiveMap: dispTex, emissiveIntensity: 0.9, roughness: 0.05, clearcoat: 1 }));
  disp.position.set(pS.x, head.position.y, 0.0662);
  g.add(neck, head, bezel, disp);

  // ---- Terreno natural (meseta + talud de corte + laderas) ------------------
  const terrain = buildTerrain(stage, path);
  g.add(terrain.mesh);

  // ---- Apoyos de concreto con abrazadera -----------------------------------
  const strapGeo = new THREE.TorusGeometry(Ro + 0.008, 0.009, 8, 48, Math.PI);
  strapGeo.rotateZ(Math.PI);                              // media abrazadera inferior
  const supportS = [1.0, 3.3];
  for (let s = L1 + path.Lb + 1.2; s < path.total - 0.9; s += 1.8) supportS.push(s);
  const groundAt = (x) => Math.min(heightAt(terrain.tp, x, -0.28), heightAt(terrain.tp, x, 0.28), heightAt(terrain.tp, x, 0));
  for (const s of supportS) {
    const p = path.at(s);
    const by = p.y - Ro / Math.cos(p.phi);                  // punto más bajo del tubo en la vertical
    const pier = boxMesh(p.x - 0.18, p.x + 0.18, groundAt(p.x) - 0.3, by - 0.005, -0.28, 0.28, M.concrete, 1.5);
    g.add(pier);
    const strap = new THREE.Mesh(strapGeo, M.galv);
    const t = new THREE.Vector3(p.tx, p.ty, 0), n = new THREE.Vector3(p.nx, p.ny, 0);
    strap.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(n, t), n, t));
    strap.position.set(p.x, p.y, 0);
    strap.castShadow = true;
    g.add(strap);
  }

  // ---- Cámara de llegada (concreto) con tapa ---------------------------------
  const pe = path.end;
  const cx0 = pe.x - 0.15, cw = 2.2;
  const cTop = pe.y + R + 0.55;
  g.add(boxMesh(cx0, cx0 + cw, 0, cTop, -1.1, 1.1, M.concrete, 1.5));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 48), M.galv);
  lid.position.set(cx0 + cw / 2, cTop + 0.025, 0); lid.castShadow = true;
  g.add(lid);

  stage.scene.add(g);
  return {
    group: g, sensor, electrodes: { e1, e2, epd }, display: { canvas: dispCanvas, tex: dispTex },
    dispose() {
      stage.scene.remove(g);
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
