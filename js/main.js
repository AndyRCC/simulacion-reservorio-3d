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
const P = { H: 1.6, thetaDeg: 45, n: 0.009, dn: 150, caso: /2/.test(location.hash) ? 'goose' : 'simple' };
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
  chute: label('', 30), vc: label('warn', 6), cam: label('', 30), goose: label('ok', 12),
};
function updateLabelVisibility() {
  const on = $('cLbl').checked, cp = stage.camera.position;
  for (const l of Object.values(L)) l.o.visible = on && l.show && cp.distanceTo(l.o.position) < l.maxDist;
}
function placeLabels() {
  const { floorY, resH, resX0, yAxis, R } = GEOM;
  const p = sol.path, pS = p.at(p.sSensor), pB = p.at(p.sBrink);
  L.res.o.position.set(resX0 * 0.62, floorY + resH * 0.55, GEOM.resZ);
  L.sensor.o.position.set(pS.x, pS.y + pipe.flowmeter.topY + 0.12, 0);
  L.codo.o.position.set(pB.x + 0.15, pB.y - R - 0.05, 0.2);
  const m = p.at(p.sBendEnd + p.L3 * 0.45);
  L.chute.o.position.set(m.x + 0.4, m.y + 0.35, 0);
  L.vc.o.position.set(0.5, yAxis + R + 0.02, 0.05);
  L.cam.o.position.set(p.end.x + 1.0, p.end.y + R + 0.9, 0);
  if (p.kind === 'goose') {
    const pv = p.at(p.sVent), pl = p.at((p.sLow0 + p.sLow1) / 2);
    L.air.o.position.set(pv.x + 0.25, pv.y + R + 0.5, 0.05);
    L.goose.o.position.set(pl.x, pl.y - R - 0.12, 0.3);
  } else {
    L.air.o.position.set((pS.x + pB.x) / 2 + 0.4, yAxis + R + 0.02, 0.05);
  }
}

// Textos de cada caso (cabecera, explicación y nota del perfil)
function applyCaseTexts() {
  const goose = P.caso === 'goose';
  document.body.dataset.case = goose ? '2' : '1';
  $('caseTag').textContent = goose ? 'FASE 2 · SOLUCIÓN' : 'FASE 1 · DIAGNÓSTICO';
  $('caseTag').style.background = goose ? 'var(--ok)' : 'var(--warn)';
  $('caseTitle').textContent = goose
    ? 'Con cuello de cisne: el tramo del sensor queda siempre lleno y la medición es correcta'
    : 'Descarga de reservorio con bajada a 45°: el caudalímetro no ve la tubería llena';
  [...$('caseSeg').children].forEach((b) => b.classList.toggle('on', b.dataset.c === P.caso));
}

// ------------------------------------------------------------- resolución
function resolve() {
  if (GEOM.DN !== P.dn) setDN(P.dn);
  const th = P.thetaDeg * Math.PI / 180;
  sol = solveHydraulics(P.H, th, P.n, P.caso);
  const alt = solveHydraulics(P.H, th, P.n, P.caso === 'goose' ? 'simple' : 'goose');   // para comparar
  const key = `${P.caso}|${P.dn}|${P.thetaDeg}`;
  if (built !== key) {
    if (pipe) pipe.dispose();
    pipe = buildPipeline(stage, sol.path);
    water.rebuild(sol.path);
    built = key;
    if (!branded) { buildBranding(stage, pipe.terrain.tp); branded = true; }
  }
  placeLabels();
  water.setReservoir(P.H);
  const isB = sol.regime === 'B', goose = sol.kind === 'goose';
  L.res.set('Reservorio', `nivel ${P.H.toFixed(2)} m sobre el fondo del tubo`);
  L.codo.set(goose ? 'Cresta: profundidad crítica' : 'Profundidad crítica en el quiebre',
    goose ? 'el control hidráulico se movió aquí' : 'control hidráulico: caída libre');
  L.vc.show = isB && !goose;
  L.vc.set('Vena contracta', 'entrada de arista viva, Cc ≈ 0.62');
  L.cam.set('Cámara de llegada');
  L.goose.show = goose;
  L.goose.set('Tramo bajo siempre lleno', `la clave del sensor está ${(sol.path.hDrop - GEOM.D).toFixed(2)} m bajo la cresta`);
  $('profNote').textContent = goose
    ? `El tramo bajo (con el sensor) queda bajo la cota de la cresta: va lleno a presión (${sol.sensor.pressure.toFixed(2)} m.c.a. en el eje). El control crítico se traslada a la cresta y el aire solo llega hasta la ventosa.`
    : isB
      ? `Entrada sumergida: el chorro contraído (y ≈ ${(sol.yVC / GEOM.D * 100).toFixed(0)}% D) avanza supercrítico y el aire entra por la descarga. La tubería nunca se presuriza.`
      : `Entrada no sumergida: perfil H2 que baja hasta y_c = ${(sol.yc / GEOM.D * 100).toFixed(0)}% D en el codo.`;
  // comparación entre casos con el mismo nivel y diámetro
  const qS = (goose ? alt.Q : sol.Q) * 1000, qG = (goose ? sol.Q : alt.Q) * 1000;
  $('cmpNote').innerHTML = goose
    ? `Costo del cuello de cisne: <b>${sol.headLoss.toFixed(2)} m</b> de pérdida en codos y tramo lleno → con el mismo nivel pasa <b>${qG.toFixed(1)} L/s</b> en vez de ${qS.toFixed(1)} L/s (${((qG / qS - 1) * 100).toFixed(0)}%).`
    : `Con cuello de cisne este mismo sensor iría lleno (${(alt.sensor.f * 100).toFixed(0)}%) y mediría bien: ver <b>Caso 2</b>.`;
  applyCaseTexts();
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
$('caseSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.dataset.c === P.caso) return;
  P.caso = b.dataset.c; dirty = true; tot = 0; meter.started = false; lcdHist.length = 0;
  history.replaceState(null, '', P.caso === 'goose' ? '#caso2' : '#caso1');
});
window.addEventListener('hashchange', () => {          // enlaces directos #caso1 / #caso2
  const c = /2/.test(location.hash) ? 'goose' : 'simple';
  if (c !== P.caso) $('caseSeg').querySelector(`button[data-c=${c}]`).click();
});
$('cPart').addEventListener('change', (e) => (opts.particles = e.target.checked));
$('cAir').addEventListener('change', (e) => (opts.air = e.target.checked));

