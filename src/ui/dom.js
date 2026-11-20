// Pequeñas utilidades para construir la interfaz sin frameworks.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Sección plegable del panel de control. */
export function section(title, ...children) {
  return h('section', { class: 'panel-section' }, h('h3', {}, title), ...children);
}

/**
 * Control deslizante con etiqueta y valor. Soporta escala logarítmica.
 * opts: { label, min, max, step, value, unit, log, format, onInput }
 */
export function slider(opts) {
  const { label, min, max, step = 0.01, value, unit = '', log = false, format = null, onInput } = opts;
  const toSlider = (v) => (log ? Math.log10(v) : v);
  const fromSlider = (s) => (log ? Math.pow(10, s) : s);
  const out = h('span', { class: 'slider-value' });
  const input = h('input', {
    type: 'range',
    min: toSlider(min), max: toSlider(max), step: log ? 0.001 : step, value: toSlider(value),
    'aria-label': label,
  });
  const show = (v) => { out.textContent = format ? format(v) : `${+v.toFixed(4)} ${unit}`; };
  const api = {
    el: null,
    get value() { return fromSlider(parseFloat(input.value)); },
    set value(v) { input.value = toSlider(v); show(v); },
    input,
  };
  input.addEventListener('input', () => { const v = api.value; show(v); onInput && onInput(v); });
  show(value);
  api.el = h('label', { class: 'control slider' }, h('span', { class: 'control-label' }, label, out), input);
  return api;
}

/** Campo numérico con etiqueta. */
export function numberInput(opts) {
  const { label, value, step = 'any', unit = '', onChange, min, max, width } = opts;
  const input = h('input', { type: 'number', value, step, min, max, style: width ? { width } : undefined });
  input.addEventListener('change', () => onChange && onChange(parseFloat(input.value)));
  input.addEventListener('input', () => opts.live && onChange && !isNaN(parseFloat(input.value)) && onChange(parseFloat(input.value)));
  const el = h('label', { class: 'control number' }, h('span', { class: 'control-label' }, label), h('span', { class: 'input-unit' }, input, unit ? h('small', {}, unit) : null));
  return { el, input, get value() { return parseFloat(input.value); }, set value(v) { input.value = v; } };
}

export function select(opts) {
  const { label, options, value, onChange } = opts;
  const sel = h('select', {}, ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  sel.addEventListener('change', () => onChange && onChange(sel.value));
  const el = h('label', { class: 'control select' }, label ? h('span', { class: 'control-label' }, label) : null, sel);
  return { el, input: sel, get value() { return sel.value; }, set value(v) { sel.value = v; } };
}

export function checkbox(opts) {
  const { label, value, onChange } = opts;
  const input = h('input', { type: 'checkbox', checked: value });
  input.addEventListener('change', () => onChange && onChange(input.checked));
  const el = h('label', { class: 'control check' }, input, h('span', {}, label));
  return { el, input, get value() { return input.checked; }, set value(v) { input.checked = v; } };
}

export function button(label, onClick, cls = '') {
  return h('button', { class: `btn ${cls}`, onClick, type: 'button' }, label);
}

/** Grupo de botones excluyentes (pestañas o modos). */
export function segmented(options, value, onChange) {
  const wrap = h('div', { class: 'segmented', role: 'tablist' });
  const btns = options.map((o) => {
    const b = h('button', { type: 'button', class: o.value === value ? 'active' : '', role: 'tab' }, o.label);
    b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      onChange(o.value);
    });
    wrap.appendChild(b);
    return b;
  });
  return wrap;
}

/** Tabla de resultados clave-valor que se puede actualizar. */
export function resultsTable(rows) {
  const tbody = h('tbody');
  const cells = {};
  rows.forEach(([key, label]) => {
    const td = h('td', { class: 'val' }, '—');
    cells[key] = td;
    tbody.appendChild(h('tr', {}, h('th', { html: label }), td));
  });
  return {
    el: h('table', { class: 'results' }, tbody),
    set(key, value, cls) { if (cells[key]) { cells[key].innerHTML = value; cells[key].className = 'val ' + (cls || ''); } },
  };
}

/** Recuadro de fundamento teórico plegable. */
export function theory(html) {
  return h('details', { class: 'theory' }, h('summary', {}, 'Fundamento teórico'), h('div', { class: 'theory-body', html }));
}

export function downloadCSV(filename, header, rows) {
  const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
}

/** Ajusta un canvas al tamaño de su contenedor respetando devicePixelRatio. */
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // si el lienzo ya fue retirado del documento (cambio de módulo), se conserva su tamaño actual
  const r = canvas.parentElement ? canvas.parentElement.getBoundingClientRect() : { width: canvas.width / dpr, height: canvas.height / dpr };
  const w = Math.max(50, Math.floor(r.width)), hgt = Math.max(50, Math.floor(r.height));
  if (canvas.width !== w * dpr || canvas.height !== hgt * dpr) {
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = hgt + 'px';
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: hgt, dpr };
}

export function debounce(fn, ms = 30) {
  let t = null;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/** Planifica un único redibujado por cuadro. */
export function rafThrottle(fn) {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(); });
  };
}
