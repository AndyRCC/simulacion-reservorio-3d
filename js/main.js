// =============================================================================
// main.js — Integración: hidráulica → escena 3D → sensor → paneles
// =============================================================================
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GEOM, setDN, solveHydraulics, waveOffset, areaFraction } from './hydraulics.js';
import { MagMeter } from './sensor.js';
import { createStage } from './scene.js';
import { buildPipeline } from './pipeline.js';
import { createWater } from './water.js';
import { drawSection, drawTime, drawProfile, drawDisplay } from './ui.js';
import { buildBranding } from './branding.js';
import { ASSETS } from './assets.js';

document.querySelectorAll('img.brand-logo').forEach((im) => { im.src = ASSETS.logo; });

const $ = (id) => document.getElementById(id);
const stage = createStage($('view'));
const water = createWater(stage);
const meter = new MagMeter();
const P = { H: 1.6, thetaDeg: 45, n: 0.009, dn: 150 };
const opts = { particles: true, air: true };
let sol = null, pipe = null, built = '', dirty = true, branded = false;

// ------------------------------------------------------------------ etiquetas
function label(cls, maxDist = 99) {
  const d = document.createElement('div');
  d.className = 'lbl ' + (cls || '');
  const o = new CSS2DObject(d);
  stage.scene.add(o);
  return { o, d, maxDist, show: true, set(t, s) { d.innerHTML = `${t}${s ? `<small>${s}</small>` : ''}`; } };
}
const L = {
  res: label('', 30), sensor: label('', 30), air: label('bad', 9), codo: label('warn', 9),
  chute: label('', 30), vc: label('warn', 6), cam: label('', 30),
};
function updateLabelVisibility() {
  const on = $('cLbl').checked, cp = stage.camera.position;
  for (const l of Object.values(L)) l.o.visible = on && l.show && cp.distanceTo(l.o.position) < l.maxDist;
}
function placeLabels() {
  const { floorY, resH, resX0, sSensor, yAxis, R, L1 } = GEOM;
  const p = sol.path;
  L.res.o.position.set(resX0 * 0.62, floorY + resH * 0.55, GEOM.resZ);
  L.sensor.o.position.set(sSensor, yAxis + pipe.flowmeter.topY + 0.12, 0);
  L.air.o.position.set((sSensor + L1) / 2 + 0.4, yAxis + R + 0.02, 0.05);
  L.codo.o.position.set(L1 + 0.15, yAxis - R - 0.05, 0.2);
  const m = p.at(L1 + p.Lb + p.L3 * 0.45);
  L.chute.o.position.set(m.x + 0.4, m.y + 0.35, 0);
  L.vc.o.position.set(0.5, yAxis + R + 0.02, 0.05);
  L.cam.o.position.set(p.end.x + 1.0, p.end.y + R + 0.9, 0);
}

// ------------------------------------------------------------- resolución
function resolve() {
  if (GEOM.DN !== P.dn) setDN(P.dn);
  sol = solveHydraulics(P.H, P.thetaDeg * Math.PI / 180, P.n);
  const key = `${P.dn}|${P.thetaDeg}`;
  if (built !== key) {
    if (pipe) pipe.dispose();
    pipe = buildPipeline(stage, sol.path);
    water.rebuild(sol.path);
    built = key;
    if (!branded) { buildBranding(stage, pipe.terrain.tp); branded = true; }
  }
  placeLabels();
  water.setReservoir(P.H);
  const isB = sol.regime === 'B';
  const rb = $('regBadge');
  rb.textContent = isB ? 'CHORRO CONTRAÍDO · SUPERCRÍTICO' : (sol.sensor.full ? 'TUBERÍA A PRESIÓN' : 'REMANSO H2 · SUBCRÍTICO');
  rb.style.color = isB ? 'var(--bad)' : 'var(--warn)';
  L.res.set('Reservorio', `nivel ${P.H.toFixed(2)} m sobre el fondo del tubo`);
  L.codo.set('Profundidad crítica en el quiebre', 'control hidráulico: caída libre');
  L.vc.show = isB;
  L.vc.set('Vena contracta', 'entrada de arista viva, Cc ≈ 0.62');
  L.cam.set('Cámara de llegada');
  $('profNote').textContent = isB
    ? `Entrada sumergida: el chorro contraído (y ≈ ${(sol.yVC / GEOM.D * 100).toFixed(0)}% D) avanza supercrítico y el aire entra por la descarga. La tubería nunca se presuriza.`
    : `Entrada no sumergida: perfil H2 que baja hasta y_c = ${(sol.yc / GEOM.D * 100).toFixed(0)}% D en el codo.`;
  $('lH').textContent = `${P.H.toFixed(2)} m`;
  $('lT').textContent = `${P.thetaDeg}°`;
  dirty = false;
}

