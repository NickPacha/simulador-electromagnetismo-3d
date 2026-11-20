// Unidad 1 · Visualizador de cargas puntuales (2D y 3D)
import { moduleLayout } from '../ui/layout.js';
import { h, section, slider, checkbox, button, segmented, resultsTable, theory, fitCanvas, rafThrottle } from '../ui/dom.js';
import { si, fmtNum } from '../ui/format.js';
import { store, presets, MAX_CHARGES } from '../state.js';
import { electricField, electricPotential, systemEnergy } from '../core/electrostatics.js';
import { chargeFieldLines } from '../core/fieldlines.js';
import { marchingSquares } from '../core/contour.js';
import { K } from '../core/constants.js';
import { createScene, polyline, lineArrowHeads, textSprite, THREE } from '../ui/scene3d.js';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

const PRESET_LABELS = [
  ['dipolo', 'Dipolo'], ['iguales', 'Cargas iguales'], ['cuadrupolo', 'Cuadrupolo'], ['asimetrico', 'Asimétrico'],
  ['triangulo', 'Triángulo'], ['placas', 'Línea de cargas'], ['tetraedro3d', 'Tetraedro 3D'],
];

/** Mapa de color divergente para el potencial: azul (−) → fondo → rojo (+). */
function potentialColor(t) {
  // t en [-1, 1]
  const a = Math.min(1, Math.abs(t));
  const base = [11, 16, 32];
  const target = t > 0 ? [239, 68, 68] : [59, 130, 246];
  const hi = t > 0 ? [254, 202, 202] : [191, 219, 254];
  const mix = a < 0.7 ? a / 0.7 : 1;
  const c = base.map((b, i) => b + (target[i] - b) * mix * 0.75);
  if (a >= 0.7) { const f = (a - 0.7) / 0.3; return c.map((v, i) => v + (hi[i] - v) * f * 0.6); }
  return c;
}

