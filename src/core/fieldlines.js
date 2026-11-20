// Trazado de líneas de campo: se integra dr/ds = F(r)/|F(r)| con RK4,
// es decir, se avanza siempre una longitud de arco fija en la dirección del campo.

function normDir(fieldFn, p, sign, out) {
  const f = fieldFn(p[0], p[1], p[2]);
  const m = Math.hypot(f[0], f[1], f[2]);
  if (m === 0 || !isFinite(m)) return null;
  out[0] = (sign * f[0]) / m; out[1] = (sign * f[1]) / m; out[2] = (sign * f[2]) / m;
  return out;
}

/**
 * Traza una línea desde `start`.
 * opts: step, maxSteps, sign (+1 sigue el campo, -1 lo recorre al revés),
 *       inBounds(p) => bool, stopAt(p) => string|null, closeLoop (cerrar líneas de B)
 * Devuelve { points: [[x,y,z],...], end: motivo }
 */
export function traceFieldLine(fieldFn, start, opts = {}) {
  const { step = 0.05, maxSteps = 800, sign = 1, inBounds = () => true, stopAt = null, closeLoop = false } = opts;
  const pts = [start.slice()];
  let p = start.slice();
  const k1 = [0, 0, 0], k2 = [0, 0, 0], k3 = [0, 0, 0], k4 = [0, 0, 0];
  const tmp = [0, 0, 0];
  let end = 'max';
  for (let s = 0; s < maxSteps; s++) {
    if (!normDir(fieldFn, p, sign, k1)) { end = 'nulo'; break; }
    for (let i = 0; i < 3; i++) tmp[i] = p[i] + 0.5 * step * k1[i];
    if (!normDir(fieldFn, tmp, sign, k2)) { end = 'nulo'; break; }
    for (let i = 0; i < 3; i++) tmp[i] = p[i] + 0.5 * step * k2[i];
    if (!normDir(fieldFn, tmp, sign, k3)) { end = 'nulo'; break; }
    for (let i = 0; i < 3; i++) tmp[i] = p[i] + step * k3[i];
    if (!normDir(fieldFn, tmp, sign, k4)) { end = 'nulo'; break; }
    const np = [0, 0, 0];
    for (let i = 0; i < 3; i++) np[i] = p[i] + (step / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
    p = np;
    pts.push(p);
    if (!inBounds(p)) { end = 'borde'; break; }
    if (stopAt) {
      const r = stopAt(p);
      if (r) { end = r; break; }
    }
    if (closeLoop && s > 20) {
      const d = Math.hypot(p[0] - start[0], p[1] - start[1], p[2] - start[2]);
      if (d < step * 1.2) { pts.push(start.slice()); end = 'cerrada'; break; }
    }
  }
  return { points: pts, end };
}

/** Puntos semilla distribuidos uniformemente en una esfera (espiral de Fibonacci). */
export function fibonacciSphere(n, radius, center = [0, 0, 0]) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    pts.push([center[0] + radius * r * Math.cos(th), center[1] + radius * y, center[2] + radius * r * Math.sin(th)]);
  }
  return pts;
}

/** Puntos semilla en una circunferencia en el plano xy. */
export function circleSeeds(n, radius, center = [0, 0, 0], phase = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (2 * Math.PI * i) / n;
    pts.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a), center[2]]);
  }
  return pts;
}

/**
 * Líneas de campo eléctrico para un conjunto de cargas puntuales.
 * El número de líneas por carga es proporcional a |q| (ley de Gauss).
 * Las líneas salen de las cargas positivas; desde las negativas solo se
 * trazan las que no terminan en una positiva (para no duplicarlas).
 */
export function chargeFieldLines(charges, fieldFn, opts = {}) {
  const { linesPerUnit = 8, unit = 1e-6, dims = 2, seedRadius = 0.12, step = 0.04, maxSteps = 900, inBounds, minLines = 4 } = opts;
  const lines = [];
  const capture = seedRadius * 0.8;
  const stopNear = (sign) => (p) => {
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      if (Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - (c.z || 0)) < capture) {
        return c.q * sign < 0 ? 'carga-opuesta' : 'carga';
      }
    }
    return null;
  };
  charges.forEach((c, idx) => {
    if (c.q === 0) return;
    const n = Math.max(minLines, Math.round((linesPerUnit * Math.abs(c.q)) / unit));
    const center = [c.x, c.y, c.z || 0];
    const seeds = dims === 2 ? circleSeeds(n, seedRadius, center, Math.PI / n) : fibonacciSphere(n, seedRadius, center);
    const sign = c.q > 0 ? 1 : -1;
    for (const s of seeds) {
      const res = traceFieldLine(fieldFn, s, { step, maxSteps, sign, inBounds, stopAt: stopNear(sign) });
      if (sign < 0 && res.end === 'carga-opuesta') continue; // ya dibujada desde la positiva
      lines.push({ points: res.points, from: idx, sign, end: res.end });
    }
  });
  return lines;
}
