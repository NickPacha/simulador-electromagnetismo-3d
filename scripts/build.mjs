// Empaqueta la aplicación con esbuild y genera un único archivo HTML autocontenido
// (dist/index.html) que funciona sin conexión y sin servidor.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
mkdirSync('dist', { recursive: true });

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: !watch,
  format: 'iife',
  target: 'es2020',
  write: false,
  outdir: 'dist',
  loader: { '.css': 'css' },
  legalComments: 'none',
});

let js = '', css = '';
for (const f of result.outputFiles) {
  if (f.path.endsWith('.js')) js = f.text;
  if (f.path.endsWith('.css')) css = f.text;
}
const template = readFileSync('src/template.html', 'utf8');
const html = template
  .replace('<!-- CSS -->', `<style>${css}</style>`)
  .replace('<!-- JS -->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
writeFileSync('dist/index.html', html);
console.log(`dist/index.html generado (${(html.length / 1024).toFixed(0)} KB)`);
