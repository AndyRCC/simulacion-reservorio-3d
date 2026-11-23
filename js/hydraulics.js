// =============================================================================
// hydraulics.js — Hidráulica 1D de la descarga del reservorio (Fase 1)
// Tubería circular, flujo gradualmente variado por método de energía.
//   · Régimen A  (entrada no sumergida / control de salida): perfil H2
//     subcrítico controlado por la profundidad crítica en el quiebre al codo.
//   · Régimen B  (entrada sumergida, arista viva): chorro contraído en la
//     entrada (vena contracta, Cc≈0.62) + perfil H3 supercrítico. Equivale al
//     "Tipo 5" de alcantarillas (USGS): la tubería NO se llena aunque el
//     reservorio esté alto, porque el aire entra desde la descarga.
//   · Tramo inclinado: perfil S2 supercrítico (energía con cos φ).
// =============================================================================
export const G = 9.81;

// Bridas EN 1092-1 PN16 y largo brida-brida ISO 13359 del caudalímetro [m]
export const DN_TABLE = {
  80:  { flangeOD: 0.200, pcd: 0.160, bolts: 8,  bolt: 0.016, len: 0.200 },
  100: { flangeOD: 0.220, pcd: 0.180, bolts: 8,  bolt: 0.016, len: 0.250 },
  125: { flangeOD: 0.250, pcd: 0.210, bolts: 8,  bolt: 0.016, len: 0.250 },
  150: { flangeOD: 0.285, pcd: 0.240, bolts: 8,  bolt: 0.020, len: 0.300 },
  200: { flangeOD: 0.340, pcd: 0.295, bolts: 12, bolt: 0.020, len: 0.350 },
  250: { flangeOD: 0.405, pcd: 0.355, bolts: 12, bolt: 0.024, len: 0.450 },
  300: { flangeOD: 0.460, pcd: 0.410, bolts: 12, bolt: 0.024, len: 0.500 },
  350: { flangeOD: 0.520, pcd: 0.470, bolts: 16, bolt: 0.024, len: 0.550 },
  400: { flangeOD: 0.580, pcd: 0.525, bolts: 16, bolt: 0.027, len: 0.600 },
};

export const GEOM = {
  L1: 4.0,               // tramo horizontal: cara interna del muro → inicio del codo [m]
  sSensor: 2.0,          // centro del caudalímetro [m]
  Rb: 0.60,              // radio del codo [m]
  floorY: 4.0,           // cota del fondo del reservorio [m]
  invertAboveFloor: 0.20,
  endY: 0.85,            // cota del eje al entrar a la cámara de llegada [m]
  resX0: -3.4, resZ: 1.7, resH: 2.9, wallT: 0.25,
  Ke: 0.5,               // pérdida de entrada (arista viva)
  Cc: 0.62,              // coeficiente de contracción (arista viva)
  Cv: 0.97,
};

// Cambia el diámetro nominal y recalcula todas las cotas derivadas
export function setDN(dn) {
  const t = DN_TABLE[dn];
  GEOM.DN = dn;
  GEOM.D = dn / 1000;                       // diámetro interno ≈ DN
  GEOM.R = GEOM.D / 2;
  GEOM.wall = 0.004 + 0.025 * GEOM.D;       // pared acrílica
  GEOM.sensorLen = t.len;
  GEOM.flangeOD = t.flangeOD; GEOM.pcd = t.pcd; GEOM.bolts = t.bolts; GEOM.boltD = t.bolt;
  GEOM.flangeT = 0.016 + 0.03 * GEOM.D;
  GEOM.Rb = Math.max(0.35, 2 * GEOM.D);     // codo de radio largo
  GEOM.yInvert = GEOM.floorY + GEOM.invertAboveFloor;
  GEOM.yAxis = GEOM.yInvert + GEOM.R;
  GEOM.Afull = Math.PI * GEOM.D * GEOM.D / 4;
}
setDN(150);

