// Pruebas unitarias del núcleo físico (node --test).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { K, EPS0, MU0, E_CHARGE, M_PROTON } from '../src/core/constants.js';
import { electricField, electricPotential, systemEnergy, contributions } from '../src/core/electrostatics.js';
import { rk4Step, eulerStep, integrate, borisStep, borisInit } from '../src/core/integrators.js';
import { traceFieldLine } from '../src/core/fieldlines.js';
import { marchingSquares } from '../src/core/contour.js';
import { solveCircuit, equivalentResistance, series, parallel } from '../src/core/circuit.js';
import { magneticField, straightWire, circularLoop, solenoid, analytic } from '../src/core/magnetostatics.js';
import { parallelPlate, partialSlab, seriesSlab, energy, energyFromQ, seriesC, parallelC } from '../src/core/capacitor.js';

const close = (a, b, rel = 1e-9, msg = '') => {
  const err = Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  assert.ok(err <= rel, `${msg} esperado ${b}, obtenido ${a} (error relativo ${err.toExponential(2)})`);
};

describe('Unidad 1 · Electrostática', () => {
  test('campo y potencial de una carga puntual (ley de Coulomb)', () => {
    const q = [{ x: 0, y: 0, z: 0, q: 1e-6 }];
    const E = electricField(q, 2, 0, 0);
    close(E[0], (K * 1e-6) / 4, 1e-6);
    close(electricPotential(q, 0, 3, 0), (K * 1e-6) / 3, 1e-6);
  });
  test('el potencial de un dipolo es nulo en el plano mediador', () => {
    const d = [{ x: -1, y: 0, z: 0, q: 2e-6 }, { x: 1, y: 0, z: 0, q: -2e-6 }];
    for (const y of [0.5, 1, 3, -2]) assert.ok(Math.abs(electricPotential(d, 0, y, 0.7)) < 1e-6);
  });
  test('E = −∇V (comprobación por diferencias centrales)', () => {
    const ch = [{ x: -1, y: 0.3, z: 0, q: 3e-6 }, { x: 1.2, y: -0.5, z: 0.4, q: -1e-6 }, { x: 0, y: 1.5, z: -0.2, q: 2e-6 }];
    const h = 1e-5;
    for (const [x, y, z] of [[0.3, 0.2, 0.1], [2, -1, 1], [-2, 2, -1]]) {
      const E = electricField(ch, x, y, z);
      const g = [
        -(electricPotential(ch, x + h, y, z) - electricPotential(ch, x - h, y, z)) / (2 * h),
        -(electricPotential(ch, x, y + h, z) - electricPotential(ch, x, y - h, z)) / (2 * h),
        -(electricPotential(ch, x, y, z + h) - electricPotential(ch, x, y, z - h)) / (2 * h),
      ];
      for (let i = 0; i < 3; i++) close(E[i], g[i], 1e-5, `componente ${i}`);
    }
  });
  test('superposición: la suma de contribuciones coincide con el total', () => {
    const ch = [{ x: 0, y: 0, z: 0, q: 1e-6 }, { x: 2, y: 0, z: 0, q: 4e-6 }];
    const c = contributions(ch, 1, 1, 0);
    close(c[0].V + c[1].V, electricPotential(ch, 1, 1, 0), 1e-6);
  });
  test('energía de un par de cargas U = kq₁q₂/r', () => {
    close(systemEnergy([{ x: 0, y: 0, z: 0, q: 1e-6 }, { x: 0, y: 3, z: 0, q: -2e-6 }]), (K * -2e-12) / 3, 1e-12);
  });
  test('la línea de campo de una carga aislada es radial', () => {
    const ch = [{ x: 0, y: 0, z: 0, q: 1e-6 }];
    const res = traceFieldLine((x, y, z) => electricField(ch, x, y, z), [0.1 * Math.cos(0.7), 0.1 * Math.sin(0.7), 0], { step: 0.05, maxSteps: 100 });
    const last = res.points[res.points.length - 1];
    close(Math.atan2(last[1], last[0]), 0.7, 1e-6);
  });
  test('marching squares: la curva de nivel de r² = 4 es una circunferencia de radio 2', () => {
    const n = 81, vals = new Float64Array(n * n);
    const X = (i) => -4 + (8 * i) / (n - 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) vals[j * n + i] = X(i) ** 2 + X(j) ** 2;
    const segs = marchingSquares(vals, n, n, 4);
    assert.ok(segs.length > 50);
    for (const s of segs) {
      const r = Math.hypot(-4 + (8 * s[0]) / (n - 1), -4 + (8 * s[1]) / (n - 1));
      assert.ok(Math.abs(r - 2) < 0.02, `r = ${r}`);
    }
  });
});

