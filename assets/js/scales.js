// Colour ramps and class breaks shared by the map, mini maps, and legends.
import { ok, short, pct } from './fmt.js';
import { tcol } from './ui.js';

export const RAMPS = {
  hijau: ['#edf8e9', '#c7e9c0', '#a1d99b', '#74c476', '#31a354', '#006d2c'],
  biru: ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
  oranye: ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#e6550d', '#a63603'],
  ungu: ['#f2f0f7', '#dadaeb', '#bcbddc', '#9e9ac8', '#756bb1', '#54278f'],
  malam: ['#1d1b3b', '#3b2c6b', '#74358c', '#bd4677', '#ef7c4c', '#fcd34d'],
  teal: ['#e6f5f3', '#b7e3dc', '#7ccbbf', '#3fae9f', '#18867a', '#0b5c55'],
  div: ['#1a6545', '#5aa57c', '#b7dcc5', '#f4d9c4', '#ef9a62', '#9f4318'],
};

// quantile classes with counts; equal values collapse so a class is never empty
export function quantClasses(vals, ramp, k = 6) {
  const v = vals.filter(ok).sort((a, b) => a - b);
  if (!v.length) return { breaks: [], colors: [RAMPS[ramp][0]] };
  const br = [];
  for (let i = 1; i < k; i++) { const q = v[Math.min(v.length - 1, Math.floor((i / k) * v.length))]; if (!br.length || q > br[br.length - 1]) br.push(q); }
  if (br[br.length - 1] >= v[v.length - 1]) br.pop();
  const cols = RAMPS[ramp];
  const pick = br.length + 1 === cols.length ? cols : Array.from({ length: br.length + 1 }, (_, i) => cols[Math.round((i * (cols.length - 1)) / Math.max(1, br.length))]);
  return { breaks: br, colors: pick, min: v[0], max: v[v.length - 1] };
}
export function fixedClasses(br, ramp) {
  const cols = RAMPS[ramp];
  return { breaks: br, colors: Array.from({ length: br.length + 1 }, (_, i) => cols[Math.round((i * (cols.length - 1)) / br.length)]) };
}
export const classOf = (v, br) => { let i = 0; while (i < br.length && v >= br[i]) i++; return i; };

export function labelsFor(sc, isPct, min, max) {
  const f = (x) => (isPct ? pct(x) : short(x));
  const b = sc.breaks;
  return sc.colors.map((_, i) => {
    const lo = i === 0 ? (ok(min ?? sc.min) ? f(min ?? sc.min) : null) : f(b[i - 1]);
    const hi = i === b.length ? (ok(max ?? sc.max) ? f(max ?? sc.max) : null) : f(b[i]);
    if (lo == null) return `kurang dari ${hi}`;
    if (hi == null) return `${lo} atau lebih`;
    return `${lo} – ${hi}`;
  });
}

export const CAT = {
  tipe: () => ({ values: [1, 2, 3, 4], colors: [1, 2, 3, 4].map(tcol), labels: ['T1 Inti perkotaan', 'T2 Peri-urban', 'T3 Pasar dan event', 'T4 Agraris'] }),
  tahap: () => ({ values: [1, 2, 3], colors: ['#0d3b2c', '#3f9a72', '#a9dcc2'], labels: ['Tahap 1 (2026–2027)', 'Tahap 2 (2028–2029)', 'Tahap 3 (2030)'] }),
  bukti: () => ({ values: [1, 2, 3], colors: ['#1f9a68', '#e3a51c', '#e2622b'], labels: ['Kuat: jalankan langsung', 'Sedang: uji coba enam bulan', 'Indikatif: timbang dulu 30 hari'] }),
  sim: () => ({ values: [0, 1, 2], colors: ['#b9c3be', '#e3a51c', '#0d6b4b'], labels: ['Belum terdanai', 'Terdanai sebagian', 'Terdanai penuh atau swadana'] }),
  hub: () => ({ values: [1, 2], colors: ['#f5b52e', '#7ccbbf'], labels: ['Lokasi hub kecamatan', 'Desa terlayani hub'] }),
};