// ---------------------------------------------------------------- trayectoria
// La trayectoria es una cadena de tramos rectos y codos. φ = ángulo bajo la
// horizontal (φ > 0 baja, φ < 0 sube). Casos:
//   'simple' → 4 m horizontales + codo θ + bajada (Fase 1)
//   'goose'  → salida, bajada a un tramo bajo con el sensor (siempre lleno),
//              montante hasta la cresta (con ventosa) + codo θ + bajada (Fase 2)
export function makePath(theta, kind = 'simple') {
  const { D, Rb, yAxis, endY, sensorLen } = GEOM;
  const segs = [];
  let s = 0, x = 0, y = yAxis, phi = 0;
  const line = (len) => {
    segs.push({ s0: s, len, type: 'line', x0: x, y0: y, phi0: phi });
    x += len * Math.cos(phi); y -= len * Math.sin(phi); s += len;
  };
  const arc = (r, dphi) => {
    const sg = Math.sign(dphi), len = r * Math.abs(dphi);
    const seg = { s0: s, len, type: 'arc', phi0: phi, r, sg, cx: x - sg * r * Math.sin(phi), cy: y - sg * r * Math.cos(phi) };
    segs.push(seg);
    phi += dphi; x = seg.cx + sg * r * Math.sin(phi); y = seg.cy + sg * r * Math.cos(phi); s += len;
  };
  const P = { theta, kind };
  if (kind === 'goose') {
    const rE = Math.max(0.75 * D, 0.12);                 // codos de 90° de radio corto
    const hDrop = Math.max(D + 0.25, 2 * rE + 0.05);     // la clave del sensor queda ≥ 0.25 m bajo la cresta
    const Llow = 0.15 + 5 * D + sensorLen + 3 * D + 0.15; // 5D aguas arriba y 3D aguas abajo del sensor
    const Lc = Math.max(0.6, 3 * D);
    line(0.9); P.sDrop0 = s;
    arc(rE, Math.PI / 2); line(hDrop - 2 * rE); arc(rE, -Math.PI / 2); P.sLow0 = s;
    P.sSensor = s + 0.15 + 5 * D + sensorLen / 2;
    line(Llow); P.sLow1 = s;
    arc(rE, -Math.PI / 2); line(hDrop - 2 * rE); arc(rE, Math.PI / 2); P.sCrest0 = s;
    P.sVent = s + Lc * 0.45;
    line(Lc);
    Object.assign(P, { rE, hDrop, Llow, Lc, yLowAxis: yAxis - hDrop });
  } else {
    line(GEOM.L1);
    P.sSensor = GEOM.sSensor;
  }
  P.sBrink = s;                                          // inicio del codo θ (control: caída libre)
  arc(Rb, theta); P.sBendEnd = s;
  P.Lb = Rb * theta;
  P.L3 = Math.max(1.0, (y - endY) / Math.sin(theta));
  line(P.L3);
  P.total = s; P.segs = segs;
  P.at = function (sq, o = {}) {
    let g = segs[0];
    for (const sg of segs) { if (sq >= sg.s0) g = sg; else break; }
    const u = Math.min(Math.max(sq - g.s0, 0), g.len);
    let ph, px, py;
    if (g.type === 'line') { ph = g.phi0; px = g.x0 + u * Math.cos(ph); py = g.y0 - u * Math.sin(ph); }
    else { ph = g.phi0 + g.sg * u / g.r; px = g.cx + g.sg * g.r * Math.sin(ph); py = g.cy + g.sg * g.r * Math.cos(ph); }
    o.x = px; o.y = py; o.phi = ph;
    o.tx = Math.cos(ph); o.ty = -Math.sin(ph);     // tangente (sentido del flujo)
    o.nx = Math.sin(ph); o.ny = Math.cos(ph);      // normal "hacia la clave"
    return o;
  };
  P.end = P.at(P.total);
  return P;
}

