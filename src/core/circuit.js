// Solucionador de circuitos de corriente continua por Análisis Nodal Modificado (MNA).
// Componentes: { type: 'R'|'V'|'C'|'W', a, b, value }
//   R: resistencia [Ω] entre a y b
//   V: fuente de voltaje [V], terminal positivo en a
//   C: capacitor [F] (en régimen estacionario de CC se comporta como circuito abierto)
//   W: cable ideal (fuente de 0 V, permite conocer la corriente que circula)

const GMIN = 1e-14; // conductancia mínima a tierra para nodos flotantes (evita matrices singulares)

/** Eliminación gaussiana con pivoteo parcial. Resuelve A x = b (A se modifica). */
export function solveLinear(A, b) {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let piv = col, max = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r][col]);
      if (v > max) { max = v; piv = r; }
    }
    if (max < 1e-300) throw new Error('Sistema singular: revisa que el circuito no tenga fuentes en cortocircuito o lazos de solo fuentes.');
    if (piv !== col) { [A[piv], A[col]] = [A[col], A[piv]]; [b[piv], b[col]] = [b[col], b[piv]]; }
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

/**
 * Resuelve el circuito. `ground` es el nodo de referencia (0 V); si no se
 * indica, se usa el terminal negativo de la primera fuente.
 * Devuelve { nodeVoltages: Map(nodo -> V), results: [{...comp, V, I, P, Q?}], ground }
 */
export function solveCircuit(components, ground = null) {
  const comps = components.filter((c) => c.a !== c.b);
  const nodeSet = new Set();
  comps.forEach((c) => { nodeSet.add(c.a); nodeSet.add(c.b); });
  if (nodeSet.size === 0) return { nodeVoltages: new Map(), results: [], ground: null };
  if (ground === null || !nodeSet.has(ground)) {
    const src = comps.find((c) => c.type === 'V');
    ground = src ? src.b : [...nodeSet][0];
  }
  const nodes = [...nodeSet].filter((n) => n !== ground);
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const vsrc = comps.filter((c) => c.type === 'V' || c.type === 'W');
  const N = nodes.length, M = vsrc.length, S = N + M;
  const A = Array.from({ length: S }, () => new Array(S).fill(0));
  const z = new Array(S).fill(0);
  const ia = (n) => (n === ground ? -1 : idx.get(n));

  for (let i = 0; i < N; i++) A[i][i] += GMIN;

  comps.forEach((c) => {
    if (c.type === 'R') {
      const g = 1 / Math.max(c.value, 1e-9);
      const a = ia(c.a), b = ia(c.b);
      if (a >= 0) A[a][a] += g;
      if (b >= 0) A[b][b] += g;
      if (a >= 0 && b >= 0) { A[a][b] -= g; A[b][a] -= g; }
    }
  });
  vsrc.forEach((c, k) => {
    const a = ia(c.a), b = ia(c.b), row = N + k;
    if (a >= 0) { A[a][row] += 1; A[row][a] += 1; }
    if (b >= 0) { A[b][row] -= 1; A[row][b] -= 1; }
    z[row] = c.type === 'V' ? c.value : 0;
  });

  const x = solveLinear(A, z);
  const V = new Map();
  V.set(ground, 0);
  nodes.forEach((n, i) => V.set(n, x[i]));

  const results = components.map((c) => {
    const va = V.get(c.a) ?? 0, vb = V.get(c.b) ?? 0;
    const dv = va - vb;
    // Iab: corriente que circula de a hacia b a través del componente
    let I = 0, Iab = 0, P = 0, Q;
    if (c.type === 'R') { Iab = I = dv / c.value; P = dv * I; }
    else if (c.type === 'V' || c.type === 'W') {
      const k = vsrc.indexOf(c);
      // la incógnita MNA de una fuente es la corriente que entra por su terminal a
      Iab = k >= 0 ? x[N + k] : 0;
      if (c.type === 'V') { I = -Iab; P = c.value * I; } // corriente y potencia entregadas
      else I = Iab;
    } else if (c.type === 'C') { Q = c.value * dv; }
    return { ...c, Va: va, Vb: vb, V: dv, I, Iab, P, Q };
  });
  return { nodeVoltages: V, results, ground };
}

/** Resistencia equivalente vista por la primera fuente: Req = V / I. */
export function equivalentResistance(solution) {
  const src = solution.results.find((r) => r.type === 'V');
  if (!src || Math.abs(src.I) < 1e-15) return Infinity;
  return src.value / src.I;
}

export const series = (...rs) => rs.reduce((s, r) => s + r, 0);
export const parallel = (...rs) => 1 / rs.reduce((s, r) => s + 1 / r, 0);
