// Unidad 4 · Simulador de campo magnético de imanes y corrientes (ley de Biot-Savart)
import { moduleLayout } from '../ui/layout.js';
import { h, section, slider, select, numberInput, checkbox, resultsTable, theory } from '../ui/dom.js';
import { si, sci } from '../ui/format.js';
import { createScene, textSprite, arrow, batchedLines, batchedArrowHeads, THREE } from '../ui/scene3d.js';
import { magneticField, straightWire, circularLoop, solenoid, analytic } from '../core/magnetostatics.js';
import { traceFieldLine } from '../core/fieldlines.js';
import { MU0 } from '../core/constants.js';

const SOURCES = [
  { value: 'hilo', label: 'Hilo recto largo' },
  { value: 'dos', label: 'Dos hilos paralelos' },
  { value: 'espira', label: 'Espira circular' },
  { value: 'helmholtz', label: 'Bobinas de Helmholtz' },
  { value: 'solenoide', label: 'Solenoide' },
  { value: 'iman', label: 'Imán de barra (modelo amperiano)' },
];

export default {
  id: 'campo-b', unit: 4, icon: '🧲', title: 'Simulador de campo magnético',
  short: 'Líneas de B de imanes, hilos, espiras y solenoides (Biot-Savart)',
  mount(root) {
    const L = moduleLayout(root, {
      title: 'Simulador de campo magnético', unit: 'Unidad 4 · Fuerza y campo magnético',
      desc: 'Elige la fuente del campo. Las líneas de B se calculan integrando numéricamente la ley de Biot-Savart sobre el conductor discretizado; el eje z es vertical.',
    });
    const st = { src: 'espira', I: 10, I2: 10, R: 1.2, N: 12, len: 3, d: 2, slice: true, probe: [0, 0, 0.5], nLines: 1 };
    const res = resultsTable([
      ['B', '|B| numérico en la sonda'], ['comp', 'Componentes (Bₓ, Bᵧ, B_z)'], ['an', 'Valor analítico de referencia'], ['formula', 'Expresión usada'], ['err', 'Error relativo'],
      ['seg', 'Segmentos del conductor'], ['extra', 'Dato adicional'],
    ]);
    const paramBox = h('div');
    const probeIns = ['x', 'y', 'z'].map((k, i) => numberInput({ label: `${k} (m)`, value: st.probe[i], step: 0.1, live: true, onChange: (v) => { st.probe[i] = v; updateProbe(); } }));

    function renderParams() {
      paramBox.innerHTML = '';
      const add = (o) => paramBox.appendChild(slider({ ...o, onInput: (v) => { st[o.key] = v; rebuild(); } }).el);
      add({ key: 'I', label: st.src === 'dos' ? 'Corriente I₁' : 'Corriente I', min: -30, max: 30, step: 0.5, value: st.I, unit: 'A' });
      if (st.src === 'dos') { add({ key: 'I2', label: 'Corriente I₂ (signo = sentido)', min: -30, max: 30, step: 0.5, value: st.I2, unit: 'A' }); add({ key: 'd', label: 'Separación d', min: 0.5, max: 4, step: 0.1, value: st.d, unit: 'm' }); }
      if (['espira', 'helmholtz', 'solenoide', 'iman'].includes(st.src)) add({ key: 'R', label: 'Radio R', min: 0.3, max: 2.5, step: 0.05, value: st.R, unit: 'm' });
      if (st.src === 'solenoide') { add({ key: 'N', label: 'Número de vueltas N', min: 2, max: 30, step: 1, value: st.N, format: (v) => `${Math.round(v)}` }); add({ key: 'len', label: 'Longitud L', min: 0.5, max: 6, step: 0.1, value: st.len, unit: 'm' }); }
    }
    L.panel.append(
      section('Fuente del campo', select({ label: '', value: st.src, options: SOURCES, onChange: (v) => { st.src = v; if (v === 'iman') st.R = Math.min(st.R, 0.6); renderParams(); rebuild(); } }).el, paramBox),
      section('Visualización',
        checkbox({ label: 'Plano de corte y = 0 con |B| (escala logarítmica)', value: st.slice, onChange: (v) => { st.slice = v; rebuild(); } }).el,
        slider({ label: 'Cantidad de líneas', min: 0.5, max: 2, step: 0.25, value: st.nLines, format: (v) => `${v}×`, onInput: (v) => { st.nLines = v; rebuild(); } }).el),
      section('Sonda de medición', h('div', { class: 'grid3' }, ...probeIns.map((p) => p.el)), res.el),
      theory(`<p><b>Ley de Biot-Savart:</b> cada elemento de corriente I dl produce</p>
        <span class="eq">dB = (μ₀ / 4π) · I dl × r̂ / r²</span>
        <p>El conductor se divide en segmentos rectos y se suma la contribución exacta de cada segmento: B = (μ₀I / 4πd)(cos θ₁ − cos θ₂).</p>
        <p>Casos de referencia: hilo infinito B = μ₀I/(2πr); centro de una espira B = μ₀I/(2R); solenoide ideal B = μ₀ n I; Helmholtz B = (4/5)^{3/2} μ₀I/R.</p>
        <p>Las líneas de B son <b>cerradas</b> (∇·B = 0, no hay monopolos). Un imán de barra equivale a un solenoide apretado: sus líneas salen por el polo N y entran por el S, y continúan dentro del imán.</p>
        <p>Dos hilos paralelos se atraen si sus corrientes tienen el mismo sentido: F/L = μ₀ I₁ I₂ / (2πd).</p>`),
    );
    renderParams();

    const S = createScene(L.stage, { extent: 5, cameraPos: [7, 4.5, 8.5], zUp: true });
    const info = h('div', { class: 'overlay tl' }, 'Arrastra para rotar · rueda para acercar');
    const legend = h('div', { class: 'overlay bl' });
    L.stage.append(info, legend);

    function segmentsFor() {
      const s = st;
      switch (s.src) {
        case 'hilo': return straightWire(s.I, 40, 0, 0, 1);
        case 'dos': return [...straightWire(s.I, 40, -s.d / 2, 0, 1), ...straightWire(s.I2, 40, s.d / 2, 0, 1)];
        case 'espira': return circularLoop(s.I, s.R, 0, 72);
        case 'helmholtz': return [...circularLoop(s.I, s.R, -s.R / 2, 72), ...circularLoop(s.I, s.R, s.R / 2, 72)];
        case 'solenoide': return solenoid(s.I, s.R, s.len, Math.round(s.N), 36);
        case 'iman': return solenoid(s.I, s.R, 2.4, 30, 24);
      }
      return [];
    }
    function seeds() {
      const s = st, n = st.nLines, out = [];
      const ring = (r, z, k) => { for (let i = 0; i < k; i++) { const a = (2 * Math.PI * i) / k; out.push([r * Math.cos(a), r * Math.sin(a), z]); } };
      switch (s.src) {
        case 'hilo': [0.5, 1, 1.6, 2.3, 3.1, 4].forEach((r, i) => { for (const z of [-1.5, 0, 1.5]) if (i < 6 * n) out.push([r, 0, z]); }); break;
        case 'dos': {
          const xs = [-3.6, -2.8, -1.9, -1.3, -0.4, 0, 0.4, 1.3, 1.9, 2.8, 3.6].map((x) => x * s.d / 2);
          xs.forEach((x) => { if (Math.abs(Math.abs(x) - s.d / 2) > 0.1) out.push([x, 0, 0]); });
          [-0.8, 0.8].forEach((y) => out.push([0, y * s.d / 2, 0]));
          break;
        }
        case 'espira': case 'helmholtz': {
          const k = Math.max(3, Math.round(4 * n));
          [0.15, 0.45, 0.7, 0.88].forEach((f) => ring(f * s.R, 0, k));
          out.push([0, 0, 0]);
          break;
        }
        case 'solenoide': case 'iman': {
          const k = Math.max(3, Math.round(4 * n));
          [0.3, 0.6, 0.85].forEach((f) => ring(f * s.R, 0, k));
          out.push([0, 0, 0]);
          break;
        }
      }
      return out;
    }

    let segs = [];
    function build() {
      S.clearWorld();
      segs = segmentsFor();
      const B = (x, y, z) => magneticField(segs, x, y, z);
      const ext = 5;
      const inB = (p) => Math.abs(p[0]) < ext + 1 && Math.abs(p[1]) < ext + 1 && Math.abs(p[2]) < ext + 1;
      // referencia para colorear según |B|
      const B0 = Math.hypot(...B(st.src === 'hilo' || st.src === 'dos' ? 1 : 0, 0, st.src === 'hilo' || st.src === 'dos' ? 0 : 0.01)) || 1e-6;
      const batch = [];
      for (const sd of seeds()) {
        const fw = traceFieldLine(B, sd, { step: 0.05, maxSteps: 1400, inBounds: inB, closeLoop: true });
        let pts = fw.points;
        if (fw.end !== 'cerrada') {
          const bw = traceFieldLine(B, sd, { step: 0.05, maxSteps: 1400, sign: -1, inBounds: inB });
          pts = bw.points.slice(1).reverse().concat(fw.points);
        }
        if (pts.length < 3) continue;
        const cols = [];
        pts.forEach((p) => {
          const t = Math.max(0, Math.min(1, 0.5 + 0.35 * Math.log10(Math.hypot(...B(p[0], p[1], p[2])) / B0)));
          cols.push(0.2 + 0.8 * t, 0.55 + 0.4 * t, 1.0);
        });
        batch.push({ points: pts, colors: cols });
      }
      S.world.add(batchedLines(batch, 0x7dd3fc, 0.95));
      S.world.add(batchedArrowHeads(batch, 0x7dd3fc, 55, 0.14));
      drawConductors();
      if (st.slice) drawSlice(B, B0);
      updateProbe();
    }

    function drawConductors() {
      const copper = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7, roughness: 0.35, emissive: 0x3b1d02 });
      const coneGeo = new THREE.ConeGeometry(0.09, 0.25, 12); coneGeo.translate(0, 0.12, 0);
      const coneMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
      const addCone = (p, dir) => {
        const m = new THREE.Mesh(coneGeo, coneMat); m.position.set(...p);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize()); S.world.add(m);
      };
      if (st.src === 'hilo' || st.src === 'dos') {
        const wires = st.src === 'hilo' ? [[0, st.I]] : [[-st.d / 2, st.I], [st.d / 2, st.I2]];
        wires.forEach(([x, I]) => {
          const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 11, 16), copper);
          cyl.rotation.x = Math.PI / 2; cyl.position.set(x, 0, 0); S.world.add(cyl);
          if (I !== 0) for (const z of [-3, 0, 3]) addCone([x, 0, z], [0, 0, Math.sign(I)]);
          const lab = textSprite(`${I > 0 ? '+' : ''}${I} A`, '#fbbf24', 0.3); lab.position.set(x + 0.35, 0, 5.2); S.world.add(lab);
        });
        return;
      }
      // conductores curvos: tubo a lo largo de la polilínea
      const groups = st.src === 'helmholtz' ? [segs.slice(0, 72), segs.slice(72)] : [segs];
      groups.forEach((g) => {
        const pts = g.map((s) => new THREE.Vector3(...s.a)); pts.push(new THREE.Vector3(...g[g.length - 1].b));
        const curve = new THREE.CatmullRomCurve3(pts, st.src === 'espira' || st.src === 'helmholtz');
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(800, pts.length * 3), st.src === 'iman' ? 0.02 : 0.04, 8, false), copper);
        S.world.add(tube);
        if (st.I !== 0 && st.src !== 'iman') for (let k = 0; k < g.length; k += Math.max(1, Math.floor(g.length / 6))) {
          const s = g[k]; addCone(s.a, [(s.b[0] - s.a[0]) * Math.sign(st.I), (s.b[1] - s.a[1]) * Math.sign(st.I), (s.b[2] - s.a[2]) * Math.sign(st.I)]);
        }
      });
      if (st.src === 'iman') {
        const R = st.R * 1.08, H = 2.4;
        const mk = (color, z, label) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(2 * R, 2 * R, H / 2), new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55, roughness: 0.4 }));
          m.position.set(0, 0, z); S.world.add(m);
          const l = textSprite(label, '#ffffff', 0.45); l.position.set(0, 0, z + Math.sign(z) * (H / 4 + 0.45)); S.world.add(l);
        };
        // con I > 0 (antihorario visto desde +z) el polo norte queda arriba
        mk(st.I >= 0 ? 0xdc2626 : 0x2563eb, H / 4, st.I >= 0 ? 'N' : 'S');
        mk(st.I >= 0 ? 0x2563eb : 0xdc2626, -H / 4, st.I >= 0 ? 'S' : 'N');
      }
    }

    function drawSlice(B, B0) {
      const Np = 140, ext = 5;
      const cv = document.createElement('canvas'); cv.width = Np; cv.height = Np;
      const g = cv.getContext('2d'); const img = g.createImageData(Np, Np);
      for (let j = 0; j < Np; j++) for (let i = 0; i < Np; i++) {
        const x = -ext + (2 * ext * i) / (Np - 1), z = ext - (2 * ext * j) / (Np - 1);
        const b = Math.hypot(...B(x, 0, z));
        const t = Math.max(0, Math.min(1, 0.5 + 0.28 * Math.log10(b / B0 + 1e-12)));
        // escala tipo "magma"
        const r = Math.min(255, 30 + 330 * t * t), gg = Math.max(0, 255 * (t - 0.45) * 1.6), bb = 60 + 120 * Math.sin(Math.PI * t);
        const k = (j * Np + i) * 4; img.data[k] = r; img.data[k + 1] = Math.min(255, gg); img.data[k + 2] = bb; img.data[k + 3] = 210;
      }
      g.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * ext, 2 * ext), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      plane.rotation.x = Math.PI / 2; // plano xz del sistema físico (y = 0)
      S.world.add(plane);
      legend.innerHTML = 'Plano y = 0: |B| en escala logarítmica<div class="legend-bar" style="background:linear-gradient(90deg,#1e0a3c,#7a1f5c,#e0533b,#fbd34d)"></div><span style="color:var(--muted)">débil → intenso</span>';
    }
    let probeObj = null;
    function updateProbe() {
      if (probeObj) { S.world.remove(probeObj); probeObj = null; }
      const [x, y, z] = st.probe;
      const b = magneticField(segs, x, y, z);
      const bm = Math.hypot(...b);
      probeObj = new THREE.Group();
      const sph = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 8), new THREE.MeshBasicMaterial({ color: 0x34d399 }));
      sph.position.set(x, y, z); probeObj.add(sph);
      if (bm > 0) probeObj.add(arrow([x, y, z], b, 1.1, 0x34d399, 0.22));
      S.world.add(probeObj);
      res.set('B', `<b>${si(bm, 'T')}</b>`);
      res.set('comp', `(${b.map((c) => sci(c, 3)).join(', ')})`);
      res.set('seg', String(segs.length));
      let an = null, formula = '—', extra = '—';
      const rxy = Math.hypot(x, y);
      if (st.src === 'hilo') { an = analytic.infiniteWire(Math.abs(st.I), rxy); formula = 'μ₀I / (2πr)'; }
      else if (st.src === 'espira' && rxy < 1e-9) { an = analytic.loopAxis(Math.abs(st.I), st.R, z); formula = 'μ₀IR² / 2(R²+z²)^{3/2} (eje)'; }
      else if (st.src === 'solenoide' && rxy < 1e-9) { an = Math.abs(analytic.solenoidAxis(st.I, st.R, st.len, Math.round(st.N), z)); formula = 'μ₀nI/2 (cos θ₁ − cos θ₂) (eje)'; extra = `Solenoide ideal μ₀nI = ${si(analytic.idealSolenoid(Math.abs(st.I), st.len, Math.round(st.N)), 'T')}`; }
      else if (st.src === 'helmholtz' && Math.hypot(x, y, z) < 1e-9) { an = analytic.helmholtzCenter(Math.abs(st.I), st.R); formula = '(4/5)^{3/2} μ₀I/R (centro)'; }
      else if (st.src === 'dos') {
        const b1 = (MU0 * st.I) / (2 * Math.PI), b2 = (MU0 * st.I2) / (2 * Math.PI);
        const dx1 = x + st.d / 2, dx2 = x - st.d / 2;
        const r1 = dx1 * dx1 + y * y, r2 = dx2 * dx2 + y * y;
        const Bx = -b1 * y / r1 - b2 * y / r2, By = b1 * dx1 / r1 + b2 * dx2 / r2;
        an = Math.hypot(Bx, By); formula = 'superposición de μ₀I/(2πr)';
        const F = analytic.parallelWiresForce(st.I, st.I2, st.d);
        extra = `F/L = ${si(Math.abs(F), 'N/m')} · ${st.I * st.I2 > 0 ? 'se atraen' : st.I * st.I2 < 0 ? 'se repelen' : 'sin fuerza'}`;
      }
      if (st.src === 'iman') extra = 'Modelo: solenoide de 30 vueltas con I equivalente';
      res.set('an', an === null ? 'coloca la sonda en el eje' : si(an, 'T'));
      res.set('formula', formula);
      const err = an ? Math.abs(bm - an) / an : null;
      res.set('err', err === null ? '—' : sci(err, 2), err !== null && err < 0.01 ? 'ok' : 'warn');
      res.set('extra', extra);
      info.innerHTML = `Sonda en (${x}, ${y}, ${z}) m · |B| = <b>${si(bm, 'T')}</b>`;
    }
    let tmr = null;
    const rebuild = () => { clearTimeout(tmr); tmr = setTimeout(build, 60); };
    build();
    return {
      dispose: () => { clearTimeout(tmr); S.dispose(); },
      setSource: (v) => { const sel = L.panel.querySelector('select'); sel.value = v; sel.dispatchEvent(new Event('change')); },
      setProbe: (x, y, z) => { st.probe = [x, y, z]; probeIns.forEach((p, i) => (p.value = st.probe[i])); updateProbe(); },
      scene: S,
    };
  },
};
