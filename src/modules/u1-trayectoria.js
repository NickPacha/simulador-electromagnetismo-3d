// Unidad 1 · Simulador de trayectoria de una partícula cargada en un campo eléctrico
import { moduleLayout } from '../ui/layout.js';
import { h, section, slider, select, button, segmented, resultsTable, theory, fitCanvas, downloadCSV } from '../ui/dom.js';
import { si, sci, fmtNum } from '../ui/format.js';
import { drawPlot, PALETTE } from '../ui/plot.js';
import { store } from '../state.js';
import { electricField, electricPotential, nearestCharge } from '../core/electrostatics.js';
import { integrate } from '../core/integrators.js';
import { chargeFieldLines } from '../core/fieldlines.js';
import { E_CHARGE, M_ELECTRON, M_PROTON, M_ALPHA } from '../core/constants.js';

const PARTICLES = {
  electron: { label: 'Electrón (e⁻)', q: -E_CHARGE, m: M_ELECTRON, v0: 1.2e7 },
  proton: { label: 'Protón (p⁺)', q: E_CHARGE, m: M_PROTON, v0: 3e5 },
  alpha: { label: 'Partícula alfa (He²⁺)', q: 2 * E_CHARGE, m: M_ALPHA, v0: 2.5e5 },
};

export default {
  id: 'trayectoria', unit: 1, icon: '↝', title: 'Simulador de trayectoria',
  short: 'Partícula cargada lanzada en un campo eléctrico (RK4)',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Trayectoria de una partícula en un campo eléctrico', unit: 'Unidad 1 · Campo eléctrico', plots: 2,
      desc: 'Elige un escenario, configura la partícula y presiona «Lanzar». La trayectoria se integra con Runge-Kutta de 4.º orden y se compara con la solución analítica cuando existe.',
    });
    const st = {
      scenario: 'placas',
      // escenario placas (SI)
      E: 5000, Lp: 0.05, d: 0.03, D: 0.10, particle: 'electron', v0: 1.2e7, ang: 0,
      // escenario cargas (q en µC, m en g, v en m/s)
      q: 1, m: 2, x0: -4.5, y0: 0.6, v0c: 6, angc: 0,
      fixed: 'rutherford',
    };
    let traj = null, playing = false, animT = 0, speed = 1;

    const res = resultsTable([
      ['a', 'Aceleración inicial |a|'], ['tf', 'Tiempo simulado'], ['yexit', 'Desviación al salir de las placas'], ['yan', 'Desviación analítica'],
      ['err', 'Error relativo numérico'], ['Y', 'Desviación en la pantalla'], ['dE', 'Variación de energía total ΔE/E'], ['end', 'Fin de la simulación'],
    ]);

    // ------- controles -------
    const placasBox = h('div');
    const cargasBox = h('div', { style: { display: 'none' } });
    const vSlider = slider({ label: 'Rapidez inicial v₀', min: 1e4, max: 5e7, log: true, value: st.v0, format: (v) => si(v, 'm/s'), onInput: (v) => { st.v0 = v; run(); } });
    placasBox.append(
      select({ label: 'Partícula', value: st.particle, options: Object.entries(PARTICLES).map(([k, p]) => ({ value: k, label: p.label })),
        onChange: (v) => { st.particle = v; st.v0 = PARTICLES[v].v0; vSlider.value = st.v0; run(); } }).el,
      vSlider.el,
      slider({ label: 'Ángulo de lanzamiento', min: -20, max: 20, step: 0.5, value: st.ang, unit: '°', onInput: (v) => { st.ang = v; run(); } }).el,
      slider({ label: 'Campo entre placas |E|', min: 100, max: 50000, log: true, value: st.E, format: (v) => si(v, 'N/C'), onInput: (v) => { st.E = v; run(); } }).el,
      slider({ label: 'Longitud de las placas L', min: 0.01, max: 0.15, step: 0.005, value: st.Lp, format: (v) => `${(v * 100).toFixed(1)} cm`, onInput: (v) => { st.Lp = v; run(); } }).el,
      slider({ label: 'Separación de las placas', min: 0.01, max: 0.08, step: 0.002, value: st.d, format: (v) => `${(v * 100).toFixed(1)} cm`, onInput: (v) => { st.d = v; run(); } }).el,
      slider({ label: 'Distancia a la pantalla D', min: 0, max: 0.3, step: 0.01, value: st.D, format: (v) => `${(v * 100).toFixed(0)} cm`, onInput: (v) => { st.D = v; run(); } }).el,
      h('p', { class: 'note' }, 'Placa superior positiva y placa inferior negativa: el campo apunta hacia −y (como en un tubo de rayos catódicos).'),
    );
    cargasBox.append(
      select({ label: 'Cargas fijas', value: st.fixed, options: [
        { value: 'rutherford', label: 'Una carga fija +5 µC (dispersión)' },
        { value: 'atractiva', label: 'Una carga fija −5 µC (atracción)' },
        { value: 'visualizador', label: 'Las del visualizador de cargas' },
      ], onChange: (v) => { st.fixed = v; run(); } }).el,
      slider({ label: 'Carga de la partícula q', min: -5, max: 5, step: 0.1, value: st.q, unit: 'µC', onInput: (v) => { st.q = v; run(); } }).el,
      slider({ label: 'Masa m', min: 0.1, max: 20, step: 0.1, value: st.m, unit: 'g', onInput: (v) => { st.m = v; run(); } }).el,
      slider({ label: 'Rapidez inicial v₀', min: 0, max: 20, step: 0.1, value: st.v0c, unit: 'm/s', onInput: (v) => { st.v0c = v; run(); } }).el,
      slider({ label: 'Ángulo', min: -180, max: 180, step: 1, value: st.angc, unit: '°', onInput: (v) => { st.angc = v; run(); } }).el,
      slider({ label: 'Posición inicial y₀ (parámetro de impacto)', min: -4, max: 4, step: 0.05, value: st.y0, unit: 'm', onInput: (v) => { st.y0 = v; run(); } }).el,
      slider({ label: 'Posición inicial x₀', min: -5, max: 5, step: 0.05, value: st.x0, unit: 'm', onInput: (v) => { st.x0 = v; run(); } }).el,
    );
    const playBtn = button('⏸ Pausa', () => { playing = !playing; playBtn.textContent = playing ? '⏸ Pausa' : '▶ Continuar'; }, '');
    L.panel.append(
      section('Escenario', segmented([{ value: 'placas', label: 'Placas paralelas (E uniforme)' }, { value: 'cargas', label: 'Cargas puntuales' }], st.scenario, (v) => {
        st.scenario = v; placasBox.style.display = v === 'placas' ? '' : 'none'; cargasBox.style.display = v === 'cargas' ? '' : 'none'; run();
      })),
      section('Parámetros', placasBox, cargasBox),
      section('Animación',
        h('div', { class: 'row' }, button('🚀 Lanzar', () => run(), 'primary'), playBtn),
        slider({ label: 'Velocidad de reproducción', min: 0.25, max: 4, step: 0.25, value: 1, format: (v) => `${v}×`, onInput: (v) => { speed = v; } }).el,
        button('Exportar trayectoria (CSV)', exportCSV)),
      section('Resultados', res.el),
      theory(`<p>Sobre la partícula actúa la fuerza eléctrica <b>F = qE</b>; por la segunda ley de Newton:</p>
        <span class="eq">d²r/dt² = (q/m) E(r)</span>
        <p>Se reescribe como un sistema de primer orden y = (x, y, vₓ, vᵧ) y se integra con <b>Runge-Kutta 4</b>. En un campo uniforme la solución es una parábola:</p>
        <span class="eq">y(x) = (qE / 2m v₀²) x² ,  tan θ = qEL / (m v₀²)</span>
        <p>Entre cargas puntuales el campo no es uniforme y no hay solución cerrada general; se verifica la <b>conservación de la energía</b> K + qV = constante.</p>`),
    );

    // ------- modelo -------
    function fixedCharges() {
      if (st.fixed === 'rutherford') return [{ x: 0, y: 0, z: 0, q: 5e-6 }];
      if (st.fixed === 'atractiva') return [{ x: 0, y: 0, z: 0, q: -5e-6 }];
      return store.si();
    }

    function simulate() {
      if (st.scenario === 'placas') {
        const p = PARTICLES[st.particle];
        const qm = p.q / p.m;
        const Ey = -st.E; // campo hacia abajo
        const half = st.d / 2, xEnd = st.Lp + st.D;
        const a = (st.ang * Math.PI) / 180;
        const f = (t, y) => {
          const inside = y[0] >= 0 && y[0] <= st.Lp;
          return [y[2], y[3], 0, inside ? qm * Ey : 0];
        };
        const tEnd = (xEnd + 0.02) / (st.v0 * Math.cos(a)) * 1.02;
        const out = integrate(f, [-0.01, 0, st.v0 * Math.cos(a), st.v0 * Math.sin(a)], 0, tEnd, {
          h: tEnd / 4000,
          stop: (t, y) => (y[0] <= st.Lp && y[0] >= 0 && Math.abs(y[1]) >= half ? 'choca con una placa' : y[0] >= xEnd ? 'llega a la pantalla' : null),
        });
        // magnitudes analíticas
        const ax = qm * Ey;
        const vx = st.v0 * Math.cos(a), vy0 = st.v0 * Math.sin(a);
        const tL = st.Lp / vx;
        const yAnExit = vy0 * (0.01 / vx) + vy0 * tL + 0.5 * ax * tL * tL;
        // posición numérica en x = L (interpolación)
        let yNum = null;
        for (let i = 1; i < out.y.length; i++) {
          if (out.y[i][0] >= st.Lp) { const A = out.y[i - 1], B = out.y[i]; const s = (st.Lp - A[0]) / (B[0] - A[0]); yNum = A[1] + s * (B[1] - A[1]); break; }
        }
        const vyExit = vy0 + ax * tL;
        const Yscreen = yAnExit + st.D * (vyExit / vx);
        const yAtX = (X) => {
          for (let i = 1; i < out.y.length; i++) if (out.y[i][0] >= X) { const A = out.y[i - 1], B = out.y[i]; return A[1] + ((X - A[0]) / (B[0] - A[0])) * (B[1] - A[1]); }
          return out.y[out.y.length - 1][1];
        };
        const yIn = yAtX(0), yOut = yAtX(st.Lp);
        // E apunta hacia −y ⇒ V(y) = E·y entre las placas (referencia V = 0 en y = 0); fuera no hay campo
        const energies = out.y.map((y, i) => {
          const K = 0.5 * p.m * (y[2] ** 2 + y[3] ** 2);
          const yy = y[0] < 0 ? yIn : y[0] > st.Lp ? yOut : y[1];
          return [out.t[i], K, p.q * st.E * yy];
        });
        return { kind: 'placas', p, out, yNum, yAn: yAnExit, Yscreen, a0: Math.abs(qm * st.E), energies, half, xEnd };
      }
      // escenario de cargas puntuales
      const ch = fixedCharges();
      const q = st.q * 1e-6, m = st.m * 1e-3, qm = q / m;
      const a = (st.angc * Math.PI) / 180;
      const f = (t, y) => { const E = electricField(ch, y[0], y[1], 0); return [y[2], y[3], qm * E[0], qm * E[1]]; };
      const y0 = [st.x0, st.y0, st.v0c * Math.cos(a), st.v0c * Math.sin(a)];
      const out = integrate(f, y0, 0, 30, {
        h: (t, y) => { const d = nearestCharge(ch, y[0], y[1], 0).distance; const v = Math.hypot(y[2], y[3]) + 0.3; return Math.min(0.01, (0.004 * Math.max(d, 0.05)) / v); },
        maxSteps: 60000,
        stop: (t, y) => (Math.abs(y[0]) > 7 || Math.abs(y[1]) > 5 ? 'sale del dominio' : nearestCharge(ch, y[0], y[1], 0).distance < 0.12 ? 'colisiona con una carga' : null),
      });
      const energies = out.y.map((y, i) => [out.t[i], 0.5 * m * (y[2] ** 2 + y[3] ** 2), q * electricPotential(ch, y[0], y[1], 0)]);
      const E0 = electricField(ch, y0[0], y0[1], 0);
      return { kind: 'cargas', ch, out, energies, a0: Math.abs(qm) * Math.hypot(E0[0], E0[1]) };
    }

    function run() {
      traj = simulate();
      animT = 0; playing = true; playBtn.textContent = '⏸ Pausa';
      const o = traj.out;
      const last = o.y[o.y.length - 1];
      res.set('a', si(traj.a0, 'm/s²'));
      res.set('tf', si(o.t[o.t.length - 1], 's'));
      const E0 = traj.energies[0][1] + traj.energies[0][2];
      const Ef = traj.energies[traj.energies.length - 1][1] + traj.energies[traj.energies.length - 1][2];
      res.set('dE', sci(Math.abs((Ef - E0) / (Math.abs(E0) || 1)), 2), Math.abs((Ef - E0) / (Math.abs(E0) || 1)) < 1e-4 ? 'ok' : 'warn');
      if (traj.kind === 'placas') {
        res.set('yexit', traj.yNum === null ? 'no sale' : `${fmtNum(traj.yNum * 1000, 4)} mm`);
        res.set('yan', `${fmtNum(traj.yAn * 1000, 4)} mm`);
        const err = traj.yNum === null ? null : Math.abs((traj.yNum - traj.yAn) / traj.yAn);
        res.set('err', err === null ? '—' : sci(err, 2), err !== null && err < 1e-3 ? 'ok' : 'warn');
        res.set('Y', o.reason === 'llega a la pantalla' ? `${fmtNum(traj.Yscreen * 1000, 4)} mm` : '—');
      } else {
        ['yexit', 'yan', 'err', 'Y'].forEach((k) => res.set(k, '—'));
      }
      res.set('end', o.reason);
      drawPlots();
    }

    function exportCSV() {
      if (!traj) return;
      downloadCSV('trayectoria.csv', ['t_s', 'x_m', 'y_m', 'vx_ms', 'vy_ms', 'K_J', 'U_J'],
        traj.out.y.map((y, i) => [traj.out.t[i], ...y, traj.energies[i][1], traj.energies[i][2]]));
    }

    // ------- dibujo -------
    const canvas = h('canvas');
    const info = h('div', { class: 'overlay tl' });
    L.stage.append(canvas, info);
    let bgLines = null, bgKey = '';

    function draw() {
      const { ctx, w, h: hh } = fitCanvas(canvas);
      ctx.fillStyle = '#0b1020'; ctx.fillRect(0, 0, w, hh);
      if (!traj) return;
      const o = traj.out;
      const n = o.y.length;
      const tTotal = o.t[n - 1];
      const idx = Math.min(n - 1, Math.floor((animT / 5) * n));
      let toPx, scale;
      if (traj.kind === 'placas') {
        const x0 = -0.015, x1 = traj.xEnd + 0.01;
        const yr = Math.max(traj.half * 1.6, 0.02, Math.abs(traj.Yscreen) * 1.2);
        scale = Math.min((w - 40) / (x1 - x0), (hh - 40) / (2 * yr));
        const cx = 20 - x0 * scale + ((w - 40) - (x1 - x0) * scale) / 2;
        toPx = (x, y) => [cx + x * scale, hh / 2 - y * scale];
        // placas
        const [pa, pt] = toPx(0, traj.half), [pb] = toPx(st.Lp, 0);
        const [, pbot] = toPx(0, -traj.half);
        ctx.fillStyle = 'rgba(248,113,113,0.12)'; ctx.fillRect(pa, pt, pb - pa, pbot - pt);
        ctx.fillStyle = '#ef4444'; ctx.fillRect(pa, pt - 8, pb - pa, 8);
        ctx.fillStyle = '#3b82f6'; ctx.fillRect(pa, pbot, pb - pa, 8);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Inter'; ctx.textAlign = 'center';
        for (let x = pa + 12; x < pb; x += 24) { ctx.fillText('+', x, pt - 1); ctx.fillText('−', x, pbot + 8); }
        // flechas de campo
        ctx.strokeStyle = 'rgba(253,230,138,0.55)'; ctx.fillStyle = 'rgba(253,230,138,0.55)'; ctx.lineWidth = 1;
        for (let x = pa + 24; x < pb - 6; x += 36) {
          ctx.beginPath(); ctx.moveTo(x, pt + 6); ctx.lineTo(x, pbot - 6); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, pbot - 6); ctx.lineTo(x - 4, pbot - 14); ctx.lineTo(x + 4, pbot - 14); ctx.fill();
        }
        // pantalla
        if (st.D > 0) { const [sx] = toPx(traj.xEnd, 0); ctx.fillStyle = '#34d399'; ctx.fillRect(sx, 20, 4, hh - 40); ctx.fillStyle = '#a7f3d0'; ctx.fillText('pantalla', sx, 14); }
        // trayectoria analítica (línea punteada)
        ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath();
        const p = traj.p, a = st.ang * Math.PI / 180, vx = st.v0 * Math.cos(a), vy0 = st.v0 * Math.sin(a), ay = (p.q / p.m) * -st.E;
        for (let k = 0; k <= 100; k++) {
          const x = (st.Lp * k) / 100; const t = (x + 0.01) / vx, tin = x / vx;
          const y = vy0 * t + 0.5 * ay * tin * tin;
          const [X, Y] = toPx(x, y); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8'; ctx.font = '11px Inter';
        ctx.fillText(`Escala: 1 cm = ${(scale / 100).toFixed(0)} px  ·  línea punteada: solución analítica`, 12, hh - 12);
      } else {
        scale = Math.min(w / 14.5, hh / 10.5);
        toPx = (x, y) => [w / 2 + x * scale, hh / 2 - y * scale];
        const key = JSON.stringify(traj.ch) + w + 'x' + hh;
        if (key !== bgKey) {
          bgKey = key;
          bgLines = chargeFieldLines(traj.ch, (x, y, z) => electricField(traj.ch, x, y, z), { linesPerUnit: 3, dims: 2, step: 0.04, maxSteps: 700, inBounds: (pp) => Math.abs(pp[0]) < 8 && Math.abs(pp[1]) < 6 });
        }
        ctx.strokeStyle = 'rgba(253,230,138,0.22)'; ctx.lineWidth = 1;
        bgLines.forEach((ln) => { ctx.beginPath(); ln.points.forEach((pp, i) => { const [X, Y] = toPx(pp[0], pp[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke(); });
        traj.ch.forEach((c) => {
          const [X, Y] = toPx(c.x, c.y);
          ctx.fillStyle = c.q >= 0 ? '#ef4444' : '#3b82f6'; ctx.beginPath(); ctx.arc(X, Y, 11, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.font = 'bold 13px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.q >= 0 ? '+' : '−', X, Y + 1);
        });
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      // trayectoria recorrida
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.2; ctx.beginPath();
      for (let i = 0; i <= idx; i++) { const [X, Y] = toPx(o.y[i][0], o.y[i][1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke();
      // partícula y vectores
      const y = o.y[idx];
      const [X, Y] = toPx(y[0], y[1]);
      const isNeg = traj.kind === 'placas' ? traj.p.q < 0 : st.q < 0;
      ctx.fillStyle = isNeg ? '#93c5fd' : '#fca5a5'; ctx.beginPath(); ctx.arc(X, Y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      const vm = Math.hypot(y[2], y[3]);
      if (vm > 0) { drawArrow(ctx, X, Y, y[2] / vm, -y[3] / vm, 40, '#e5e7eb'); }
      let F = [0, 0];
      if (traj.kind === 'placas') { F = y[0] >= 0 && y[0] <= st.Lp ? [0, traj.p.q * -st.E] : [0, 0]; }
      else { const E = electricField(traj.ch, y[0], y[1], 0); F = [st.q * 1e-6 * E[0], st.q * 1e-6 * E[1]]; }
      const fm = Math.hypot(F[0], F[1]);
      if (fm > 0) drawArrow(ctx, X, Y, F[0] / fm, -F[1] / fm, 34, '#e879f9');
      const t = o.t[idx];
      info.innerHTML = `t = ${si(t, 's')}<br>x = ${traj.kind === 'placas' ? fmtNum(y[0] * 100, 4) + ' cm' : fmtNum(y[0], 3) + ' m'}, y = ${traj.kind === 'placas' ? fmtNum(y[1] * 1000, 4) + ' mm' : fmtNum(y[1], 3) + ' m'}<br>|v| = ${si(vm, 'm/s')}<br><span style="color:#e5e7eb">→ velocidad</span> · <span style="color:#e879f9">→ fuerza</span>`;
      L._progress = idx / (n - 1);
      if (tTotal === 0) return;
    }
    function drawArrow(ctx, x, y, ux, uy, len, color) {
      const ex = x + ux * len, ey = y + uy * len;
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      const a = Math.atan2(uy, ux);
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - 9 * Math.cos(a - 0.45), ey - 9 * Math.sin(a - 0.45)); ctx.lineTo(ex - 9 * Math.cos(a + 0.45), ey - 9 * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
    }

    function drawPlots() {
      if (!traj) return;
      const en = traj.energies;
      const step = Math.max(1, Math.floor(en.length / 600));
      const sub = en.filter((_, i) => i % step === 0 || i === en.length - 1);
      const scaleT = traj.kind === 'placas' ? 1e9 : 1;
      const tl = traj.kind === 'placas' ? 't (ns)' : 't (s)';
      drawPlot(L.plots[0], { title: 'Energía: cinética K, potencial U y total K + U', xlabel: tl, ylabel: 'Energía (J)',
        series: [
          { data: sub.map((e) => [e[0] * scaleT, e[1]]), color: PALETTE.cyan, label: 'K' },
          { data: sub.map((e) => [e[0] * scaleT, e[2]]), color: PALETTE.magenta, label: 'U = qV' },
          { data: sub.map((e) => [e[0] * scaleT, e[1] + e[2]]), color: PALETTE.yellow, label: 'K + U', width: 2.5 },
        ] });
      const o = traj.out;
      const sy = o.y.filter((_, i) => i % step === 0);
      if (traj.kind === 'placas') {
        drawPlot(L.plots[1], { title: 'Componentes de la velocidad', xlabel: tl, ylabel: 'v (m/s)',
          series: [{ data: sy.map((y, i) => [o.t[i * step] * scaleT, y[2]]), color: PALETTE.white, label: 'vₓ' }, { data: sy.map((y, i) => [o.t[i * step] * scaleT, y[3]]), color: PALETTE.green, label: 'vᵧ' }] });
      } else {
        drawPlot(L.plots[1], { title: 'Rapidez |v|(t)', xlabel: tl, ylabel: '|v| (m/s)',
          series: [{ data: sy.map((y, i) => [o.t[i * step], Math.hypot(y[2], y[3])]), color: PALETTE.green }] });
      }
    }

    let raf = 0, last = performance.now();
    const loop = (now) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
      if (playing && traj) { animT += dt * speed; if (animT >= 5) { animT = 5; playing = false; playBtn.textContent = '▶ Continuar'; } }
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const ro = new ResizeObserver(() => drawPlots()); L.plots.forEach((p) => ro.observe(p.parentElement));
    run();
    return {
      dispose: () => { cancelAnimationFrame(raf); ro.disconnect(); },
      finish: () => { animT = 5; },
      setScenario: (s) => { const seg = L.panel.querySelector('.segmented'); [...seg.children][s === 'placas' ? 0 : 1].click(); },
    };
  },
};