describe('Integradores numéricos', () => {
  const osc = (t, y) => [y[1], -y[0]]; // oscilador armónico, solución cos t
  const errAt = (step, h) => { let y = [1, 0]; const n = Math.round(2 / h); for (let i = 0; i < n; i++) y = step(osc, i * h, y, h); return Math.abs(y[0] - Math.cos(2)); };
  test('RK4 es de cuarto orden (al dividir h entre 2 el error baja ≈16 veces)', () => {
    const ratio = errAt(rk4Step, 0.1) / errAt(rk4Step, 0.05);
    assert.ok(ratio > 14 && ratio < 18, `razón ${ratio}`);
  });
  test('RK4 es mucho más preciso que Euler con el mismo paso', () => {
    assert.ok(errAt(rk4Step, 0.01) < errAt(eulerStep, 0.01) * 1e-5);
  });
  test('caída libre con integrate(): y = ½gt²', () => {
    const out = integrate((t, y) => [y[1], -9.8], [0, 0], 0, 2, { h: 0.01 });
    close(out.y[out.y.length - 1][0], -0.5 * 9.8 * 4, 1e-10);
  });
  test('Boris conserva |v| en un campo magnético puro', () => {
    let pos = [0, 0, 0], vel = [1e5, 0, 2e4];
    const qm = E_CHARGE / M_PROTON, B = [0, 0, 0.01], E = [0, 0, 0];
    const v0 = Math.hypot(...vel);
    for (let i = 0; i < 20000; i++) ({ pos, vel } = borisStep(pos, vel, qm, E, B, 1e-9));
    close(Math.hypot(...vel), v0, 1e-12);
  });
  test('Boris reproduce el radio de Larmor r = mv/(qB)', () => {
    const qm = E_CHARGE / M_PROTON, B = 0.01, v = 1e5;
    const T = (2 * Math.PI) / (qm * B), n = 2000, dt = T / n;
    let pos = [0, 0, 0], vel = borisInit([v, 0, 0], qm, [0, 0, 0], [0, 0, B], dt), ymin = 0;
    for (let i = 0; i < n; i++) { ({ pos, vel } = borisStep(pos, vel, qm, [0, 0, 0], [0, 0, B], dt)); ymin = Math.min(ymin, pos[1]); }
    close(-ymin / 2, v / (qm * B), 1e-4, 'radio');
    assert.ok(Math.hypot(pos[0], pos[1]) < 1e-3 * v / (qm * B), 'vuelve al origen tras un período');
  });
  test('deriva E×B: velocidad media = E/B', () => {
    const qm = E_CHARGE / M_PROTON, B = 0.01, E = 1000;
    const T = (2 * Math.PI) / (qm * B), n = 400, dt = T / n;
    let pos = [0, 0, 0], vel = borisInit([0, 0, 0], qm, [0, E, 0], [0, 0, B], dt);
    for (let i = 0; i < 10 * n; i++) ({ pos, vel } = borisStep(pos, vel, qm, [0, E, 0], [0, 0, B], dt));
    close(pos[0] / (10 * T), E / B, 1e-3, 'deriva');
  });
});

describe('Unidad 2 · Capacitores', () => {
  test('C = ε₀A/d y el dieléctrico multiplica por κ', () => {
    close(parallelPlate(0.01, 1e-3), (EPS0 * 0.01) / 1e-3);
    close(parallelPlate(0.01, 1e-3, 4.7), 4.7 * parallelPlate(0.01, 1e-3));
  });
  test('dieléctrico parcial: límites f = 0 y f = 1', () => {
    close(partialSlab(0.02, 2e-3, 5, 0), parallelPlate(0.02, 2e-3));
    close(partialSlab(0.02, 2e-3, 5, 1), parallelPlate(0.02, 2e-3, 5));
    close(seriesSlab(0.02, 2e-3, 5, 2e-3), parallelPlate(0.02, 2e-3, 5));
  });
  test('U = ½CV² = Q²/2C', () => { const C = 470e-6, V = 12; close(energy(C, V), energyFromQ(C * V, C)); close(energy(C, V), 0.03384); });
  test('asociaciones serie y paralelo', () => { close(seriesC(2, 2), 1); close(parallelC(1, 2, 3), 6); });
});

