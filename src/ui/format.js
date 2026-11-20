// Formateo de magnitudes físicas con prefijos del SI.
const PREFIXES = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
  [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

export function si(value, unit = '', digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (!isFinite(value)) return (value > 0 ? '∞ ' : '−∞ ') + unit;
  if (value === 0) return `0 ${unit}`.trim();
  const a = Math.abs(value);
  for (const [f, p] of PREFIXES) {
    if (a >= f * 0.9995) return `${fmtNum(value / f, digits)} ${p}${unit}`.trim();
  }
  return `${sci(value, digits)} ${unit}`.trim();
}

export function fmtNum(v, digits = 3) {
  const a = Math.abs(v);
  if (a === 0) return '0';
  const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(a)));
  return v.toFixed(Math.min(decimals, 8)).replace('-', '−');
}

/** Notación científica legible: 1,23 × 10⁻⁴ */
export function sci(v, digits = 3) {
  if (v === 0) return '0';
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -2 && e <= 3) return fmtNum(v, digits + 1);
  const m = v / Math.pow(10, e);
  return `${m.toFixed(digits - 1).replace('-', '−')} × 10${sup(e)}`;
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n) => String(n).split('').map((c) => SUP[c] ?? c).join('');

export const vec = (v, unit = '', digits = 3) => `(${v.map((c) => sci(c, digits)).join(', ')}) ${unit}`.trim();