// ----------------------------------------------------------------- controles
$('sH').addEventListener('input', (e) => { P.H = +e.target.value; dirty = true; });
$('sT').addEventListener('input', (e) => { P.thetaDeg = +e.target.value; dirty = true; });
$('sN').addEventListener('change', (e) => { P.n = +e.target.value; dirty = true; });
$('sD').addEventListener('change', (e) => { P.dn = +e.target.value; dirty = true; tot = 0; meter.started = false; lcdHist.length = 0; });
$('epdSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  meter.epdMode = b.dataset.m;
  [...$('epdSeg').children].forEach((x) => x.classList.toggle('on', x === b));
});
$('cPart').addEventListener('change', (e) => (opts.particles = e.target.checked));
$('cAir').addEventListener('change', (e) => (opts.air = e.target.checked));

// ------------------------------------------------------------ vistas de cámara
const VIEWS = () => {
  const { sSensor, yAxis, L1, floorY, resX0, D } = GEOM;
  const p = sol.path, mid = p.at(p.total * 0.5), cy = yAxis + pipe.flowmeter.topY - 0.12;
  return {
    general: [[6.4, 6.9, 12.2], [1.9, 3.0, 0]],
    sensor: [[sSensor + 0.5 + 1.2 * D, yAxis + 0.35 + 0.8 * D, 1.0 + 2.6 * D], [sSensor + 0.05, yAxis + 0.16, 0]],
    equipo: [[sSensor + 0.14, cy + 0.06, 0.62], [sSensor, cy - 0.01, 0.05]],
    codo: [[L1 + 2.2, yAxis + 0.9, 2.9], [L1 + 0.7, yAxis - 0.7, 0]],
    lateral: [[mid.x, 3.6, 18.5], [mid.x, 3.0, 0]],
    reservorio: [[0.6, floorY + 3.0, 6.0], [resX0 / 2, floorY + 0.8, 0]],
    paisaje: [[-12, 10.5, 22], [4, 2.5, -2]],
  };
};
let tween = null;
$('views').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  [...$('views').children].forEach((x) => x.classList.toggle('on', x === b));
  const [pos, tgt] = VIEWS()[b.dataset.v];
  tween = { t: 0, p0: stage.camera.position.clone(), t0: stage.controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...tgt) };
});

// ------------------------------------------------------------- historial
const hist = { cap: 600, n: 0, head: 0, real: new Float32Array(600), meas: new Float32Array(600) };
function push(r, m) {
  hist.real[hist.head] = r; hist.meas[hist.head] = m;
  hist.head = (hist.head + 1) % hist.cap; hist.n = Math.min(hist.cap, hist.n + 1);
}
const lcdHist = [];

// ---------------------------------------------------------------- bucle
const clock = new THREE.Clock();
let t = 0, tot = 0, accHist = 0, accUI = 0, accDisp = 0;
const red = new THREE.Color(0xff2a2a), green = new THREE.Color(0x19ff8a);

function frame() {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, clock.getDelta()));
}

