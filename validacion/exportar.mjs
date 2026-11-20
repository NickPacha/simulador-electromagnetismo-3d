// Ejecuta el núcleo físico del simulador (JavaScript) en casos de prueba y guarda
// los resultados en JSON para compararlos con NumPy/SciPy (validar.py).
import { writeFileSync } from 'node:fs';
import { electricField, electricPotential } from '../src/core/electrostatics.js';
import { integrate, rk4Step, eulerStep, borisStep, borisInit } from '../src/core/integrators.js';
import { solveCircuit } from '../src/core/circuit.js';
import { magneticField, circularLoop } from '../src/core/magnetostatics.js';
import { E_CHARGE, M_PROTON, M_ELECTRON } from '../src/core/constants.js';

const out = {};

// 1) Campo y potencial en una malla de puntos para una distribución de 4 cargas
const charges = [{ x: -1.5, y: 0.2, z: 0, q: 2e-6 }, { x: 1.4, y: -0.3, z: 0.5, q: -3e-6 }, { x: 0.2, y: 1.6, z: -0.4, q: 1e-6 }, { x: 0.5, y: -1.8, z: 0.2, q: -0.5e-6 }];
const pts = [];
for (let i = 0; i < 200; i++) { const a = i * 2.399963, r = 0.4 + (i % 17) * 0.25; pts.push([r * Math.cos(a), r * Math.sin(a), ((i % 7) - 3) * 0.3]); }
out.electro = { charges, points: pts, V: pts.map((p) => electricPotential(charges, ...p)), E: pts.map((p) => electricField(charges, ...p)) };

// 2) Trayectoria en el campo de una carga fija (dispersión) con RK4 de paso adaptativo
const fixed = [{ x: 0, y: 0, z: 0, q: 5e-6 }];
const q = 1e-6, m = 2e-3;
const f = (t, y) => { const E = electricField(fixed, y[0], y[1], 0); return [y[2], y[3], (q / m) * E[0], (q / m) * E[1]]; };
const traj = integrate(f, [-4.5, 0.6, 6, 0], 0, 1.6, { h: (t, y) => Math.min(0.01, (0.004 * Math.max(Math.hypot(y[0], y[1]), 0.05)) / (Math.hypot(y[2], y[3]) + 0.3)) });
out.scattering = { q, m, Q: 5e-6, y0: [-4.5, 0.6, 6, 0], t: traj.t, y: traj.y };

// 3) Convergencia: oscilador armónico con RK4 y Euler para varios pasos
const osc = (t, y) => [y[1], -y[0]];
out.convergence = [0.2, 0.1, 0.05, 0.025, 0.0125, 0.00625].map((h) => {
  const n = Math.round(10 / h); let a = [1, 0], b = [1, 0];
  for (let i = 0; i < n; i++) { a = rk4Step(osc, i * h, a, h); b = eulerStep(osc, i * h, b, h); }
  return { h, rk4: Math.abs(a[0] - Math.cos(10)), euler: Math.abs(b[0] - Math.cos(10)) };
});

// 4) Lorentz: protón en E × B con Boris
const qm = E_CHARGE / M_PROTON, Bz = 0.01, Ey = 1000;
const Tc = (2 * Math.PI) / (qm * Bz), N = 960, dt = (4 * Tc) / N;
let pos = [0, 0, 0], vel = borisInit([0, 0, 0], qm, [0, Ey, 0], [0, 0, Bz], dt);
const lor = { t: [0], pos: [pos], vel: [vel] };
for (let i = 0; i < N; i++) { ({ pos, vel } = borisStep(pos, vel, qm, [0, Ey, 0], [0, 0, Bz], dt)); lor.t.push((i + 1) * dt); lor.pos.push(pos); lor.vel.push(vel); }
out.lorentz = { qm, E: [0, Ey, 0], B: [0, 0, Bz], ...lor };
// Energía en B puro: electrón 10⁵ pasos
let p2 = [0, 0, 0], v2 = [2e6, 0, 5e5]; const qm2 = -E_CHARGE / M_ELECTRON;
const energyDrift = [];
const Te = (2 * Math.PI) / (Math.abs(qm2) * 1e-4);
for (let i = 0; i <= 100000; i++) { if (i % 1000 === 0) energyDrift.push([i, (v2[0] ** 2 + v2[1] ** 2 + v2[2] ** 2) / (2e6 ** 2 + 5e5 ** 2) - 1]); ({ pos: p2, vel: v2 } = borisStep(p2, v2, qm2, [0, 0, 0], [0, 0, 1e-4], Te / 100)); }
out.borisEnergy = energyDrift;

// 5) Circuito mixto
const comps = [{ type: 'V', a: 1, b: 0, value: 12 }, { type: 'R', a: 1, b: 2, value: 100 }, { type: 'R', a: 2, b: 0, value: 220 }, { type: 'R', a: 2, b: 3, value: 150 }, { type: 'R', a: 3, b: 0, value: 180 }];
const sol = solveCircuit(comps);
out.circuit = { comps, nodes: Object.fromEntries(sol.nodeVoltages), currents: sol.results.map((r) => r.I) };

// 6) Biot-Savart: espira fuera del eje con distintas discretizaciones
const field = [];
for (const n of [8, 16, 32, 64, 128, 256, 512]) {
  const segs = circularLoop(10, 1, 0, n);
  field.push({ n, B: magneticField(segs, 0.6, 0.0, 0.4) });
}
out.loop = { I: 10, R: 1, point: [0.6, 0, 0.4], field };

writeFileSync(new URL('./resultados_js.json', import.meta.url), JSON.stringify(out));
console.log('resultados_js.json escrito');