export default {
  id: 'cargas', unit: 1, icon: '⊕', title: 'Visualizador de cargas puntuales',
  short: 'Líneas de campo y equipotenciales de hasta 10 cargas en 2D/3D',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Visualizador de cargas puntuales', unit: 'Unidad 1 · Campo eléctrico',
      desc: 'Arrastra las cargas, haz doble clic para agregar una nueva y clic derecho para eliminarla. Alterna entre vista 2D y 3D.',
    });
    const opts = { mode: '2d', lines: true, equip: true, colormap: true, vectors: false, density: 6, surfaces: true, level: 0.5, slice: true };
    let disposeView = null;
    const results = resultsTable([
      ['n', 'Número de cargas'], ['qnet', 'Carga neta'], ['U', 'Energía potencial del sistema U'], ['nl', 'Líneas de campo trazadas'],
    ]);

    // ---------- panel ----------
    const tableBody = h('tbody');
    const renderTable = () => {
      tableBody.innerHTML = '';
      store.charges.forEach((c, i) => {
        const inp = (key, step) => {
          const el = h('input', { type: 'number', step, value: +c[key].toFixed(3) });
          el.addEventListener('change', () => {
            const v = parseFloat(el.value);
            if (isNaN(v)) return;
            const list = store.charges.map((x) => ({ ...x }));
            list[i][key] = key === 'q' ? Math.max(-10, Math.min(10, v)) : Math.max(-4.5, Math.min(4.5, v));
            store.setCharges(list, 'table');
          });
          return h('td', {}, el);
        };
        tableBody.appendChild(h('tr', {},
          h('td', {}, h('span', { class: 'dot', style: { background: c.q >= 0 ? 'var(--pos)' : 'var(--neg)' } }), ' ', i + 1),
          inp('x', 0.1), inp('y', 0.1), inp('z', 0.1), inp('q', 0.5),
          h('td', {}, button('✕', () => store.setCharges(store.charges.filter((_, k) => k !== i)), 'small danger')),
        ));
      });
      addBtn.disabled = store.charges.length >= MAX_CHARGES;
    };
    const addBtn = button('+ Agregar carga', () => {
      if (store.charges.length >= MAX_CHARGES) return;
      const a = Math.random() * Math.PI * 2;
      store.setCharges([...store.charges, { x: +(2 * Math.cos(a)).toFixed(2), y: +(2 * Math.sin(a)).toFixed(2), z: 0, q: store.charges.length % 2 ? -1 : 1 }]);
    });

    const optsBox2d = h('div', {},
      checkbox({ label: 'Líneas de campo', value: opts.lines, onChange: (v) => { opts.lines = v; redraw(); } }).el,
      checkbox({ label: 'Líneas equipotenciales', value: opts.equip, onChange: (v) => { opts.equip = v; redraw(); } }).el,
      checkbox({ label: 'Mapa de color del potencial', value: opts.colormap, onChange: (v) => { opts.colormap = v; redraw(); } }).el,
      checkbox({ label: 'Vectores de campo', value: opts.vectors, onChange: (v) => { opts.vectors = v; redraw(); } }).el,
    );
    const levelSlider = slider({ label: 'Nivel de la superficie |V|', min: 0.05, max: 3, value: opts.level, log: true,
      format: (v) => `${v.toFixed(2)} × V₀`, onInput: (v) => { opts.level = v; redraw(); } });
    const optsBox3d = h('div', { style: { display: 'none' } },
      checkbox({ label: 'Líneas de campo', value: opts.lines, onChange: (v) => { opts.lines = v; redraw(); } }).el,
      checkbox({ label: 'Superficies equipotenciales', value: opts.surfaces, onChange: (v) => { opts.surfaces = v; redraw(); } }).el,
      levelSlider.el,
      h('p', { class: 'note' }, 'V₀ = k·|q|máx / (1 m). Las superficies rojas corresponden a +V y las azules a −V.'),
      checkbox({ label: 'Plano de corte z = 0 (mapa de V)', value: opts.slice, onChange: (v) => { opts.slice = v; redraw(); } }).el,
    );

    L.panel.append(
      section('Vista', segmented([{ value: '2d', label: 'Vista 2D' }, { value: '3d', label: 'Vista 3D' }], '2d', (v) => setMode(v))),
      section('Configuraciones predefinidas', h('div', { class: 'chips' },
        ...PRESET_LABELS.map(([k, lab]) => button(lab, () => { store.setCharges(presets[k]()); if (k === 'tetraedro3d' && opts.mode === '2d') setMode('3d', true); }, 'small')))),
      section(`Cargas (máx. ${MAX_CHARGES})`,
        h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'x (m)'), h('th', {}, 'y (m)'), h('th', {}, 'z (m)'), h('th', {}, 'q (µC)'), h('th'))), tableBody),
        h('div', { class: 'row', style: { marginTop: '8px' } }, addBtn, button('Limpiar', () => store.setCharges([]), 'danger'))),
      section('Opciones de visualización', optsBox2d, optsBox3d,
        slider({ label: 'Densidad de líneas', min: 2, max: 12, step: 1, value: opts.density, format: (v) => `${Math.round(v)} líneas/µC`, onInput: (v) => { opts.density = Math.round(v); redraw(); } }).el),
      section('Resultados', results.el),
      theory(`
        <p><b>Ley de Coulomb y superposición.</b> El campo de un conjunto de cargas puntuales es la suma vectorial de los campos individuales:</p>
        <span class="eq">E(r) = Σ k qᵢ (r − rᵢ) / |r − rᵢ|³</span>
        <p>El potencial es la suma escalar:</p><span class="eq">V(r) = Σ k qᵢ / |r − rᵢ|</span>
        <p>con k = 8,99 × 10⁹ N·m²/C². Las <b>líneas de campo</b> son tangentes a E en cada punto, salen de las cargas positivas y llegan a las negativas; su número es proporcional a |q| (ley de Gauss). Las <b>equipotenciales</b> son perpendiculares a las líneas de campo, porque E = −∇V.</p>
        <p>La energía potencial del sistema es U = Σ<sub>i&lt;j</sub> k qᵢ qⱼ / rᵢⱼ.</p>`),
    );

    // ---------- vista 2D ----------
    function mount2D() {
      const canvas = h('canvas', { style: { cursor: 'crosshair' } });
      const info = h('div', { class: 'overlay tl' }, 'Mueve el cursor para medir E y V');
      const legend = h('div', { class: 'overlay bl' }, h('div', {}, 'Potencial eléctrico'), h('div', { class: 'legend-bar' }), h('div', { style: { display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' } }, h('span', {}, '−V'), h('span', {}, '0'), h('span', {}, '+V')));
      L.stage.append(canvas, info, legend);
      let view = { scale: 80, cx: 0, cy: 0, w: 0, h: 0 };
      let drag = -1, hover = null;
      const toWorld = (px, py) => [(px - view.w / 2) / view.scale, -(py - view.h / 2) / view.scale];
      const toPx = (x, y) => [view.w / 2 + x * view.scale, view.h / 2 - y * view.scale];
      const off = document.createElement('canvas');

      function draw() {
        const { ctx, w, h: hh } = fitCanvas(canvas);
        view.w = w; view.h = hh; view.scale = Math.min(w, hh) / 9;
        ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, hh);
        const charges = store.si();
        const qmax = Math.max(1e-6, ...charges.map((c) => Math.abs(c.q)));
        const Vs = K * qmax / 1.0;
        const cell = 4;
        const nx = Math.ceil(w / cell) + 1, ny = Math.ceil(hh / cell) + 1;
        const grid = new Float64Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const [x, y] = toWorld(i * cell, hh - j * cell);
          grid[j * nx + i] = electricPotential(charges, x, y, 0);
        }
        // mapa de color
        if (opts.colormap && charges.length) {
          off.width = nx; off.height = ny;
          const octx = off.getContext('2d');
          const img = octx.createImageData(nx, ny);
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
            const t = (2 / Math.PI) * Math.atan(grid[j * nx + i] / Vs);
            const c = potentialColor(t);
            const k = ((ny - 1 - j) * nx + i) * 4;
            img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
          }
          octx.putImageData(img, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(off, 0, 0, nx * cell, ny * cell);
        }
        // malla de fondo
        ctx.strokeStyle = 'rgba(148,163,184,0.07)'; ctx.lineWidth = 1;
        for (let x = Math.ceil(-w / 2 / view.scale); x <= w / 2 / view.scale; x++) { const [px] = toPx(x, 0); ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, hh); ctx.stroke(); }
        for (let y = Math.ceil(-hh / 2 / view.scale); y <= hh / 2 / view.scale; y++) { const [, py] = toPx(0, y); ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(148,163,184,0.22)';
        ctx.beginPath(); ctx.moveTo(0, hh / 2); ctx.lineTo(w, hh / 2); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, hh); ctx.stroke();
        ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.font = '11px Inter, sans-serif';
        ctx.fillText('1 m', toPx(1, 0)[0] - 8, hh / 2 + 14);

        // equipotenciales
        if (opts.equip && charges.length) {
          const levels = [0.08, 0.15, 0.25, 0.4, 0.6, 0.9, 1.4, 2.2, 3.5].flatMap((f) => [f * Vs, -f * Vs]);
          const hasBoth = charges.some((c) => c.q > 0) && charges.some((c) => c.q < 0);
          if (hasBoth) levels.push(0);
          ctx.lineWidth = 1.2;
          for (const lv of levels) {
            ctx.strokeStyle = lv === 0 ? 'rgba(255,255,255,0.65)' : lv > 0 ? 'rgba(254,202,202,0.75)' : 'rgba(191,219,254,0.75)';
            ctx.setLineDash(lv === 0 ? [6, 4] : [3, 3]);
            const segs = marchingSquares(grid, nx, ny, lv);
            ctx.beginPath();
            for (const s of segs) { ctx.moveTo(s[0] * cell, hh - s[1] * cell); ctx.lineTo(s[2] * cell, hh - s[3] * cell); }
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        // líneas de campo
        let nlines = 0;
        if (opts.lines && charges.length) {
          const xm = w / 2 / view.scale + 0.5, ym = hh / 2 / view.scale + 0.5;
          const ef = (x, y, z) => electricField(charges, x, y, z);
          const lines = chargeFieldLines(charges, ef, {
            linesPerUnit: opts.density, dims: 2, seedRadius: 0.1, step: 0.03, maxSteps: 1400,
            inBounds: (p) => Math.abs(p[0]) < xm && Math.abs(p[1]) < ym,
          });
          nlines = lines.length;
          ctx.strokeStyle = 'rgba(253,230,138,0.85)'; ctx.fillStyle = 'rgba(253,230,138,0.95)'; ctx.lineWidth = 1.4;
          for (const ln of lines) {
            ctx.beginPath();
            ln.points.forEach((p, i) => { const [px, py] = toPx(p[0], p[1]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
            ctx.stroke();
            // puntas de flecha
            const every = 45;
            for (let i = 25; i < ln.points.length - 2; i += every) {
              const a = ln.points[i], b = ln.points[i + 1];
              let dx = b[0] - a[0], dy = b[1] - a[1];
              if (ln.sign < 0) { dx = -dx; dy = -dy; }
              const ang = Math.atan2(-dy, dx);
              const [px, py] = toPx(a[0], a[1]);
              ctx.save(); ctx.translate(px, py); ctx.rotate(ang);
              ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill();
              ctx.restore();
            }
          }
        }
        // vectores
        if (opts.vectors && charges.length) {
          const sp = 38;
          for (let py = sp / 2; py < hh; py += sp) for (let px = sp / 2; px < w; px += sp) {
            const [x, y] = toWorld(px, py);
            const E = electricField(charges, x, y, 0);
            const m = Math.hypot(E[0], E[1]);
            if (!m) continue;
            const a = Math.min(1, 0.25 + 0.15 * Math.log10(m / 100 + 1));
            const len = 14;
            const ux = E[0] / m, uy = -E[1] / m;
            ctx.strokeStyle = `rgba(167,243,208,${a})`; ctx.lineWidth = 1.3;
            ctx.beginPath(); ctx.moveTo(px - ux * len / 2, py - uy * len / 2); ctx.lineTo(px + ux * len / 2, py + uy * len / 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(px + ux * len / 2, py + uy * len / 2, 2, 0, Math.PI * 2); ctx.fillStyle = `rgba(167,243,208,${a})`; ctx.fill();
          }
        }
        // cargas
        store.charges.forEach((c, i) => {
          const [px, py] = toPx(c.x, c.y);
          const r = 10 + 3 * Math.sqrt(Math.abs(c.q));
          const g = ctx.createRadialGradient(px - r / 3, py - r / 3, 1, px, py, r);
          if (c.q >= 0) { g.addColorStop(0, '#fecaca'); g.addColorStop(1, '#dc2626'); } else { g.addColorStop(0, '#bfdbfe'); g.addColorStop(1, '#2563eb'); }
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = drag === i ? '#fff' : 'rgba(255,255,255,0.5)'; ctx.lineWidth = drag === i ? 2.5 : 1.2; ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(r)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(c.q >= 0 ? '+' : '−', px, py + 1);
          ctx.font = '600 11px Inter, sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(11,16,32,0.9)'; ctx.lineWidth = 3;
          ctx.strokeText(`${c.q > 0 ? '+' : ''}${fmtNum(c.q, 2)} µC`, px, py + r + 11); ctx.fillText(`${c.q > 0 ? '+' : ''}${fmtNum(c.q, 2)} µC`, px, py + r + 11);
          if (Math.abs(c.z) > 1e-6) { ctx.fillStyle = '#fbbf24'; ctx.fillText(`z=${c.z.toFixed(1)}`, px, py - r - 8); }
        });
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        // punto de medición
        if (hover) {
          const [px, py] = toPx(hover[0], hover[1]);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.stroke();
        }
        updateResults(nlines);
      }
      const redraw2 = rafThrottle(draw);

      const pick = (px, py) => store.charges.findIndex((c) => { const [x, y] = toPx(c.x, c.y); return Math.hypot(px - x, py - y) < 14 + 3 * Math.sqrt(Math.abs(c.q)); });
      const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      canvas.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const [px, py] = pos(e); drag = pick(px, py);
        if (drag >= 0) { canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; }
      });
      canvas.addEventListener('pointermove', (e) => {
        const [px, py] = pos(e);
        const [x, y] = toWorld(px, py);
        if (drag >= 0) {
          const list = store.charges.map((c) => ({ ...c }));
          list[drag].x = Math.max(-6, Math.min(6, +x.toFixed(2)));
          list[drag].y = Math.max(-4.4, Math.min(4.4, +y.toFixed(2)));
          store.setCharges(list, 'drag');
        } else {
          canvas.style.cursor = pick(px, py) >= 0 ? 'grab' : 'crosshair';
        }
        hover = [x, y];
        const ch = store.si();
        const E = electricField(ch, x, y, 0), V = electricPotential(ch, x, y, 0);
        info.innerHTML = `Punto (${x.toFixed(2)}, ${y.toFixed(2)}) m<br><b>|E|</b> = ${si(Math.hypot(...E), 'N/C')}<br>E = (${si(E[0], '')}, ${si(E[1], '')}) N/C<br><b>V</b> = ${si(V, 'V')}`;
        if (drag < 0) redraw2();
      });
      const endDrag = () => { if (drag >= 0) { drag = -1; canvas.style.cursor = 'grab'; renderTable(); redraw2(); } };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('dblclick', (e) => {
        const [px, py] = pos(e);
        if (pick(px, py) >= 0 || store.charges.length >= MAX_CHARGES) return;
        const [x, y] = toWorld(px, py);
        store.setCharges([...store.charges, { x: +x.toFixed(2), y: +y.toFixed(2), z: 0, q: e.shiftKey ? -1 : 1 }]);
      });
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const [px, py] = pos(e); const i = pick(px, py);
        if (i >= 0) store.setCharges(store.charges.filter((_, k) => k !== i));
      });
      const ro = new ResizeObserver(redraw2); ro.observe(L.stage);
      draw();
      return { redraw: redraw2, dispose: () => { ro.disconnect(); canvas.remove(); info.remove(); legend.remove(); } };
    }

    // ---------- vista 3D ----------
    function mount3D() {
      const S = createScene(L.stage, { extent: 5, cameraPos: [7.5, 5.5, 9] });
      const info = h('div', { class: 'overlay tl' }, 'Arrastra para rotar · rueda para acercar · clic derecho para desplazar');
      L.stage.append(info);
      const RES = 52, EXT = 5;
      const mkCubes = (color) => {
        const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, shininess: 60 });
        const mc = new MarchingCubes(RES, mat, false, false, 90000);
        mc.scale.set(EXT, EXT, EXT);
        return mc;
      };
      function build() {
        S.clearWorld();
        const charges = store.si();
        const qmax = Math.max(1e-6, ...charges.map((c) => Math.abs(c.q)));
        const Vs = K * qmax;
        // cargas
        store.charges.forEach((c) => {
          const r = 0.16 + 0.06 * Math.sqrt(Math.abs(c.q));
          const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshPhongMaterial({ color: c.q >= 0 ? 0xef4444 : 0x3b82f6, emissive: c.q >= 0 ? 0x7f1d1d : 0x1e3a8a, shininess: 90 }));
          // en Three.js el eje vertical es y; se usa el mismo sistema (x, y, z) del problema
          m.position.set(c.x, c.y, c.z);
          S.world.add(m);
          const lab = textSprite(`${c.q > 0 ? '+' : ''}${fmtNum(c.q, 2)} µC`, c.q >= 0 ? '#fecaca' : '#bfdbfe', 0.32);
          lab.position.set(c.x, c.y + r + 0.3, c.z);
          S.world.add(lab);
        });
        let nlines = 0;
        if (opts.lines && charges.length) {
          const ef = (x, y, z) => electricField(charges, x, y, z);
          const lines = chargeFieldLines(charges, ef, {
            linesPerUnit: Math.max(3, opts.density * 1.6), dims: 3, seedRadius: 0.2, step: 0.05, maxSteps: 700, minLines: 10,
            inBounds: (p) => Math.abs(p[0]) < 6 && Math.abs(p[1]) < 6 && Math.abs(p[2]) < 6,
          });
          nlines = lines.length;
          for (const ln of lines) {
            const cols = [];
            ln.points.forEach((p) => {
              const E = ef(p[0], p[1], p[2]);
              const t = Math.min(1, Math.max(0, Math.log10(Math.hypot(...E) / Vs * 25 + 1) / 1.6));
              cols.push(0.95, 0.75 + 0.2 * t, 0.35 + 0.5 * t);
            });
            S.world.add(polyline(ln.points, 0xfde68a, 0.9, cols));
            const pts = ln.sign < 0 ? ln.points.slice().reverse() : ln.points;
            S.world.add(lineArrowHeads(pts, 0xfde68a, 60, 0.16));
          }
        }
        if (opts.surfaces && charges.length) {
          const pos = mkCubes(0xf87171), neg = mkCubes(0x60a5fa);
          const half = RES / 2;
          const lv = opts.level * Vs;
          for (let k = 0; k < RES; k++) for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
            const x = ((i - half) / half) * EXT, y = ((j - half) / half) * EXT, z = ((k - half) / half) * EXT;
            const V = electricPotential(charges, x, y, z);
            const idx = k * RES * RES + j * RES + i;
            pos.field[idx] = V; neg.field[idx] = -V;
          }
          pos.isolation = lv; neg.isolation = lv;
          pos.update(); neg.update();
          S.world.add(pos, neg);
        }
        if (opts.slice && charges.length) {
          const N = 160;
          const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
          const g = cv.getContext('2d'); const img = g.createImageData(N, N);
          for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
            const x = -EXT + (2 * EXT * i) / (N - 1), y = EXT - (2 * EXT * j) / (N - 1);
            const t = (2 / Math.PI) * Math.atan(electricPotential(charges, x, y, 0) / Vs);
            const c = potentialColor(t); const k = (j * N + i) * 4;
            img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 230;
          }
          g.putImageData(img, 0, 0);
          const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * EXT, 2 * EXT), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
          S.world.add(plane);
        }
        updateResults(nlines);
      }
      let pending = null;
      const rebuild = () => { clearTimeout(pending); pending = setTimeout(build, 40); };
      build();
      return { redraw: rebuild, dispose: () => { clearTimeout(pending); S.dispose(); info.remove(); }, scene: S };
    }

    function updateResults(nlines) {
      const ch = store.si();
      results.set('n', `${ch.length} / ${MAX_CHARGES}`);
      results.set('qnet', si(ch.reduce((s, c) => s + c.q, 0), 'C'));
      results.set('U', si(systemEnergy(ch), 'J'));
      results.set('nl', String(nlines));
    }

    let current = null;
    function setMode(m, force = false) {
      if (m === opts.mode && current && !force) return;
      opts.mode = m;
      if (current) current.dispose();
      optsBox2d.style.display = m === '2d' ? '' : 'none';
      optsBox3d.style.display = m === '3d' ? '' : 'none';
      const seg = L.panel.querySelector('.segmented');
      if (seg) [...seg.children].forEach((b, i) => b.classList.toggle('active', (i === 0) === (m === '2d')));
      current = m === '2d' ? mount2D() : mount3D();
    }
    const redraw = () => current && current.redraw();
    const unsub = store.subscribe((src) => { if (src !== 'table' || true) { if (src !== 'drag') renderTable(); redraw(); } });
    renderTable();
    setMode('2d', true);
    disposeView = () => { unsub(); current && current.dispose(); };
    return { dispose: disposeView, setMode };
  },
};
