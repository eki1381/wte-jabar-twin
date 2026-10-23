// Kembaran Digital WtE Jawa Barat: router, theme, lazy views, prefetch, service worker. No build step.
import { $, $$, isDark } from './ui.js';
import * as store from './store.js';

const VIEWS = ['ringkasan', 'peta', 'wilayah', 'rekomendasi', 'skenario', 'paper', 'metode'];
const TITLES = { ringkasan: 'Ringkasan', peta: 'Peta desa', wilayah: 'Wilayah', rekomendasi: 'Rekomendasi', skenario: 'Skenario pembiayaan', paper: 'Temuan paper', metode: 'Data dan metode' };
const mods = {}, mounted = {};
let current = null, silent = false;

// "#peta?l=org&desa=12"; older links (#desa=12, #kab=3204, #kab, #data) still resolve
export function parse(hash = location.hash) {
  const h = decodeURIComponent(hash.replace(/^#\/?/, ''));
  const [head, qs = ''] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs));
  if (VIEWS.includes(head)) return { view: head, params };
  const legacy = Object.fromEntries(new URLSearchParams(h.replace(/&/g, '&')));
  if ('desa' in legacy) return { view: 'peta', params: { desa: legacy.desa } };
  if ('kab' in legacy) return { view: 'wilayah', params: legacy.kab ? { kab: legacy.kab } : {} };
  if (h === 'data') return { view: 'metode', params: {} };
  return { view: 'ringkasan', params: {} };
}
const build = (view, params = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return `#${view}${q ? '?' + q : ''}`;
};
// change URL without re-rendering (views call this to keep their state shareable)
export function setParams(view, params) {
  const url = build(view, params);
  if (url === location.hash) return;
  silent = true; history.replaceState(null, '', url); silent = false;
}
export function go(view, params = {}) {
  const url = build(view, params);
  if (url === location.hash) route(); else location.hash = url;
}
const ctx = { go, setParams, store };

async function route() {
  if (silent) return;
  const { view, params } = parse();
  $$('.nav a').forEach((a) => (a.getAttribute('data-view') === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = `${TITLES[view]} · Kembaran Digital WtE Jawa Barat`;
  if (current !== view) {
    if (current) mods[current]?.hide?.();
    $$('main > .view').forEach((v) => (v.hidden = v.dataset.view !== view));
    if (current) window.scrollTo({ top: 0 });
    current = view;
  }
  try {
    const m = (mods[view] ||= await import(`./views/${view}.js`));
    if (!mounted[view]) { mounted[view] = true; await m.mount($(`#v-${view}`), ctx); }
    await m.update?.(params, ctx);
  } catch (e) {
    console.error(e);
    $(`#v-${view}`).insertAdjacentHTML('afterbegin', `<div class="wrap"><div class="callout warm"><h4>Bagian ini gagal dimuat</h4><p>${String(e.message || e)}. Muat ulang halaman; bila berulang, buka melalui server web (GitHub Pages atau python -m http.server).</p></div></div>`);
  }
}

// theme: explicit choice is remembered; views listen for "tema" to restyle charts and the map
$('#temaBtn').onclick = () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('wte-tema', next); } catch {}
  $('meta[name=theme-color]').content = next === 'dark' ? '#0b1310' : '#0d3b2c';
  dispatchEvent(new Event('tema'));
};

// Tanya data palette loads on first use
async function tanya(q) { (await import('./tanya.js')).open(ctx, q); }
$('#tanyaBtn').onclick = () => tanya();
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); tanya(); }
});
export { tanya };

addEventListener('hashchange', route);
route();

// after first paint: warm the map path, then register the offline cache
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
addEventListener('load', () => idle(() => { if (current !== 'peta') store.prefetchMap(); }, { timeout: 4000 }));
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
