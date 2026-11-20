// Unidad 1 · Calculadora de potencial eléctrico en cualquier punto del espacio
import { moduleLayout } from '../ui/layout.js';
import { h, section, numberInput, button, resultsTable, theory, fitCanvas, rafThrottle, downloadCSV } from '../ui/dom.js';
import { si, sci, fmtNum } from '../ui/format.js';
import { drawPlot, PALETTE } from '../ui/plot.js';
import { store, presets, MAX_CHARGES } from '../state.js';
import { electricField, electricPotential, contributions, systemEnergy } from '../core/electrostatics.js';
import { K } from '../core/constants.js';

export default {
  id: 'potencial', unit: 1, icon: 'V', title: 'Calculadora de potencial',
  short: 'V, E y contribuciones de cada carga en un punto P(x, y, z)',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Calculadora de potencial eléctrico', unit: 'Unidad 1 · Potencial eléctrico', plots: 2,
      desc: 'Define una distribución de cargas y un punto P. Se calcula el potencial, el campo y la contribución de cada carga. Arrastra P sobre el plano para explorar.',
    });
    const P = { x: -0.5, y: 1.2, z: 0 };
    let q0 = 1; // carga de prueba en µC

    const res = resultsTable([
      ['V', 'Potencial total V(P)'], ['E', '|E(P)|'], ['Ex', 'Eₓ'], ['Ey', 'Eᵧ'], ['Ez', 'E_z'], ['dir', 'Dirección de E (plano xy)'],
      ['W', 'Trabajo para traer q₀ desde ∞: W = q₀V'], ['F', 'Fuerza sobre q₀: |F| = |q₀|·|E|'], ['U', 'Energía del sistema de cargas'],
    ]);
    const contribBody = h('tbody');
    const steps = h('div', { class: 'theory-body', style: { padding: '0', fontSize: '12.5px' } });

    // --- tabla de cargas editable (compartida con el visualizador) ---
    const chargeBody = h('tbody');
    const renderCharges = () => {
      chargeBody.innerHTML = '';
      store.charges.forEach((c, i) => {
        const inp = (key) => {
          const el = h('input', { type: 'number', step: key === 'q' ? 0.5 : 0.1, value: +c[key].toFixed(3) });
          el.addEventListener('change', () => {
            const v = parseFloat(el.value); if (isNaN(v)) return;
            const list = store.charges.map((x) => ({ ...x })); list[i][key] = v; store.setCharges(list, 'pot');
          });
          return h('td', {}, el);
        };
        chargeBody.appendChild(h('tr', {}, h('td', {}, `q${i + 1}`), inp('x'), inp('y'), inp('z'), inp('q'),
          h('td', {}, button('✕', () => store.setCharges(store.charges.filter((_, k) => k !== i)), 'small danger'))));
      });
    };
    const px = numberInput({ label: 'x (m)', value: P.x, step: 0.1, live: true, onChange: (v) => { P.x = v; update(); } });
    const py = numberInput({ label: 'y (m)', value: P.y, step: 0.1, live: true, onChange: (v) => { P.y = v; update(); } });
    const pz = numberInput({ label: 'z (m)', value: P.z, step: 0.1, live: true, onChange: (v) => { P.z = v; update(); } });

    L.panel.append(
      section('Distribución de cargas',
        h('p', { class: 'note' }, 'Es la misma configuración del visualizador: los cambios se reflejan en ambos módulos.'),
        h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'x (m)'), h('th', {}, 'y (m)'), h('th', {}, 'z (m)'), h('th', {}, 'q (µC)'), h('th'))), chargeBody),
        h('div', { class: 'row', style: { marginTop: '8px' } },
          button('+ Carga', () => store.charges.length < MAX_CHARGES && store.setCharges([...store.charges, { x: 0, y: -1, z: 0, q: 1 }])),
          button('Dipolo', () => store.setCharges(presets.dipolo())),
          button('Triángulo', () => store.setCharges(presets.triangulo())))),
      section('Punto P', h('div', { class: 'grid3' }, px.el, py.el, pz.el),
        numberInput({ label: 'Carga de prueba q₀', value: q0, step: 0.5, unit: 'µC', live: true, onChange: (v) => { q0 = v; update(); } }).el),
      section('Resultados en P', res.el),
      section('Contribución de cada carga',
        h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'rᵢ (m)'), h('th', {}, 'Vᵢ (V)'), h('th', {}, '|Eᵢ| (N/C)'))), contribBody),
        h('div', { class: 'row', style: { marginTop: '8px' } }, button('Exportar CSV', exportCSV))),
      section('Desarrollo paso a paso', steps),
      theory(`<p>El potencial es una magnitud <b>escalar</b>, por lo que las contribuciones se suman algebraicamente:</p>
        <span class="eq">V(P) = k Σ qᵢ / rᵢ ,  rᵢ = |P − rᵢ|</span>
        <p>El campo es <b>vectorial</b> y se obtiene como E = −∇V, o directamente:</p>
        <span class="eq">E(P) = k Σ qᵢ (P − rᵢ) / rᵢ³</span>
        <p>El trabajo que realiza un agente externo para traer una carga q₀ desde el infinito hasta P, sin cambiar su energía cinética, es W = q₀ V(P).</p>`),
    );

    // --- escena 2D (vista superior, plano z = zP) ---
    const canvas = h('canvas', { style: { cursor: 'move' } });
    L.stage.append(canvas, h('div', { class: 'overlay tl' }, 'Vista del plano xy. Arrastra el punto P (amarillo).'));
    const view = { scale: 80, w: 0, h: 0 };
    const toPx = (x, y) => [view.w / 2 + x * view.scale, view.h / 2 - y * view.scale];
    const toW = (a, b) => [(a - view.w / 2) / view.scale, -(b - view.h / 2) / view.scale];
    function drawScene() {
      const { ctx, w, h: hh } = fitCanvas(canvas);
      view.w = w; view.h = hh; view.scale = Math.min(w, hh) / 9;
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, hh);
      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      for (let x = Math.ceil(-w / 2 / view.scale); x <= w / 2 / view.scale; x++) { const [a] = toPx(x, 0); ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(a, hh); ctx.stroke(); }
      for (let y = Math.ceil(-hh / 2 / view.scale); y <= hh / 2 / view.scale; y++) { const [, b] = toPx(0, y); ctx.beginPath(); ctx.moveTo(0, b); ctx.lineTo(w, b); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.beginPath(); ctx.moveTo(0, hh / 2); ctx.lineTo(w, hh / 2); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, hh); ctx.stroke();
      const ch = store.si();
      const [ppx, ppy] = toPx(P.x, P.y);
      const con = contributions(ch, P.x, P.y, P.z);
      // segmentos rᵢ y vectores Eᵢ
      ch.forEach((c, i) => {
        const [cx, cy] = toPx(c.x, c.y);
        ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ppx, ppy); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px Inter, sans-serif';
        ctx.fillText(`r${i + 1} = ${con[i].r.toFixed(2)} m`, (cx + ppx) / 2 + 6, (cy + ppy) / 2 - 6);
      });
      const E = electricField(ch, P.x, P.y, P.z);
      const Em = Math.hypot(E[0], E[1]);
      const arrowTo = (vx, vy, color, len, width) => {
        const m = Math.hypot(vx, vy); if (!m) return;
        const ux = vx / m, uy = -vy / m;
        const ex = ppx + ux * len, ey = ppy + uy * len;
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(ppx, ppy); ctx.lineTo(ex, ey); ctx.stroke();
        const a = Math.atan2(uy, ux);
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 10 * Math.cos(a - 0.4), ey - 10 * Math.sin(a - 0.4)); ctx.lineTo(ex - 10 * Math.cos(a + 0.4), ey - 10 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
      };
      const maxE = Math.max(Em, ...con.map((c) => Math.hypot(c.E[0], c.E[1])));
      con.forEach((c, i) => arrowTo(c.E[0], c.E[1], ch[i].q >= 0 ? 'rgba(248,113,113,0.75)' : 'rgba(96,165,250,0.75)', 25 + 90 * Math.hypot(c.E[0], c.E[1]) / maxE, 1.6));
      arrowTo(E[0], E[1], '#34d399', 25 + 90 * Em / maxE, 3);
      // cargas
      store.charges.forEach((c, i) => {
        const [cx, cy] = toPx(c.x, c.y);
        ctx.fillStyle = c.q >= 0 ? '#ef4444' : '#3b82f6';
        ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(c.q >= 0 ? '+' : '−', cx, cy + 1);
        ctx.font = '11px Inter'; ctx.fillText(`q${i + 1} = ${fmtNum(c.q, 2)} µC`, cx, cy + 24);
      });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(ppx, ppy, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#fde68a'; ctx.font = 'bold 13px Inter'; ctx.fillText('P', ppx + 10, ppy - 10);
      // leyenda
      ctx.font = '12px Inter'; ctx.fillStyle = '#34d399'; ctx.fillText('— E total en P', 14, hh - 34);
      ctx.fillStyle = '#cbd5e1'; ctx.fillText('— Contribuciones Eᵢ (rojo: q>0, azul: q<0)', 14, hh - 16);
    }

    function drawPlots() {
      const ch = store.si();
      const Vd = [], Ed = [];
      for (let i = 0; i <= 400; i++) {
        const x = -5 + (10 * i) / 400;
        const V = electricPotential(ch, x, P.y, P.z);
        const E = electricField(ch, x, P.y, P.z);
        Vd.push([x, V]); Ed.push([x, Math.hypot(...E)]);
      }
      const VP = electricPotential(ch, P.x, P.y, P.z);
      const lim = Math.max(1, ...Vd.map((p) => Math.abs(p[1])).sort((a, b) => a - b).slice(0, 380));
      drawPlot(L.plots[0], { title: `V(x) sobre la recta y = ${P.y.toFixed(2)} m, z = ${P.z.toFixed(2)} m`, xlabel: 'x (m)', ylabel: 'V (V)', xRange: [-5, 5], yRange: [-lim * 1.1, lim * 1.1],
        series: [{ data: Vd, color: PALETTE.cyan }], points: [{ x: P.x, y: VP, color: PALETTE.yellow, label: 'P' }] });
      const elim = Math.max(1, ...Ed.map((p) => p[1]).sort((a, b) => a - b).slice(0, 380));
      drawPlot(L.plots[1], { title: '|E(x)| sobre la misma recta', xlabel: 'x (m)', ylabel: '|E| (N/C)', xRange: [-5, 5], yRange: [0, elim * 1.1],
        series: [{ data: Ed, color: PALETTE.green }], points: [{ x: P.x, y: Math.hypot(...electricField(ch, P.x, P.y, P.z)), color: PALETTE.yellow, label: 'P' }] });
    }

    function update() {
      const ch = store.si();
      const V = electricPotential(ch, P.x, P.y, P.z);
      const E = electricField(ch, P.x, P.y, P.z);
      const Em = Math.hypot(...E);
      const q0c = q0 * 1e-6;
      res.set('V', `<b>${si(V, 'V')}</b>`);
      res.set('E', si(Em, 'N/C'));
      res.set('Ex', si(E[0], 'N/C')); res.set('Ey', si(E[1], 'N/C')); res.set('Ez', si(E[2], 'N/C'));
      res.set('dir', `${(Math.atan2(E[1], E[0]) * 180 / Math.PI).toFixed(1)}°`);
      res.set('W', si(q0c * V, 'J'));
      res.set('F', si(Math.abs(q0c) * Em, 'N'));
      res.set('U', si(systemEnergy(ch), 'J'));
      const con = contributions(ch, P.x, P.y, P.z);
      contribBody.innerHTML = '';
      con.forEach((c, i) => contribBody.appendChild(h('tr', {}, h('td', {}, `q${i + 1}`), h('td', {}, c.r.toFixed(3)), h('td', {}, sci(c.V, 3)), h('td', {}, sci(c.Emag, 3)))));
      contribBody.appendChild(h('tr', { style: { fontWeight: '700' } }, h('td', {}, 'Σ'), h('td', {}, ''), h('td', {}, sci(V, 3)), h('td', {}, sci(Em, 3) + '*')));
      const terms = store.charges.map((c, i) => `(${fmtNum(c.q, 3)}×10⁻⁶)/${con[i].r.toFixed(3)}`).join(' + ');
      steps.innerHTML = ch.length ? `
        <p>1) Distancias: ${con.map((c, i) => `r${i + 1} = ${c.r.toFixed(3)} m`).join(', ')}.</p>
        <p>2) Potencial: V = k Σ qᵢ/rᵢ = 8,99×10⁹ · [ ${terms} ]</p>
        <p>&nbsp;&nbsp;&nbsp;= 8,99×10⁹ · ${sci(V / K, 4)} = <b>${sci(V, 4)} V</b></p>
        <p>3) Campo: se suman vectorialmente Eᵢ = k qᵢ (P − rᵢ)/rᵢ³ → E = ${'(' + E.map((e) => sci(e, 3)).join(', ') + ')'} N/C, |E| = ${sci(Em, 4)} N/C.</p>
        <p class="note">* |E| total no es la suma de los módulos |Eᵢ|: es el módulo de la suma vectorial.</p>` : '<p>Agrega al menos una carga.</p>';
      redraw();
    }
    function exportCSV() {
      const ch = store.si(); const con = contributions(ch, P.x, P.y, P.z);
      downloadCSV('contribuciones_potencial.csv', ['carga', 'x_m', 'y_m', 'z_m', 'q_C', 'r_m', 'V_V', 'Ex_NC', 'Ey_NC', 'Ez_NC'],
        ch.map((c, i) => [`q${i + 1}`, c.x, c.y, c.z, c.q, con[i].r, con[i].V, ...con[i].E]));
    }
    const redraw = rafThrottle(() => { drawScene(); drawPlots(); });

    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect(); const [a, b] = toPx(P.x, P.y);
      if (Math.hypot(e.clientX - r.left - a, e.clientY - r.top - b) < 16) { dragging = true; canvas.setPointerCapture(e.pointerId); }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = canvas.getBoundingClientRect(); const [x, y] = toW(e.clientX - r.left, e.clientY - r.top);
      P.x = +x.toFixed(2); P.y = +y.toFixed(2); px.value = P.x; py.value = P.y; update();
    });
    canvas.addEventListener('pointerup', () => { dragging = false; });

    const ro = new ResizeObserver(redraw); ro.observe(L.stage); L.plots.forEach((p) => ro.observe(p.parentElement));
    const unsub = store.subscribe(() => { renderCharges(); update(); });
    renderCharges(); update();
    return { dispose: () => { ro.disconnect(); unsub(); }, setPoint: (x, y, z = 0) => { P.x = x; P.y = y; P.z = z; px.value = x; py.value = y; pz.value = z; update(); } };
  },
};