function tick(dt) {
  t += dt;
  if (dirty) resolve();

  let fInst = sol.sensor.f;
  if (!sol.sensor.full) fInst = Math.max(0.02, Math.min(0.99, fInst + waveOffset(GEOM.sSensor, t, sol)));
  const qOut = meter.update(dt, sol.Q, fInst);
  tot += qOut * dt;

  const pulse = 0.6 + 0.4 * Math.sin(t * 8);
  for (const [k, wet] of [['e1', meter.electrodesWet], ['e2', meter.electrodesWet], ['epd', meter.epdWet]]) {
    const m = pipe.electrodes[k].material;
    m.emissive.copy(wet ? green : red);
    m.emissiveIntensity = wet ? 0.35 : 1.1 * pulse;
  }

  accHist += dt;
  while (accHist >= 0.05) { accHist -= 0.05; push(sol.Q * 1000, qOut * 1000); }

  accUI += dt;
  if (accUI > 0.1) {
    accUI = 0;
    const qr = sol.Q * 1000, qm = qOut * 1000, err = (qm - qr) / Math.max(1e-6, qr) * 100;
    $('qReal').textContent = `${qr.toFixed(1)} L/s`;
    $('qRealS').textContent = `${(qr * 3.6).toFixed(0)} m³/h · régimen ${sol.regime === 'B' ? 'supercrítico' : 'subcrítico'}`;
    $('qMeas').textContent = `${qm.toFixed(1)} L/s`;
    $('qErr').textContent = `error ${err >= 0 ? '+' : ''}${err.toFixed(0)}%`;
    const st = $('stBadge');
    st.textContent = meter.status;
    st.style.color = meter.status === 'OK' ? 'var(--ok)' : 'var(--bad)';
    $('rFill').textContent = `${(fInst * 100).toFixed(1)} %`;
    $('rArea').textContent = `${(areaFraction(fInst) * 100).toFixed(1)} %`;
    $('rVel').textContent = `${sol.sensor.v.toFixed(2)} m/s`;
    $('rFr').textContent = sol.sensor.full ? '— (a presión)' : sol.sensor.Fr.toFixed(2);
    $('rEl').textContent = meter.electrodesWet ? 'mojados' : 'EN AIRE';
    $('rEl').style.color = meter.electrodesWet ? 'var(--ok)' : 'var(--bad)';
    $('rEpd').textContent = meter.epdWet ? 'mojado' : 'EN AIRE';
    $('rEpd').style.color = meter.epdWet ? 'var(--ok)' : 'var(--bad)';
    const al = $('alarm');
    al.style.visibility = meter.status === 'OK' ? 'hidden' : 'visible';
    al.textContent = meter.status === 'TUBERÍA VACÍA' ? '⚠ ALARMA EPD: TUBERÍA VACÍA · salida forzada a 0'
      : meter.status === 'SIN SEÑAL' ? '⚠ ELECTRODOS EN AIRE · señal errática'
      : `⚠ TUBERÍA PARCIAL (${(fInst * 100).toFixed(0)}%) · lectura ${err >= 0 ? '+' : ''}${err.toFixed(0)}%`;
    L.sensor.set(`ISOMAG MS2500 + MV145 · DN${GEOM.DN}`, `indica ${qm.toFixed(1)} L/s · real ${qr.toFixed(1)} L/s`);
    L.air.set('Bolsón de aire', `${(100 - fInst * 100).toFixed(0)}% de la altura · entra por la descarga`);
    L.air.show = !sol.sensor.full;
    L.chute.set(`Bajada θ = ${P.thetaDeg}°`, `S2 supercrítico · v = ${sol.outlet.v.toFixed(1)} m/s · Fr = ${sol.outlet.Fr.toFixed(1)}`);
    drawSection($('secCanvas'), { f: fInst, eWet: meter.electrodesWet, epdWet: meter.epdWet, t });
    drawTime($('timeCanvas'), hist);
    drawProfile($('profCanvas'), sol, t);
  }
  accDisp += dt;
  if (accDisp > 0.25) {
    accDisp = 0;
    lcdHist.push(qOut * 1000); if (lcdHist.length > 80) lcdHist.shift();
    const lcdStatus = meter.status === 'TUBERÍA VACÍA' ? 'EMPTY PIPE' : meter.status === 'SIN SEÑAL' ? 'SIGNAL ERROR' : 'MEAS OK';
    drawDisplay(pipe.display.canvas, { q: qOut * 1000, dn: GEOM.DN, tot, hist: lcdHist, alarm: lcdStatus !== 'MEAS OK', statusLcd: lcdStatus });
    pipe.display.tex.needsUpdate = true;
  }

  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.3);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    stage.camera.position.lerpVectors(tween.p0, tween.p1, e);
    stage.controls.target.lerpVectors(tween.t0, tween.t1, e);
    if (tween.t >= 1) tween = null;
  }
  stage.controls.update();
  updateLabelVisibility();
  water.update(sol, t, dt, opts);
  stage.renderer.render(stage.scene, stage.camera);
  stage.labelRenderer.render(stage.scene, stage.camera);
}

resolve();
stage.ready.then(() => {
  const ld = $('loading'); ld.style.opacity = 0; setTimeout(() => ld.remove(), 700);
});
frame();
window.__sim = {
  P, meter, stage, get sol() { return sol; },
  step(n = 60, dt = 1 / 60) { for (let i = 0; i < n; i++) tick(dt); },   // depuración sin rAF
  view(v) { document.querySelector(`#views button[data-v="${v}"]`).click(); tween && (tween.t = 0.999); },
};
