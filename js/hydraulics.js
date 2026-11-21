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
export function makePath(theta) {
  const { L1, Rb, yAxis, endY } = GEOM;
  const Lb = Rb * theta;
  const p2x = L1 + Rb * Math.sin(theta);
  const p2y = yAxis - Rb * (1 - Math.cos(theta));
  const L3 = Math.max(1.0, (p2y - endY) / Math.sin(theta));
  const total = L1 + Lb + L3;
  function at(s, o = {}) {
    let phi, x, y;
    if (s <= L1) { phi = 0; x = s; y = yAxis; }
    else if (s <= L1 + Lb) {
      phi = (s - L1) / Rb;
      x = L1 + Rb * Math.sin(phi);
      y = yAxis - Rb * (1 - Math.cos(phi));
    } else {
      phi = theta;
      const u = s - L1 - Lb;
      x = p2x + u * Math.cos(theta);
      y = p2y - u * Math.sin(theta);
    }
    o.x = x; o.y = y; o.phi = phi;
    o.tx = Math.cos(phi); o.ty = -Math.sin(phi);   // tangente (sentido del flujo)
    o.nx = Math.sin(phi); o.ny = Math.cos(phi);    // normal "hacia la clave"
    return o;
  }
  return { theta, L1, Lb, L3, total, at, end: at(total) };
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

// ------------------------------------------------------- solución completa
// H: nivel del reservorio sobre el fondo (invert) de la tubería [m]
export function solveHydraulics(H, theta, n, ds = 0.02) {
  const D = GEOM.D;
  const path = makePath(theta);
  const yVC = depthForAreaFraction(GEOM.Cc);
  const QA = solveOutletControlQ(H, n);
  let QB = Infinity;
  if (H > D) QB = GEOM.Cv * GEOM.Cc * GEOM.Afull * Math.sqrt(2 * G * Math.max(1e-6, H - yVC));
  const regime = QB < QA ? 'B' : 'A';
  const Q = regime === 'B' ? QB : QA;

  const N = Math.ceil(path.total / ds);
  const h = path.total / N;
  const s = new Float32Array(N + 1), y = new Float32Array(N + 1);
  const full = new Uint8Array(N + 1);
  const iL1 = Math.round(GEOM.L1 / h);
  for (let i = 0; i <= N; i++) s[i] = i * h;

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

  // Tramo codo + inclinado: S2 supercrítico con energía total
  const p = {};
  path.at(s[iL1], p);
  let yy = regime === 'A' ? ycH : y[iL1];
  let Htot = (p.y - GEOM.R * Math.cos(p.phi)) + energy(yy, Q, Math.cos(p.phi));
  for (let i = iL1 + 1; i <= N; i++) {
    Htot -= sf(Q, yy, n) * h;
    path.at(s[i], p);
    const c = Math.cos(p.phi);
    const zInv = p.y - GEOM.R * c;
    const ycl = criticalDepth(Q, c);
    yy = depthFromEnergy(Htot - zInv, Q, c, 'sup', ycl);
    y[i] = yy;
  }

  const f = new Float32Array(N + 1), v = new Float32Array(N + 1), Fr = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    f[i] = full[i] ? 1 : Math.min(1, y[i] / D);
    const A = full[i] ? GEOM.Afull : section(y[i]).A;
    v[i] = Q / A;
    Fr[i] = full[i] ? 0 : froude(Q, y[i]);
  }
  const idx = (sv) => Math.max(0, Math.min(N, Math.round(sv / h)));
  const iS = idx(GEOM.sSensor);
  return {
    H, Q, QA, QB, regime, choked, theta, n, path,
    N, h, s, y, f, v, Fr, full,
    yc: ycH, yVC,
    sensor: { f: f[iS], v: v[iS], Fr: Fr[iS], full: !!full[iS] },
    outlet: { f: f[N], v: v[N], Fr: Fr[N] },
    sample(sv, arr) {           // interpolación lineal en s
      const x = Math.max(0, Math.min(N, sv / h));
      const i0 = Math.floor(x), i1 = Math.min(N, i0 + 1), t = x - i0;
      return arr[i0] * (1 - t) + arr[i1] * t;
    },
  };
}

// --------------------------------------------- oleaje superficial (fracción D)
// Ondas que viajan aguas abajo; mayores en flujo supercrítico/aireado.
export function waveOffset(s, t, sol) {
  const sup = sol.regime === 'B' || s > GEOM.L1;
  const a = sup ? 0.030 : 0.018;
  const k = s > GEOM.L1 ? 1.8 : 1.0;
  return a * (0.55 * Math.sin(6.1 * k * s - 7.3 * t)
            + 0.30 * Math.sin(13.7 * k * s - 11.9 * t + 1.3)
            + 0.15 * Math.sin(2.3 * s - 3.1 * t + 0.7));
}
