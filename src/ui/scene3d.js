// Escena 3D reutilizable con Three.js: cámara orbital, luces, malla de referencia y ejes rotulados.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export { THREE };

function textSprite(text, color = '#e5e7eb', size = 0.5) {
  // el ancho del lienzo se ajusta al texto para que no se recorte
  const c = document.createElement('canvas');
  const g0 = c.getContext('2d');
  g0.font = 'bold 40px Inter, system-ui, sans-serif';
  const tw = Math.ceil(g0.measureText(text).width) + 16;
  c.width = Math.max(64, tw); c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 40px Inter, system-ui, sans-serif';
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(size * (c.width / 64), size, 1);
  return sp;
}
export { textSprite };

/**
 * Crea una escena 3D dentro de `container`.
 * opts: { extent, cameraPos, grid, axes, up }
 * Devuelve { scene, camera, renderer, controls, world, onFrame(fn), dispose(), resize() }
 */
export function createScene(container, opts = {}) {
  const { extent = 5, cameraPos = [8, 6, 9], grid = true, axes = true, background = 0x0b1020, zUp = false } = opts;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(background);
  container.appendChild(renderer.domElement);
  renderer.domElement.classList.add('three-canvas');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
  camera.position.set(...cameraPos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(5, 10, 7);
  scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0x88aaff, 0.4);
  dir2.position.set(-6, -4, -5);
  scene.add(dir2);

  const helpers = new THREE.Group();
  scene.add(helpers);
  // Con zUp, el sistema físico (x, y, z) se muestra con z vertical (rotación de −90° sobre x).
  const world = new THREE.Group();
  const axesGroup = new THREE.Group();
  if (zUp) { world.rotation.x = -Math.PI / 2; axesGroup.rotation.x = -Math.PI / 2; }
  scene.add(world);
  scene.add(axesGroup);

  function buildHelpers(ext) {
    while (helpers.children.length) helpers.remove(helpers.children[0]);
    while (axesGroup.children.length) axesGroup.remove(axesGroup.children[0]);
    if (grid) {
      const g = new THREE.GridHelper(ext * 2, 20, 0x334155, 0x1e293b);
      g.position.y = -ext;
      helpers.add(g);
    }
    if (axes) {
      const mk = (to, color, label) => {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(...to)]);
        axesGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })));
        const s = textSprite(label, '#' + color.toString(16).padStart(6, '0'), ext * 0.09);
        s.position.set(to[0] * 1.08, to[1] * 1.08, to[2] * 1.08);
        axesGroup.add(s);
      };
      mk([ext, 0, 0], 0xf87171, 'x');
      mk([0, ext, 0], 0x4ade80, 'y');
      mk([0, 0, ext], 0x60a5fa, 'z');
    }
  }
  buildHelpers(extent);

  const frameFns = [];
  let running = true;
  function resize() {
    const r = container.getBoundingClientRect();
    const w = Math.max(50, r.width), hh = Math.max(50, r.height);
    renderer.setSize(w, hh, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = hh + 'px';
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let last = performance.now();
  function loop(now) {
    if (!running) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    frameFns.forEach((f) => f(dt, now));
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return {
    THREE, scene, camera, renderer, controls, world,
    setExtent: buildHelpers,
    onFrame: (f) => frameFns.push(f),
    resize,
    clearWorld() {
      world.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); }); } });
      while (world.children.length) world.remove(world.children[0]);
    },
    dispose() {
      running = false; ro.disconnect(); controls.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}

/** Línea poligonal 3D a partir de una lista de puntos. Admite colores por vértice. */
export function polyline(points, color = 0x38bdf8, opacity = 1, colors = null) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(points.length * 3);
  points.forEach((p, i) => { arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2]; });
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  let mat;
  if (colors) {
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
    mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity });
  } else {
    mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  }
  return new THREE.Line(geo, mat);
}

/** Flecha 3D (para vectores de campo, velocidad o fuerza). */
export function arrow(from, dirVec, length, color, headScale = 0.25) {
  const d = new THREE.Vector3(...dirVec);
  if (d.lengthSq() === 0) d.set(1, 0, 0);
  d.normalize();
  return new THREE.ArrowHelper(d, new THREE.Vector3(...from), length, color, length * headScale, length * headScale * 0.6);
}

/** Pequeña flecha cónica a mitad de una línea de campo para indicar el sentido. */
export function lineArrowHeads(points, color, every = 40, size = 0.12) {
  const group = new THREE.Group();
  const geo = new THREE.ConeGeometry(size * 0.45, size, 10);
  geo.translate(0, size / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ color });
  for (let i = Math.floor(every / 2); i < points.length - 1; i += every) {
    const p = points[i], q = points[i + 1];
    const dir = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (dir.lengthSq() === 0) continue;
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p[0], p[1], p[2]);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    group.add(m);
  }
  return group;
}

/**
 * Agrupa muchas polilíneas en un único objeto LineSegments (una sola llamada de dibujo).
 * lines: [{ points: [[x,y,z],...], colors?: [r,g,b, r,g,b, ...] }]
 */
export function batchedLines(lines, color = 0xffffff, opacity = 1) {
  let n = 0;
  lines.forEach((l) => { n += Math.max(0, l.points.length - 1); });
  const pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
  const base = new THREE.Color(color);
  let k = 0;
  for (const l of lines) {
    const p = l.points, c = l.colors;
    for (let i = 0; i < p.length - 1; i++) {
      for (const j of [i, i + 1]) {
        pos[k] = p[j][0]; pos[k + 1] = p[j][1]; pos[k + 2] = p[j][2];
        if (c) { col[k] = c[j * 3]; col[k + 1] = c[j * 3 + 1]; col[k + 2] = c[j * 3 + 2]; }
        else { col[k] = base.r; col[k + 1] = base.g; col[k + 2] = base.b; }
        k += 3;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: opacity < 1, opacity }));
}

/** Puntas de flecha de muchas líneas en una sola malla instanciada. */
export function batchedArrowHeads(lines, color, every = 40, size = 0.12) {
  const items = [];
  for (const l of lines) {
    const pts = l.points;
    for (let i = Math.floor(every / 2); i < pts.length - 1; i += every) {
      const p = pts[i], q = pts[i + 1];
      const dir = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
      if (dir.lengthSq() > 0) items.push([p, dir.normalize()]);
    }
  }
  const geo = new THREE.ConeGeometry(size * 0.45, size, 10);
  geo.translate(0, size / 2, 0);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), Math.max(1, items.length));
  const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  items.forEach(([p, d], i) => { qt.setFromUnitVectors(up, d); m.compose(new THREE.Vector3(p[0], p[1], p[2]), qt, one); mesh.setMatrixAt(i, m); });
  mesh.count = items.length;
  return mesh;
}
