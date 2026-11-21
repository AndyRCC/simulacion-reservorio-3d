// =============================================================================
// ui.js — Corte A–A, registro temporal, perfil longitudinal y display del equipo
// =============================================================================
import { GEOM, areaFraction } from './hydraulics.js';

const C = { ok: '#34d399', bad: '#f87171', warn: '#fbbf24', acc: '#38bdf8', mut: '#93a3b5', grid: 'rgba(255,255,255,.07)' };
const MONO = '"JetBrains Mono", Consolas, monospace';

export function drawSection(cv, st) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const cx = W / 2, cy = H / 2 + 6, R = W * 0.34;
  g.clearRect(0, 0, W, H);
  // carcasa + brida
  g.fillStyle = '#1d4f91'; g.beginPath(); g.arc(cx, cy, R + 26, 0, 7); g.fill();
  g.fillStyle = '#163d70'; g.beginPath(); g.arc(cx, cy, R + 12, 0, 7); g.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * Math.PI / 4;
    g.fillStyle = '#aab3bc'; g.beginPath(); g.arc(cx + Math.cos(a) * (R + 19), cy + Math.sin(a) * (R + 19), 4, 0, 7); g.fill();
  }
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip();
  g.fillStyle = '#10151b'; g.fillRect(0, 0, W, H);
  const ys = cy + R - 2 * R * st.f;
  // aire
  const ag = g.createLinearGradient(0, cy - R, 0, ys);
  ag.addColorStop(0, 'rgba(248,113,113,.28)'); ag.addColorStop(1, 'rgba(248,113,113,.06)');
  g.fillStyle = ag; g.fillRect(0, cy - R, W, Math.max(0, ys - (cy - R)));
  // agua
  const wg = g.createLinearGradient(0, ys, 0, cy + R);
  wg.addColorStop(0, '#7fd6ea'); wg.addColorStop(0.25, '#2a9fc2'); wg.addColorStop(1, '#0b4a66');
  g.fillStyle = wg; g.beginPath(); g.moveTo(0, H);
  for (let x = cx - R; x <= cx + R; x += 4) g.lineTo(x, ys + Math.sin(x * 0.07 + st.t * 6) * 2.2 + Math.sin(x * 0.17 - st.t * 9) * 1.2);
  g.lineTo(W, H); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(230,250,255,.9)'; g.lineWidth = 2; g.beginPath();
  for (let x = cx - R; x <= cx + R; x += 4) {
    const y = ys + Math.sin(x * 0.07 + st.t * 6) * 2.2 + Math.sin(x * 0.17 - st.t * 9) * 1.2;
    x === cx - R ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  // burbujas
  for (let i = 0; i < 14; i++) {
    const bx = cx + Math.sin(i * 12.9 + st.t * 0.7) * R * 0.75;
    const by = ys + 8 + ((i * 37 + st.t * 40) % Math.max(10, cy + R - ys - 10));
    if (by < cy + R - 4) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.arc(bx, by, 1.5 + (i % 3), 0, 7); g.stroke(); }
  }
  g.restore();
  g.strokeStyle = 'rgba(200,230,255,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
  // electrodos
  const el = (x, y, wet, lab, dx, dy) => {
    g.fillStyle = wet ? C.ok : C.bad; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#e7edf3'; g.font = `700 13px ${MONO}`; g.textAlign = 'center'; g.fillText(lab, x + dx, y + dy);
  };
  el(cx - R, cy, st.eWet, 'E1', -2, -14); el(cx + R, cy, st.eWet, 'E2', 2, -14); el(cx, cy - R, st.epdWet, 'EPD', 0, -14);
  g.font = `700 14px ${MONO}`; g.textAlign = 'center';
  if (st.f < 0.97) { g.fillStyle = '#fca5a5'; g.fillText('AIRE', cx, (cy - R + ys) / 2 + 5); }
  g.fillStyle = '#eafcff'; g.fillText(`AGUA ${(st.f * 100).toFixed(0)}%`, cx, Math.min(cy + R - 12, ys + 26));
}