// ------------------------------------------------------- geometría de sección
export function section(y, D = GEOM.D) {
  const yy = Math.min(Math.max(y, 1e-6 * D), D * (1 - 1e-7));
  const th = 2 * Math.acos(1 - 2 * yy / D);
  const A = D * D / 8 * (th - Math.sin(th));
  const P = D * th / 2;
  const T = D * Math.sin(th / 2);
  return { A, P, T, Rh: A / P };
}
export function areaFraction(f) {
  if (f >= 1) return 1;
  if (f <= 0) return 0;
  return section(f * GEOM.D).A / GEOM.Afull;
}
function depthForAreaFraction(a) {
  let lo = 0, hi = GEOM.D;
  for (let i = 0; i < 50; i++) {
    const m = 0.5 * (lo + hi);
    if (section(m).A / GEOM.Afull < a) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}
export function froude(Q, y) {
  const s = section(y);
  return Math.sqrt(Q * Q * s.T / (G * s.A ** 3));
}
function energy(y, Q, c) {
  const A = section(y).A;
  return y * c + Q * Q / (2 * G * A * A);
}
function sf(Q, y, n) {
  const s = section(Math.min(y, GEOM.D * 0.9995));
  return n * n * Q * Q / (s.A * s.A * Math.pow(s.Rh, 4 / 3));
}
function sfFull(Q, n) {
  const A = GEOM.Afull, Rh = GEOM.D / 4;
  return n * n * Q * Q / (A * A * Math.pow(Rh, 4 / 3));
}
// Profundidad crítica con presión hidrostática y·cosφ
export function criticalDepth(Q, c = 1) {
  const D = GEOM.D;
  let lo = 1e-5 * D, hi = D * 0.9999;
  for (let i = 0; i < 48; i++) {
    const m = 0.5 * (lo + hi);
    const s = section(m);
    if (Q * Q * s.T / (G * s.A ** 3) > c) lo = m; else hi = m;
  }
  return 0.5 * (lo + hi);
}
// Raíz de la energía específica en la rama sub o supercrítica.
// Rama 'sub' devuelve null si la energía exige tubería a presión.
function depthFromEnergy(E, Q, c, branch, yc) {
  const D = GEOM.D;
  const Emin = energy(yc, Q, c);
  if (E <= Emin) return yc;
  let lo, hi;
  if (branch === 'sub') {
    lo = yc; hi = D * 0.9995;
    if (energy(hi, Q, c) < E) return null;
  } else {
    lo = 1e-4 * D; hi = yc;
    if (energy(lo, Q, c) < E) return lo;
  }
  for (let i = 0; i < 44; i++) {
    const m = 0.5 * (lo + hi);
    const e = energy(m, Q, c);
    if (branch === 'sub') { if (e < E) lo = m; else hi = m; }
    else { if (e > E) lo = m; else hi = m; }
  }
  return 0.5 * (lo + hi);
}

// ------------------------------------------- régimen A: H2 desde el codo
function marchSubUpstream(Q, n, ds) {
  const { L1, D } = GEOM;
  const N = Math.max(2, Math.ceil(L1 / ds));
  const h = L1 / N;
  const yc = criticalDepth(Q, 1);
  const ys = new Float64Array(N + 1);
  const full = new Uint8Array(N + 1);
  let y = yc, E = energy(yc, Q, 1), press = false;
  ys[N] = yc;
  for (let i = N - 1; i >= 0; i--) {
    if (!press) {
      E += sf(Q, y, n) * h;
      const yn = depthFromEnergy(E, Q, 1, 'sub', yc);
      if (yn === null) { press = true; y = D; } else y = yn;
    } else {
      E += sfFull(Q, n) * h;
    }
    ys[i] = y; full[i] = press ? 1 : 0;
  }
  const A0 = press ? GEOM.Afull : section(ys[0]).A;
  const V0 = Q / A0;
  return { ys, full, N, h, yc, Hreq: E + GEOM.Ke * V0 * V0 / (2 * G) };
}

function solveOutletControlQ(H, n) {
  let lo = 1e-6, hi = 2.0;
  for (let i = 0; i < 42; i++) {
    const m = Math.sqrt(lo * hi);
    if (marchSubUpstream(m, n, 0.05).Hreq < H) lo = m; else hi = m;
  }
  return Math.sqrt(lo * hi);
}

// ------------------------------------------------------- utilidades de perfil
// Perfil S2 supercrítico desde el quiebre (codo θ) hasta el final, con energía total
function marchDownstream(path, Q, n, s, y, iStart, yStart) {
  const p = {};
  path.at(s[iStart], p);
  let yy = yStart;
  let Htot = (p.y - GEOM.R * Math.cos(p.phi)) + energy(yy, Q, Math.cos(p.phi));
  y[iStart] = yy;
  for (let i = iStart + 1; i < s.length; i++) {
    const h = s[i] - s[i - 1];
    Htot -= sf(Q, yy, n) * h;
    path.at(s[i], p);
    const c = Math.cos(p.phi);
    const zInv = p.y - GEOM.R * c;
    yy = depthFromEnergy(Htot - zInv, Q, c, 'sup', criticalDepth(Q, c));
    y[i] = yy;
  }
}

function finish(base, f, full) {
  const { Q, s, N, h, path } = base;
  const v = new Float32Array(N + 1), Fr = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const A = full[i] ? GEOM.Afull : section(f[i] * GEOM.D).A;
    v[i] = Q / A;
    Fr[i] = full[i] ? 0 : froude(Q, f[i] * GEOM.D);
  }
  const idx = (sv) => Math.max(0, Math.min(N, Math.round(sv / h)));
  const iS = idx(path.sSensor);
  return Object.assign(base, {
    f, full, v, Fr,
    sensor: Object.assign({ f: f[iS], v: v[iS], Fr: Fr[iS], full: !!full[iS] }, base.sensorExtra || {}),
    outlet: { f: f[N], v: v[N], Fr: Fr[N] },
    sample(sv, arr) {           // interpolación lineal en s
      const x = Math.max(0, Math.min(N, sv / h));
      const i0 = Math.floor(x), i1 = Math.min(N, i0 + 1), t = x - i0;
      return arr[i0] * (1 - t) + arr[i1] * t;
    },
  });
}

