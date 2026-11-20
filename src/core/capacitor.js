// Capacitores de placas paralelas y dieléctricos.
import { EPS0 } from './constants.js';

/** Materiales dieléctricos: constante κ y rigidez dieléctrica (campo de ruptura) [V/m]. */
export const DIELECTRICS = [
  { id: 'vacio', name: 'Vacío', k: 1.0, Emax: Infinity },
  { id: 'aire', name: 'Aire (1 atm)', k: 1.00059, Emax: 3e6 },
  { id: 'teflon', name: 'Teflón', k: 2.1, Emax: 60e6 },
  { id: 'polietileno', name: 'Polietileno', k: 2.25, Emax: 50e6 },
  { id: 'papel', name: 'Papel', k: 3.7, Emax: 16e6 },
  { id: 'pyrex', name: 'Vidrio Pyrex', k: 4.7, Emax: 14e6 },
  { id: 'mica', name: 'Mica', k: 5.4, Emax: 100e6 },
  { id: 'porcelana', name: 'Porcelana', k: 6.5, Emax: 12e6 },
  { id: 'silicio', name: 'Silicio', k: 11.7, Emax: 30e6 },
  { id: 'agua', name: 'Agua (20 °C)', k: 80.4, Emax: 65e6 },
  { id: 'srtio3', name: 'Titanato de estroncio', k: 310, Emax: 8e6 },
];

/** C = κ ε0 A / d */
export const parallelPlate = (A, d, k = 1) => (k * EPS0 * A) / d;

/**
 * Dieléctrico insertado lateralmente una fracción f del área: dos capacitores en paralelo.
 * C = ε0 A [κ f + (1 − f)] / d
 */
export const partialSlab = (A, d, k, f) => (EPS0 * A * (k * f + (1 - f))) / d;

/** Dieléctrico de espesor t < d apoyado sobre una placa: dos capacitores en serie. */
export const seriesSlab = (A, d, k, t) => (EPS0 * A) / (d - t + t / k);

export const energy = (C, V) => 0.5 * C * V * V;           // U = ½ C V²
export const energyFromQ = (Q, C) => (Q * Q) / (2 * C);    // U = Q² / 2C
export const energyDensity = (E, k = 1) => 0.5 * k * EPS0 * E * E; // u = ½ κ ε0 E²

export const seriesC = (...cs) => 1 / cs.reduce((s, c) => s + 1 / c, 0);
export const parallelC = (...cs) => cs.reduce((s, c) => s + c, 0);
