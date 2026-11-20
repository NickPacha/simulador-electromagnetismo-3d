// Unidad 3 · Simulador de circuitos de corriente continua (editor en malla + análisis nodal modificado)
import { moduleLayout } from '../ui/layout.js';
import { h, section, button, numberInput, checkbox, theory, fitCanvas } from '../ui/dom.js';
import { si, fmtNum } from '../ui/format.js';
import { solveCircuit, equivalentResistance } from '../core/circuit.js';

const COLS = 9, ROWS = 6;
const N = (i, j) => j * COLS + i;
const TOOLS = [
  { id: 'W', label: '━ Cable' }, { id: 'R', label: '⌇ Resistor' }, { id: 'V', label: '⊣ Fuente' },
  { id: 'C', label: '‖ Capacitor' }, { id: 'select', label: '☝ Seleccionar' }, { id: 'erase', label: '✕ Borrar' },
];
const DEFAULTS = { R: 100, V: 12, C: 10e-6 };

function presetSeries() {
  return [
    ...wires([[1, 1, 2, 1], [3, 1, 4, 1], [5, 1, 6, 1], [6, 1, 7, 1], [7, 1, 7, 2], [7, 3, 7, 4], [1, 1, 1, 2], [1, 3, 1, 4]]),
    ...hline(1, 7, 4),
    { type: 'V', a: N(1, 2), b: N(1, 3), value: 12 },
    { type: 'R', a: N(2, 1), b: N(3, 1), value: 100 },
    { type: 'R', a: N(4, 1), b: N(5, 1), value: 220 },
    { type: 'R', a: N(7, 2), b: N(7, 3), value: 330 },
  ];
}
function presetParallel() {
  const out = [...hline(1, 7, 1), ...hline(1, 7, 4), ...wires([[1, 1, 1, 2], [1, 3, 1, 4]]), { type: 'V', a: N(1, 2), b: N(1, 3), value: 12 }];
  [[3, 100], [5, 220], [7, 330]].forEach(([i, r]) => out.push(...wires([[i, 1, i, 2], [i, 3, i, 4]]), { type: 'R', a: N(i, 2), b: N(i, 3), value: r }));
  return out;
}
function presetMixed() {
  const out = [...wires([[1, 1, 2, 1], [1, 1, 1, 2], [1, 3, 1, 4]]), ...hline(3, 7, 1), ...hline(1, 7, 4),
    { type: 'V', a: N(1, 2), b: N(1, 3), value: 12 }, { type: 'R', a: N(2, 1), b: N(3, 1), value: 100 }];
  [[5, 220], [7, 330]].forEach(([i, r]) => out.push(...wires([[i, 1, i, 2], [i, 3, i, 4]]), { type: 'R', a: N(i, 2), b: N(i, 3), value: r }));
  return out;
}
function presetRC() {
  const out = [...wires([[1, 1, 2, 1], [1, 1, 1, 2], [1, 3, 1, 4]]), ...hline(3, 7, 1), ...hline(1, 7, 4),
    { type: 'V', a: N(1, 2), b: N(1, 3), value: 9 }, { type: 'R', a: N(2, 1), b: N(3, 1), value: 1000 }];
  out.push(...wires([[4, 1, 4, 2], [4, 3, 4, 4]]), { type: 'R', a: N(4, 2), b: N(4, 3), value: 2000 });
  out.push(...wires([[7, 1, 7, 2], [7, 3, 7, 4]]), { type: 'C', a: N(7, 2), b: N(7, 3), value: 47e-6 });
  return out;
}
function presetTwoSources() {
  const out = [...hline(1, 7, 1), ...hline(1, 7, 4), ...wires([[1, 1, 1, 2], [1, 3, 1, 4], [7, 1, 7, 2], [7, 3, 7, 4], [4, 1, 4, 2], [4, 3, 4, 4]])];
  out.push({ type: 'V', a: N(1, 2), b: N(1, 3), value: 12 }, { type: 'V', a: N(7, 2), b: N(7, 3), value: 6 }, { type: 'R', a: N(4, 2), b: N(4, 3), value: 150 });
  // resistencias internas en las ramas superiores
  const idx = out.findIndex((c) => c.type === 'W' && c.a === N(2, 1) && c.b === N(3, 1)); out[idx] = { type: 'R', a: N(2, 1), b: N(3, 1), value: 47 };
  const idx2 = out.findIndex((c) => c.type === 'W' && c.a === N(5, 1) && c.b === N(6, 1)); out[idx2] = { type: 'R', a: N(5, 1), b: N(6, 1), value: 68 };
  return out;
}
function hline(i0, i1, j) { const o = []; for (let i = i0; i < i1; i++) o.push({ type: 'W', a: N(i, j), b: N(i + 1, j), value: 0 }); return o; }
function wires(list) { return list.map(([a, b, c, d]) => ({ type: 'W', a: N(a, b), b: N(c, d), value: 0 })); }

