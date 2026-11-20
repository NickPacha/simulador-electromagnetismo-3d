// Unidad 4 · Simulador de la fuerza de Lorentz: partícula en campos E y B cruzados (empujador de Boris)
import { moduleLayout } from '../ui/layout.js';
import { h, section, slider, select, numberInput, button, resultsTable, theory, downloadCSV } from '../ui/dom.js';
import { si, sci } from '../ui/format.js';
import { drawPlot, PALETTE } from '../ui/plot.js';
import { createScene, polyline, arrow, textSprite, THREE } from '../ui/scene3d.js';
import { borisStep, borisInit } from '../core/integrators.js';
import { E_CHARGE, M_ELECTRON, M_PROTON, M_ALPHA, M_DEUTERON } from '../core/constants.js';

const U = 1.66053906660e-27;
const PARTICLES = {
  proton: { label: 'Protón', q: E_CHARGE, m: M_PROTON, color: 0xf87171 },
  electron: { label: 'Electrón', q: -E_CHARGE, m: M_ELECTRON, color: 0x60a5fa },
  deuteron: { label: 'Deuterón', q: E_CHARGE, m: M_DEUTERON, color: 0xfbbf24 },
  alpha: { label: 'Partícula alfa', q: 2 * E_CHARGE, m: M_ALPHA, color: 0xa78bfa },
  he3: { label: 'Ion ³He⁺', q: E_CHARGE, m: 3.016 * U, color: 0x34d399 },
  he4: { label: 'Ion ⁴He⁺', q: E_CHARGE, m: 4.0026 * U, color: 0xe879f9 },
};
const COLORS = ['#f87171', '#fbbf24', '#34d399', '#e879f9'];

const PRESETS = {
  circular: { label: 'Movimiento circular (v ⊥ B)', particle: 'proton', E: [0, 0, 0], B: [0, 0, 0.01], v: [1e5, 0, 0], periods: 2 },
  helice: { label: 'Hélice (v con componente ∥ B)', particle: 'proton', E: [0, 0, 0], B: [0, 0, 0.01], v: [1e5, 0, 3e4], periods: 4 },
  cicloide: { label: 'Cicloide: deriva E × B', particle: 'proton', E: [0, 1000, 0], B: [0, 0, 0.01], v: [0, 0, 0], periods: 4 },
  selector: { label: 'Selector de velocidades (v = E/B)', particle: 'proton', E: [0, 1000, 0], B: [0, 0, 0.01], v: [1e5, 0, 0], periods: 2 },
  selector2: { label: 'Selector con v ≠ E/B (desviada)', particle: 'proton', E: [0, 1000, 0], B: [0, 0, 0.01], v: [1.5e5, 0, 0], periods: 2 },
  electron: { label: 'Electrón en B uniforme', particle: 'electron', E: [0, 0, 0], B: [0, 0, 1e-4], v: [2e6, 0, 5e5], periods: 3 },
  espectrometro: { label: 'Espectrómetro de masas (4 iones)', particle: 'multi', E: [0, 0, 0], B: [0, 0, 0.05], v: [0, 0, 0], periods: 0.5, Vacc: 1000 },
};

