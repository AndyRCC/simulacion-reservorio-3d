// =============================================================================
// sensor.js — Modelo simplificado de caudalímetro electromagnético (DN300)
//   Q_indicado = v_medida · A_llena   (el equipo SUPONE tubería llena)
//   · Electrodos de medición a las 3 y 9 en punto (mitad de altura).
//   · Electrodo EPD (detección de tubería vacía) en la clave.
//   Con llenado parcial y electrodos mojados: v real = Q / A_mojada > Q / A_llena
//   → SOBRE-LECTURA ≈ A_llena / A_mojada, más ruido por burbujas y oleaje.
//   Con nivel bajo los electrodos: contacto intermitente → señal errática.
// =============================================================================
import { areaFraction } from './hydraulics.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MagMeter {
  constructor() {
    this.rng = mulberry32(20261120);
    this.out = 0;            // salida amortiguada (lo que ve el SCADA)
    this.raw = 0;            // señal instantánea
    this.ou = 0;             // ruido correlacionado (Ornstein–Uhlenbeck)
    this.damping = 1.0;      // constante de tiempo del transmisor [s]
    this.epdMode = 'raw';    // 'raw' = EPD desactivado | 'zero' = forzar 0 con alarma
    this.status = 'OK';
    this.electrodesWet = true;
    this.epdWet = true;
    this.spikeHold = 0;
    this.spikeVal = 0;
  }
  gauss() {
    const u = Math.max(1e-9, this.rng()), v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Q [m³/s] real, f = llenado instantáneo en el sensor (y/D)
  update(dt, Q, f) {
    const tau = 0.35;
    this.ou += (-this.ou / tau) * dt + Math.sqrt(2 * dt / tau) * this.gauss();
    const aw = Math.max(0.02, areaFraction(f));
    this.electrodesWet = f > 0.53;
    this.epdWet = f > 0.97;

    let raw;
    if (f >= 0.995) {
      raw = Q * (1 + 0.003 * this.ou);
      this.status = 'OK';
    } else if (this.electrodesWet) {
      const sigma = 0.05 + 0.30 * (1 - f);
      raw = (Q / aw) * (1 + sigma * this.ou);
      this.status = 'SOBRE-LECTURA';
    } else {
      this.spikeHold -= dt;
      if (this.spikeHold <= 0) {
        this.spikeHold = 0.05 + 0.25 * this.rng();
        this.spikeVal = this.rng() < 0.4 ? 0 : (Q / aw) * (0.2 + 1.8 * this.rng());
      }
      raw = this.spikeVal;
      this.status = 'SIN SEÑAL';
    }
    raw = Math.max(0, raw);
    this.raw = raw;

    let target = raw;
    if (!this.epdWet && this.epdMode === 'zero') {
      target = 0;
      this.status = 'TUBERÍA VACÍA';
    }
    if (!this.started) { this.out = target; this.started = true; }   // arranque sin transitorio
    this.out += (target - this.out) * (1 - Math.exp(-dt / this.damping));
    return this.out;
  }
}
