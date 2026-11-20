// Integradores numéricos de ecuaciones diferenciales ordinarias.

/**
 * Un paso de Runge-Kutta de 4.º orden para dy/dt = f(t, y).
 * y es un arreglo de números; devuelve un arreglo nuevo.
 * Error local O(h⁵), error global O(h⁴).
 */
export function rk4Step(f, t, y, h) {
  const n = y.length;
  const k1 = f(t, y);
  const y2 = new Array(n);
  for (let i = 0; i < n; i++) y2[i] = y[i] + 0.5 * h * k1[i];
  const k2 = f(t + 0.5 * h, y2);
  const y3 = new Array(n);
  for (let i = 0; i < n; i++) y3[i] = y[i] + 0.5 * h * k2[i];
  const k3 = f(t + 0.5 * h, y3);
  const y4 = new Array(n);
  for (let i = 0; i < n; i++) y4[i] = y[i] + h * k3[i];
  const k4 = f(t + h, y4);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  return out;
}

/** Paso de Euler explícito (solo para comparación didáctica en las pruebas). */
export function eulerStep(f, t, y, h) {
  const d = f(t, y);
  return y.map((v, i) => v + h * d[i]);
}

/**
 * Integra dy/dt = f(t,y) con RK4 de paso fijo o variable.
 * options.h: paso fijo, o función (t, y) => h para paso adaptativo.
 * options.stop: (t, y) => boolean para detener (colisión, salida del dominio).
 * Devuelve { t: [...], y: [[...], ...], reason }.
 */
export function integrate(f, y0, t0, tEnd, options = {}) {
  const { h = (tEnd - t0) / 1000, stop = null, maxSteps = 200000 } = options;
  const ts = [t0], ys = [y0.slice()];
  let t = t0, y = y0.slice(), reason = 'tiempo';
  for (let s = 0; s < maxSteps && t < tEnd; s++) {
    let step = typeof h === 'function' ? h(t, y) : h;
    if (t + step > tEnd) step = tEnd - t;
    y = rk4Step(f, t, y, step);
    t += step;
    ts.push(t); ys.push(y);
    if (stop) {
      const r = stop(t, y);
      if (r) { reason = typeof r === 'string' ? r : 'detenido'; break; }
    }
  }
  return { t: ts, y: ys, reason };
}

/**
 * Empujador de Boris para la fuerza de Lorentz F = q(E + v × B).
 * Es el algoritmo estándar en física de plasmas: es de segundo orden,
 * reversible en el tiempo y conserva exactamente |v| cuando E = 0.
 * pos, vel: [x,y,z]; E, B: [x,y,z] evaluados en pos.
 */
export function borisStep(pos, vel, qm, E, B, dt) {
  const h = 0.5 * qm * dt;
  // medio impulso eléctrico
  const vmx = vel[0] + h * E[0], vmy = vel[1] + h * E[1], vmz = vel[2] + h * E[2];
  // rotación magnética
  const tx = h * B[0], ty = h * B[1], tz = h * B[2];
  const t2 = tx * tx + ty * ty + tz * tz;
  const sx = (2 * tx) / (1 + t2), sy = (2 * ty) / (1 + t2), sz = (2 * tz) / (1 + t2);
  const vpx = vmx + (vmy * tz - vmz * ty);
  const vpy = vmy + (vmz * tx - vmx * tz);
  const vpz = vmz + (vmx * ty - vmy * tx);
  const vqx = vmx + (vpy * sz - vpz * sy);
  const vqy = vmy + (vpz * sx - vpx * sz);
  const vqz = vmz + (vpx * sy - vpy * sx);
  // segundo medio impulso eléctrico
  const nvx = vqx + h * E[0], nvy = vqy + h * E[1], nvz = vqz + h * E[2];
  return {
    pos: [pos[0] + nvx * dt, pos[1] + nvy * dt, pos[2] + nvz * dt],
    vel: [nvx, nvy, nvz],
  };
}

/**
 * Inicialización del esquema "leapfrog" de Boris: las velocidades viven en
 * medios pasos (t − Δt/2, t + Δt/2, …). Para empezar correctamente desde v(0)
 * se retrocede la velocidad medio paso. Sin esta corrección aparece un error
 * de fase de orden ωΔt en presencia de campo eléctrico.
 */
export function borisInit(vel, qm, E, B, dt) {
  return borisStep([0, 0, 0], vel, qm, E, B, -dt / 2).vel;
}