export default {
  id: 'lorentz', unit: 4, icon: '⟲', title: 'Simulador de fuerza de Lorentz',
  short: 'Trayectorias en campos E y B cruzados: círculo, hélice, cicloide',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Fuerza de Lorentz: partícula en campos E y B', unit: 'Unidad 4 · Fuerza y campo magnético', plots: 2,
      desc: 'F = q(E + v × B). Elige un experimento predefinido o escribe tus propios vectores. La trayectoria se integra con el algoritmo de Boris, que conserva la energía en un campo magnético puro.',
    });
    const st = JSON.parse(JSON.stringify(PRESETS.circular));
    st.preset = 'circular';
    let sims = [], anim = 0, playing = true, speed = 1;

    const res = resultsTable([
      ['v0', '|v₀|'], ['vpar', 'v∥ (paralela a B)'], ['vperp', 'v⊥ (perpendicular a B)'], ['r', '<b>Radio de Larmor r = mv⊥/|q|B</b>'], ['T', 'Período ciclotrónico T = 2πm/|q|B'],
      ['f', 'Frecuencia ciclotrónica f'], ['pitch', 'Paso de la hélice v∥·T'], ['vd', 'Velocidad de deriva E×B/B²'], ['F0', 'Fuerza inicial |F|'], ['dK', 'Energía: ΔK/K₀ (numérico)'],
    ]);
    const multiBox = h('div');
    const vecInputs = {};
    const vecRow = (key, label, unit) => {
      vecInputs[key] = [0, 1, 2].map((i) => numberInput({ label: ['x', 'y', 'z'][i], value: st[key][i], step: 'any', onChange: (v) => { if (!isNaN(v)) { st[key][i] = v; st.preset = 'custom'; run(); } } }));
      return h('div', {}, h('div', { class: 'control-label' }, `${label} (${unit})`), h('div', { class: 'grid3' }, ...vecInputs[key].map((x) => x.el)));
    };
    const partSel = select({ label: 'Partícula', value: st.particle, options: [...Object.entries(PARTICLES).map(([k, p]) => ({ value: k, label: `${p.label} (q = ${sci(p.q / E_CHARGE, 2)} e)` })), { value: 'multi', label: 'Varios iones (espectrómetro)' }],
      onChange: (v) => { st.particle = v; run(); } });
    const presetSel = select({ label: 'Experimento', value: 'circular', options: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label })), onChange: (v) => applyPreset(v) });
    const perSlider = slider({ label: 'Duración (períodos ciclotrónicos)', min: 0.5, max: 10, step: 0.5, value: st.periods, onInput: (v) => { st.periods = v; run(); } });
    const playBtn = button('⏸ Pausa', () => { playing = !playing; playBtn.textContent = playing ? '⏸ Pausa' : '▶ Continuar'; });
    L.panel.append(
      section('Experimento', presetSel.el, partSel.el, multiBox),
      section('Campos y velocidad inicial', vecRow('E', 'Campo eléctrico E', 'V/m'), vecRow('B', 'Campo magnético B', 'T'), vecRow('v', 'Velocidad inicial v₀', 'm/s'), perSlider.el),
      section('Animación', h('div', { class: 'row' }, button('↻ Relanzar', () => { anim = 0; playing = true; playBtn.textContent = '⏸ Pausa'; }, 'primary'), playBtn),
        slider({ label: 'Velocidad de reproducción', min: 0.25, max: 4, step: 0.25, value: 1, format: (v) => `${v}×`, onInput: (v) => { speed = v; } }).el,
        button('Exportar trayectoria (CSV)', () => sims[0] && downloadCSV('lorentz.csv', ['t_s', 'x_m', 'y_m', 'z_m', 'vx', 'vy', 'vz'], sims[0].t.map((t, i) => [t, ...sims[0].pos[i], ...sims[0].vel[i]])))),
      section('Resultados', res.el),
      theory(`<p>Una carga q que se mueve con velocidad v en campos E y B siente la <b>fuerza de Lorentz</b>:</p>
        <span class="eq">F = q (E + v × B)</span>
        <p>La parte magnética es siempre perpendicular a v: no realiza trabajo y solo cambia la dirección. Con B uniforme y E = 0 la partícula gira con radio r = mv⊥/(|q|B) y período T = 2πm/(|q|B), independiente de la rapidez (principio del ciclotrón). Si v tiene componente paralela a B, la trayectoria es una <b>hélice</b>.</p>
        <p>Con E ⊥ B aparece una deriva con velocidad v_d = E × B / B², independiente de q y m (cicloide). Si v = E/B la fuerza neta es nula: <b>selector de velocidades</b>.</p>
        <p><b>Algoritmo de Boris:</b> v⁻ = vₙ + (qE/m)Δt/2 → rotación de v⁻ alrededor de B → v⁺ → vₙ₊₁ = v⁺ + (qE/m)Δt/2; xₙ₊₁ = xₙ + vₙ₊₁Δt. Conserva |v| exactamente cuando E = 0.</p>`),
    );

    function applyPreset(k) {
      const p = JSON.parse(JSON.stringify(PRESETS[k]));
      Object.assign(st, p); st.preset = k;
      presetSel.value = k; partSel.value = st.particle; perSlider.value = st.periods;
      ['E', 'B', 'v'].forEach((key) => vecInputs[key].forEach((inp, i) => (inp.value = st[key][i])));
      run();
    }

    const S = createScene(L.stage, { extent: 4, cameraPos: [6, 5, 7.5], zUp: true });
    const info = h('div', { class: 'overlay tl' });
    const legend = h('div', { class: 'overlay bl' }, h('span', { style: { color: '#fde047' } }, '→ E'), ' · ', h('span', { style: { color: '#22d3ee' } }, '→ B'), ' · ', h('span', { style: { color: '#e5e7eb' } }, '→ v'), ' · ', h('span', { style: { color: '#e879f9' } }, '→ F'));
    L.stage.append(info, legend);
    let scale = 1, dyn = null, center = [0, 0, 0];

    function simulate(part, v0, Tc, tTotal) {
      const qm = part.q / part.m;
      const steps = Math.min(20000, Math.max(400, Math.round((tTotal / (Tc || tTotal)) * 240)));
      const dt = tTotal / steps;
      let pos = [0, 0, 0], vel = borisInit(v0.slice(), qm, st.E, st.B, dt);
      const out = { t: [0], pos: [pos], vel: [v0.slice()], part };
      for (let i = 0; i < steps; i++) {
        const r = borisStep(pos, vel, qm, st.E, st.B, dt);
        pos = r.pos; vel = r.vel;
        out.t.push((i + 1) * dt); out.pos.push(pos); out.vel.push(vel);
      }
      return out;
    }

    function run() {
      const Bm = Math.hypot(...st.B);
      let parts;
      if (st.particle === 'multi') {
        const Vacc = st.Vacc || 1000;
        parts = ['proton', 'deuteron', 'he3', 'he4'].map((k) => { const p = PARTICLES[k]; return { p, v: [Math.sqrt((2 * Math.abs(p.q) * Vacc) / p.m), 0, 0] }; });
        multiBox.innerHTML = '';
        multiBox.append(h('p', { class: 'note' }, `Iones acelerados con ${Vacc} V entran en x = 0 con velocidad +x. Su radio r = √(2mV/q)/B depende de la masa: así se separan los isótopos.`));
      } else {
        multiBox.innerHTML = '';
        parts = [{ p: PARTICLES[st.particle], v: st.v.slice() }];
      }
      const ref = parts[0];
      const Tc = Bm > 0 ? (2 * Math.PI * ref.p.m) / (Math.abs(ref.p.q) * Bm) : 0;
      const tTotal = Bm > 0 ? st.periods * Tc : 2e-6 * st.periods;
      sims = parts.map((pp) => simulate(pp.p, pp.v, Tc, tTotal));
      // escala automática para que la trayectoria quepa en la escena
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      sims.forEach((s) => s.pos.forEach((p) => { for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); } }));
      center = [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2);
      const ext = Math.max(1e-12, ...[0, 1, 2].map((c) => (hi[c] - lo[c]) / 2));
      scale = 3.6 / ext;
      buildScene();
      anim = 0; playing = true; playBtn.textContent = '⏸ Pausa';
      // resultados de la partícula de referencia
      const v0 = ref.v, p = ref.p;
      const vm = Math.hypot(...v0);
      const bh = Bm > 0 ? st.B.map((b) => b / Bm) : [0, 0, 0];
      const vpar = v0[0] * bh[0] + v0[1] * bh[1] + v0[2] * bh[2];
      const vperp = Math.sqrt(Math.max(0, vm * vm - vpar * vpar));
      const ExB = [st.E[1] * st.B[2] - st.E[2] * st.B[1], st.E[2] * st.B[0] - st.E[0] * st.B[2], st.E[0] * st.B[1] - st.E[1] * st.B[0]];
      const vd = Bm > 0 ? ExB.map((c) => c / (Bm * Bm)) : [0, 0, 0];
      const F = [0, 1, 2].map((i) => p.q * (st.E[i] + [v0[1] * st.B[2] - v0[2] * st.B[1], v0[2] * st.B[0] - v0[0] * st.B[2], v0[0] * st.B[1] - v0[1] * st.B[0]][i]));
      res.set('v0', si(vm, 'm/s'));
      res.set('vpar', si(Math.abs(vpar), 'm/s'));
      res.set('vperp', si(vperp, 'm/s'));
      res.set('r', Bm > 0 ? `<b>${si((p.m * vperp) / (Math.abs(p.q) * Bm), 'm')}</b>` : '— (B = 0)');
      res.set('T', Bm > 0 ? si(Tc, 's') : '—');
      res.set('f', Bm > 0 ? si(1 / Tc, 'Hz') : '—');
      res.set('pitch', Bm > 0 ? si(Math.abs(vpar) * Tc, 'm') : '—');
      res.set('vd', Bm > 0 ? `${si(Math.hypot(...vd), 'm/s')} (${vd.map((c) => sci(c, 2)).join(', ')})` : '—');
      res.set('F0', si(Math.hypot(...F), 'N'));
      const s0 = sims[0];
      const K = (v) => 0.5 * p.m * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
      const K0 = K(s0.vel[0]), Kf = K(s0.vel[s0.vel.length - 1]);
      const Emag = Math.hypot(...st.E);
      res.set('dK', K0 > 0 ? sci((Kf - K0) / K0, 2) : `K final = ${si(Kf, 'J')}`, Emag === 0 && K0 > 0 ? (Math.abs((Kf - K0) / K0) < 1e-10 ? 'ok' : 'warn') : '');
      drawPlots();
    }

    function buildScene() {
      S.clearWorld();
      const Bm = Math.hypot(...st.B), Em = Math.hypot(...st.E);
      // flechas de campos uniformes (rejilla)
      const g = [-2.5, 0, 2.5];
      if (Bm > 0) for (const x of g) for (const y of g) S.world.add(arrow([x, y, -3.2], st.B, 1.4, 0x22d3ee, 0.2));
      if (Em > 0) for (const x of [-3, 3]) for (const z of [-1.5, 1.5]) S.world.add(arrow([x, -2.6, z], st.E, 1.2, 0xfde047, 0.22));
      if (Bm > 0) { const l = textSprite('B', '#22d3ee', 0.4); l.position.set(-2.5 + 0.35, -2.5, -1.7); S.world.add(l); }
      if (Em > 0) { const l = textSprite('E', '#fde047', 0.4); l.position.set(-3, -2.6, 0); S.world.add(l); }
      dyn = sims.map((s, k) => {
        const pts = s.pos.map((p) => [(p[0] - center[0]) * scale, (p[1] - center[1]) * scale, (p[2] - center[2]) * scale]);
        const line = polyline(pts, s.part.color);
        line.geometry.setDrawRange(0, 1);
        const ghost = polyline(pts, s.part.color, 0.18);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 12), new THREE.MeshPhongMaterial({ color: s.part.color, emissive: s.part.color, emissiveIntensity: 0.4 }));
        S.world.add(ghost, line, ball);
        let vArr = null, fArr = null;
        if (k === 0) { vArr = arrow([0, 0, 0], [1, 0, 0], 0.9, 0xe5e7eb, 0.25); fArr = arrow([0, 0, 0], [1, 0, 0], 0.9, 0xe879f9, 0.25); S.world.add(vArr, fArr); }
        if (sims.length > 1) { const lab = textSprite(s.part.label, COLORS[k], 0.3); const e = pts[pts.length - 1]; lab.position.set(e[0], e[1] - 0.4, e[2] + 0.3); S.world.add(lab); }
        return { pts, line, ball, vArr, fArr, s };
      });
      if (st.particle === 'multi') {
        // placa detectora sobre el eje y (los iones positivos con v = +x y B = +z giran hacia −y)
        const det = new THREE.Mesh(new THREE.BoxGeometry(0.08, 7.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x64748b }));
        det.position.set((0 - center[0]) * scale - 0.1, 0, 0); S.world.add(det);
        const dl = textSprite('detector', '#cbd5e1', 0.28); dl.position.set((0 - center[0]) * scale - 0.6, -3.9, 0.5); S.world.add(dl);
      }
      S.setExtent(4);
    }

    function frame(dt) {
      if (!dyn) return;
      if (playing) { anim += dt * speed / 6; if (anim >= 1) { anim = 1; playing = false; playBtn.textContent = '▶ Continuar'; } }
      dyn.forEach((d, k) => {
        const n = d.pts.length; const i = Math.min(n - 1, Math.floor(anim * (n - 1)));
        d.line.geometry.setDrawRange(0, i + 1);
        d.ball.position.set(...d.pts[i]);
        if (k === 0 && d.vArr) {
          const v = d.s.vel[i]; const p = d.s.part;
          const vB = [v[1] * st.B[2] - v[2] * st.B[1], v[2] * st.B[0] - v[0] * st.B[2], v[0] * st.B[1] - v[1] * st.B[0]];
          const F = [0, 1, 2].map((c) => p.q * (st.E[c] + vB[c]));
          const vm = Math.hypot(...v), fm = Math.hypot(...F);
          d.vArr.visible = vm > 0; d.fArr.visible = fm > 0;
          d.vArr.position.set(...d.pts[i]); d.fArr.position.set(...d.pts[i]);
          if (vm > 0) d.vArr.setDirection(new THREE.Vector3(v[0] / vm, v[1] / vm, v[2] / vm));
          if (fm > 0) d.fArr.setDirection(new THREE.Vector3(F[0] / fm, F[1] / fm, F[2] / fm));
          info.innerHTML = `${p.label} · t = ${si(d.s.t[i], 's')}<br>r = (${d.s.pos[i].map((c) => sci(c, 2)).join(', ')}) m<br>|v| = ${si(vm, 'm/s')} · |F| = ${si(fm, 'N')}<br><span style="color:var(--muted)">Escala de la escena: 1 unidad = ${si(1 / scale, 'm')}</span>`;
        }
      });
    }
    S.onFrame(frame);

    function drawPlots() {
      const s0 = sims[0]; const p = s0.part;
      const step = Math.max(1, Math.floor(s0.t.length / 600));
      const K0 = 0.5 * p.m * Math.max(1e-300, s0.vel[0].reduce((a, c) => a + c * c, 0));
      const Ks = s0.vel.map((v, i) => [s0.t[i], 0.5 * p.m * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2)]).filter((_, i) => i % step === 0);
      const tsc = s0.t[s0.t.length - 1] < 1e-6 ? 1e9 : 1e6; const tl = tsc === 1e9 ? 't (ns)' : 't (µs)';
      drawPlot(L.plots[0], { title: 'Energía cinética K(t)', xlabel: tl, ylabel: 'K (eV)', series: sims.map((s, k) => ({ data: s.vel.filter((_, i) => i % step === 0).map((v, j) => [s.t[j * step] * tsc, (0.5 * s.part.m * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2)) / E_CHARGE]), color: COLORS[k], label: sims.length > 1 ? s.part.label : null })) });
      drawPlot(L.plots[1], { title: 'Posición de la partícula', xlabel: tl, ylabel: 'posición (m)',
        series: [0, 1, 2].map((c) => ({ data: s0.pos.filter((_, i) => i % step === 0).map((pp, j) => [s0.t[j * step] * tsc, pp[c]]), color: [PALETTE.red, PALETTE.green, PALETTE.blue][c], label: ['x(t)', 'y(t)', 'z(t)'][c] })) });
      void K0; void Ks;
    }
    const ro = new ResizeObserver(() => sims.length && drawPlots()); L.plots.forEach((p) => ro.observe(p.parentElement));
    run();
    return { dispose: () => { ro.disconnect(); S.dispose(); }, applyPreset, finish: () => { anim = 1; }, scene: S };
  },
};
