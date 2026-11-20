// Magnetostática: ley de Biot-Savart para conductores discretizados en segmentos rectos.
// Cada segmento {a:[x,y,z], b:[x,y,z], I} contribuye con la expresión exacta del
// campo de un segmento finito:  B = (μ0 I / 4π d) (cos θ1 − cos θ2) en la dirección dl × r̂.
import { MU0 } from './constants.js';

const C = MU0 / (4 * Math.PI);

/** Campo magnético de un conjunto de segmentos en (x,y,z) [T]. */
export function magneticField(segments, x, y, z, out = [0, 0, 0]) {
  let bx = 0, by = 0, bz = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const ax = s.a[0], ay = s.a[1], az = s.a[2];
    const lx = s.b[0] - ax, ly = s.b[1] - ay, lz = s.b[2] - az; // dl
    const r1x = x - ax, r1y = y - ay, r1z = z - az;
    const r2x = x - s.b[0], r2y = y - s.b[1], r2z = z - s.b[2];
    // dl × r1
    const cx = ly * r1z - lz * r1y, cy = lz * r1x - lx * r1z, cz = lx * r1y - ly * r1x;
    const c2 = cx * cx + cy * cy + cz * cz;
    const L2 = lx * lx + ly * ly + lz * lz;
    if (c2 < 1e-14 * L2) continue; // punto sobre la recta del segmento
    const r1 = Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z);
    const r2 = Math.sqrt(r2x * r2x + r2y * r2y + r2z * r2z);
    const dot1 = (lx * r1x + ly * r1y + lz * r1z) / r1;
    const dot2 = (lx * r2x + ly * r2y + lz * r2z) / r2;
    const f = (C * s.I * (dot1 - dot2)) / c2;
    bx += f * cx; by += f * cy; bz += f * cz;
  }
  out[0] = bx; out[1] = by; out[2] = bz;
  return out;
}

// ---------- Generadores de geometrías de conductores ----------

/** Hilo recto a lo largo de z, centrado en (x0,y0), de longitud L. */
export function straightWire(I, L = 20, x0 = 0, y0 = 0, n = 1) {
  const segs = [];
  for (let k = 0; k < n; k++) {
    const z1 = -L / 2 + (L * k) / n, z2 = -L / 2 + (L * (k + 1)) / n;
    segs.push({ a: [x0, y0, z1], b: [x0, y0, z2], I });
  }
  return segs;
}

/** Espira circular de radio R en el plano z = z0, centrada en el eje z. */
export function circularLoop(I, R, z0 = 0, n = 64) {
  const segs = [];
  for (let k = 0; k < n; k++) {
    const a1 = (2 * Math.PI * k) / n, a2 = (2 * Math.PI * (k + 1)) / n;
    segs.push({ a: [R * Math.cos(a1), R * Math.sin(a1), z0], b: [R * Math.cos(a2), R * Math.sin(a2), z0], I });
  }
  return segs;
}

/** Solenoide helicoidal de N vueltas, radio R y longitud L, eje z. */
export function solenoid(I, R, L, N, perTurn = 36) {
  const segs = [];
  const total = N * perTurn;
  const pt = (k) => {
    const a = (2 * Math.PI * k) / perTurn;
    return [R * Math.cos(a), R * Math.sin(a), -L / 2 + (L * k) / total];
  };
  for (let k = 0; k < total; k++) segs.push({ a: pt(k), b: pt(k + 1), I });
  return segs;
}

// ---------- Expresiones analíticas (para validación) ----------
export const analytic = {
  infiniteWire: (I, r) => (MU0 * I) / (2 * Math.PI * r),
  finiteWire: (I, d, L) => ((MU0 * I) / (4 * Math.PI * d)) * (2 * (L / 2) / Math.sqrt((L / 2) ** 2 + d * d)),
  loopAxis: (I, R, z) => (MU0 * I * R * R) / (2 * Math.pow(R * R + z * z, 1.5)),
  solenoidCenter: (I, R, L, N) => (MU0 * N * I) / L * ((L / 2) / Math.sqrt((L / 2) ** 2 + R * R)),
  idealSolenoid: (I, L, N) => (MU0 * N * I) / L,
  /** Campo en el eje de un solenoide finito, a una altura z desde su centro. */
  solenoidAxis: (I, R, L, N, z) => ((MU0 * N * I) / (2 * L)) * ((z + L / 2) / Math.hypot(z + L / 2, R) - (z - L / 2) / Math.hypot(z - L / 2, R)),
  /** Centro de un par de bobinas de Helmholtz (separación = R, N vueltas cada una). */
  helmholtzCenter: (I, R, N = 1) => Math.pow(4 / 5, 1.5) * (MU0 * N * I) / R,
  /** Fuerza por unidad de longitud entre dos hilos paralelos. */
  parallelWiresForce: (I1, I2, d) => (MU0 * I1 * I2) / (2 * Math.PI * d),
};
