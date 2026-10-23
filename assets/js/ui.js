// Shared UI helpers: DOM, theme colours, sortable tables, bars, count up, toast, lightbox.
import { esc, ok, num } from './fmt.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const isDark = () => document.documentElement.dataset.theme === 'dark'
  || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
// data saver or a slow connection: skip optional downloads that only add polish
export const lowData = () => { const c = navigator.connection; return !!(c?.saveData || /2g|3g/.test(c?.effectiveType || '')); };
export const debounce = (f, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const TIPE = { 1: 'T1 Inti perkotaan', 2: 'T2 Permukiman peri-urban', 3: 'T3 Simpul pasar dan event', 4: 'T4 Agraris perdesaan' };
export const TIPE_PENDEK = { 1: 'Inti perkotaan', 2: 'Peri-urban', 3: 'Pasar dan event', 4: 'Agraris' };
export const tcol = (t) => css(`--t${t}`) || '#888';
export const TAHAP = { 1: 'Tahap 1 (2026–2027)', 2: 'Tahap 2 (2028–2029)', 3: 'Tahap 3 (2030)' };
export const BUKTI = { 1: 'kuat', 2: 'sedang', 3: 'indikatif' };
export const MODUL = {
  1: 'Hub biogas kecamatan dengan pembangkit listrik dan panas gabungan',
  2: 'Digester komunal dan pengomposan yang ditambatkan pada bank sampah, pesantren, atau TPS3R',
  3: 'Unit anaerobic digestion modular di pasar atau destinasi dengan cadangan kapasitas musiman',
  4: 'Biodigester rumah tangga, kompos, dan budidaya maggot BSF melalui BUMDes',
};
export const ICON = {
  1: '<svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V9l4-3v15M9 21V4l6 3v14M15 21v-9l4 2v7"/></svg>',
  2: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>',
  3: '<svg viewBox="0 0 24 24"><path d="M3 9l2-5h14l2 5"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v7h14v-7"/></svg>',
  4: '<svg viewBox="0 0 24 24"><path d="M12 21V11"/><path d="M12 11c0-4 3-7 8-7 0 5-3 8-8 7z"/><path d="M12 14c0-3-2.5-5.5-7-5.5 0 4 2.5 6.5 7 5.5z"/></svg>',
};

export function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2200);
}
export async function copy(text, msg = 'Tautan disalin') {
  try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast('Salin manual: ' + text); }
}

export function countUp(root = document) {
  const els = $$('[data-count]', root);
  if (reduced()) return;
  const io = new IntersectionObserver((ents) => ents.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const el = e.target, end = +el.dataset.count, d = +(el.dataset.dec || 0), fmt = (v) => num(v, d), t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 900), v = end * (1 - Math.pow(1 - k, 3)); el.textContent = fmt(v); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: 0.3 });
  els.forEach((el) => io.observe(el));
}

export function cellbar(v, max, label, color) {
  const w = max > 0 && ok(v) ? Math.max(2, (100 * v) / max) : 0;
  // short bars put the label outside, in ink colour, so it stays readable
  const out = w < 42 ? ` class="out" style="left:calc(${w}% + 6px)"` : '';
  return `<div class="cellbar"><div class="tr"><i style="width:${w}%;${color ? `--bc:${color}` : ''}"></i><b${out}>${esc(label)}</b></div></div>`;
}
export function stack(parts, cls = '') {
  const tot = parts.reduce((a, p) => a + (p.v || 0), 0) || 1;
  return `<div class="stack ${cls}" role="img" aria-label="${esc(parts.map((p) => `${p.label} ${num(p.v)}`).join(', '))}">${parts.map((p) => `<i style="width:${(100 * (p.v || 0)) / tot}%;background:${p.color}" title="${esc(p.label)}: ${num(p.v)}"></i>`).join('')}</div>`;
}

// sortable table: columns [{key, label, n (numeric), fmt(row), sort(row) }]; pageSize renders one page of the sorted rows
export function table(el, { columns, rows, sortKey, sortDir = -1, onRow, rowKey, selected, limit, pageSize, onPage }) {
  let key = sortKey, dir = sortDir, page = 0;
  const draw = () => {
    const col = columns.find((c) => c.key === key);
    const sv = col?.sort || ((r) => r[key]);
    const data = key ? [...rows].sort((a, b) => { const x = sv(a), y = sv(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; }) : rows;
    const pages = pageSize ? Math.max(1, Math.ceil(data.length / pageSize)) : 1;
    page = Math.min(page, pages - 1);
    const shown = pageSize ? data.slice(page * pageSize, (page + 1) * pageSize) : limit ? data.slice(0, limit) : data;
    onPage?.({ page, pages, total: data.length });
    el.innerHTML = `<table class="t"><thead><tr>${columns.map((c) => `<th class="${c.n ? 'n ' : ''}${c.nosort ? '' : 'sortable'}" data-k="${c.key}" ${c.key === key ? `aria-sort="${dir < 0 ? 'descending' : 'ascending'}"` : ''} scope="col">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${shown.map((r) => `<tr class="${onRow ? 'click' : ''} ${rowKey && r[rowKey] === selected ? 'on' : ''}" data-r="${esc(rowKey ? r[rowKey] : '')}" ${onRow ? 'tabindex="0"' : ''}>${columns.map((c) => `<td class="${c.n ? 'n' : ''}">${c.fmt ? c.fmt(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $$('th.sortable', el).forEach((th) => (th.onclick = () => { const k = th.dataset.k; dir = k === key ? -dir : (columns.find((c) => c.key === k).n ? -1 : 1); key = k; page = 0; draw(); }));
    if (onRow) $$('tbody tr', el).forEach((tr) => {
      const go = () => onRow(rows.find((r) => String(r[rowKey]) === tr.dataset.r));
      tr.onclick = go; tr.onkeydown = (e) => { if (e.key === 'Enter') go(); };
    });
  };
  draw();
  return { redraw: (r, s) => { if (r) { rows = r; page = 0; } if (s !== undefined) selected = s; draw(); }, go: (p) => { page = Math.max(0, p); draw(); }, get page() { return page; } };
}

export function lightbox(src, caption) {
  const d = document.createElement('div');
  d.className = 'lightbox'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', caption || 'Gambar');
  d.innerHTML = `<div><img src="${esc(src)}" alt="${esc(caption)}"><p>${esc(caption)}</p></div>`;
  const close = () => { d.remove(); document.removeEventListener('keydown', k); };
  const k = (e) => { if (e.key === 'Escape') close(); };
  d.onclick = close; document.addEventListener('keydown', k); document.body.append(d);
}

// small chart helpers on top of Chart.js, themed from CSS variables
export function chartTheme(Chart) {
  Chart.defaults.font.family = css('--font');
  Chart.defaults.font.size = 11.5;
  Chart.defaults.color = css('--muted');
  Chart.defaults.borderColor = css('--line2');
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.legend.labels.boxWidth = 10;
  Chart.defaults.plugins.legend.labels.boxHeight = 10;
  Chart.defaults.plugins.tooltip.backgroundColor = isDark() ? '#e5efe9' : '#10241b';
  Chart.defaults.plugins.tooltip.titleColor = isDark() ? '#10241b' : '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = isDark() ? '#10241b' : '#fff';
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  // set only the duration: replacing the whole object drops Chart.js's colour interpolator and every hover throws
  Chart.defaults.animation.duration = reduced() ? 0 : 300;
}
const charts = new Map();
export function chart(canvas, cfg, Chart) {
  if (!canvas) return null;
  charts.get(canvas)?.destroy();
  const c = new Chart(canvas, cfg); charts.set(canvas, c); return c;
}
