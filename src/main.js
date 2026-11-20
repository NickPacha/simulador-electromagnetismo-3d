// Punto de entrada: barra lateral por unidades, enrutamiento por hash y página de inicio.
import './styles.css';
import { h } from './ui/dom.js';
import { MODULES, UNITS } from './modules/index.js';

const app = document.getElementById('app');
const content = h('main', { id: 'content' });
const nav = h('nav', { class: 'sidebar', 'aria-label': 'Módulos' });
app.append(
  h('header', { class: 'topbar' },
    h('div', { class: 'logo' }, 'EM'),
    h('div', {}, h('h1', {}, 'Simulador Interactivo de Campos Eléctricos y Magnéticos en 3D'), h('div', { class: 'sub' }, 'Física 2 · Ingeniería de Sistemas')),
    h('div', { class: 'spacer' }),
    h('span', { class: 'tag' }, 'v1.0'),
  ),
  nav, content,
);

let active = null;
const navButtons = new Map();

function renderNav() {
  const home = h('button', { class: 'nav-home', onClick: () => go('inicio') }, '⌂  Inicio');
  navButtons.set('inicio', home);
  nav.appendChild(home);
  UNITS.forEach((u) => {
    const box = h('div', { class: 'nav-unit' }, h('h4', {}, h('span', {}, `Unidad ${u.n} · `), u.short));
    MODULES.filter((m) => m.unit === u.n).forEach((m) => {
      const b = h('button', { class: 'nav-item', onClick: () => go(m.id), title: m.short }, h('span', { class: 'ic' }, m.icon), m.title);
      navButtons.set(m.id, b);
      box.appendChild(b);
    });
    nav.appendChild(box);
  });
}

function renderHome(root) {
  const el = h('div', { class: 'home' },
    h('div', { class: 'hero' },
      h('h2', {}, 'Explora la electricidad y el magnetismo en tiempo real'),
      h('p', {}, 'Este simulador permite visualizar campos eléctricos generados por distribuciones de carga, líneas y superficies equipotenciales, trayectorias de partículas cargadas en campos eléctricos y magnéticos, capacitores con dieléctricos y circuitos de corriente continua.'),
      h('p', {}, 'Cada módulo combina una visualización interactiva, controles para modificar los parámetros físicos, resultados numéricos calculados al instante y un recuadro con el fundamento teórico.'),
    ),
    h('div', { class: 'cards' }, ...UNITS.map((u) => h('div', { class: 'card' },
      h('div', { class: 'u' }, `Unidad ${u.n}`), h('h3', {}, u.title),
      ...MODULES.filter((m) => m.unit === u.n).map((m) => h('button', { onClick: () => go(m.id) }, h('span', { style: { fontSize: '18px', width: '24px', textAlign: 'center' } }, m.icon), h('span', {}, m.title, h('small', {}, m.short)))),
    ))),
    h('div', { class: 'howto' },
      h('b', {}, 'Cómo usarlo: '), 'elige un módulo en la barra lateral. Los controles están en el panel de la derecha; en las vistas 3D arrastra con el ratón para rotar, usa la rueda para acercar y el botón derecho para desplazar la cámara. ',
      'Todas las magnitudes están en unidades del SI.'),
  );
  root.appendChild(el);
  return { dispose: () => el.remove() };
}

function go(id) {
  if (location.hash !== '#' + id) { location.hash = id; return; }
  show(id);
}

function show(id) {
  if (active) { try { active.dispose && active.dispose(); } catch (e) { console.error(e); } }
  content.innerHTML = '';
  navButtons.forEach((b, k) => b.classList.toggle('active', k === id));
  const mod = MODULES.find((m) => m.id === id);
  active = mod ? mod.mount(content) : renderHome(content);
  window.__active = active;
  document.title = (mod ? mod.title + ' · ' : '') + 'Simulador EM 3D';
}

window.addEventListener('hashchange', () => show(location.hash.slice(1) || 'inicio'));
renderNav();
show(location.hash.slice(1) || 'inicio');
