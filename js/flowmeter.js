// =============================================================================
// flowmeter.js — Caudalímetro electromagnético ISOMAG: sensor bridado MS2500
// (verde, liner PTFE) + convertidor a baterías MV145 montado en compacto.
// Modelo propio a partir de las fotos del fabricante; la carcasa del sensor
// lleva una ventana de corte para ver el agua.
// Marco local: eje del tubo = +x, arriba = +y, frente (display) = +z.
// =============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GEOM } from './hydraulics.js';

const GREEN = 0x2f8f6f;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { canvas: c, tex: t };
}

function ringGeo(rIn, rOut, thick, seg = 64) {
  const h = thick / 2;
  const pts = [[rIn, -h], [rOut, -h], [rOut, h], [rIn, h], [rIn, -h]].map(([a, b]) => new THREE.Vector2(a, b));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(-Math.PI / 2);                 // eje de revolución → x
  return g;
}

export function buildFlowmeter(M) {
  const { R, sensorLen, flangeOD, flangeT } = GEOM;
  const g = new THREE.Group();
  const mats = {
    green: new THREE.MeshPhysicalMaterial({ color: GREEN, roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide }),
    plastic: new THREE.MeshPhysicalMaterial({ color: GREEN, roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    ptfe: new THREE.MeshStandardMaterial({ color: 0xf1f1ee, roughness: 0.55, side: THREE.DoubleSide }),
    inox: new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 1, roughness: 0.28 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a4045, roughness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55 }),
    lid: new THREE.MeshPhysicalMaterial({ color: 0x2c3237, roughness: 0.06, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false }),
  };

  // ------------------------------------------------------------ sensor MS2500
  const half = sensorLen / 2;
  const rBody = Math.max(R + 0.035, flangeOD * 0.36);
  const bodyLen = sensorLen - 2 * flangeT;
  for (const sx of [-1, 1]) {
    const fl = new THREE.Mesh(ringGeo(R + 0.002, flangeOD / 2, flangeT), mats.green);
    fl.position.x = sx * (half - flangeT / 2); fl.castShadow = true; g.add(fl);
    const liner = new THREE.Mesh(ringGeo(R - 0.002, R + 0.35 * (flangeOD / 2 - R), 0.004), mats.ptfe);  // PTFE en la cara
    liner.position.x = sx * (half - 0.001); g.add(liner);
    // tornillo de puesta a tierra + etiqueta amarilla
    const gs = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.02, 12), mats.inox);
    gs.rotation.x = Math.PI / 2; gs.position.set(sx * (half - flangeT * 0.5), 0.02, flangeOD / 2 - 0.004); g.add(gs);
  }
  // cuerpo con ventana de corte frontal (+z)
  const win = Math.PI * 0.6;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rBody, rBody, bodyLen, 64, 1, true, win / 2, 2 * Math.PI - win), mats.green);
  body.rotation.z = -Math.PI / 2; body.castShadow = true; g.add(body);
  const liner = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.003, R + 0.003, bodyLen + 0.004, 64, 1, true, win / 2, 2 * Math.PI - win), mats.ptfe);
  liner.rotation.z = -Math.PI / 2; g.add(liner);
  for (const sgn of [-1, 1]) {                 // espesor visible del corte
    const a = sgn * win / 2, w = rBody - R;
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(bodyLen, w), mats.green);
    const rm = R + w / 2;                       // radial en el plano y-z, ángulo a desde +z
    cap.position.set(0, rm * Math.sin(a), rm * Math.cos(a));
    cap.rotation.x = -a + Math.PI / 2;
    g.add(cap);
  }
  // electrodos E1/E2 (3 y 9 en punto) y EPD (clave)
  const eGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.02, 16);
  const eMat = () => new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 1, roughness: 0.2, emissive: 0x19ff8a, emissiveIntensity: 0 });
  const e1 = new THREE.Mesh(eGeo, eMat()); e1.rotation.x = Math.PI / 2; e1.position.set(0, 0, R - 0.006);
  const e2 = new THREE.Mesh(eGeo, eMat()); e2.rotation.x = Math.PI / 2; e2.position.set(0, 0, -R + 0.006);
  const epd = new THREE.Mesh(eGeo, eMat()); epd.position.set(0, R - 0.006, 0);
  g.add(e1, e2, epd);

  // caja de bornes inox con placa de datos
  const plate = canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = '#e9ecee'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1b2a3a'; c.font = 'bold 30px Arial'; c.fillText('ISOMAG', 14, 40);
    c.font = '20px Arial'; c.fillText(`MS2500  DN${GEOM.DN}`, 14, 74); c.fillText('PN16 · PTFE · IP68', 14, 102);
    c.fillStyle = '#6b7a88'; c.fillRect(14, 118, 228, 2); c.font = '16px Arial'; c.fillText('S/N  ——————', 14, 146);
  });
  const boxH = 0.05, boxY = rBody + boxH / 2 - 0.004;
  const tbox = new THREE.Mesh(new RoundedBoxGeometry(0.12, boxH, 0.075, 2, 0.006), mats.inox);
  tbox.position.set(0, boxY, 0); tbox.castShadow = true; g.add(tbox);
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0625), new THREE.MeshStandardMaterial({ map: plate.tex, roughness: 0.4, metalness: 0.2 }));
  pl.position.set(0, boxY, 0.0381); pl.scale.setScalar(0.42 / 0.625 * 0.9); g.add(pl);

  // ------------------------------------------------------- convertidor MV145
  const conv = new THREE.Group();
  const W = 0.20, H = 0.22, Dp = 0.115;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.06), mats.dark);
  neck.position.set(0, boxY + boxH / 2 + 0.022, 0); g.add(neck);
  const cy = neck.position.y + 0.025 + H / 2;
  const shell = new THREE.Mesh(new RoundedBoxGeometry(W, H, Dp, 4, 0.016), mats.plastic);
  shell.castShadow = true; conv.add(shell);
  const side = new THREE.Mesh(new RoundedBoxGeometry(0.03, H * 0.86, Dp * 0.9, 3, 0.01), mats.dark);
  side.position.set(-W / 2 - 0.006, 0.006, -0.004); conv.add(side);
  // bisel + teclas + logo (estático)
  const bez = canvasTex(512, 300, (c, w, h) => {
    const r = 26; c.fillStyle = '#2c3a45'; c.beginPath(); c.roundRect(0, 0, w, h, r); c.fill();
    c.strokeStyle = '#4c6a80'; c.lineWidth = 6; c.stroke();
    for (let i = 0; i < 3; i++) {
      const y = 34 + i * 72; c.fillStyle = '#1a242c'; c.beginPath(); c.roundRect(396, y, 82, 58, 10); c.fill();
      c.fillStyle = '#3aa0e0'; c.beginPath();
      if (i === 0) { c.moveTo(437, y + 14); c.lineTo(455, y + 40); c.lineTo(419, y + 40); }
      else if (i === 1) { c.moveTo(452, y + 12); c.lineTo(452, y + 46); c.lineTo(422, y + 29); }
      else { c.moveTo(420, y + 42); c.lineTo(450, y + 14); c.lineTo(456, y + 22); c.lineTo(428, y + 48); }
      c.fill();
    }
    c.fillStyle = '#e8f0f4'; c.font = 'bold 44px Arial'; c.fillText('ISOMAG', 40, 282);
    c.fillStyle = '#3aa0e0'; c.beginPath(); c.moveTo(215, 250); c.lineTo(245, 250); c.lineTo(245, 280); c.fill();
  });
  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.088), new THREE.MeshStandardMaterial({ map: bez.tex, roughness: 0.35 }));
  bezel.position.set(0, 0.05, Dp / 2 + 0.0012); conv.add(bezel);
  // LCD dinámico (retroiluminado)
  const lcd = canvasTex(512, 320, () => {});
  const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.084, 0.0525),
    new THREE.MeshStandardMaterial({ map: lcd.tex, emissive: 0xffffff, emissiveMap: lcd.tex, emissiveIntensity: 0.55, roughness: 0.15 }));
  lcdMesh.position.set(-0.025, 0.056, Dp / 2 + 0.0022); conv.add(lcdMesh);
  // tapa de baterías con rejilla + 4 tornillos
  const grille = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#2f8f6f'; c.fillRect(0, 0, w, h);
    for (let x = 18; x < w - 18; x += 7) { c.fillStyle = '#226a52'; c.fillRect(x, 18, 3, h - 36); }
  });
  const cover = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.085, 0.012, 2, 0.004),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: grille.tex, bumpMap: grille.tex, bumpScale: 0.6, roughness: 0.55, clearcoat: 0.2 }));
  cover.position.set(0, -0.058, Dp / 2 + 0.004); conv.add(cover);
  const scr = new THREE.CylinderGeometry(0.004, 0.004, 0.004, 12);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const s = new THREE.Mesh(scr, mats.dark); s.rotation.x = Math.PI / 2;
    s.position.set(sx * 0.075, -0.058 + sy * 0.033, Dp / 2 + 0.011); conv.add(s);
  }
  // prensaestopas inferiores
  const gland = new THREE.CylinderGeometry(0.0085, 0.0085, 0.022, 16), nut = new THREE.CylinderGeometry(0.012, 0.012, 0.008, 6);
  for (let i = 0; i < 4; i++) {
    const x = -0.06 + i * 0.04;
    const gl = new THREE.Mesh(gland, mats.black); gl.position.set(x, -H / 2 - 0.011, 0.02); conv.add(gl);
    const nt = new THREE.Mesh(nut, mats.black); nt.position.set(x, -H / 2 - 0.003, 0.02); conv.add(nt);
  }
  // tapa ahumada abatible (abierta ~105°)
  const hinge = new THREE.Group();
  hinge.position.set(0, H / 2 - 0.008, Dp / 2 - 0.002);
  const lidM = new THREE.Mesh(new RoundedBoxGeometry(0.168, 0.004, 0.12, 2, 0.0018), mats.lid);
  lidM.position.set(0, 0, 0.06); lidM.renderOrder = 5;
  hinge.add(lidM); hinge.rotation.x = -Math.PI * 0.58;
  conv.add(hinge);
  conv.position.set(0, cy, 0);
  g.add(conv);

  return {
    group: g, electrodes: { e1, e2, epd },
    display: { canvas: lcd.canvas, tex: lcd.tex },
    topY: cy + H / 2,
    dispose() { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); [plate, bez, lcd, grille].forEach((x) => x.tex.dispose()); },
  };
}
