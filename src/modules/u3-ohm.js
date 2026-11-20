// Unidad 3 · Visualizador de la ley de Ohm en tiempo real (elementos óhmicos y no óhmicos)
import { moduleLayout } from '../ui/layout.js';
import { h, section, slider, segmented, select, resultsTable, theory, fitCanvas } from '../ui/dom.js';
import { si } from '../ui/format.js';
import { drawPlot, PALETTE } from '../ui/plot.js';

const VT = 0.025852; // voltaje térmico a 300 K
const IS = 1e-12, NID = 1.8; // parámetros del diodo (LED/silicio genérico)

/** Corriente del elemento para una fuente V (con resistencia R en serie para diodo). */
function elementCurrent(el, V, R) {
  if (el === 'ohm') return V / R;
  if (el === 'lampara') {
    // filamento: R aumenta con la temperatura, R = R0 (1 + γ P). Iteración de punto fijo.
    let r = R;
    for (let i = 0; i < 60; i++) { const I = V / r; const P = I * I * r; r = 0.5 * r + 0.5 * R * (1 + 0.6 * P); }
    return V / r;
  }
  // diodo con resistencia limitadora: V = I R + n VT ln(I/Is + 1). Bisección.
  if (V <= 0) return -IS * (1 - Math.exp(V / (NID * VT)));
  let lo = 0, hi = V / R;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const f = mid * R + NID * VT * Math.log(mid / IS + 1) - V;
    if (f > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export default {
  id: 'ohm', unit: 3, icon: 'Ω', title: 'Visualizador de la ley de Ohm',
  short: 'Relación V–I–R en tiempo real; óhmico vs. no óhmico',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Visualizador de la ley de Ohm', unit: 'Unidad 3 · Corriente y ley de Ohm', plots: 2,
      desc: 'Varía el voltaje y la resistencia y observa en tiempo real la corriente, el movimiento de los electrones y la curva característica I–V. Compara un resistor con una lámpara y un diodo.',
    });
    const st = { mode: 'dc', V: 6, Vp: 10, f: 0.25, R: 100, el: 'ohm' };
    const res = resultsTable([['V', 'Voltaje aplicado V'], ['I', '<b>Corriente I</b>'], ['Ref', 'Resistencia efectiva V/I'], ['P', 'Potencia P = VI'], ['vd', 'Velocidad de deriva (cobre, 1 mm²)']]);
    const dcBox = h('div'), acBox = h('div', { style: { display: 'none' } });
    dcBox.append(slider({ label: 'Voltaje V', min: -24, max: 24, step: 0.1, value: st.V, unit: 'V', onInput: (v) => { st.V = v; } }).el);
    acBox.append(
      slider({ label: 'Amplitud Vₚ', min: 0.5, max: 24, step: 0.5, value: st.Vp, unit: 'V', onInput: (v) => { st.Vp = v; } }).el,
      slider({ label: 'Frecuencia', min: 0.05, max: 2, step: 0.05, value: st.f, unit: 'Hz', onInput: (v) => { st.f = v; } }).el,
      h('p', { class: 'note' }, 'Frecuencia baja a propósito para poder seguir el fenómeno a simple vista.'));
    L.panel.append(
      section('Fuente', segmented([{ value: 'dc', label: 'Continua' }, { value: 'ac', label: 'Senoidal' }, { value: 'rampa', label: 'Barrido' }], st.mode, (v) => {
        st.mode = v; dcBox.style.display = v === 'dc' ? '' : 'none'; acBox.style.display = v === 'dc' ? 'none' : ''; history.length = 0;
      }), dcBox, acBox),
      section('Elemento',
        select({ label: 'Tipo de elemento', value: st.el, options: [{ value: 'ohm', label: 'Resistor (óhmico)' }, { value: 'lampara', label: 'Lámpara de filamento (no óhmica)' }, { value: 'diodo', label: 'Diodo + resistencia limitadora' }], onChange: (v) => { st.el = v; history.length = 0; } }).el,
        slider({ label: 'Resistencia R (en frío / limitadora)', min: 1, max: 1000, log: true, value: st.R, format: (v) => si(v, 'Ω'), onInput: (v) => { st.R = v; } }).el),
      section('Mediciones', res.el),
      theory(`<p>La <b>ley de Ohm</b> establece que en un conductor óhmico la corriente es proporcional al voltaje:</p>
        <span class="eq">I = V / R</span>
        <p>Su curva I–V es una recta que pasa por el origen con pendiente 1/R. Un elemento es <b>no óhmico</b> si R = V/I cambia con el voltaje: en una lámpara la resistencia aumenta al calentarse el filamento, y un diodo casi no conduce en polarización inversa (I = Iₛ(e^{V/nV_T} − 1)).</p>
        <p>Microscópicamente, I = n q v_d A: los electrones se desplazan con una velocidad de deriva muy pequeña (del orden de mm/s), aunque la señal eléctrica se propague casi a la velocidad de la luz.</p>`),
    );

    const canvas = h('canvas');
    L.stage.append(canvas);
    const history = [];
    let t = 0, phase = 0, raf = 0, last = performance.now();
    const electrons = Array.from({ length: 70 }, (_, i) => i / 70);

    const voltage = () => st.mode === 'dc' ? st.V : st.mode === 'ac' ? st.Vp * Math.sin(2 * Math.PI * st.f * t) : st.Vp * (2 * (((t * st.f) % 1 + 1) % 1) - 1);

    function draw(V, I) {
      const { ctx, w, h: hh } = fitCanvas(canvas);
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, hh);
      const x0 = w * 0.16, x1 = w * 0.84, y0 = hh * 0.2, y1 = hh * 0.8;
      // recorrido del circuito (rectángulo)
      const per = 2 * (x1 - x0) + 2 * (y1 - y0);
      const at = (s) => {
        s = ((s % 1) + 1) % 1 * per;
        if (s < x1 - x0) return [x0 + s, y0]; s -= x1 - x0;
        if (s < y1 - y0) return [x1, y0 + s]; s -= y1 - y0;
        if (s < x1 - x0) return [x1 - s, y1]; s -= x1 - x0;
        return [x0, y1 - s];
      };
      ctx.strokeStyle = '#475569'; ctx.lineWidth = 12; ctx.lineJoin = 'round'; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 8; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      // electrones: se mueven en sentido contrario a la corriente convencional
      ctx.fillStyle = '#60a5fa';
      electrons.forEach((e) => { const [x, y] = at(e); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });
      // fuente (lado izquierdo)
      const cy = (y0 + y1) / 2;
      ctx.fillStyle = '#0b1020'; ctx.fillRect(x0 - 30, cy - 34, 60, 68);
      ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 - 24, cy - 8); ctx.lineTo(x0 + 24, cy - 8); ctx.stroke();
      ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x0 - 13, cy + 8); ctx.lineTo(x0 + 13, cy + 8); ctx.stroke();
      ctx.fillStyle = V >= 0 ? '#f87171' : '#60a5fa'; ctx.font = 'bold 14px Inter'; ctx.textAlign = 'center';
      ctx.fillText(V >= 0 ? '+' : '−', x0 + 36, cy - 12); ctx.fillStyle = '#e5e7eb'; ctx.font = '13px Inter'; ctx.fillText(`${V.toFixed(2)} V`, x0 - 64, cy + 4);
      // elemento (lado derecho)
      const P = Math.abs(V * I);
      const glow = Math.min(1, P / 2);
      ctx.fillStyle = '#0b1020'; ctx.fillRect(x1 - 30, cy - 60, 60, 120);
      ctx.save(); ctx.translate(x1, cy);
      if (st.el === 'ohm') {
        ctx.shadowColor = `rgba(251,146,60,${glow})`; ctx.shadowBlur = 30 * glow;
        ctx.fillStyle = `rgb(${120 + 135 * glow},${90 + 40 * glow},${60})`; ctx.fillRect(-16, -52, 32, 104);
        ctx.shadowBlur = 0;
        ['#a16207', '#7c2d12', '#000', '#ca8a04'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(-16, -36 + i * 18, 32, 7); });
      } else if (st.el === 'lampara') {
        ctx.shadowColor = `rgba(253,224,71,${glow})`; ctx.shadowBlur = 60 * glow;
        ctx.fillStyle = `rgba(253,224,71,${0.15 + 0.85 * glow})`; ctx.beginPath(); ctx.arc(0, -8, 28, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -8, 28, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#64748b'; ctx.fillRect(-12, 20, 24, 22);
      } else {
        ctx.fillStyle = '#e5e7eb'; ctx.beginPath(); ctx.moveTo(-18, -16); ctx.lineTo(18, -16); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill();
        ctx.fillRect(-18, 14, 36, 4);
        ctx.fillStyle = I > 1e-4 ? `rgba(248,113,113,${0.3 + 0.7 * Math.min(1, I / 0.05)})` : 'rgba(100,116,139,0.4)';
        ctx.beginPath(); ctx.arc(0, -40, 9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
      // instrumentos
      const meter = (x, y, label, value, color) => {
        ctx.fillStyle = '#111827'; ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x - 70, y - 26, 140, 52, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = color; ctx.font = 'bold 12px Inter'; ctx.textAlign = 'center'; ctx.fillText(label, x, y - 8);
        ctx.font = '600 17px "JetBrains Mono", Consolas, monospace'; ctx.fillStyle = '#e5e7eb'; ctx.fillText(value, x, y + 15);
      };
      meter((x0 + x1) / 2, y0, 'AMPERÍMETRO', si(I, 'A', 4), '#38bdf8');
      meter(x1 + 0, y1 + 50 > hh - 30 ? y1 - 0 : y1 + 44, 'VOLTÍMETRO', si(V, 'V', 4), '#fbbf24');
      // flecha de corriente convencional
      ctx.fillStyle = '#fca5a5'; ctx.font = '12px Inter'; ctx.textAlign = 'center';
      ctx.fillText(I >= 0 ? 'I convencional →' : '← I convencional', (x0 + x1) / 2, y0 - 40);
      ctx.fillStyle = '#93c5fd'; ctx.fillText('• electrones (se mueven en sentido opuesto)', (x0 + x1) / 2, y1 + 26);
    }

    function plots(V, I) {
      // característica I–V
      const curve = [];
      const vmax = 24;
      for (let i = 0; i <= 240; i++) { const v = -vmax + (2 * vmax * i) / 240; curve.push([v, elementCurrent(st.el, v, st.R) * 1000]); }
      const ohm = st.el === 'ohm' ? null : curve.map(([v]) => [v, (v / st.R) * 1000]);
      const lim = Math.max(...curve.map((p) => Math.abs(p[1])), 1e-3);
      drawPlot(L.plots[0], { title: 'Curva característica I–V', xlabel: 'V (V)', ylabel: 'I (mA)', xRange: [-vmax, vmax], yRange: [-lim * 1.1, lim * 1.1],
        series: [...(ohm ? [{ data: ohm, color: PALETTE.axis, dash: [5, 4], label: `óhmico R = ${si(st.R, 'Ω')}` }] : []), { data: curve, color: PALETTE.cyan, width: 2.5, label: st.el === 'ohm' ? `pendiente 1/R = ${si(1 / st.R, 'S')}` : 'elemento real' }],
        points: [{ x: V, y: I * 1000, color: PALETTE.yellow }] });
      const tw = 10;
      const sub = history.filter((p) => p[0] > t - tw);
      const imax = Math.max(1e-6, ...sub.map((p) => Math.abs(p[2]) * 1000));
      const vmx = Math.max(1, ...sub.map((p) => Math.abs(p[1])));
      const k = vmx / imax;
      drawPlot(L.plots[1], { title: `Registro en tiempo real (I escalada ×${k.toPrecision(2)} para comparar formas)`, xlabel: 't (s)', ylabel: 'V (V)', xRange: [Math.max(0, t - tw), Math.max(tw, t)], yRange: [-vmx * 1.15, vmx * 1.15],
        series: [{ data: sub.map((p) => [p[0], p[1]]), color: PALETTE.yellow, label: 'V(t)' }, { data: sub.map((p) => [p[0], p[2] * 1000 * k]), color: PALETTE.cyan, label: 'I(t)' }] });
    }

    let frame = 0;
    const loop = (now) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; t += dt;
      const V = voltage();
      const I = elementCurrent(st.el, V, st.R);
      history.push([t, V, I]); if (history.length > 2000) history.shift();
      // velocidad visual de los electrones ∝ I (sentido contrario a I)
      const vis = Math.sign(I) * Math.min(0.25, Math.abs(I) * 2.5);
      for (let i = 0; i < electrons.length; i++) electrons[i] = (electrons[i] - vis * dt + 1) % 1;
      draw(V, I);
      if (frame++ % 2 === 0) plots(V, I);
      res.set('V', si(V, 'V'));
      res.set('I', `<b>${si(I, 'A')}</b>`);
      res.set('Ref', Math.abs(I) > 1e-9 ? si(V / I, 'Ω') : '∞');
      res.set('P', si(V * I, 'W'));
      // v_d = I / (n e A), n(Cu) = 8,5e28 m⁻³, A = 1 mm²
      res.set('vd', si(Math.abs(I) / (8.5e28 * 1.602e-19 * 1e-6), 'm/s'));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return { dispose: () => cancelAnimationFrame(raf), set: (o) => Object.assign(st, o) };
  },
};
