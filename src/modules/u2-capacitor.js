// Unidad 2 · Simulador de capacitores de placas paralelas con dieléctricos
import { moduleLayout } from '../ui/layout.js';
import { h, section, slider, select, segmented, resultsTable, theory, fitCanvas, rafThrottle } from '../ui/dom.js';
import { si, fmtNum } from '../ui/format.js';
import { drawPlot, PALETTE } from '../ui/plot.js';
import { DIELECTRICS, partialSlab, parallelPlate } from '../core/capacitor.js';
import { EPS0 } from '../core/constants.js';

export default {
  id: 'capacitor', unit: 2, icon: '⊣⊢', title: 'Simulador de capacitores',
  short: 'C según área, distancia y dieléctrico; batería conectada o aislada',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Simulador de capacitores de placas paralelas', unit: 'Unidad 2 · Capacitores y dieléctricos', plots: 2,
      desc: 'Modifica el área, la separación y el material dieléctrico. Compara qué ocurre si el capacitor sigue conectado a la batería (V constante) o si está aislado (Q constante).',
    });
    const st = { A: 100e-4, d: 2e-3, mat: 'vidrio', k: 4.7, fill: 1, V: 100, mode: 'bateria', Qfixed: null };
    st.mat = 'pyrex';
    const mat = () => DIELECTRICS.find((m) => m.id === st.mat);

    const res = resultsTable([
      ['C0', 'Capacitancia sin dieléctrico C₀'], ['C', '<b>Capacitancia C</b>'], ['ratio', 'C / C₀'], ['V', 'Diferencia de potencial V'], ['Q', 'Carga en las placas Q'],
      ['E', 'Campo entre placas E = V/d'], ['sigma', 'Densidad de carga libre σ (zona con dieléctrico)'], ['sb', 'Densidad de carga ligada σᵦ'], ['U', 'Energía almacenada U = ½CV²'], ['u', 'Densidad de energía (zona con dieléctrico)'],
    ]);
    const warn = h('div');
    const vSlider = slider({ label: 'Voltaje de la batería V', min: 1, max: 1000, step: 1, value: st.V, unit: 'V', onInput: (v) => { st.V = v; update(); } });
    L.panel.append(
      section('Conexión', segmented([{ value: 'bateria', label: 'Conectado a la batería (V cte.)' }, { value: 'aislado', label: 'Aislado (Q cte.)' }], st.mode, (v) => {
        if (v === 'aislado') st.Qfixed = capacitance() * st.V;
        st.mode = v; vSlider.input.disabled = v === 'aislado'; update();
      }),
      h('p', { class: 'note' }, 'Al aislar el capacitor se conserva la carga que tenía en ese momento; entonces, al cambiar d o κ, cambia el voltaje.')),
      section('Geometría',
        slider({ label: 'Área de las placas A', min: 1, max: 400, step: 1, value: st.A * 1e4, unit: 'cm²', onInput: (v) => { st.A = v * 1e-4; update(); } }).el,
        slider({ label: 'Separación d', min: 0.1, max: 10, step: 0.05, value: st.d * 1e3, unit: 'mm', onInput: (v) => { st.d = v * 1e-3; update(); } }).el,
        vSlider.el),
      section('Dieléctrico',
        select({ label: 'Material', value: st.mat, options: DIELECTRICS.map((m) => ({ value: m.id, label: `${m.name} (κ = ${m.k})` })), onChange: (v) => { st.mat = v; update(); } }).el,
        slider({ label: 'Fracción insertada del dieléctrico', min: 0, max: 1, step: 0.01, value: st.fill, format: (v) => `${Math.round(v * 100)} %`, onInput: (v) => { st.fill = v; update(); } }).el,
        warn),
      section('Resultados', res.el),
      theory(`<p>Para dos placas de área A separadas una distancia d:</p><span class="eq">C = κ ε₀ A / d</span>
        <p>Un dieléctrico se polariza y crea una carga ligada que reduce el campo dentro del material: E = E₀/κ (si Q es constante). Por eso la capacitancia aumenta κ veces.</p>
        <p>Si el dieléctrico se inserta solo en una fracción f del área, se tienen dos capacitores en <b>paralelo</b>:</p>
        <span class="eq">C = ε₀ A [κ f + (1 − f)] / d</span>
        <p><b>Batería conectada:</b> V fijo ⇒ Q = CV aumenta. <b>Aislado:</b> Q fijo ⇒ V = Q/C disminuye y la energía U = Q²/2C también disminuye (el dieléctrico es atraído hacia el interior).</p>
        <p>Si E supera la <b>rigidez dieléctrica</b> del material se produce la ruptura (chispa).</p>`),
    );

    const capacitance = () => partialSlab(st.A, st.d, mat().k, st.fill);
    const state = () => {
      const C = capacitance();
      const V = st.mode === 'aislado' ? st.Qfixed / C : st.V;
      const Q = C * V;
      const E = V / st.d;
      return { C, V, Q, E, C0: parallelPlate(st.A, st.d, 1) };
    };

    const canvas = h('canvas');
    const info = h('div', { class: 'overlay tr' });
    L.stage.append(canvas, info);
    let phase = 0;
    function draw() {
      const { ctx, w, h: hh } = fitCanvas(canvas);
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, hh);
      const s = state();
      const k = mat().k;
      // escala visual: d de 0,1 a 10 mm → 40 a 300 px; ancho de placa según √A
      const gap = 40 + (Math.min(st.d, 0.01) / 0.01) * 260;
      const plateW = 140 + Math.sqrt(st.A / 0.04) * 420;
      const cx = w / 2 - 40, cy = hh / 2;
      const x0 = cx - plateW / 2, x1 = cx + plateW / 2;
      const top = cy - gap / 2, bot = cy + gap / 2;
      // dieléctrico
      const fillW = plateW * st.fill;
      if (st.fill > 0 && k > 1.0001) {
        const alpha = Math.min(0.55, 0.15 + Math.log10(k) * 0.18);
        ctx.fillStyle = `rgba(167,139,250,${alpha})`;
        ctx.fillRect(x0, top + 2, fillW, gap - 4);
        ctx.strokeStyle = 'rgba(196,181,253,0.8)'; ctx.strokeRect(x0, top + 2, fillW, gap - 4);
        // dipolos inducidos
        const nd = Math.max(3, Math.round(Math.log10(k + 1) * 6));
        ctx.font = '10px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < nd * (fillW / 60); i++) {
          for (let j = 0; j < Math.max(1, Math.floor(gap / 34)); j++) {
            const px = x0 + 25 + i * (60 / nd) * 2; const py = top + 18 + j * 34;
            if (px > x0 + fillW - 12 || py > bot - 12) continue;
            ctx.fillStyle = 'rgba(30,27,75,0.75)'; ctx.beginPath(); ctx.ellipse(px, py, 6, 11, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#93c5fd'; ctx.fillText('−', px, py - 5); ctx.fillStyle = '#fca5a5'; ctx.fillText('+', px, py + 5);
          }
        }
        ctx.fillStyle = '#c4b5fd'; ctx.font = '12px Inter'; ctx.textAlign = 'left';
        ctx.fillText(`${mat().name} (κ = ${k})`, x0 + 6, bot + 34);
      }
      // líneas de campo (densidad ∝ E; dentro del dieléctrico, campo de las cargas libres reducido por la ligada)
      const nLines = Math.max(4, Math.min(60, Math.round(Math.log10(s.E + 10) * 8)));
      for (let i = 0; i < nLines; i++) {
        const x = x0 + ((i + 0.5) / nLines) * plateW;
        ctx.strokeStyle = 'rgba(253,230,138,0.6)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, top + 4); ctx.lineTo(x, bot - 4); ctx.stroke();
        const y = top + 8 + ((phase * 40 + i * 7) % (gap - 16));
        ctx.fillStyle = 'rgba(253,230,138,0.9)'; ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x - 3.5, y - 2); ctx.lineTo(x + 3.5, y - 2); ctx.fill();
      }
      // placas
      const g1 = ctx.createLinearGradient(0, top - 14, 0, top); g1.addColorStop(0, '#fca5a5'); g1.addColorStop(1, '#b91c1c');
      ctx.fillStyle = g1; ctx.fillRect(x0, top - 14, plateW, 14);
      const g2 = ctx.createLinearGradient(0, bot, 0, bot + 14); g2.addColorStop(0, '#1d4ed8'); g2.addColorStop(1, '#93c5fd');
      ctx.fillStyle = g2; ctx.fillRect(x0, bot, plateW, 14);
      // signos: más densos donde hay dieléctrico (σ libre mayor)
      ctx.font = 'bold 13px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sigN = Math.max(4, Math.min(40, Math.round(Math.log10(Math.abs(s.Q) * 1e12 + 1) * 4)));
      for (let i = 0; i < sigN; i++) {
        const fx = (i + 0.5) / sigN; const x = x0 + fx * plateW;
        const inside = fx < st.fill;
        if (!inside && i % Math.max(1, Math.round(k > 2 ? 2 : 1)) && k > 2) continue;
        ctx.fillStyle = '#fff'; ctx.fillText('+', x, top - 7); ctx.fillText('−', x, bot + 7);
      }
      // cables y batería
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
      const bx = x1 + 70;
      ctx.beginPath(); ctx.moveTo(cx, top - 14); ctx.lineTo(cx, top - 50); ctx.lineTo(bx, top - 50); ctx.lineTo(bx, cy - 16);
      ctx.moveTo(cx, bot + 14); ctx.lineTo(cx, bot + 50); ctx.lineTo(bx, bot + 50); ctx.lineTo(bx, cy + 16); ctx.stroke();
      if (st.mode === 'bateria') {
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx - 18, cy - 16); ctx.lineTo(bx + 18, cy - 16); ctx.stroke();
        ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(bx - 10, cy + 2); ctx.lineTo(bx + 10, cy + 2); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, cy + 2); ctx.lineTo(bx, cy + 16); ctx.stroke();
        ctx.fillStyle = '#e5e7eb'; ctx.font = '12px Inter'; ctx.textAlign = 'left'; ctx.fillText(`${fmtNum(st.V, 3)} V`, bx + 24, cy - 2);
      } else {
        ctx.fillStyle = '#fbbf24'; ctx.font = '12px Inter'; ctx.textAlign = 'left'; ctx.fillText('circuito abierto', bx + 10, cy);
        ctx.strokeStyle = '#0b1020'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(bx, cy - 18); ctx.lineTo(bx, cy + 18); ctx.stroke();
      }
      // cotas
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; ctx.fillStyle = '#cbd5e1'; ctx.font = '12px Inter';
      ctx.beginPath(); ctx.moveTo(x0 - 24, top); ctx.lineTo(x0 - 24, bot); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(`d = ${fmtNum(st.d * 1e3, 3)} mm`, x0 - 30, cy);
      ctx.textAlign = 'center'; ctx.fillText(`A = ${fmtNum(st.A * 1e4, 3)} cm²`, cx, top - 26);
      info.innerHTML = `C = <b>${si(s.C, 'F')}</b><br>Q = ${si(s.Q, 'C')}<br>V = ${si(s.V, 'V')}<br>E = ${si(s.E, 'V/m')}`;
    }

    function update() {
      const s = state();
      const k = mat().k;
      res.set('C0', si(s.C0, 'F'));
      res.set('C', `<b>${si(s.C, 'F')}</b>`);
      res.set('ratio', fmtNum(s.C / s.C0, 4));
      res.set('V', si(s.V, 'V'));
      res.set('Q', si(s.Q, 'C'));
      res.set('E', si(s.E, 'V/m'));
      const sigmaFree = k * EPS0 * s.E;
      res.set('sigma', si(st.fill > 0 ? sigmaFree : EPS0 * s.E, 'C/m²'));
      res.set('sb', st.fill > 0 ? si(sigmaFree * (1 - 1 / k), 'C/m²') : '0');
      res.set('U', si(0.5 * s.C * s.V * s.V, 'J'));
      res.set('u', si(0.5 * (st.fill > 0 ? k : 1) * EPS0 * s.E * s.E, 'J/m³'));
      const Emax = st.fill > 0 ? Math.min(mat().Emax, 3e6 * (st.fill < 1 ? 1 : Infinity)) : 3e6;
      warn.innerHTML = '';
      if (s.E > Emax) warn.appendChild(h('div', { class: 'warnbox' }, `⚡ Ruptura dieléctrica: E = ${si(s.E, 'V/m')} supera la rigidez dieléctrica (${si(Emax, 'V/m')}). En un capacitor real saltaría una chispa.`));
      else warn.appendChild(h('div', { class: 'okbox' }, `Rigidez dieléctrica: ${isFinite(Emax) ? si(Emax, 'V/m') : '∞ (vacío ideal)'} · margen ${isFinite(Emax) ? Math.round((1 - s.E / Emax) * 100) + ' %' : '—'}`));
      plots();
    }

    function plots() {
      const s = state(); const k = mat().k;
      const data = [], data0 = [];
      for (let i = 1; i <= 200; i++) {
        const d = (i / 200) * 10e-3;
        data.push([d * 1e3, partialSlab(st.A, d, k, st.fill) * 1e12]);
        data0.push([d * 1e3, parallelPlate(st.A, d, 1) * 1e12]);
      }
      const ymax = Math.min(data[0][1], partialSlab(st.A, 0.4e-3, k, st.fill) * 1e12) * 1.1;
      drawPlot(L.plots[0], { title: 'C en función de la separación d (C ∝ 1/d)', xlabel: 'd (mm)', ylabel: 'C (pF)', xRange: [0, 10], yRange: [0, Math.max(ymax, s.C * 1e12 * 1.2)],
        series: [{ data: data0, color: PALETTE.axis, dash: [5, 4], label: 'vacío' }, { data, color: PALETTE.cyan, label: 'con dieléctrico' }],
        points: [{ x: st.d * 1e3, y: s.C * 1e12, color: PALETTE.yellow, label: si(s.C, 'F') }] });
      const kd = [];
      for (let f = 0; f <= 1.0001; f += 0.02) kd.push([f * 100, partialSlab(st.A, st.d, k, f) * 1e12]);
      const qd = kd.map(([f, c]) => [f, (st.mode === 'aislado' ? st.Qfixed : c * 1e-12 * st.V) / (c * 1e-12)]);
      drawPlot(L.plots[1], { title: st.mode === 'aislado' ? 'V al insertar el dieléctrico (Q constante)' : 'C al insertar el dieléctrico (V constante)', xlabel: 'Fracción insertada (%)',
        ylabel: st.mode === 'aislado' ? 'V (V)' : 'C (pF)', xRange: [0, 100],
        series: [{ data: st.mode === 'aislado' ? qd : kd, color: PALETTE.magenta }],
        points: [{ x: st.fill * 100, y: st.mode === 'aislado' ? s.V : s.C * 1e12, color: PALETTE.yellow }] });
      redraw();
    }
    const redraw = rafThrottle(draw);
    let raf = 0;
    const loop = () => { phase += 0.01; draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(plots); L.plots.forEach((p) => ro.observe(p.parentElement));
    update();
    return { dispose: () => { cancelAnimationFrame(raf); ro.disconnect(); } };
  },
};
