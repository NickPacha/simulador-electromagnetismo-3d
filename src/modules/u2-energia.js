// Unidad 2 · Calculadora de energía almacenada en capacitores (y asociaciones serie/paralelo)
import { moduleLayout } from '../ui/layout.js';
import { h, section, slider, select, segmented, resultsTable, theory, numberInput } from '../ui/dom.js';
import { si, fmtNum } from '../ui/format.js';
import { drawPlot, PALETTE } from '../ui/plot.js';
import { energy, seriesC, parallelC } from '../core/capacitor.js';
import { G } from '../core/constants.js';

const UNITS = [[1e-12, 'pF'], [1e-9, 'nF'], [1e-6, 'µF'], [1e-3, 'mF'], [1, 'F']].map(([v, label]) => ({ value: String(v), label }));

export default {
  id: 'energia', unit: 2, icon: '⚡', title: 'Energía almacenada',
  short: 'U = ½CV² y asociación de capacitores en serie y paralelo',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Calculadora de energía almacenada en un capacitor', unit: 'Unidad 2 · Capacitores y dieléctricos', plots: 2,
      desc: 'La energía almacenada es el área bajo la recta Q–V durante la carga. También puedes combinar tres capacitores en serie o en paralelo.',
    });
    const st = { C: 470, unit: 1e-6, V: 12, assoc: 'single', c1: 10, c2: 22, c3: 47, cu: 1e-6 };
    const res = resultsTable([
      ['C', 'Capacitancia (equivalente)'], ['Q', 'Carga Q = CV'], ['U', '<b>Energía U = ½CV²</b>'], ['U2', 'Comprobación Q²/2C'], ['U3', 'Comprobación ½QV'],
      ['h', 'Equivale a elevar 1 kg una altura'], ['led', 'Mantiene un LED de 20 mW durante'],
    ]);
    const assocRes = resultsTable([['c1', 'Capacitor C₁'], ['c2', 'Capacitor C₂'], ['c3', 'Capacitor C₃']]);
    const singleBox = h('div');
    const assocBox = h('div', { style: { display: 'none' } });
    const cIn = numberInput({ label: 'Capacitancia C', value: st.C, step: 1, live: true, onChange: (v) => { if (v > 0) { st.C = v; update(); } } });
    singleBox.append(h('div', { class: 'row' }, cIn.el, select({ label: 'Unidad', value: String(st.unit), options: UNITS, onChange: (v) => { st.unit = +v; update(); } }).el));
    const mk = (key, label) => numberInput({ label, value: st[key], step: 1, live: true, onChange: (v) => { if (v > 0) { st[key] = v; update(); } } }).el;
    assocBox.append(h('div', { class: 'grid3' }, mk('c1', 'C₁'), mk('c2', 'C₂'), mk('c3', 'C₃')),
      select({ label: 'Unidad', value: String(st.cu), options: UNITS, onChange: (v) => { st.cu = +v; update(); } }).el, assocRes.el);
    const diagram = h('canvas', { style: { width: '100%', height: '110px', display: 'block', marginTop: '8px' } });
    assocBox.append(diagram);
    L.panel.append(
      section('Configuración', segmented([{ value: 'single', label: 'Un capacitor' }, { value: 'serie', label: 'Serie' }, { value: 'paralelo', label: 'Paralelo' }], 'single', (v) => {
        st.assoc = v; singleBox.style.display = v === 'single' ? '' : 'none'; assocBox.style.display = v === 'single' ? 'none' : ''; update();
      }), singleBox, assocBox),
      section('Voltaje', slider({ label: 'Voltaje aplicado V', min: 0.1, max: 1000, log: true, value: st.V, format: (v) => si(v, 'V'), onInput: (v) => { st.V = v; update(); } }).el),
      section('Resultados', res.el),
      theory(`<p>Para cargar un capacitor se transporta carga dq contra la diferencia de potencial v = q/C. El trabajo total es:</p>
        <span class="eq">U = ∫₀^Q (q/C) dq = Q²/2C = ½CV² = ½QV</span>
        <p>Gráficamente, U es el <b>área del triángulo</b> bajo la recta Q–V. Esa energía queda almacenada en el campo eléctrico, con densidad u = ½ κ ε₀ E².</p>
        <p><b>Serie:</b> 1/C = 1/C₁ + 1/C₂ + 1/C₃ (misma carga Q en cada uno). <b>Paralelo:</b> C = C₁ + C₂ + C₃ (mismo voltaje V en cada uno).</p>`),
    );

    const ceq = () => {
      if (st.assoc === 'single') return st.C * st.unit;
      const cs = [st.c1, st.c2, st.c3].map((c) => c * st.cu);
      return st.assoc === 'serie' ? seriesC(...cs) : parallelC(...cs);
    };

    // escena principal: gráfica Q–V grande con el área sombreada
    const qv = h('canvas');
    L.stage.append(h('div', { class: 'plot', style: { position: 'absolute', inset: '0' } }, qv));

    function drawDiagram() {
      const r = diagram.getBoundingClientRect(); if (!r.width) return;
      const dpr = Math.min(2, devicePixelRatio || 1); diagram.width = r.width * dpr; diagram.height = 110 * dpr;
      const g = diagram.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = '#cbd5e1'; g.lineWidth = 2; g.fillStyle = '#cbd5e1'; g.font = '11px Inter'; g.textAlign = 'center';
      const W = r.width;
      const cap = (x, y, vertical, label) => {
        g.beginPath();
        if (vertical) { g.moveTo(x - 12, y - 4); g.lineTo(x + 12, y - 4); g.moveTo(x - 12, y + 4); g.lineTo(x + 12, y + 4); }
        else { g.moveTo(x - 4, y - 12); g.lineTo(x - 4, y + 12); g.moveTo(x + 4, y - 12); g.lineTo(x + 4, y + 12); }
        g.stroke(); g.fillText(label, x + (vertical ? 26 : 0), y + (vertical ? 4 : -18));
      };
      if (st.assoc === 'serie') {
        g.beginPath(); g.moveTo(20, 55); g.lineTo(W * 0.25 - 4, 55); g.moveTo(W * 0.25 + 4, 55); g.lineTo(W * 0.5 - 4, 55); g.moveTo(W * 0.5 + 4, 55); g.lineTo(W * 0.75 - 4, 55); g.moveTo(W * 0.75 + 4, 55); g.lineTo(W - 20, 55); g.stroke();
        cap(W * 0.25, 55, false, 'C₁'); cap(W * 0.5, 55, false, 'C₂'); cap(W * 0.75, 55, false, 'C₃');
      } else {
        g.beginPath(); g.moveTo(20, 20); g.lineTo(W - 20, 20); g.moveTo(20, 90); g.lineTo(W - 20, 90);
        [0.3, 0.5, 0.7].forEach((f) => { g.moveTo(W * f, 20); g.lineTo(W * f, 51); g.moveTo(W * f, 59); g.lineTo(W * f, 90); });
        g.stroke();
        cap(W * 0.3, 55, true, 'C₁'); cap(W * 0.5, 55, true, 'C₂'); cap(W * 0.7, 55, true, 'C₃');
      }
      g.fillText('a', 12, st.assoc === 'serie' ? 59 : 24); g.fillText('b', W - 12, st.assoc === 'serie' ? 59 : 94);
    }

    function update() {
      const C = ceq(), V = st.V, Q = C * V, U = energy(C, V);
      res.set('C', si(C, 'F'));
      res.set('Q', si(Q, 'C'));
      res.set('U', `<b>${si(U, 'J')}</b>`);
      res.set('U2', si((Q * Q) / (2 * C), 'J'));
      res.set('U3', si(0.5 * Q * V, 'J'));
      res.set('h', si(U / G, 'm'));
      res.set('led', si(U / 0.02, 's'));
      if (st.assoc !== 'single') {
        const cs = [st.c1, st.c2, st.c3].map((c) => c * st.cu);
        cs.forEach((c, i) => {
          const qi = st.assoc === 'serie' ? Q : c * V;
          const vi = qi / c;
          assocRes.set('c' + (i + 1), `${si(c, 'F')} · V=${si(vi, 'V')} · Q=${si(qi, 'C')} · U=${si(0.5 * qi * vi, 'J')}`);
        });
        drawDiagram();
      }
      // gráfica Q–V con área
      const Vmax = Math.max(V * 1.4, 1);
      const line = [[0, 0], [Vmax, C * Vmax]];
      const area = [[0, 0], [V, Q]];
      drawPlot(qv, { title: 'Proceso de carga: Q = C·V. El área sombreada es la energía almacenada U = ½QV', xlabel: 'Voltaje V (V)', ylabel: 'Carga Q (C)',
        xRange: [0, Vmax], yRange: [0, C * Vmax * 1.05],
        series: [{ data: area, color: 'rgba(0,0,0,0)', fill: 'rgba(56,189,248,0.28)' }, { data: line, color: PALETTE.cyan, width: 2.5, label: `Q = (${si(C, 'F')})·V` }],
        vlines: [{ x: V }], points: [{ x: V, y: Q, color: PALETTE.yellow, label: `U = ${si(U, 'J')}` }] });
      // U vs V
      const ud = []; for (let i = 0; i <= 200; i++) { const v = (Vmax * i) / 200; ud.push([v, energy(C, v)]); }
      drawPlot(L.plots[0], { title: 'U en función de V (parábola: U ∝ V²)', xlabel: 'V (V)', ylabel: 'U (J)', xRange: [0, Vmax], series: [{ data: ud, color: PALETTE.magenta }], points: [{ x: V, y: U, color: PALETTE.yellow }] });
      // U vs C (a V fijo) en escala lineal alrededor del valor actual
      const cd = []; for (let i = 1; i <= 200; i++) { const c = (C * 2 * i) / 200; cd.push([c / C, energy(c, V)]); }
      drawPlot(L.plots[1], { title: 'U en función de C a voltaje fijo (U ∝ C)', xlabel: 'C / C actual', ylabel: 'U (J)', xRange: [0, 2], series: [{ data: cd, color: PALETTE.green }], points: [{ x: 1, y: U, color: PALETTE.yellow }] });
    }
    const ro = new ResizeObserver(() => update());
    ro.observe(L.stage); L.plots.forEach((p) => ro.observe(p.parentElement));
    update();
    return { dispose: () => ro.disconnect(), setAssoc: (v) => { const seg = L.panel.querySelector('.segmented'); [...seg.children][['single', 'serie', 'paralelo'].indexOf(v)].click(); } };
  },
};