function grid(path, ds) {
  const N = Math.ceil(path.total / ds), h = path.total / N;
  const s = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) s[i] = i * h;
  return { N, h, s };
}

// ------------------------------------------------ Caso 1: sin cuello de cisne
// H: nivel del reservorio sobre el fondo (invert) de la tubería a la salida [m]
function solveSimple(H, theta, n, ds) {
  const D = GEOM.D;
  const path = makePath(theta, 'simple');
  const yVC = depthForAreaFraction(GEOM.Cc);
  const QA = solveOutletControlQ(H, n);
  let QB = Infinity;
  if (H > D) QB = GEOM.Cv * GEOM.Cc * GEOM.Afull * Math.sqrt(2 * G * Math.max(1e-6, H - yVC));
  const regime = QB < QA ? 'B' : 'A';
  const Q = regime === 'B' ? QB : QA;
  const { N, h, s } = grid(path, ds);
  const y = new Float32Array(N + 1), full = new Uint8Array(N + 1);
  const iL1 = Math.round(path.sBrink / h);
  const ycH = criticalDepth(Q, 1);
  let choked = false;
  if (regime === 'A') {
    const up = marchSubUpstream(Q, n, h);
    for (let i = 0; i <= iL1; i++) {
      const j = Math.min(up.N, Math.round(s[i] / up.h));
      y[i] = up.ys[j]; full[i] = up.full[j];
    }
  } else {
    const sVC = 0.6 * D;               // ubicación de la vena contracta
    let yy = yVC, E = energy(yVC, Q, 1);
    for (let i = 0; i <= iL1; i++) {
      if (s[i] < sVC) {
        const u = s[i] / sVC;
        y[i] = D + (yVC - D) * (0.5 - 0.5 * Math.cos(Math.PI * u));
        full[i] = u < 0.05 ? 1 : 0;
        continue;
      }
      if (!choked) {
        E -= sf(Q, yy, n) * h;
        yy = depthFromEnergy(E, Q, 1, 'sup', ycH);
        if (yy >= ycH * 0.999) choked = true;
      }
      y[i] = yy;
    }
  }
  marchDownstream(path, Q, n, s, y, iL1, regime === 'A' ? ycH : y[iL1]);
  const f = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) f[i] = full[i] ? 1 : Math.min(1, y[i] / D);
  return finish({
    kind: 'simple', H, Q, QA, QB, regime, choked, theta, n, path, N, h, s, y,
    yc: ycH, yVC, ycSpan: [0, path.sBrink],
    marks: [{ s: path.sBrink, label: 'codo' }],
  }, f, full);
}

