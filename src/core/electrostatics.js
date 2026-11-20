// Electrostática de cargas puntuales: ley de Coulomb y principio de superposición.
// Las cargas se describen como {x, y, z, q} con q en coulombs y posiciones en metros.
import { K } from './constants.js';

// Radio de suavizado para evitar la singularidad 1/r² sobre la propia carga.
export const SOFTENING = 1e-4;

/**
 * Campo eléctrico total en (x,y,z):  E = Σ k q_i (r - r_i) / |r - r_i|³
 * Devuelve [Ex, Ey, Ez] en N/C.
 */
export function electricField(charges, x, y, z = 0, out = [0, 0, 0]) {
  let ex = 0, ey = 0, ez = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x, dy = y - c.y, dz = z - (c.z || 0);
    const r2 = dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING;
    const inv = (K * c.q) / (r2 * Math.sqrt(r2));
    ex += inv * dx; ey += inv * dy; ez += inv * dz;
  }
  out[0] = ex; out[1] = ey; out[2] = ez;
  return out;
}

/** Potencial eléctrico total:  V = Σ k q_i / |r - r_i|   [V] */
export function electricPotential(charges, x, y, z = 0) {
  let v = 0;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const dx = x - c.x, dy = y - c.y, dz = z - (c.z || 0);
    v += (K * c.q) / Math.sqrt(dx * dx + dy * dy + dz * dz + SOFTENING * SOFTENING);
  }
  return v;
}

/** Contribuciones individuales de cada carga en un punto (para la calculadora). */
export function contributions(charges, x, y, z = 0) {
  return charges.map((c) => {
    const dx = x - c.x, dy = y - c.y, dz = z - (c.z || 0);
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const V = (K * c.q) / r;
    const Emag = (K * Math.abs(c.q)) / (r * r);
    const f = (K * c.q) / (r * r * r);
    return { r, V, E: [f * dx, f * dy, f * dz], Emag };
  });
}

/** Energía potencial electrostática del sistema: U = Σ_{i<j} k q_i q_j / r_ij  [J] */
export function systemEnergy(charges) {
  let u = 0;
  for (let i = 0; i < charges.length; i++) {
    for (let j = i + 1; j < charges.length; j++) {
      const a = charges[i], b = charges[j];
      const r = Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
      u += (K * a.q * b.q) / r;
    }
  }
  return u;
}

/** Distancia a la carga más cercana (útil para paso adaptativo y detección de colisión). */
export function nearestCharge(charges, x, y, z = 0) {
  let best = Infinity, idx = -1;
  for (let i = 0; i < charges.length; i++) {
    const c = charges[i];
    const d = Math.hypot(x - c.x, y - c.y, z - (c.z || 0));
    if (d < best) { best = d; idx = i; }
  }
  return { distance: best, index: idx };
}
