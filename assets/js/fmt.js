// Indonesian number formatting. Ranges are written "a sampai b" (no dash), matching the paper style.
const cache = {};
const nf = (d) => (cache[d] ||= new Intl.NumberFormat('id-ID', { maximumFractionDigits: d, minimumFractionDigits: 0 }));

export const ok = (v) => v !== null && v !== undefined && !Number.isNaN(v);
export const num = (v, d = 0) => (ok(v) ? nf(d).format(v) : 'tidak tersedia');
export const pct = (v, d = 0) => (ok(v) ? `${nf(d).format(v * 100)} persen` : 'tidak tersedia');

export function rp(v, d = 1) {
  if (!ok(v)) return 'tidak tersedia';
  const a = Math.abs(v), s = v < 0 ? 'minus ' : '';
  if (a >= 1e12) return `${s}Rp${nf(2).format(a / 1e12)} triliun`;
  if (a >= 1e9) return `${s}Rp${nf(d).format(a / 1e9)} miliar`;
  if (a >= 1e6) return `${s}Rp${nf(d).format(a / 1e6)} juta`;
  return `${s}Rp${nf(0).format(a)}`;
}
// compact for axes and legends
export function short(v) {
  if (!ok(v)) return '';
  const a = Math.abs(v);
  if (a >= 1e12) return nf(1).format(v / 1e12) + ' T';
  if (a >= 1e9) return nf(1).format(v / 1e9) + ' M';
  if (a >= 1e6) return nf(1).format(v / 1e6) + ' jt';
  if (a >= 1e4) return nf(0).format(v / 1e3) + ' rb';
  if (a >= 100) return nf(0).format(v);
  if (a >= 1) return nf(1).format(v);
  return nf(2).format(v);
}
export const range = (a, b, d = 0) => `${num(a, d)} sampai ${num(b, d)}`;
export const title = (s) => (s || '').toLowerCase().replace(/(^|[\s(/.])([a-z])/g, (m, p, c) => p + c.toUpperCase());
export const kabTitle = (s) => title(s).replace(/^Kabupaten /, 'Kab. ');
export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function quantiles(values, k = 5) {
  const v = values.filter(ok).sort((a, b) => a - b);
  if (!v.length) return [];
  const out = [];
  for (let i = 1; i < k; i++) out.push(v[Math.min(v.length - 1, Math.floor((i / k) * v.length))]);
  return [...new Set(out)];
}
export function median(a) {
  const v = a.filter(ok).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
export function downloadCSV(name, rows) {
  const cols = Object.keys(rows[0]);
  const cell = (x) => { const s = x === null || x === undefined ? '' : String(x); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