// ------------------------------------------------ Caso 2: con cuello de cisne
// El montante lleva el agua hasta una cresta más alta que la clave del sensor:
// el tramo bajo queda SIEMPRE lleno (a presión). El control hidráulico pasa a la
// cresta (profundidad crítica en el quiebre) y el aire que entra por la descarga
// solo llega hasta la cresta, donde lo evacúa la ventosa.
const K_ELBOW = 0.25;                          // pérdida por codo de 90° de radio corto
function solveGoose(H, theta, n, ds) {
  const D = GEOM.D, A = GEOM.Afull;
  const path = makePath(theta, 'goose');
  const Lfull = path.sCrest0 - path.sDrop0;
  // profundidad del pozo libre sobre el fondo del tramo de salida (= cota de la cresta)
  const pool = (Q) => {
    const hv = (Q / A) ** 2 / (2 * G), yc = criticalDepth(Q, 1);
    return energy(yc, Q, 1) + sf(Q, yc, n) * path.Lc + 4 * K_ELBOW * hv + sfFull(Q, n) * Lfull;
  };
  const Hreq = (Q) => {
    const dp = pool(Q), isFull = dp >= D;
    const V = Q / (isFull ? A : section(dp).A);
    return dp + (1 + GEOM.Ke) * V * V / (2 * G) + (isFull ? sfFull(Q, n) : sf(Q, dp, n)) * path.sDrop0;
  };
  let lo = 1e-6, hi = 2.0;
  for (let i = 0; i < 46; i++) { const m = Math.sqrt(lo * hi); if (Hreq(m) < H) lo = m; else hi = m; }
  const QA = Math.sqrt(lo * hi);
  const yVC = depthForAreaFraction(GEOM.Cc);
  let QB = Infinity;
  if (H > D) QB = GEOM.Cv * GEOM.Cc * A * Math.sqrt(2 * G * Math.max(1e-6, H - yVC));
  const Q = (QB < QA && pool(QB) < yVC) ? QB : QA;   // chorro libre solo si el pozo no lo ahoga
  const dp = pool(Q), Zpool = GEOM.yInvert + dp, yc = criticalDepth(Q, 1);

  const { N, h, s } = grid(path, ds);
  const y = new Float32Array(N + 1), f = new Float32Array(N + 1), full = new Uint8Array(N + 1);
  const iB = Math.round(path.sBrink / h), iC0 = Math.round(path.sCrest0 / h);
  // cresta: perfil H2 corto desde y_c en el quiebre hacia aguas arriba
  let E = energy(yc, Q, 1), yy = yc;
  for (let i = iB; i >= iC0; i--) {
    if (i < iB) { E += sf(Q, yy, n) * h; const yn = depthFromEnergy(E, Q, 1, 'sub', yc); yy = yn === null ? D : yn; }
    y[i] = yy; f[i] = Math.min(1, yy / D); full[i] = yy >= D * 0.999 ? 1 : 0;
  }
  const Zcs = GEOM.yInvert + y[iC0];             // superficie libre al inicio de la cresta
  // aguas arriba de la cresta: la superficie libre (pozo o cresta) corta cada sección
  const p = {};
  for (let i = 0; i < iC0; i++) {
    path.at(s[i], p);
    const level = s[i] < path.sLow1 ? Zpool : Zcs;
    const c = Math.cos(p.phi);
    let fr;
    if (c < 0.02) fr = p.y < level ? 1 : (s[i] < path.sLow0 ? 0.18 : 1);   // tramo vertical
    else fr = (level - (p.y - GEOM.R * c)) / (2 * GEOM.R * c);
    if (s[i] > path.sDrop0 && s[i] < path.sLow0) fr = Math.max(fr, 0.18);   // lámina que cae
    fr = Math.max(0.02, Math.min(1, fr));
    f[i] = fr; y[i] = fr * D; full[i] = fr >= 0.999 ? 1 : 0;
  }
  marchDownstream(path, Q, n, s, y, iB, yc);
  for (let i = iB + 1; i <= N; i++) f[i] = Math.min(1, y[i] / D);

  // presión en el eje del sensor (m.c.a.)
  const hv = (Q / A) ** 2 / (2 * G);
  const Eline = Zpool - 2 * K_ELBOW * hv - sfFull(Q, n) * (path.sSensor - path.sDrop0);
  const pS = path.at(path.sSensor);
  const headLoss = 4 * K_ELBOW * hv + sfFull(Q, n) * Lfull;
  return finish({
    kind: 'goose', H, Q, QA, QB, regime: 'G', choked: false, theta, n, path, N, h, s, y,
    yc, yVC, ycSpan: [path.sCrest0, path.sBrink], pool: dp, Zpool, headLoss,
    sensorExtra: { pressure: Eline - hv - pS.y },
    marks: [{ s: path.sDrop0, label: 'bajada' }, { s: path.sLow1, label: 'montante' }, { s: path.sBrink, label: 'cresta' }],
  }, f, full);
}

export function solveHydraulics(H, theta, n, kind = 'simple', ds = 0.02) {
  return kind === 'goose' ? solveGoose(H, theta, n, ds) : solveSimple(H, theta, n, ds);
}

// --------------------------------------------- oleaje superficial (fracción D)
// Ondas que viajan aguas abajo; mayores en flujo supercrítico/aireado.
export function waveOffset(s, t, sol) {
  const brink = sol.path.sBrink;
  const sup = sol.regime === 'B' || s > brink;
  const a = sup ? 0.030 : 0.018;
  const k = s > brink ? 1.8 : 1.0;
  return a * (0.55 * Math.sin(6.1 * k * s - 7.3 * t)
            + 0.30 * Math.sin(13.7 * k * s - 11.9 * t + 1.3)
            + 0.15 * Math.sin(2.3 * s - 3.1 * t + 0.7));
}