// ------------------------------------------------------------ vistas de cámara
const VIEWS = () => {
  const { floorY, resX0, D } = GEOM;
  const p = sol.path, mid = p.at(p.total * 0.5), pS = p.at(p.sSensor), pB = p.at(p.sBrink);
  const sx = pS.x, sy = pS.y, cy = sy + pipe.flowmeter.topY - 0.12;
  return {
    general: [[6.4, 6.9, 12.2], [1.9, 3.0, 0]],
    sensor: p.kind === 'goose'
      ? (() => {                       // encuadra todo el cuello de cisne (bajada → cresta)
        const a = p.at(p.sDrop0), b = p.at(p.sCrest0), w = b.x - a.x + 0.6, mx = (a.x + b.x) / 2;
        return [[mx + 0.25 * w, sy + 0.25 + 0.3 * w, 0.6 + 1.05 * w], [mx, sy + 0.2, 0]];
      })()
      : [[sx + 0.5 + 1.2 * D, sy + 0.35 + 0.8 * D, 1.0 + 2.6 * D], [sx + 0.05, sy + 0.16, 0]],
    equipo: [[sx + 0.14, cy + 0.06, 0.62], [sx, cy - 0.01, 0.05]],
    codo: [[pB.x + 2.2, pB.y + 0.9, 2.9], [pB.x + 0.7, pB.y - 0.7, 0]],
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
  if (!sol.sensor.full) fInst = Math.max(0.02, Math.min(0.99, fInst + waveOffset(sol.path.sSensor, t, sol)));
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
    $('qMeas').style.color = meter.status === 'OK' ? 'var(--ok)' : 'var(--bad)';
    const e0 = Math.round(err);
    $('qErr').textContent = `error ${e0 > 0 ? '+' : ''}${e0 === 0 ? '0' : e0}%`;
    const st = $('stBadge');
    st.textContent = meter.status;
    st.style.color = meter.status === 'OK' ? 'var(--ok)' : 'var(--bad)';
    $('rFill').textContent = `${(fInst * 100).toFixed(1)} %`;
    $('rArea').textContent = `${(areaFraction(fInst) * 100).toFixed(1)} %`;
    $('rVel').textContent = `${sol.sensor.v.toFixed(2)} m/s`;
    $('rFr').textContent = sol.sensor.full ? (sol.sensor.pressure != null ? `a presión · ${sol.sensor.pressure.toFixed(2)} m.c.a.` : '— (a presión)') : sol.sensor.Fr.toFixed(2);
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
    if (sol.kind === 'goose') L.air.set('Ventosa en la cresta', 'el aire de la descarga llega solo hasta aquí; evita el sifonamiento');
    else L.air.set('Bolsón de aire', `${(100 - fInst * 100).toFixed(0)}% de la altura · entra por la descarga`);
    L.air.show = sol.kind === 'goose' || !sol.sensor.full;
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
