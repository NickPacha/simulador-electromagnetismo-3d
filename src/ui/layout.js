import { h } from './dom.js';

/**
 * Estructura estándar de un módulo: encabezado, escenario (visualización),
 * zona inferior opcional de gráficas y panel lateral de controles.
 */
export function moduleLayout(root, { title, unit, desc, plots = 0 }) {
  const stage = h('div', { class: 'stage' });
  const plotEls = [];
  let bottom = null;
  if (plots > 0) {
    bottom = h('div', { class: 'bottom' });
    for (let i = 0; i < plots; i++) {
      const c = h('canvas');
      const p = h('div', { class: 'plot' }, c);
      bottom.appendChild(p);
      plotEls.push(c);
    }
  }
  const panel = h('aside', { class: 'panel' });
  const el = h('div', { class: 'module' },
    h('div', { class: 'module-head' }, h('h2', {}, title), h('span', { class: 'unit' }, unit), desc ? h('p', {}, desc) : null),
    h('div', { class: 'view' }, stage, bottom),
    panel,
  );
  root.appendChild(el);
  return { el, stage, panel, plots: plotEls, bottom };
}