export function drawTime(cv, hist) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  let mx = 10;
  for (let i = 0; i < hist.n; i++) mx = Math.max(mx, hist.real[i], hist.meas[i]);
  const step = mx > 400 ? 100 : mx > 160 ? 50 : mx > 60 ? 20 : 10;
  const top = Math.ceil(mx * 1.1 / step) * step;
  const pl = 46, pr = 8, pt = 10, pb = 18;
  const X = (i) => pl + (i / (hist.cap - 1)) * (W - pl - pr), Yq = (q) => H - pb - (q / top) * (H - pt - pb);
  g.font = `500 15px ${MONO}`; g.textAlign = 'right'; g.fillStyle = C.mut;
  for (let q = 0; q <= top; q += step) {
    g.strokeStyle = C.grid; g.lineWidth = 1; g.beginPath(); g.moveTo(pl, Yq(q)); g.lineTo(W - pr, Yq(q)); g.stroke();
    g.fillText(q, pl - 6, Yq(q) + 5);
  }
  g.textAlign = 'left'; g.fillText('L/s', 4, pt + 10);
  const line = (arr, col, w) => {
    g.strokeStyle = col; g.lineWidth = w; g.beginPath();
    const off = hist.cap - hist.n;
    for (let i = 0; i < hist.n; i++) { const j = (hist.head - hist.n + i + hist.cap) % hist.cap; const x = X(off + i), y = Yq(arr[j]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  };
  line(hist.real, C.ok, 3); line(hist.meas, C.bad, 2.2);
}

export function drawProfile(cv, sol, t) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const sMax = Math.min(sol.path.total, GEOM.L1 + sol.path.Lb + 3.5);
  const pl = 34, pr = 10, pt = 26, pb = 30;
  const X = (s) => pl + (s / sMax) * (W - pl - pr), Yf = (f) => H - pb - f * (H - pt - pb);
  // zona del sensor
  const s0 = GEOM.sSensor - GEOM.sensorLen / 2, s1 = GEOM.sSensor + GEOM.sensorLen / 2;
  g.fillStyle = 'rgba(56,189,248,.12)'; g.fillRect(X(s0), Yf(1), X(s1) - X(s0), Yf(0) - Yf(1));
  // agua
  g.beginPath(); g.moveTo(X(0), Yf(0));
  for (let s = 0; s <= sMax; s += sMax / 300) g.lineTo(X(s), Yf(sol.sample(s, sol.f)));
  g.lineTo(X(sMax), Yf(0)); g.closePath();
  const wg = g.createLinearGradient(0, Yf(1), 0, Yf(0)); wg.addColorStop(0, '#4cc3e0'); wg.addColorStop(1, '#0d4c6a');
  g.fillStyle = wg; g.fill();
  // tubería
  g.strokeStyle = 'rgba(220,235,250,.7)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(X(0), Yf(1)); g.lineTo(X(sMax), Yf(1)); g.moveTo(X(0), Yf(0)); g.lineTo(X(sMax), Yf(0)); g.stroke();
  // codo
  g.setLineDash([5, 5]); g.strokeStyle = C.warn; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(X(GEOM.L1), Yf(1.12)); g.lineTo(X(GEOM.L1), Yf(-0.05)); g.stroke();
  // profundidad crítica (tramo horizontal)
  g.strokeStyle = 'rgba(255,255,255,.55)';
  g.beginPath(); g.moveTo(X(0), Yf(sol.yc / GEOM.D)); g.lineTo(X(GEOM.L1), Yf(sol.yc / GEOM.D)); g.stroke();
  g.setLineDash([]);
  g.font = `600 15px ${MONO}`; g.fillStyle = C.warn; g.textAlign = 'center';
  g.fillText('codo', X(GEOM.L1), pt - 8);
  g.fillStyle = C.acc; g.fillText('sensor', X(GEOM.sSensor), pt - 8);
  g.fillStyle = 'rgba(255,255,255,.75)'; g.textAlign = 'left';
  g.fillText('y_c', X(0.08), Yf(sol.yc / GEOM.D) - 5);
  g.fillStyle = C.mut; g.textAlign = 'right'; g.fillText('y/D', pl - 4, pt + 4);
  g.fillText('1', pl - 6, Yf(1) + 5); g.fillText('0', pl - 6, Yf(0) + 5);
  g.textAlign = 'center';
  for (let s = 0; s <= sMax; s += 1) g.fillText(`${s}`, X(s), H - 8);
  g.textAlign = 'right'; g.fillText('s [m]', W - pr, H - 8);
}

// LCD del convertidor MV145: caudal instantáneo, totalizador, tendencia y estado
export function drawDisplay(cv, d) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#d7e6ee'); bg.addColorStop(1, '#b9cfdc');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const ink = '#18242e';
  g.fillStyle = ink; g.strokeStyle = ink;
  // fila de iconos: batería, señal, DN
  g.lineWidth = 3; g.strokeRect(14, 12, 44, 20); g.fillRect(58, 17, 5, 10); g.fillRect(18, 16, 30, 12);
  g.font = `700 22px ${MONO}`; g.textAlign = 'left'; g.fillText(`DN${d.dn}`, 80, 31);
  g.textAlign = 'right'; g.fillText(d.alarm ? '⚠' : '✓', W - 16, 31);
  // unidad y caudal
  g.textAlign = 'left'; g.font = `700 26px ${MONO}`; g.fillText('l/s', 16, 92);
  g.textAlign = 'right'; g.font = `700 104px ${MONO}`;
  g.fillText(d.q.toFixed(d.q < 100 ? 2 : 1), W - 14, 128);
  // totalizador
  g.font = `600 24px ${MONO}`; g.textAlign = 'left';
  g.fillText(`T+ ${d.tot.toFixed(3)} m³`, 16, 168);
  // tendencia
  const gx = 16, gy = 186, gw = W - 32, gh = 92;
  g.lineWidth = 2; g.strokeRect(gx, gy, gw, gh);
  const hs = d.hist, n = hs.length, mx = Math.max(1, ...hs) * 1.15;
  g.beginPath();
  for (let i = 0; i < n; i++) { const x = gx + (i / Math.max(1, n - 1)) * gw, y = gy + gh - (hs[i] / mx) * gh; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.lineTo(gx + gw, gy + gh); g.lineTo(gx, gy + gh); g.closePath();
  g.fillStyle = 'rgba(24,36,46,.28)'; g.fill(); g.stroke();
  // barra de estado
  g.fillStyle = d.alarm ? '#7a1010' : ink;
  g.font = `700 24px ${MONO}`; g.textAlign = 'left';
  g.fillText(d.statusLcd, 16, H - 14);
}

export function areaPct(f) { return areaFraction(f) * 100; }