export default {
  id: 'circuitos', unit: 3, icon: '⎓', title: 'Simulador de circuitos',
  short: 'Arma circuitos en serie, paralelo y mixtos; calcula V, I y P',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Simulador de circuitos de corriente continua', unit: 'Unidad 3 · Corriente y ley de Ohm',
      desc: 'Elige una herramienta y haz clic entre dos puntos vecinos de la malla para colocar el componente. El circuito se resuelve al instante por análisis nodal modificado.',
    });
    let comps = presetMixed();
    let tool = 'R', selected = null, hoverEdge = null, sol = null, error = null, showNodes = true;
    const counters = () => { const c = { R: 0, V: 0, C: 0, W: 0 }; return comps.map((x) => `${x.type === 'W' ? 'cable' : x.type}${++c[x.type]}`); };

    // ---------- panel ----------
    const selBox = h('div', { class: 'note' }, 'Usa «Seleccionar» y haz clic sobre un componente para editar su valor.');
    const resBody = h('tbody');
    const summary = h('div');
    L.panel.append(
      section('Circuitos de ejemplo', h('div', { class: 'chips' },
        button('Serie', () => load(presetSeries()), 'small'), button('Paralelo', () => load(presetParallel()), 'small'),
        button('Mixto', () => load(presetMixed()), 'small'), button('Con capacitor', () => load(presetRC()), 'small'),
        button('Dos fuentes', () => load(presetTwoSources()), 'small'), button('Vaciar', () => load([]), 'small danger'))),
      section('Componente seleccionado', selBox),
      section('Resultados por componente',
        h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', { style: { textAlign: 'left' } }, ''), h('th', {}, 'Valor'), h('th', {}, 'V'), h('th', {}, 'I'), h('th', {}, 'P'))), resBody),
        summary,
        checkbox({ label: 'Mostrar voltaje de cada nodo', value: showNodes, onChange: (v) => { showNodes = v; } }).el),
      theory(`<p><b>Ley de Ohm:</b> V = IR. <b>Leyes de Kirchhoff:</b> la suma de corrientes que entran a un nodo es cero (LCK) y la suma de voltajes en una malla cerrada es cero (LVK).</p>
        <p>El simulador usa el <b>análisis nodal modificado (MNA)</b>, el mismo método de SPICE: se plantea una ecuación LCK por nodo y una ecuación por cada fuente, y se resuelve el sistema lineal</p>
        <span class="eq">[ G  B ; Bᵀ  0 ] · [ v ; i ] = [ 0 ; E ]</span>
        <p>por eliminación gaussiana con pivoteo parcial. <b>Serie:</b> R = R₁ + R₂ + … · <b>Paralelo:</b> 1/R = 1/R₁ + 1/R₂ + … · Potencia: P = VI = I²R = V²/R.</p>
        <p>En corriente continua y régimen estacionario, un capacitor no deja pasar corriente (circuito abierto) y almacena Q = CV.</p>`),
    );

    function load(list) { comps = list.map((c) => ({ ...c })); selected = null; solve(); renderSel(); }

    function renderSel() {
      selBox.innerHTML = '';
      if (selected === null || !comps[selected]) { selBox.className = 'note'; selBox.textContent = 'Usa «Seleccionar» y haz clic sobre un componente para editar su valor.'; return; }
      selBox.className = '';
      const c = comps[selected];
      const name = counters()[selected];
      if (c.type === 'W') { selBox.append(h('p', { class: 'note' }, `${name}: cable ideal (R = 0)`), button('Eliminar', () => { comps.splice(selected, 1); selected = null; solve(); renderSel(); }, 'danger')); return; }
      const unit = c.type === 'R' ? 'Ω' : c.type === 'V' ? 'V' : 'µF';
      const val = c.type === 'C' ? c.value * 1e6 : c.value;
      const inp = numberInput({ label: `${name} · ${c.type === 'R' ? 'Resistencia' : c.type === 'V' ? 'Voltaje de la fuente' : 'Capacitancia'}`, value: val, unit, step: c.type === 'V' ? 0.5 : 1, live: true,
        onChange: (v) => { if (isNaN(v) || (c.type !== 'V' && v <= 0)) return; c.value = c.type === 'C' ? v * 1e-6 : v; solve(); } });
      selBox.append(inp.el, h('div', { class: 'row' },
        c.type === 'V' ? button('⇅ Invertir polaridad', () => { [c.a, c.b] = [c.b, c.a]; solve(); }) : null,
        button('Eliminar', () => { comps.splice(selected, 1); selected = null; solve(); renderSel(); }, 'danger')));
    }

    function solve() {
      error = null; sol = null;
      try { if (comps.length) sol = solveCircuit(comps); } catch (e) { error = e.message; }
      resBody.innerHTML = ''; summary.innerHTML = '';
      if (error) { summary.append(h('div', { class: 'warnbox' }, error)); return; }
      if (!sol) return;
      const names = counters();
      let pIn = 0, pOut = 0;
      sol.results.forEach((r, i) => {
        if (r.type === 'W') return;
        if (r.type === 'V') pIn += r.P; else pOut += r.P;
        const val = r.type === 'R' ? si(r.value, 'Ω') : r.type === 'V' ? si(r.value, 'V') : si(r.value, 'F');
        const tr = h('tr', { style: { cursor: 'pointer', background: selected === i ? 'rgba(56,189,248,.12)' : '' }, onClick: () => { selected = i; renderSel(); solve(); } },
          h('td', { style: { textAlign: 'left', fontWeight: 600 } }, names[i]), h('td', {}, val), h('td', {}, si(Math.abs(r.V), 'V')),
          h('td', {}, r.type === 'C' ? `Q=${si(r.Q, 'C')}` : si(Math.abs(r.I), 'A')), h('td', {}, si(Math.abs(r.P), 'W')));
        resBody.appendChild(tr);
      });
      const req = equivalentResistance(sol);
      const nsrc = sol.results.filter((r) => r.type === 'V').length;
      summary.append(h('table', { class: 'results', style: { marginTop: '8px' } }, h('tbody', {},
        nsrc === 1 ? h('tr', {}, h('th', {}, 'Resistencia equivalente vista por la fuente'), h('td', {}, isFinite(req) ? si(req, 'Ω') : '∞ (circuito abierto)')) : null,
        h('tr', {}, h('th', {}, 'Potencia entregada por las fuentes'), h('td', {}, si(pIn, 'W'))),
        h('tr', {}, h('th', {}, 'Potencia disipada en resistencias'), h('td', {}, si(pOut, 'W'))),
        h('tr', {}, h('th', {}, 'Balance de energía'), h('td', { class: Math.abs(pIn - pOut) <= 1e-9 + 1e-6 * Math.abs(pIn) ? 'val ok' : 'val warn' }, Math.abs(pIn - pOut) <= 1e-9 + 1e-6 * Math.abs(pIn) ? '✓ se conserva' : si(pIn - pOut, 'W'))),
      )));
    }

    // ---------- lienzo ----------
    const canvas = h('canvas');
    const toolbar = h('div', { class: 'toolbar' });
    const toolBtns = TOOLS.map((t) => { const b = button(t.label, () => { tool = t.id; toolBtns.forEach((x) => x.classList.remove('active')); b.classList.add('active'); }, 'small'); if (t.id === tool) b.classList.add('active'); toolbar.appendChild(b); return b; });
    L.stage.append(canvas, toolbar, h('div', { class: 'overlay bl' }, 'Los puntos azules indican el sentido real de la corriente convencional; su rapidez es proporcional a |I|.'));
    const geo = { sp: 80, ox: 0, oy: 0 };
    const nodePx = (n) => [geo.ox + (n % COLS) * geo.sp, geo.oy + Math.floor(n / COLS) * geo.sp];
    let phase = 0;

    function edgeAt(px, py) {
      let best = null, bd = geo.sp * 0.32;
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
        if (i < COLS - 1) { const mx = geo.ox + (i + 0.5) * geo.sp, my = geo.oy + j * geo.sp; const d = Math.hypot(px - mx, py - my); if (d < bd) { bd = d; best = [N(i, j), N(i + 1, j)]; } }
        if (j < ROWS - 1) { const mx = geo.ox + i * geo.sp, my = geo.oy + (j + 0.5) * geo.sp; const d = Math.hypot(px - mx, py - my); if (d < bd) { bd = d; best = [N(i, j), N(i, j + 1)]; } }
      }
      return best;
    }
    const findComp = (e) => comps.findIndex((c) => (c.a === e[0] && c.b === e[1]) || (c.a === e[1] && c.b === e[0]));

    function drawComp(ctx, c, i, r) {
      const [x1, y1] = nodePx(c.a), [x2, y2] = nodePx(c.b);
      const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1);
      ctx.save(); ctx.translate(x1, y1); ctx.rotate(ang);
      const sel = selected === i;
      const col = sel ? '#38bdf8' : '#cbd5e1';
      ctx.strokeStyle = col; ctx.lineWidth = sel ? 3 : 2.2; ctx.fillStyle = col;
      const m = len / 2, bodyHalf = Math.min(22, len * 0.3);
      if (c.type === 'W') { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke(); }
      else {
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(m - bodyHalf, 0); ctx.moveTo(m + bodyHalf, 0); ctx.lineTo(len, 0); ctx.stroke();
        if (c.type === 'R') {
          const p = r ? Math.min(1, Math.abs(r.P) / 0.5) : 0;
          if (p > 0.02) { ctx.shadowColor = `rgba(251,146,60,${0.3 + 0.7 * p})`; ctx.shadowBlur = 18 * p; ctx.strokeStyle = `rgb(${203 + 52 * p},${213 - 70 * p},${225 - 160 * p})`; }
          ctx.beginPath(); ctx.moveTo(m - bodyHalf, 0);
          for (let k = 0; k < 6; k++) ctx.lineTo(m - bodyHalf + ((k + 0.5) * 2 * bodyHalf) / 6, k % 2 ? 8 : -8);
          ctx.lineTo(m + bodyHalf, 0); ctx.stroke(); ctx.shadowBlur = 0;
        } else if (c.type === 'V') {
          // terminal positivo en a (inicio del segmento)
          ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(m - bodyHalf, 0); ctx.lineTo(m - 4, 0); ctx.moveTo(m + 4, 0); ctx.lineTo(m + bodyHalf, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(m - 4, -14); ctx.lineTo(m - 4, 14); ctx.stroke();
          ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(m + 4, -7); ctx.lineTo(m + 4, 7); ctx.stroke();
          ctx.save(); ctx.translate(m - 14, -14); ctx.rotate(-ang); ctx.fillStyle = '#f87171'; ctx.font = 'bold 13px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', 0, 0); ctx.restore();
        } else if (c.type === 'C') {
          ctx.beginPath(); ctx.moveTo(m - bodyHalf, 0); ctx.lineTo(m - 5, 0); ctx.moveTo(m + 5, 0); ctx.lineTo(m + bodyHalf, 0); ctx.stroke();
          ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(m - 5, -13); ctx.lineTo(m - 5, 13); ctx.moveTo(m + 5, -13); ctx.lineTo(m + 5, 13); ctx.stroke();
        }
      }
      // puntos de corriente
      if (r && Math.abs(r.Iab) > 1e-12 && sol) {
        const maxI = Math.max(...sol.results.map((x) => Math.abs(x.Iab || 0)));
        const v = 0.25 + 0.75 * Math.abs(r.Iab) / maxI;
        const dir = Math.sign(r.Iab);
        ctx.fillStyle = '#7dd3fc';
        const spacing = 20;
        const off = ((phase * 60 * v * dir) % spacing + spacing) % spacing;
        for (let s = off; s < len; s += spacing) { ctx.beginPath(); ctx.arc(s, 0, 2.6, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
      // etiqueta
      if (c.type !== 'W') {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, vertical = Math.abs(x2 - x1) < 1;
        const txt = c.type === 'R' ? si(c.value, 'Ω', 3) : c.type === 'V' ? si(c.value, 'V', 3) : si(c.value, 'F', 3);
        ctx.font = '600 12px Inter'; ctx.fillStyle = '#e5e7eb'; ctx.textAlign = vertical ? 'left' : 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${names[i]} ${txt}`, mx + (vertical ? 18 : 0), my + (vertical ? 0 : -24));
        if (r) {
          ctx.font = '11px Inter'; ctx.fillStyle = '#7dd3fc';
          const sub = c.type === 'C' ? `Q=${si(r.Q, 'C')}` : `${si(Math.abs(r.I), 'A')}`;
          ctx.fillText(sub, mx + (vertical ? 18 : 0), my + (vertical ? 15 : 24));
        }
      }
    }
    let names = [];
    function draw() {
      const { ctx, w, h: hh } = fitCanvas(canvas);
      geo.sp = Math.min((w - 120) / (COLS - 1), (hh - 130) / (ROWS - 1));
      geo.ox = (w - geo.sp * (COLS - 1)) / 2; geo.oy = 70 + (hh - 100 - geo.sp * (ROWS - 1)) / 2;
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, hh);
      for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const [x, y] = nodePx(N(i, j)); ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }
      if (hoverEdge && tool !== 'select') {
        const [x1, y1] = nodePx(hoverEdge[0]), [x2, y2] = nodePx(hoverEdge[1]);
        ctx.strokeStyle = tool === 'erase' ? 'rgba(248,113,113,0.6)' : 'rgba(56,189,248,0.45)'; ctx.lineWidth = 10; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.lineCap = 'butt';
      }
      names = counters();
      comps.forEach((c, i) => drawComp(ctx, c, i, sol ? sol.results[i] : null));
      // nodos usados
      if (sol) {
        const used = new Set(); comps.forEach((c) => { used.add(c.a); used.add(c.b); });
        const vmax = Math.max(1e-9, ...[...sol.nodeVoltages.values()].map(Math.abs));
        used.forEach((n) => {
          const v = sol.nodeVoltages.get(n) ?? 0; const [x, y] = nodePx(n);
          const t = v / vmax;
          ctx.fillStyle = t >= 0 ? `rgb(${120 + 128 * t},${120 - 40 * t},${140 - 60 * t})` : `rgb(${120 + 40 * t},${120 - 20 * t},${140 - 100 * t})`;
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
          if (n === sol.ground) { ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 8, y + 12); ctx.lineTo(x + 8, y + 12); ctx.moveTo(x - 5, y + 16); ctx.lineTo(x + 5, y + 16); ctx.moveTo(x - 2, y + 20); ctx.lineTo(x + 2, y + 20); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 12); ctx.stroke(); }
        });
        if (showNodes) {
          ctx.font = '10.5px Inter'; ctx.fillStyle = '#fde68a'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          const seen = new Set();
          used.forEach((n) => {
            const v = sol.nodeVoltages.get(n) ?? 0; const key = v.toFixed(4); const [x, y] = nodePx(n);
            if (seen.has(key + '|' + Math.floor(n / COLS))) return; seen.add(key + '|' + Math.floor(n / COLS));
            ctx.fillText(`${fmtNum(v, 3)} V`, x + 6, y - 5);
          });
        }
      }
      if (error) { ctx.fillStyle = '#fca5a5'; ctx.font = '13px Inter'; ctx.textAlign = 'center'; ctx.fillText('⚠ ' + error, w / 2, hh - 20); }
    }

    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointermove', (e) => { hoverEdge = edgeAt(...pos(e)); canvas.style.cursor = hoverEdge ? 'pointer' : 'default'; });
    canvas.addEventListener('pointerleave', () => { hoverEdge = null; });
    canvas.addEventListener('click', (e) => {
      const edge = edgeAt(...pos(e)); if (!edge) return;
      const idx = findComp(edge);
      if (tool === 'select') { selected = idx >= 0 ? idx : null; renderSel(); solve(); return; }
      if (tool === 'erase') { if (idx >= 0) { comps.splice(idx, 1); selected = null; } }
      else {
        const c = { type: tool, a: edge[0], b: edge[1], value: DEFAULTS[tool] ?? 0 };
        if (idx >= 0) comps[idx] = c; else comps.push(c);
        selected = tool === 'W' ? null : (idx >= 0 ? idx : comps.length - 1);
      }
      solve(); renderSel();
    });
    let raf = 0;
    const loop = () => { phase += 1 / 60; draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    solve();
    return { dispose: () => cancelAnimationFrame(raf), load: (k) => load({ serie: presetSeries, paralelo: presetParallel, mixto: presetMixed, rc: presetRC, dos: presetTwoSources }[k]()), select: (i) => { selected = i; renderSel(); solve(); } };
  },
};
