// Lightweight maps without WebGL: an SVG choropleth for 27 kab/kota and a canvas mini map for desa polygons.
import { esc } from './fmt.js';

const LAT0 = Math.cos((-6.9 * Math.PI) / 180);
const proj = ([x, y]) => [x * LAT0, -y];
function rings(g) { return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; }
function bounds(features) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of features) for (const poly of rings(f.geometry)) for (const ring of poly) for (const p of ring) {
    const [x, y] = proj(p); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// features need properties.idkab; color(idkab) -> css colour; tip(idkab) -> html
export function svgChoropleth(el, geo, { color, tip, onClick, selected }) {
  const fs = geo.features, [x0, y0, x1, y1] = bounds(fs), W = 1000, s = W / (x1 - x0), H = Math.round((y1 - y0) * s);
  const pth = (g) => rings(g).map((poly) => poly.map((ring) => 'M' + ring.map((p) => { const [x, y] = proj(p); return `${((x - x0) * s).toFixed(1)},${((y - y0) * s).toFixed(1)}`; }).join('L') + 'Z').join('')).join('');
  el.classList.add('mapcard');
  el.innerHTML = `<svg class="svgmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Peta kabupaten/kota Jawa Barat">${fs.map((f) => {
    const k = String(f.properties.idkab);
    return `<path d="${pth(f.geometry)}" data-k="${k}" fill="${color(k)}" class="${k === selected ? 'on' : ''}" tabindex="0"><title>${esc(f.properties.nmkab)}</title></path>`;
  }).join('')}</svg><div class="maptip" hidden></div>`;
  const tipEl = el.querySelector('.maptip');
  el.querySelectorAll('path').forEach((p) => {
    p.addEventListener('mousemove', (e) => {
      if (!tip) return;
      const r = el.getBoundingClientRect();
      tipEl.innerHTML = tip(p.dataset.k); tipEl.hidden = false;
      const x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
      tipEl.style.left = Math.min(x, r.width - 270) + 'px'; tipEl.style.top = y + 'px';
    });
    p.addEventListener('mouseleave', () => (tipEl.hidden = true));
    if (onClick) { p.addEventListener('click', () => onClick(p.dataset.k)); p.addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(p.dataset.k); }); }
    p.querySelector('title').remove(); // custom tooltip replaces native title on hover devices
  });
}

// draw desa polygons onto a canvas, fitting the bbox of the given features
export function canvasMap(canvas, features, colorOf, { stroke } = {}) {
  const dpr = Math.min(2, devicePixelRatio || 1), w = canvas.clientWidth || 600;
  const [x0, y0, x1, y1] = bounds(features), s = (w - 16) / (x1 - x0), h = Math.min(520, Math.round((y1 - y0) * s) + 16);
  const sc = Math.min(s, (h - 16) / (y1 - y0));
  const ox = (w - (x1 - x0) * sc) / 2, oy = (h - (y1 - y0) * sc) / 2;
  canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h); ctx.lineJoin = 'round';
  for (const f of features) {
    ctx.beginPath();
    for (const poly of rings(f.geometry)) for (const ring of poly) ring.forEach((p, j) => { const [x, y] = proj(p); const X = ox + (x - x0) * sc, Y = oy + (y - y0) * sc; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.fillStyle = colorOf(f.id); ctx.fill('evenodd');
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.35; ctx.stroke(); }
  }
}

// shared fit for layered maps: an SVG overlay and a canvas underneath drawn with the same transform
export function fit(features, W) {
  const [x0, y0, x1, y1] = bounds(features), s = W / (x1 - x0), H = Math.round((y1 - y0) * s);
  const xy = (p) => { const [x, y] = proj(p); return [(x - x0) * s, (y - y0) * s]; };
  const path = (g) => rings(g).map((poly) => poly.map((ring) => 'M' + ring.map((p) => xy(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z').join('')).join('');
  return { W, H, xy, path };
}
export function drawFeatures(ctx, features, xy, colorOf) {
  for (const f of features) {
    const c = colorOf(f); if (!c) continue;
    ctx.beginPath();
    for (const poly of rings(f.geometry)) for (const ring of poly) ring.forEach((p, j) => { const [X, Y] = xy(p); j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.fillStyle = c; ctx.fill('evenodd');
  }
}