describe('Unidad 3 · Circuitos (análisis nodal modificado)', () => {
  test('serie: I = V / ΣR', () => {
    const s = solveCircuit([{ type: 'V', a: 1, b: 0, value: 12 }, { type: 'R', a: 1, b: 2, value: 100 }, { type: 'R', a: 2, b: 3, value: 220 }, { type: 'R', a: 3, b: 0, value: 330 }]);
    close(s.results[0].I, 12 / 650, 1e-9);
    close(equivalentResistance(s), series(100, 220, 330), 1e-9);
  });
  test('paralelo: Req = 1/Σ(1/R)', () => {
    const s = solveCircuit([{ type: 'V', a: 1, b: 0, value: 9 }, { type: 'R', a: 1, b: 0, value: 100 }, { type: 'R', a: 1, b: 0, value: 220 }, { type: 'R', a: 1, b: 0, value: 330 }]);
    close(equivalentResistance(s), parallel(100, 220, 330), 1e-9);
  });
  test('mixto: conservación de la energía y ley de corrientes de Kirchhoff', () => {
    const comps = [{ type: 'V', a: 1, b: 0, value: 12 }, { type: 'R', a: 1, b: 2, value: 100 }, { type: 'R', a: 2, b: 0, value: 220 }, { type: 'R', a: 2, b: 3, value: 150 }, { type: 'R', a: 3, b: 0, value: 180 }];
    const s = solveCircuit(comps);
    const pIn = s.results.filter((r) => r.type === 'V').reduce((a, r) => a + r.P, 0);
    const pOut = s.results.filter((r) => r.type === 'R').reduce((a, r) => a + r.P, 0);
    close(pIn, pOut, 1e-9);
    // LCK en el nodo 2: lo que entra por R1 sale por R2 y R3
    close(s.results[1].I, s.results[2].I + s.results[3].I, 1e-9);
    close(equivalentResistance(s), 100 + parallel(220, 150 + 180), 1e-9);
  });
  test('capacitor en CC: no circula corriente y Q = CV', () => {
    const s = solveCircuit([{ type: 'V', a: 1, b: 0, value: 9 }, { type: 'R', a: 1, b: 2, value: 1000 }, { type: 'C', a: 2, b: 0, value: 47e-6 }]);
    assert.ok(Math.abs(s.results[1].I) < 1e-9);
    close(s.results[2].Q, 47e-6 * 9, 1e-6);
  });
  test('dos fuentes (comparado con el teorema de Millman)', () => {
    // V1=12 V con R1=47 Ω, V2=6 V con R2=68 Ω, carga común R3=150 Ω
    const s = solveCircuit([
      { type: 'V', a: 1, b: 0, value: 12 }, { type: 'R', a: 1, b: 2, value: 47 },
      { type: 'V', a: 3, b: 0, value: 6 }, { type: 'R', a: 3, b: 2, value: 68 }, { type: 'R', a: 2, b: 0, value: 150 },
    ]);
    const Vn = (12 / 47 + 6 / 68) / (1 / 47 + 1 / 68 + 1 / 150); // teorema de Millman
    close(s.nodeVoltages.get(2), Vn, 1e-9);
  });
  test('lazo de solo fuentes en cortocircuito: se informa el error', () => {
    assert.throws(() => solveCircuit([{ type: 'V', a: 1, b: 0, value: 5 }, { type: 'W', a: 1, b: 0, value: 0 }]));
  });
});

describe('Unidad 4 · Magnetostática', () => {
  test('hilo largo: B = μ₀I/(2πr) y regla de la mano derecha', () => {
    const B = magneticField(straightWire(5, 2000), 0.2, 0, 0);
    close(B[1], analytic.infiniteWire(5, 0.2), 1e-6);
    assert.ok(Math.abs(B[0]) < 1e-15 && Math.abs(B[2]) < 1e-15);
  });
  test('espira: campo en el eje', () => {
    const segs = circularLoop(10, 1.2, 0, 720);
    for (const z of [0, 0.5, 2]) close(magneticField(segs, 0, 0, z)[2], analytic.loopAxis(10, 1.2, z), 1e-4);
  });
  test('solenoide finito: campo en el centro', () => {
    close(magneticField(solenoid(2, 0.3, 3, 40, 72), 0, 0, 0)[2], analytic.solenoidCenter(2, 0.3, 3, 40), 2e-3);
  });
  test('bobinas de Helmholtz: campo en el centro', () => {
    const segs = [...circularLoop(1, 1, -0.5, 720), ...circularLoop(1, 1, 0.5, 720)];
    close(magneticField(segs, 0, 0, 0)[2], analytic.helmholtzCenter(1, 1), 1e-4);
  });
  test('∇·B = 0 (no hay monopolos magnéticos)', () => {
    const segs = circularLoop(3, 1, 0, 180), h = 1e-4;
    for (const [x, y, z] of [[0.4, 0.3, 0.2], [1.5, -0.4, 0.8]]) {
      const d = (i) => { const p = [x, y, z], m = [x, y, z]; p[i] += h; m[i] -= h; return (magneticField(segs, ...p)[i] - magneticField(segs, ...m)[i]) / (2 * h); };
      const div = d(0) + d(1) + d(2);
      const scale = Math.hypot(...magneticField(segs, x, y, z));
      assert.ok(Math.abs(div) < 1e-4 * scale, `div B = ${div}`);
    }
  });
  test('μ₀ y ε₀ cumplen c = 1/√(μ₀ε₀)', () => close(1 / Math.sqrt(MU0 * EPS0), 299792458, 1e-9));
});
