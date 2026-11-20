// Estado compartido entre módulos (por ejemplo, la distribución de cargas
// del visualizador se puede reutilizar en la calculadora y en el simulador de trayectorias).

export const MAX_CHARGES = 10;

export const presets = {
  dipolo: () => [{ x: -1.5, y: 0, z: 0, q: 2 }, { x: 1.5, y: 0, z: 0, q: -2 }],
  iguales: () => [{ x: -1.5, y: 0, z: 0, q: 2 }, { x: 1.5, y: 0, z: 0, q: 2 }],
  cuadrupolo: () => [
    { x: -1.4, y: -1.4, z: 0, q: 2 }, { x: 1.4, y: 1.4, z: 0, q: 2 },
    { x: -1.4, y: 1.4, z: 0, q: -2 }, { x: 1.4, y: -1.4, z: 0, q: -2 },
  ],
  asimetrico: () => [{ x: -1.2, y: 0, z: 0, q: 4 }, { x: 1.6, y: 0, z: 0, q: -1 }],
  placas: () => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      out.push({ x: -2 + i, y: 1.2, z: 0, q: 1 });
      out.push({ x: -2 + i, y: -1.2, z: 0, q: -1 });
    }
    return out;
  },
  triangulo: () => [
    { x: 0, y: 1.8, z: 0, q: 2 }, { x: -1.6, y: -1, z: 0, q: 2 }, { x: 1.6, y: -1, z: 0, q: -3 },
  ],
  tetraedro3d: () => [
    { x: 1.2, y: 1.2, z: 1.2, q: 2 }, { x: -1.2, y: -1.2, z: 1.2, q: -2 },
    { x: -1.2, y: 1.2, z: -1.2, q: -2 }, { x: 1.2, y: -1.2, z: -1.2, q: 2 },
  ],
};

export const store = {
  // q en microcoulombs (µC), posiciones en metros
  charges: presets.dipolo(),
  listeners: new Set(),
  setCharges(list, source = null) {
    this.charges = list.slice(0, MAX_CHARGES).map((c) => ({ x: +c.x, y: +c.y, z: +(c.z || 0), q: +c.q }));
    this.listeners.forEach((fn) => fn(source));
  },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  /** Cargas en unidades SI (C) para los cálculos. */
  si() { return this.charges.map((c) => ({ x: c.x, y: c.y, z: c.z, q: c.q * 1e-6 })); },
};
