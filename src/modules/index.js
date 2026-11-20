// Registro de módulos del simulador, organizados por unidad del sílabo.
import cargas from './u1-cargas.js';
import potencial from './u1-potencial.js';
import trayectoria from './u1-trayectoria.js';
import capacitor from './u2-capacitor.js';
import energia from './u2-energia.js';
import circuitos from './u3-circuitos.js';
import ohm from './u3-ohm.js';
import campoB from './u4-campo-b.js';
import lorentz from './u4-lorentz.js';

export const UNITS = [
  { n: 1, short: 'Campo eléctrico', title: 'Electricidad, campo eléctrico y potencial eléctrico' },
  { n: 2, short: 'Capacitores', title: 'Capacitores y dieléctricos' },
  { n: 3, short: 'Corriente', title: 'Corriente eléctrica y ley de Ohm' },
  { n: 4, short: 'Magnetismo', title: 'Fuerza y campo magnético' },
];

export const MODULES = [cargas, potencial, trayectoria, capacitor, energia, circuitos, ohm, campoB, lorentz];
