// Mini biblioteca de gráficas 2D sobre canvas (ejes, malla, series, puntos, áreas).
import { fitCanvas } from './dom.js';
import { sci } from './format.js';

function niceStep(range, target = 6) {
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return s * mag;
}

function tickLabel(v, step) {
  if (Math.abs(v) < step * 1e-6) return '0';
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-2) return sci(v, 2);
  const dec = Math.max(0, -Math.floor(Math.log10(step)));
  return v.toFixed(dec).replace('-', '−');
}

export const PALETTE = { grid: '#273248', axis: '#8b98b0', text: '#c8d2e3', cyan: '#38bdf8', red: '#f87171', blue: '#60a5fa', yellow: '#fbbf24', green: '#34d399', magenta: '#e879f9', white: '#e5e7eb' };

/**
 * Dibuja una gráfica.
 * cfg = { title, xlabel, ylabel, xRange:[a,b], yRange:[a,b], series:[{data:[[x,y]], color, width, dash, label, fill}],
 *         points:[{x,y,color,label,r}], vlines:[{x,color,label}] }
 */
export function drawPlot(canvas, cfg) {
  const { ctx, w, h } = fitCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  const m = { l: 62, r: 14, t: cfg.title ? 26 : 12, b: 40 };
  const all = (cfg.series || []).flatMap((s) => s.data);
  let [x0, x1] = cfg.xRange || [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  let [y0, y1] = cfg.yRange || [Math.min(0, ...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  (cfg.points || []).forEach((p) => { if (!cfg.yRange) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } });
  if (!isFinite(x0) || !isFinite(x1) || x0 === x1) { x0 = 0; x1 = 1; }
  if (!isFinite(y0) || !isFinite(y1) || y0 === y1) { y0 = y0 === y1 && isFinite(y0) ? y0 - 1 : 0; y1 = y0 + 2; }
  if (!cfg.yRange) { const pad = (y1 - y0) * 0.08; y1 += pad; if (y0 < 0) y0 -= pad; }
  // margen izquierdo según el ancho real de las etiquetas del eje y
  ctx.font = '11px Inter, system-ui, sans-serif';
  {
    const st = niceStep(y1 - y0, 5);
    let mw = 0;
    for (let y = Math.ceil(y0 / st) * st; y <= y1 + st * 1e-9; y += st) mw = Math.max(mw, ctx.measureText(tickLabel(y, st)).width);
    m.l = Math.max(48, mw + 30);
  }
  const pw = w - m.l - m.r, ph = h - m.t - m.b;
  const X = (x) => m.l + ((x - x0) / (x1 - x0)) * pw;
  const Y = (y) => m.t + ph - ((y - y0) / (y1 - y0)) * ph;

  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.lineWidth = 1;
  // malla y marcas
  const sx = niceStep(x1 - x0), sy = niceStep(y1 - y0, 5);
  ctx.strokeStyle = PALETTE.grid; ctx.fillStyle = PALETTE.axis;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let x = Math.ceil(x0 / sx) * sx; x <= x1 + sx * 1e-9; x += sx) {
    ctx.beginPath(); ctx.moveTo(X(x), m.t); ctx.lineTo(X(x), m.t + ph); ctx.stroke();
    ctx.fillText(tickLabel(x, sx), X(x), m.t + ph + 5);
  }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let y = Math.ceil(y0 / sy) * sy; y <= y1 + sy * 1e-9; y += sy) {
    ctx.beginPath(); ctx.moveTo(m.l, Y(y)); ctx.lineTo(m.l + pw, Y(y)); ctx.stroke();
    ctx.fillText(tickLabel(y, sy), m.l - 6, Y(y));
  }
  // ejes en cero
  ctx.strokeStyle = PALETTE.axis;
  if (y0 < 0 && y1 > 0) { ctx.beginPath(); ctx.moveTo(m.l, Y(0)); ctx.lineTo(m.l + pw, Y(0)); ctx.stroke(); }
  if (x0 < 0 && x1 > 0) { ctx.beginPath(); ctx.moveTo(X(0), m.t); ctx.lineTo(X(0), m.t + ph); ctx.stroke(); }
  ctx.strokeRect(m.l, m.t, pw, ph);

  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, pw, ph); ctx.clip();
  for (const s of cfg.series || []) {
    if (!s.data.length) continue;
    if (s.fill) {
      ctx.fillStyle = s.fill;
      ctx.beginPath(); ctx.moveTo(X(s.data[0][0]), Y(Math.max(y0, 0)));
      s.data.forEach((p) => ctx.lineTo(X(p[0]), Y(p[1])));
      ctx.lineTo(X(s.data[s.data.length - 1][0]), Y(Math.max(y0, 0)));
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = s.color || PALETTE.cyan; ctx.lineWidth = s.width || 2;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    s.data.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1]))));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const v of cfg.vlines || []) {
    ctx.strokeStyle = v.color || PALETTE.yellow; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(v.x), m.t); ctx.lineTo(X(v.x), m.t + ph); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const p of cfg.points || []) {
    ctx.fillStyle = p.color || PALETTE.yellow;
    ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r || 5, 0, Math.PI * 2); ctx.fill();
    if (p.label) { ctx.fillStyle = PALETTE.text; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(p.label, X(p.x) + 8, Y(p.y) - 4); }
  }
  ctx.restore();

  // etiquetas
  ctx.fillStyle = PALETTE.text; ctx.font = '12px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  if (cfg.xlabel) ctx.fillText(cfg.xlabel, m.l + pw / 2, h - 4);
  if (cfg.title) { ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.fillText(cfg.title, m.l + pw / 2, 6); }
  if (cfg.ylabel) {
    ctx.save(); ctx.translate(11, m.t + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.font = '12px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(cfg.ylabel, 0, 0); ctx.restore();
  }
  // leyenda
  const labeled = (cfg.series || []).filter((s) => s.label);
  if (labeled.length) {
    ctx.font = '11px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let lx = m.l + 10, ly = m.t + 12;
    const lw = Math.max(...labeled.map((s) => ctx.measureText(s.label).width)) + 36;
    ctx.fillStyle = 'rgba(11,16,32,0.85)'; ctx.fillRect(lx - 6, ly - 9, lw, labeled.length * 16 + 2);
    labeled.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash || []);
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = PALETTE.text; ctx.fillText(s.label, lx + 24, ly);
      ly += 16;
    });
  }
  return { X, Y, x0, x1, y0, y1 };
}
