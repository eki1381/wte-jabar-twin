// Kembaran Digital WtE Jawa Barat: static dashboard, no build step.
import { num, pct, rp, short, range, title, kabTitle, BULAN, BLN, esc, quantiles, median, ok, downloadCSV } from './fmt.js';
import { simulate, BASE, PRESET } from './sim.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const TIPE = { 1: 'T1 Inti perkotaan', 2: 'T2 Permukiman peri urban', 3: 'T3 Simpul pasar dan event', 4: 'T4 Agraris perdesaan' };
const TCOL = { 1: '#2a78d6', 2: '#eb6834', 3: '#1baf7a', 4: '#4a3aa7' };
const TAHAP = { 1: 'Tahap 1 (2026 sampai 2027)', 2: 'Tahap 2 (2028 sampai 2029)', 3: 'Tahap 3 (2030)' };
const TAHAP_COL = { 1: '#1f3d34', 2: '#5f9a83', 3: '#c3dccf' };
const RAMP = {
  blue: ['#e6eef8', '#b6cfee', '#78a9e0', '#3a7fcf', '#1c5296'],
  green: ['#e5f2ea', '#b4dbc3', '#77bd95', '#38966a', '#1a6545'],
  orange: ['#fbebdf', '#f6c7a5', '#ef9a62', '#dc6a30', '#9f4318'],
  div: ['#1a6545', '#77bd95', '#ece8dc', '#ef9a62', '#9f4318'],
};
const MISSING = '#dfe4e0';
// Ramadan and Lebaran months used to shade the time ribbon: the calendar month holding most days of Ramadan, and most days
// of the paper's Lebaran window (seven days before to six days after Idulfitri). A month can be both.
// Idulfitri: 2 Mei 2022, 22 April 2023, 10 April 2024, 31 Maret 2025, 20 Maret 2026, 10 Maret 2027
const RAMADAN = ['2022-04', '2023-04', '2024-03', '2025-03', '2026-03', '2027-02'];
const LEBARAN = ['2022-05', '2023-04', '2024-04', '2025-03', '2026-03', '2027-03'];

const LAYERS = [
  { id: 'org', label: 'Timbulan organik (median)', col: 'timbulan_organik_ton_th_p50', unit: 'ton per tahun', year: '2024', src: 'model Monte Carlo', ramp: 'green' },
  { id: 'orgd', label: 'Kepadatan timbulan organik', col: 'kepadatan_organik_ton_km2_th', unit: 'ton per km² per tahun', year: '2024', src: 'model Monte Carlo', ramp: 'green' },
  { id: 'tipe', label: 'Tipe desa WtE', cat: 'tipe_desa', year: '2026', src: 'tipologi k means dan LPA' },
  { id: 'tahap', label: 'Tahap implementasi', cat: 'tahap', year: '2026 sampai 2030', src: 'kurva pasokan VGF' },
  { id: 'vgf', label: 'Kebutuhan VGF bagian desa', col: 'vgf_juta_rp', unit: 'juta rupiah', year: '2026 sampai 2030', src: 'model ekonomi sel', ramp: 'blue' },
  { id: 'swa', label: 'Peluang swadana lewat gate fee', col: 'peluang_swadana', unit: 'peluang', year: '2026', src: 'Monte Carlo 3.000 iterasi', ramp: 'blue', isPct: true },
  { id: 'mac', label: 'Biaya abatemen marjinal', col: 'mac_rp_t_co2e', unit: 'rupiah per t CO₂e', year: '2026', src: 'model ekonomi sel', ramp: 'div' },
  { id: 'ghg', label: 'Emisi dihindari', col: 'emisi_dihindari_t_co2e_th', unit: 't CO₂e per tahun', year: 'kondisi tunak', src: 'IPCC FOD', ramp: 'green' },
  { id: 'ntl', label: 'Cahaya malam', yearCol: 'ntl_', unit: 'nW per cm² per sr', src: 'VIIRS via GEE', ramp: 'blue' },
  { id: 'ntlg', label: 'Perubahan cahaya malam 2022 ke 2025', col: 'ntl_pertumbuhan_2022_2025', unit: 'rasio', year: '2022 sampai 2025', src: 'VIIRS via GEE', ramp: 'div', isPct: true },
  { id: 'co', label: 'Kolom CO', yearCol: 'co_', unit: 'mmol per m²', src: 'Sentinel 5P via GEE', ramp: 'orange' },
  { id: 'so2', label: 'Kolom SO₂', yearCol: 'so2_', unit: '10⁻⁵ mol per m²', src: 'Sentinel 5P via GEE', ramp: 'orange' },
  { id: 'peak', label: 'Rasio puncak musiman', col: 'rasio_puncak_rerata', unit: 'rasio', year: 'kalender 2025', src: 'model musiman', ramp: 'orange' },
  { id: 'tpa', label: 'Jarak ke TPA', col: 'jarak_tpa_km', unit: 'km', year: 'diunduh 2026', src: 'OpenStreetMap', ramp: 'orange' },
  { id: 'conf', label: 'Skor keyakinan estimasi', col: 'skor_keyakinan', unit: 'skor 0 sampai 100', year: '2026', src: 'model penulis', ramp: 'blue' },
  { id: 'sim', label: 'Status skenario (simulasi)', sim: true, year: '2026 sampai 2030', src: 'simulasi di peramban' },
];

const S = {
  view: 'peta', layer: 'org', year: 2024, kab: '', tipe: new Set([1, 2, 3, 4]), tahap: new Set([1, 2, 3]),
  sel: null, ribbonVar: 'ntl', shards: {}, charts: {}, P: { ...BASE }, sim: null, kabSel: null,
};
let D, K, C, PV, KAMUS, GEO, KABGEO, N, map, featBy, byKab, idx;

// ---------------------------------------------------------------- data
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); }
async function load() {
  const [d, k, c, p, km, topo, kg] = await Promise.all(['data/desa.json', 'data/kabkota.json', 'data/sel.json', 'data/provinsi.json',
    'data/meta/kamus_data.json', 'data/geo/desa_jabar.topojson', 'data/geo/kabkota_jabar.geojson'].map(getJSON));
  D = d; K = k; C = c; PV = p; KAMUS = km; KABGEO = kg;
  N = D.uid.length;
  idx = new Map(D.uid.map((u, i) => [u, i]));
  const obj = topo.objects[Object.keys(topo.objects)[0]];
  GEO = topojson.feature(topo, obj);
  GEO.features.forEach((f) => { f.id = f.properties.uid; });
  featBy = new Map(GEO.features.map((f) => [f.id, f]));
  byKab = Object.fromEntries(K.map((x) => [x.kode_kabupaten_kota, x]));
  S.sim = simulate(C, K, S.P);
}
const val = (col, i) => D[col]?.[i];
const kabName = (kode) => kabTitle(byKab[String(kode)]?.nama_kabupaten_kota || String(kode));
async function shard(kode) {
  kode = String(kode);
  if (!S.shards[kode]) S.shards[kode] = getJSON(`data/series/kab_${kode}.json`);
  return S.shards[kode];
}

// ---------------------------------------------------------------- map
function layerDef() { return LAYERS.find((l) => l.id === S.layer); }
function colFor(l) { return l.yearCol ? l.yearCol + S.year : l.col; }

function valuesFor(l) {
  const out = new Array(N);
  if (l.sim) { for (let i = 0; i < N; i++) out[i] = S.sim.cellX[`${D.kode_kabupaten_kota[i]}_${D.tipe_desa[i]}`]; return out; }
  const c = l.cat || colFor(l);
  for (let i = 0; i < N; i++) out[i] = D.bukan_permukiman[i] ? null : D[c][i];
  return out;
}
function scaleFor(l, vals) {
  if (l.cat === 'tipe_desa') return { cat: true, breaks: [1.5, 2.5, 3.5], colors: [TCOL[1], TCOL[2], TCOL[3], TCOL[4]], labels: [1, 2, 3, 4].map((t) => TIPE[t]) };
  if (l.cat === 'tahap') return { cat: true, breaks: [1.5, 2.5], colors: [TAHAP_COL[1], TAHAP_COL[2], TAHAP_COL[3]], labels: [1, 2, 3].map((t) => TAHAP[t]) };
  if (l.sim) return { cat: true, breaks: [0.01, 0.99], colors: ['#c9cfcb', '#e0a23a', '#1f3d34'], labels: ['Belum terdanai', 'Terdanai sebagian', 'Terdanai penuh atau swadana'] };
  let br = quantiles(vals, 5);
  if (l.ramp === 'div' && l.id === 'mac') br = [-200000, 0, 200000, 600000];
  const colors = RAMP[l.ramp].slice(0, br.length + 1);
  const f = (v) => (l.isPct ? pct(v) : short(v));
  const labels = colors.map((_, i) => (i === 0 ? `kurang dari ${f(br[0])}` : i === br.length ? `${f(br[i - 1])} atau lebih` : `${f(br[i - 1])} sampai ${f(br[i])}`));
  return { cat: false, breaks: br, colors, labels };
}
function stepExpr(sc) {
  const e = ['step', ['to-number', ['feature-state', 'v'], 0], sc.colors[0]];
  sc.breaks.forEach((b, i) => e.push(b, sc.colors[i + 1]));
  return ['case', ['boolean', ['feature-state', 'm'], true], MISSING, e];
}
function passFilter(i) {
  if (S.kab && String(D.kode_kabupaten_kota[i]) !== S.kab) return false;
  if (!S.tipe.has(D.tipe_desa[i])) return false;
  if (!S.tahap.has(D.tahap[i])) return false;
  return true;
}
function paint() {
  if (!map || !map.getSource('desa')) return;
  const l = layerDef(), vals = valuesFor(l), sc = scaleFor(l, vals);
  for (let i = 0; i < N; i++) {
    const v = vals[i];
    map.setFeatureState({ source: 'desa', id: D.uid[i] }, { v: ok(v) ? v : 0, m: !ok(v), off: !passFilter(i) });
  }
  map.setPaintProperty('desa-fill', 'fill-color', stepExpr(sc));
  renderLegend(l, sc);
  $('#tahunWrap').classList.toggle('dim', !l.yearCol);
  $$('#tahun button').forEach((b) => (b.disabled = !l.yearCol));
}
function renderLegend(l, sc) {
  const yr = l.yearCol ? String(S.year) : l.year;
  $('#legend').innerHTML = `<h4>${esc(l.label)}</h4>` +
    sc.labels.map((t, i) => `<div class="row"><span class="sw" style="background:${sc.colors[i]}"></span>${esc(t)}</div>`).join('') +
    `<div class="row"><span class="sw" style="background:${MISSING}"></span>bukan permukiman atau tanpa data</div>` +
    `<p class="note">${l.unit ? esc(l.unit) + '. ' : ''}Data ${esc(yr)}, sumber ${esc(l.src)}.${sc.cat ? '' : ' Kelas kuantil se Jawa Barat.'}${l.id === 'mac' ? ' Nilai negatif berarti penghematan bersih.' : ''}${l.sim ? ' Ikuti pengaturan di tab Provinsi dan skenario.' : ''}</p>`;
}

function initMap() {
  map = new maplibregl.Map({
    container: 'map', attributionControl: { compact: true },
    style: {
      version: 8,
      sources: {
        // Esri Light Gray Canvas: no API key needed (CARTO basemaps now return "API KEY REQUIRED" tiles)
        base: { type: 'raster', tileSize: 256, maxzoom: 16, attribution: 'Peta dasar © Esri, HERE, Garmin, © OpenStreetMap contributors, dan komunitas pengguna GIS',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'] },
        lab: { type: 'raster', tileSize: 256, maxzoom: 16, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}'] },
      },
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef2ee' } }, { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 0.85 } }],
    },
    bounds: [[106.35, -7.85], [108.85, -5.9]], fitBoundsOptions: { padding: 20 }, maxZoom: 15, minZoom: 6.5,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    map.addSource('desa', { type: 'geojson', data: GEO });
    map.addSource('kab', { type: 'geojson', data: KABGEO });
    map.addLayer({ id: 'desa-fill', type: 'fill', source: 'desa',
      paint: { 'fill-color': MISSING, 'fill-opacity': ['case', ['boolean', ['feature-state', 'off'], false], 0.1, 0.88] } });
    map.addLayer({ id: 'desa-line', type: 'line', source: 'desa', minzoom: 9, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.2, 13, 1] } });
    map.addLayer({ id: 'kab-line', type: 'line', source: 'kab', paint: { 'line-color': '#1f3d34', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.7, 12, 2], 'line-opacity': 0.75 } });
    map.addLayer({ id: 'labels', type: 'raster', source: 'lab', paint: { 'raster-opacity': 0.9 } });
    map.addLayer({ id: 'desa-sel', type: 'line', source: 'desa', filter: ['==', ['get', 'uid'], -1], paint: { 'line-color': '#111c18', 'line-width': 2.6 } });
    map.addLayer({ id: 'desa-hl', type: 'line', source: 'desa', filter: ['==', ['get', 'uid'], -1], paint: { 'line-color': '#2a78d6', 'line-width': 1.6 } });
    paint();
    const hv = $('#hover');
    map.on('mousemove', 'desa-fill', (e) => {
      const u = e.features[0].properties.uid, i = idx.get(u);
      map.getCanvas().style.cursor = 'pointer';
      map.setFilter('desa-hl', ['==', ['get', 'uid'], u]);
      const l = layerDef(), v = valuesFor(l)[i];
      let vs;
      if (l.cat === 'tipe_desa') vs = TIPE[v]; else if (l.cat === 'tahap') vs = TAHAP[v]; else if (l.sim) vs = ok(v) ? `${pct(v)} terdanai` : '';
      else vs = ok(v) ? (l.isPct ? pct(v) : `${num(v, Math.abs(v) < 10 ? 2 : 0)} ${l.unit}`) : 'tanpa data';
      hv.innerHTML = `<b>${esc(title(D.bps_nama_desa_kelurahan[i]))}</b>${esc(title(D.bps_nama_kecamatan[i]))}, ${esc(kabName(D.kode_kabupaten_kota[i]))}<br>${esc(vs)}`;
      hv.hidden = false; hv.style.left = e.point.x + 14 + 'px'; hv.style.top = e.point.y + 14 + 'px';
    });
    map.on('mouseleave', 'desa-fill', () => { hv.hidden = true; map.getCanvas().style.cursor = ''; map.setFilter('desa-hl', ['==', ['get', 'uid'], -1]); });
    map.on('click', 'desa-fill', (e) => selectDesa(e.features[0].properties.uid, false));
    const h = parseHash();
    if (h.desa != null && idx.has(+h.desa)) selectDesa(+h.desa, true);
  });
}
function bboxOf(geom) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (a) => { if (typeof a[0] === 'number') { x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]); } else a.forEach(walk); };
  walk(geom.coordinates); return [[x0, y0], [x1, y1]];
}
function zoomKab(kode) {
  if (!map) return;
  if (!kode) { map.fitBounds([[106.35, -7.85], [108.85, -5.9]], { padding: 20 }); return; }
  const f = KABGEO.features.find((x) => String(x.properties.idkab) === String(kode));
  if (f) map.fitBounds(bboxOf(f.geometry), { padding: 30, duration: 700 });
}

// ---------------------------------------------------------------- rail controls
function initRail() {
  $('#lapisan').innerHTML = LAYERS.map((l) => `<option value="${l.id}">${esc(l.label)}</option>`).join('');
  $('#lapisan').value = S.layer;
  $('#lapisan').onchange = (e) => { S.layer = e.target.value; paint(); };
  const yrs = PV.tahun_tersedia || [2022, 2023, 2024, 2025];
  if (!yrs.includes(S.year)) S.year = yrs[yrs.length - 1];
  $('#tahun').innerHTML = yrs.map((y) => `<button data-y="${y}" aria-pressed="${y === S.year}">${y}</button>`).join('');
  $$('#tahun button').forEach((b) => (b.onclick = () => { S.year = +b.dataset.y; $$('#tahun button').forEach((x) => x.setAttribute('aria-pressed', x === b)); paint(); }));
  $('#fKab').innerHTML += K.map((k) => `<option value="${k.kode_kabupaten_kota}">${esc(kabTitle(k.nama_kabupaten_kota))}</option>`).join('');
  $('#fKab').onchange = (e) => { S.kab = e.target.value; paint(); zoomKab(S.kab); };
  $('#fTipe').insertAdjacentHTML('beforeend', [1, 2, 3, 4].map((t) => `<button class="chip" data-t="${t}" aria-pressed="true"><i style="background:${TCOL[t]}"></i>${esc(TIPE[t])}</button>`).join(''));
  $('#fTahap').insertAdjacentHTML('beforeend', [1, 2, 3].map((t) => `<button class="chip" data-p="${t}" aria-pressed="true"><i style="background:${TAHAP_COL[t]}"></i>${esc(TAHAP[t])}</button>`).join(''));
  $$('#fTipe .chip').forEach((b) => (b.onclick = () => toggle(S.tipe, +b.dataset.t, b)));
  $$('#fTahap .chip').forEach((b) => (b.onclick = () => toggle(S.tahap, +b.dataset.p, b)));
  const lb = (PV.bulan || []).slice(-1)[0] || '2025-12';
  $('#vintage').innerHTML = `Versi data ${esc(PV.versi_data)}. Deret GEE sampai ${BULAN[+lb.slice(5) - 1]} ${lb.slice(0, 4)}. Rujukan: ${esc(PV.paper)}.`;
  // search
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '');
  const names = D.bps_nama_desa_kelurahan.map((n) => norm(n || ''));
  const inp = $('#cari'), ul = $('#hasilCari');
  let hits = [], act = -1;
  const show = () => {
    ul.innerHTML = hits.map((i, j) => `<li role="option" data-i="${i}" aria-selected="${j === act}">${esc(title(D.bps_nama_desa_kelurahan[i]))}<small>${esc(title(D.bps_nama_kecamatan[i]))}, ${esc(kabName(D.kode_kabupaten_kota[i]))}</small></li>`).join('');
    $$('li', ul).forEach((li) => (li.onmousedown = () => pick(+li.dataset.i)));
  };
  const pick = (i) => { ul.innerHTML = ''; inp.value = title(D.bps_nama_desa_kelurahan[i]); setView('peta'); selectDesa(D.uid[i], true); };
  inp.oninput = () => {
    const q = norm(inp.value.trim()); act = -1;
    if (q.length < 2) { hits = []; show(); return; }
    hits = [];
    for (let i = 0; i < N && hits.length < 40; i++) if (names[i].includes(q)) hits.push(i);
    hits.sort((a, b) => (names[a].startsWith(q) ? 0 : 1) - (names[b].startsWith(q) ? 0 : 1)); hits = hits.slice(0, 8); show();
  };
  inp.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { act = Math.min(act + 1, hits.length - 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act = Math.max(act - 1, 0); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits.length) pick(hits[Math.max(act, 0)]);
    else if (e.key === 'Escape') { ul.innerHTML = ''; }
  };
  inp.onblur = () => setTimeout(() => (ul.innerHTML = ''), 150);
  $$('#ribbonVar button').forEach((b) => (b.onclick = () => { S.ribbonVar = b.dataset.v; $$('#ribbonVar button').forEach((x) => x.setAttribute('aria-pressed', x === b)); drawRibbon(); }));
}
function toggle(set, v, btn) {
  if (set.has(v) && set.size > 1) set.delete(v); else set.add(v);
  btn.parentElement.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-pressed', set.has(+(b.dataset.t || b.dataset.p))));
  paint();
}

// ---------------------------------------------------------------- drawer
function provSnapshot() {
  const k = PV.kpi, sd = PV.skenario.dasar;
  $('#provSnapshot').innerHTML = `
    <div class="facts">
      <div><b>${num(N)}</b>poligon desa dan kelurahan, batas BPS 2024</div>
      <div><b>${num(k.timbulan_organik_ton_th[1] / 1e6, 2)} juta ton</b>timbulan organik per tahun, interval 90 persen ${num(k.timbulan_organik_ton_th[0] / 1e6, 2)} sampai ${num(k.timbulan_organik_ton_th[2] / 1e6, 2)} (2024)</div>
      <div><b>${num(k.emisi_dihindari_tunak_t[1] / 1e6, 2)} juta t</b>CO₂e per tahun dapat dihindari pada kondisi tunak</div>
      <div><b>${rp(k.vgf_rp[1])}</b>kebutuhan VGF lima tahun (median), tertutup penuh pada skenario fiskal dasar</div>
    </div>
    <h3 style="font-size:14px;margin:14px 0 6px;color:var(--moss)">Sebaran tipe desa</h3>
    <div class="legend" style="border:0;padding:0">${[1, 2, 3, 4].map((t) => `<div class="row"><span class="sw" style="background:${TCOL[t]}"></span>${esc(TIPE[t])}: ${num(PV.profil_tipe[t].desa)} desa</div>`).join('')}</div>
    <p class="vintage" style="margin-top:12px">Rekomendasi setiap desa ditulis dari data: kondisi diberi label tahun dan sumber terlebih dahulu, baru tindakan.</p>`;
}
function splitSrc(s) { const m = s.match(/^(.*)\s\[(.+)\]$/); return m ? [m[1], m[2]] : [s, '']; }

async function selectDesa(uid, fly) {
  const i = idx.get(uid); if (i == null) return;
  S.sel = uid;
  if (map && map.getLayer('desa-sel')) map.setFilter('desa-sel', ['==', ['get', 'uid'], uid]);
  if (fly && map) { const f = featBy.get(uid); map.fitBounds(bboxOf(f.geometry), { padding: 120, maxZoom: 12.5, duration: 800 }); }
  history.replaceState(null, '', `#desa=${uid}`);
  const kode = D.kode_kabupaten_kota[i], t = D.tipe_desa[i];
  $('#drawerEmpty').hidden = true;
  const body = $('#drawerBody'); body.hidden = false;
  const conf = D.kategori_keyakinan[i];
  body.innerHTML = `
    <div class="d-head">
      <h2>${esc(title(D.bps_nama_desa_kelurahan[i]))}</h2>
      <div class="where">Kec. ${esc(title(D.bps_nama_kecamatan[i]))}, ${esc(kabName(kode))}. Kode BPS ${D.bps_kode_desa_kelurahan[i]}</div>
      ${t ? `<span class="typechip" style="background:${TCOL[t]}">${esc(TIPE[t])}</span>` : ''}
    </div>
    <div class="facts">
      <div><b>${num(D.penduduk_model[i])}</b>jiwa, model 2024</div>
      <div><b>${num(D.timbulan_organik_ton_th_p50[i])} ton</b>organik per tahun, ${range(D.timbulan_organik_ton_th_p05[i], D.timbulan_organik_ton_th_p95[i])}</div>
      <div><b>${rp((D.vgf_juta_rp[i] || 0) * 1e6)}</b>VGF bagian desa, 2026 sampai 2030</div>
      <div><b>${num(D.emisi_dihindari_t_co2e_th[i])} t</b>CO₂e per tahun dihindari</div>
    </div>
    <div id="recBox"><p class="vintage">Memuat kondisi data dan rekomendasi</p></div>
    <div class="sect"><h3>Kalender timbulan organik, model 2025</h3><div class="mini"><canvas id="seasChart"></canvas></div></div>
    <div class="actions"><button class="btn solid" id="dlDesa">Unduh data desa (CSV)</button><button class="btn" id="cpLink">Salin tautan desa</button></div>
    <p class="vintage" style="margin-top:10px">Skor keyakinan estimasi ${num(D.skor_keyakinan[i])} dari 100 (${esc(conf)}).</p>`;
  $('#cpLink').onclick = () => { navigator.clipboard?.writeText(location.href); $('#cpLink').textContent = 'Tautan disalin'; };
  const sh = await shard(kode);
  if (S.sel !== uid) return;
  const rec = sh.desa[uid] || sh.desa[String(uid)];
  S.selShard = sh; S.selRec = rec;
  renderRec(rec, i);
  drawSeason(rec?.musiman);
  drawRibbon();
  $('#dlDesa').onclick = () => {
    const row = {};
    Object.keys(D).forEach((c) => (row[c] = D[c][i]));
    row.kabupaten_kota = byKab[String(kode)]?.nama_kabupaten_kota;
    if (rec?.rek) Object.entries(rec.rek).forEach(([k2, v]) => (row['rek_' + k2] = Array.isArray(v) ? v.join(' | ') : v));
    downloadCSV(`desa_${D.bps_kode_desa_kelurahan[i]}_${uid}.csv`, [row]);
  };
}
function renderRec(rec, i) {
  const box = $('#recBox');
  if (!rec?.rek) { box.innerHTML = '<p class="vintage">Rekomendasi tidak tersedia untuk poligon ini.</p>'; return; }
  const r = rec.rek, kb = (r.kekuatan_bukti || '').split(' ')[0];
  box.innerHTML = `
    <div class="sect"><h3>Kondisi data</h3><ul class="cond">${(r.kondisi || []).map((s) => { const [a, b] = splitSrc(s); return `<li>${esc(a)}${b ? `<span class="src">${esc(b)}</span>` : ''}</li>`; }).join('')}</ul></div>
    <div class="sect"><h3>Rekomendasi</h3><div class="rec">
      <div class="main">${esc(r.rekomendasi_utama)}</div>
      <dl>
        <dt>Waktu</dt><dd>${esc(r.tahap_teks || '')}</dd>
        <dt>Aktor</dt><dd>${esc(r.aktor || '')}</dd>
        <dt>Instrumen</dt><dd>${esc(r.instrumen || '')}</dd>
        <dt>Target</dt><dd>${esc(r.target || '')}</dd>
        <dt>Bukti</dt><dd><span class="badge ${esc(kb)}">${esc(r.kekuatan_bukti || '')}</span></dd>
      </dl>
      <ul>${(r.aksi || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      ${(r.catatan || []).length ? `<div class="notes">${r.catatan.map((c) => `<p>${esc(c)}</p>`).join('')}</div>` : ''}
    </div></div>`;
}
function chart(id, cfg) {
  if (S.charts[id]) S.charts[id].destroy();
  const el = document.getElementById(id); if (!el) return null;
  S.charts[id] = new Chart(el, cfg); return S.charts[id];
}
Chart.defaults.locale = 'id-ID';
Chart.defaults.font.family = "'Public Sans', system-ui, sans-serif";
Chart.defaults.font.size = 11.5;
Chart.defaults.color = '#4c5753';
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.boxHeight = 10;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 };

function drawSeason(m) {
  if (!m) return;
  const t = D.tipe_desa[idx.get(S.sel)];
  chart('seasChart', {
    type: 'bar',
    data: { labels: BLN, datasets: [{ data: m, backgroundColor: m.map((v) => (v === Math.max(...m) ? TCOL[t] || '#1f3d34' : '#c8d4ce')), borderRadius: 2 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${num(c.raw, 1)} ton organik` } } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: '#edf0ee' }, title: { display: true, text: 'ton per bulan' } } } },
  });
}

// time ribbon: monthly desa series against the median of its type, with Ramadan and Lebaran shaded
const shade = {
  id: 'shade',
  beforeDatasetsDraw(ch) {
    const { ctx, chartArea: a, scales: { x } } = ch; if (!a) return;
    const labels = ch.data.labels, w = x.width / labels.length;
    ctx.save();
    labels.forEach((l, j) => {
      const isR = RAMADAN.includes(l), isL = LEBARAN.includes(l);
      if (!isR && !isL) return;
      ctx.fillStyle = isL ? 'rgba(235,104,52,.16)' : 'rgba(31,61,52,.07)';
      ctx.fillRect(x.getPixelForValue(j) - w / 2, a.top, w, a.bottom - a.top);
    });
    ctx.restore();
  },
};
const UNIT = { ntl: 'nW per cm² per sr', co: 'mmol per m²', so2: '10⁻⁵ mol per m²' };
const VNAME = { ntl: 'Cahaya malam', co: 'Kolom CO', so2: 'Kolom SO₂' };
function drawRibbon() {
  const v = S.ribbonVar, labels = monthLabels(), last = labels[labels.length - 1] || '';
  let ds = [], ttl;
  if (S.sel != null && S.selRec?.seri) {
    const i = idx.get(S.sel), t = D.tipe_desa[i];
    ttl = `${VNAME[v]} bulanan ${title(D.bps_nama_desa_kelurahan[i])}, ${labels[0]?.slice(0, 4)} sampai ${last.slice(0, 4)}, dibanding median ${TIPE[t] || 'tipe'}`;
    ds.push({ label: title(D.bps_nama_desa_kelurahan[i]), data: S.selRec.seri[v], borderColor: '#1f3d34', backgroundColor: '#1f3d34', borderWidth: 2, pointRadius: 0, spanGaps: true, tension: 0.25 });
    if (t) ds.push({ label: `median ${TIPE[t]}`, data: PV.seri_median_tipe[t][v], borderColor: TCOL[t], borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, spanGaps: true, tension: 0.25 });
  } else {
    ttl = `${VNAME[v]} bulanan, median per tipe desa, ${labels[0]?.slice(0, 4)} sampai ${last.slice(0, 4)}. Klik desa untuk membandingkan`;
    ds = [1, 2, 3, 4].map((t) => ({ label: TIPE[t], data: PV.seri_median_tipe[t][v], borderColor: TCOL[t], backgroundColor: TCOL[t], borderWidth: 1.6, pointRadius: 0, spanGaps: true, tension: 0.25 }));
  }
  $('#ribbonTitle').textContent = ttl;
  chart('ribbonChart', {
    type: 'line', data: { labels, datasets: ds }, plugins: [shade],
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', align: 'end' },
        tooltip: { callbacks: { title: (it) => { const [y, m] = it[0].label.split('-'); const r = RAMADAN.includes(it[0].label), l = LEBARAN.includes(it[0].label); const tag = r && l ? ', Ramadan dan Lebaran' : r ? ', Ramadan' : l ? ', bulan Lebaran' : ''; return `${BULAN[+m - 1]} ${y}${tag}`; },
          label: (c) => `${c.dataset.label}: ${ok(c.raw) ? num(c.raw, 2) : 'tanpa citra'} ${UNIT[v]}` } } },
      scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (_, j) => (j % 12 === 0 ? labels[j].slice(0, 4) : j % 3 === 0 && window.innerWidth > 900 ? BLN[j % 12] : '') } },
        y: { grid: { color: '#edf0ee' }, title: { display: true, text: UNIT[v] } } },
    },
  });
}
function monthLabels() { return PV.bulan || S.selShard?.bulan || []; }

// ---------------------------------------------------------------- kabupaten/kota view
function renderKabView() {
  const el = $('#viewKab');
  const rows = [...K].sort((a, b) => b.timbulan_organik_ton_th - a.timbulan_organik_ton_th);
  const sel = byKab[S.kabSel] ? S.kabSel : rows[0].kode_kabupaten_kota;
  S.kabSel = sel;
  history.replaceState(null, '', `#kab=${sel}`);
  el.innerHTML = `
    <h2>Kabupaten dan kota</h2>
    <p class="lead">Setiap baris memadukan APBD 2018 sampai 2025, IDSD 2022 sampai 2025, Susenas 2021 sampai 2024, dan hasil model. Klik baris untuk membaca kondisi data, rekomendasi, dan rincian empat sel tipologi.</p>
    <div class="grid2">
      <div class="box"><h3>Ringkasan 27 kabupaten/kota, skenario dasar</h3><div class="tablewrap"><table class="t" id="kabTable">
        <thead><tr><th>Kabupaten/kota</th><th class="n">Organik (ribu ton)</th><th class="n">VGF</th><th class="n">VGF per belanja modal 5 tahun</th><th>Kuadran</th></tr></thead>
        <tbody>${rows.map((k) => `<tr class="click" data-k="${k.kode_kabupaten_kota}" ${k.kode_kabupaten_kota === sel ? 'style="background:var(--paper)"' : ''}>
          <td>${esc(kabTitle(k.nama_kabupaten_kota))}</td><td class="n">${num(k.timbulan_organik_ton_th / 1e3, 1)}</td><td class="n">${short(k.vgf)}</td>
          <td class="n">${pct(k.vgf_per_belanja_modal_5th, 1)}</td><td>${esc((k.quadrant || '').split(':')[0])}</td></tr>`).join('')}</tbody></table></div>
        <p class="vintage">VGF dalam rupiah (M berarti miliar, T berarti triliun). Kuadran: I potensi dan kesiapan tinggi, II potensi tinggi kesiapan rendah, III potensi rendah kesiapan tinggi, IV keduanya rendah.</p>
      </div>
      <div class="box" id="kabDetail"></div>
    </div>
    <div class="grid2" style="margin-top:22px">
      <div class="box"><h3>Ruang fiskal APBD, 2018 sampai 2025</h3><div class="chart"><canvas id="kApbd"></canvas></div><p class="vintage">Sumber DJPK Kemenkeu. Pangsa belanja modal dan rasio SiLPA terhadap belanja.</p></div>
      <div class="box"><h3>Skor IDSD dan inklusi keuangan</h3><div class="chart"><canvas id="kIdsd"></canvas></div><p class="vintage">IDSD BRIN 2022 sampai 2025 (skor 1 sampai 5); Susenas 2021 sampai 2024 (persen rumah tangga).</p></div>
    </div>
    <div class="box" style="margin-top:22px"><h3>Empat sel tipologi di kabupaten/kota terpilih</h3><div class="tablewrap" id="cellTable"></div>
      <p class="vintage">Median dan persentil dari 3.000 iterasi Monte Carlo. VGF p90 adalah kebutuhan pada kondisi buruk satu dari sepuluh.</p></div>`;
  $$('#kabTable tr.click').forEach((tr) => (tr.onclick = () => { S.kabSel = tr.dataset.k; renderKabView(); }));
  renderKabDetail(sel);
}
function renderKabDetail(kode) {
  const k = byKab[kode], r = k.rek, kb = (r.kekuatan_bukti || '').split(' ')[0];
  $('#kabDetail').innerHTML = `
    <h3>${esc(kabTitle(k.nama_kabupaten_kota))}</h3>
    <div class="facts">
      <div><b>${num(k.jumlah_desa)}</b>desa dan kelurahan; ${num(k.hub_kecamatan)} hub kecamatan</div>
      <div><b>${rp(k.vgf)}</b>VGF lima tahun, ${pct(k.vgf_per_belanja_modal_5th, 1)} belanja modal</div>
    </div>
    <div class="sect"><h3>Kondisi data</h3><ul class="cond">${r.kondisi.map((s) => { const [a, b] = splitSrc(s); return `<li>${esc(a)}${b ? `<span class="src">${esc(b)}</span>` : ''}</li>`; }).join('')}</ul></div>
    <div class="sect"><h3>Rekomendasi ${esc(String(r.tahun_rekomendasi || 2026))}</h3><div class="rec"><div class="main">${esc(r.rekomendasi_utama)}</div>
      <dl><dt>Aktor</dt><dd>${esc(r.aktor)}</dd><dt>Instrumen</dt><dd>${esc(r.instrumen_utama)}</dd><dt>Target</dt><dd>${esc(r.target)}</dd>
      <dt>Bukti</dt><dd><span class="badge ${esc(kb)}">${esc(r.kekuatan_bukti)}</span></dd><dt>Data rujukan</dt><dd>${esc(r.tahun_data_rujukan)}</dd></dl>
      <ul>${r.aksi.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      ${(r.catatan || []).length ? `<div class="notes">${r.catatan.map((c) => `<p>${esc(c)}</p>`).join('')}</div>` : ''}</div></div>
    <div class="sect"><h3>Sumber VGF skenario dasar</h3><div class="mini" style="height:90px"><canvas id="kFund"></canvas></div></div>
    <div class="actions"><button class="btn solid" id="kMap">Lihat desa di peta</button><button class="btn" id="kDl">Unduh rekomendasi (CSV)</button></div>`;
  $('#kMap').onclick = () => { S.kab = kode; $('#fKab').value = kode; setView('peta'); paint(); zoomKab(kode); };
  $('#kDl').onclick = () => {
    const row = { kode_kabupaten_kota: kode, nama_kabupaten_kota: k.nama_kabupaten_kota };
    Object.entries(r).forEach(([a, v]) => (row[a] = Array.isArray(v) ? v.join(' | ') : v));
    downloadCSV(`rekomendasi_kab_${kode}.csv`, [row]);
  };
  chart('kFund', { type: 'bar', data: { labels: [''], datasets: [
    { label: 'APBD kab/kota', data: [k.f_kab], backgroundColor: '#1f3d34' }, { label: 'Dana Desa', data: [k.f_dd], backgroundColor: '#5f9a83' }, { label: 'Bantuan provinsi', data: [k.f_bk], backgroundColor: '#e0a23a' }] },
    options: { indexAxis: 'y', plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${rp(c.raw)}` } } }, scales: { x: { stacked: true, ticks: { callback: (v) => short(v) } }, y: { stacked: true, grid: { display: false } } } } });
  const s = k.seri, yrs = s.tahun.map(String);
  const sub = (key) => s[key] || yrs.map(() => null);
  chart('kApbd', { type: 'line', data: { labels: yrs, datasets: [
    { label: 'Pangsa belanja modal', data: sub('pangsa_belanja_modal').map((v) => (ok(v) ? v * 100 : null)), borderColor: '#1f3d34', backgroundColor: '#1f3d34', tension: 0.2 },
    { label: 'Rasio SiLPA terhadap belanja', data: sub('rasio_silpa_belanja').map((v) => (ok(v) ? v * 100 : null)), borderColor: '#e0a23a', backgroundColor: '#e0a23a', tension: 0.2 },
    { label: 'Pangsa PAD', data: sub('pangsa_pad').map((v) => (ok(v) ? v * 100 : null)), borderColor: '#2a78d6', backgroundColor: '#2a78d6', borderDash: [4, 3], tension: 0.2 }] },
    options: { plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${num(c.raw, 1)} persen` } } }, scales: { y: { title: { display: true, text: 'persen' }, grid: { color: '#edf0ee' } }, x: { grid: { display: false } } } } });
  const keep = yrs.map((y, j) => +y >= 2021);
  const f = (arr, m = 1) => arr.filter((_, j) => keep[j]).map((v) => (ok(v) ? v * m : null));
  chart('kIdsd', { type: 'line', data: { labels: yrs.filter((_, j) => keep[j]), datasets: [
    { label: 'Skor IDSD', data: f(sub('skor_idsd')), borderColor: '#1f3d34', backgroundColor: '#1f3d34', yAxisID: 'y' },
    { label: 'Pengelolaan lingkungan IDSD', data: f(sub('skor_pengelolaan_lingkungan_idsd')), borderColor: '#1baf7a', backgroundColor: '#1baf7a', yAxisID: 'y' },
    { label: 'Kapasitas fiskal IDSD', data: f(sub('skor_kapasitas_fiskal_idsd')), borderColor: '#4a3aa7', backgroundColor: '#4a3aa7', yAxisID: 'y' },
    { label: 'Memiliki tabungan (persen)', data: f(sub('pangsa_memiliki_tabungan'), 100), borderColor: '#eb6834', backgroundColor: '#eb6834', borderDash: [4, 3], yAxisID: 'y2' },
    { label: 'Mengakses kredit (persen)', data: f(sub('pangsa_mengakses_kredit'), 100), borderColor: '#a46a00', backgroundColor: '#a46a00', borderDash: [2, 2], yAxisID: 'y2' }] },
    options: { spanGaps: true, scales: { y: { min: 1, max: 5, title: { display: true, text: 'skor IDSD' }, grid: { color: '#edf0ee' } }, y2: { position: 'right', min: 0, title: { display: true, text: 'persen' }, grid: { display: false } }, x: { grid: { display: false } } } } });
  const cells = C.filter((c) => c.idkab === kode).sort((a, b) => a.tipe - b.tipe);
  $('#cellTable').innerHTML = `<table class="t"><thead><tr><th>Tipe</th><th class="n">Desa</th><th class="n">Organik diolah (ton/th)</th><th class="n">Investasi</th>
    <th class="n">VGF median</th><th class="n">VGF p90</th><th class="n">MAC (Rp/t CO₂e)</th><th class="n">Peluang swadana</th><th class="n">Pekerjaan</th><th>Tahap</th></tr></thead><tbody>
    ${cells.map((c) => `<tr><td><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${TCOL[c.tipe]};margin-right:6px"></span>${esc(TIPE[c.tipe])}</td>
      <td class="n">${num(c.n_desa)}</td><td class="n">${num(c.thr_p50)}<br><small style="color:var(--muted)">${range(c.thr_p05, c.thr_p95)}</small></td>
      <td class="n">${short(c.capex_p50)}</td><td class="n">${short(c.vgf_capital_p50)}</td><td class="n">${short(c.vgf_capital_p90)}</td>
      <td class="n">${num(c.mac_p50)}</td><td class="n">${pct(c.p_selffin)}</td><td class="n">${num(c.jobs_p50)}</td><td>${esc(TAHAP[c.phase])}</td></tr>`).join('')}</tbody></table>`;
}

// ---------------------------------------------------------------- province and scenario view
const SLIDERS = [
  { k: 'alpha', label: 'Bagian belanja modal kab/kota per tahun', min: 0, max: 0.1, step: 0.005, f: (v) => pct(v, 1) },
  { k: 'silpa', label: 'Bagian SiLPA 2025 kab/kota (sekali)', min: 0, max: 0.3, step: 0.01, f: (v) => pct(v) },
  { k: 'dd', label: 'Bagian Dana Desa per tahun (T2 dan T4)', min: 0, max: 0.1, step: 0.005, f: (v) => pct(v, 1) },
  { k: 'bk', label: 'Bagian bantuan keuangan provinsi per tahun', min: 0, max: 0.2, step: 0.01, f: (v) => pct(v) },
  { k: 'tip', label: 'Tipping fee TPA', min: 100000, max: 450000, step: 10000, f: (v) => rp(v) + ' per ton' },
  { k: 'pc', label: 'Harga karbon', min: 0, max: 300000, step: 10000, f: (v) => rp(v) + ' per t CO₂e' },
  { k: 'capm', label: 'Tingkat tangkapan relatif terhadap desain', min: 0.5, max: 1.3, step: 0.05, f: (v) => pct(v) },
  { k: 'cm', label: 'Pengali biaya investasi', min: 0.6, max: 1.6, step: 0.05, f: (v) => num(v, 2) + ' kali' },
  { k: 'r', label: 'Tingkat diskonto', min: 0.06, max: 0.14, step: 0.005, f: (v) => pct(v, 1) },
];
function renderSkenario() {
  const k = PV.kpi, el = $('#viewSkenario');
  const kp = (v, d, unit, lab) => `<div><span>${lab}</span><b>${num(v[1] / d, 2)} ${unit}</b><small>interval 90 persen ${num(v[0] / d, 2)} sampai ${num(v[2] / d, 2)}</small></div>`;
  el.innerHTML = `
    <h2>Provinsi dan skenario</h2>
    <p class="lead">Angka provinsi berasal dari model paper (Monte Carlo 3.000 iterasi, program linear di bawah amplop fiskal). Simulator di bawah menghitung ulang 84 sel di peramban agar pengaruh tiap asumsi kebijakan terlihat; hasilnya indikatif.</p>
    <div class="kpis">
      ${kp(k.organik_dialihkan_ton_th, 1e6, 'juta ton', 'Organik dialihkan per tahun')}
      ${kp(k.emisi_dihindari_tunak_t, 1e6, 'juta t CO₂e', 'Emisi dihindari per tahun, tunak')}
      ${kp(k.vgf_rp, 1e12, 'triliun rupiah', 'Kebutuhan VGF lima tahun, median total')}
      ${kp(k.pekerjaan, 1e3, 'ribu', 'Pekerjaan langsung')}
    </div>
    <div class="grid2">
      <div class="box"><h3>Simulator pembiayaan 2026 sampai 2030</h3>
        <div class="seg" id="preset" style="margin-bottom:14px">${Object.keys(PRESET).map((p) => `<button data-p="${p}" aria-pressed="${p === 'dasar'}">${title(p)}</button>`).join('')}</div>
        <div class="sliders">${SLIDERS.map((s) => `<label class="sl">${esc(s.label)} <output id="o_${s.k}"></output><input type="range" id="s_${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${S.P[s.k]}"></label>`).join('')}</div>
        <div class="simout" id="simOut"></div>
        <p class="vintage" style="margin-top:12px">${esc(PV.parameter_skenario.catatan)} Pilih lapisan "Status skenario (simulasi)" di tab Peta desa untuk melihat sebaran spasialnya.</p>
      </div>
      <div class="box"><h3>Kurva pasokan abatemen dan tahap</h3><div class="chart"><canvas id="supply"></canvas></div>
        <table class="t" style="margin-top:12px"><thead><tr><th>Tahap</th><th class="n">Sel</th><th class="n">Organik (ribu ton/th)</th><th class="n">Emisi (ribu t/th)</th><th class="n">VGF</th><th class="n">Investasi</th></tr></thead>
        <tbody>${[1, 2, 3].map((p) => { const t = PV.tahap[p]; return `<tr><td>${esc(TAHAP[p])}</td><td class="n">${t.sel}</td><td class="n">${num(t.organik_ton / 1e3)}</td><td class="n">${num(t.emisi_t / 1e3)}</td><td class="n">${rp(t.vgf_rp)}</td><td class="n">${rp(t.investasi_rp)}</td></tr>`; }).join('')}</tbody></table>
        <p class="vintage">Sel diurutkan dari VGF per t CO₂e terendah. Tahap 1 menyerap sel swadana dan sel termurah. Jumlah median per sel (Rp2,68 triliun) sedikit berbeda dari median total provinsi (Rp2,76 triliun) karena median tidak bersifat aditif.</p></div>
    </div>
    <div class="grid2" style="margin-top:22px">
      <div class="box"><h3>Kesenjangan per kabupaten/kota pada pengaturan simulator</h3><div class="chart" style="height:420px"><canvas id="kabGap"></canvas></div></div>
      <div class="box"><h3>Lonjakan Lebaran pada cahaya malam, studi peristiwa</h3><div class="chart"><canvas id="event"></canvas></div>
        <p class="vintage">Efek relatif terhadap T1 dengan efek tetap desa serta tahun kali bulan, galat baku klaster dua arah, panel GEE 2022 sampai 2025. Plasebo menggeser Lebaran dua bulan. Bar memuat interval 95 persen.</p></div>
    </div>`;
  $$('#preset button').forEach((b) => (b.onclick = () => { Object.assign(S.P, PRESET[b.dataset.p]); $$('#preset button').forEach((x) => x.setAttribute('aria-pressed', x === b)); syncSliders(); runSim(); }));
  SLIDERS.forEach((s) => ($('#s_' + s.k).oninput = (e) => { S.P[s.k] = +e.target.value; $$('#preset button').forEach((x) => x.setAttribute('aria-pressed', 'false')); syncSliders(); runSim(); }));
  syncSliders(); runSim(); drawSupply(); drawEvent();
}
function syncSliders() { SLIDERS.forEach((s) => { const i = $('#s_' + s.k); if (i) { i.value = S.P[s.k]; $('#o_' + s.k).textContent = s.f(S.P[s.k]); } }); }
let simTimer;
function runSim() {
  clearTimeout(simTimer);
  simTimer = setTimeout(() => {
    S.sim = simulate(C, K, S.P); const t = S.sim.tot;
    $('#simOut').innerHTML = `
      <div><b>${pct(t.ghg_share)}</b>potensi abatemen terdanai (${num(t.ghg / 1e6, 2)} juta t CO₂e per tahun)</div>
      <div><b>${rp(t.vgf_need)}</b>kebutuhan VGF; amplop publik ${rp(t.env.kab + t.env.dd + t.env.bk)}</div>
      <div><b>${rp(t.public)}</b>dana publik terpakai: kab/kota ${short(t.used_kab)}, Dana Desa ${short(t.used_dd)}, provinsi ${short(t.used_bk)}</div>
      <div><b>${rp(t.private)}</b>investasi swasta dan perbankan yang ikut bergerak</div>
      <div><b>${t.full} dari 84 sel</b>terdanai penuh atau swadana, ${t.partial} sebagian, ${t.none} belum</div>
      <div><b>${num(t.jobs)}</b>pekerjaan langsung dan ${num(t.thr / 1e6, 2)} juta ton organik per tahun</div>`;
    drawKabGap();
    if (S.layer === 'sim') paint();
  }, 60);
}
function drawSupply() {
  const pts = PV.kurva_pasokan;
  const col = { 1: '#1f3d34', 2: '#5f9a83', 3: '#e0a23a' };
  chart('supply', { type: 'scatter', data: { datasets: [1, 2, 3].map((p) => ({ label: TAHAP[p], showLine: false, pointRadius: 3.2, backgroundColor: col[p], borderColor: col[p],
    data: pts.filter((q) => q.phase === p).map((q) => ({ x: q.cum_ghg / 1e6, y: q.cum_vgf / 1e12, cell: q.cell, tipe: q.tipe })) })) },
    options: { plugins: { tooltip: { callbacks: { label: (c) => `${kabName(c.raw.cell.split('_')[0])} ${TIPE[c.raw.tipe]}: kumulatif ${num(c.raw.x, 2)} juta t, ${num(c.raw.y, 2)} triliun` } } },
      scales: { x: { title: { display: true, text: 'emisi dihindari kumulatif (juta t CO₂e per tahun)' }, grid: { color: '#edf0ee' } }, y: { title: { display: true, text: 'VGF kumulatif (triliun rupiah)' }, grid: { color: '#edf0ee' } } } } });
}
function drawKabGap() {
  if (!document.getElementById('kabGap')) return;
  const b = S.sim.byKab, ks = Object.keys(b).sort((x, y) => b[y].need - b[x].need);
  chart('kabGap', { type: 'bar', data: { labels: ks.map(kabName), datasets: [
    { label: 'VGF terdanai', data: ks.map((k) => b[k].used / 1e9), backgroundColor: '#1f3d34' },
    { label: 'VGF belum terdanai', data: ks.map((k) => Math.max(b[k].need - b[k].used, 0) / 1e9), backgroundColor: '#e0a23a' }] },
    options: { indexAxis: 'y', plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: Rp${num(c.raw, 1)} miliar` } } },
      scales: { x: { stacked: true, title: { display: true, text: 'miliar rupiah, lima tahun' }, grid: { color: '#edf0ee' } }, y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 10.5 } } } } } });
}
function drawEvent() {
  const e = PV.studi_peristiwa, p = PV.plasebo, labs = ['T2', 'T3', 'T4'];
  const mk = (src, pre) => labs.map((t) => src[`${pre}_${t}`]);
  const bar = (arr) => arr.map((o) => (o ? [o.b - 1.96 * o.se, o.b + 1.96 * o.se] : null));
  chart('event', { type: 'bar', data: { labels: labs.map((t) => TIPE[t[1]]), datasets: [
    { label: 'Lebaran', data: bar(mk(e, 'leb')), backgroundColor: 'rgba(235,104,52,.75)', meta: mk(e, 'leb') },
    { label: 'Ramadan', data: bar(mk(e, 'ram')), backgroundColor: 'rgba(31,61,52,.55)', meta: mk(e, 'ram') },
    { label: 'Plasebo Lebaran plus dua bulan', data: bar(mk(p, 'leb')), backgroundColor: 'rgba(138,143,140,.55)', meta: mk(p, 'leb') }] },
    options: { plugins: { tooltip: { callbacks: { label: (c) => { const m = c.dataset.meta[c.dataIndex]; return `${c.dataset.label}: koefisien ${num(m.b, 3)} (p ${num(m.p, 3)})`; } } } },
      scales: { y: { title: { display: true, text: 'asinh cahaya malam relatif T1' }, grid: { color: '#edf0ee' } }, x: { grid: { display: false }, ticks: { font: { size: 10.5 } } } } } });
}

// ---------------------------------------------------------------- data and method view
function renderData() {
  const el = $('#viewData'), v = PV.validasi;
  const files = [
    ['desa_indikator_wide.csv', 'Satu baris per desa, 96 kolom indikator, kode wilayah gaya Satu Data Jabar'],
    ['desa_indikator_long.csv.gz', 'Format panjang (uid, indikator, nilai, satuan, tahun, sumber), siap diunggah ke portal data'],
    ['desa_bulanan_gee.csv.gz', 'Panel bulanan cahaya malam, SO₂, dan CO per desa, 48 bulan'],
    ['desa_musiman_model_2025.csv', 'Kalender timbulan organik bulanan per desa'],
    ['rekomendasi_desa.csv', 'Kondisi data bertanda tahun dan sumber, lalu rekomendasi per desa'],
    ['kabkota_tahunan_long.csv', 'APBD 2018 sampai 2025, IDSD 2022 sampai 2025, Susenas 2021 sampai 2024, NTL 2022 sampai 2025'],
    ['kabkota_rencana.csv', 'Rencana pembiayaan dan kesiapan per kabupaten/kota'],
    ['rekomendasi_kabkota.csv', 'Rekomendasi kabupaten/kota'],
    ['sel_ekonomi_kabkota_tipe.csv', '84 sel ekonomi dengan persentil Monte Carlo dan koefisien rerata'],
    ['dim_wilayah_desa.csv', 'Dimensi wilayah dan kolom Kemendagri untuk crosswalk'],
    ['template_realisasi_bulanan.csv', 'Templat pelaporan realisasi bulanan (lapisan pemantauan)'],
    ['kamus_data.csv', 'Kamus data: definisi, satuan, tahun, sumber, metode, kekuatan bukti'],
  ];
  el.innerHTML = `
    <h2>Data dan metode</h2>
    <p class="lead">Seluruh angka di dashboard bisa ditelusuri ke berkas di folder <code>dataset/</code>. Kolom identitas mengikuti konvensi Satu Data Jabar (kode_provinsi, kode_kabupaten_kota, bps_kode_desa_kelurahan, kemendagri_kode_desa_kelurahan, satuan, tahun) sehingga berkas dapat digabung dengan dataset Open Data Jabar lain.</p>
    <div class="box"><h3>Arsitektur embrio digital twin</h3>
      <div class="twin">
        <div><b>Lapisan dasar statis</b>Batas desa BPS 2024, penduduk dasymetric, timbulan Monte Carlo, tipologi. Diperbarui saat ada sensus atau batas baru.</div>
        <div><b>Lapisan dinamis</b>Panel bulanan VIIRS dan Sentinel 5P dari GEE. Skrip <code>pipeline/gee_monthly_update.py</code> menambah bulan baru melalui GitHub Actions.</div>
        <div><b>Lapisan skenario</b>Simulator 84 sel di peramban: amplop fiskal, tipping fee, harga karbon, tangkapan, dan biaya investasi.</div>
        <div><b>Lapisan pemantauan</b>Templat realisasi bulanan per desa. Data timbangan lapangan menggantikan estimasi model dan mempersempit interval.</div>
      </div></div>
    <div class="grid2" style="margin-top:22px">
      <div class="box"><h3>Berkas dataset</h3><table class="t dl"><tbody>${files.map(([f, d]) => `<tr><td><a href="dataset/${f}" download>${f}</a></td><td>${esc(d)}</td></tr>`).join('')}</tbody></table></div>
      <div class="box"><h3>Validasi model</h3><table class="t"><tbody>
        <tr><td>Dasymetric, Q² validasi silang tinggalkan satu</td><td class="n">${num(v.dasymetric.Q2_loo, 3)}</td></tr>
        <tr><td>Dasymetric, MAPE validasi silang</td><td class="n">${num(v.dasymetric.MAPE_loo, 1)} persen</td></tr>
        <tr><td>Pangsa perkotaan, korelasi dengan BPS</td><td class="n">${num(v.perkotaan.r, 3)}</td></tr>
        <tr><td>Timbulan terhadap SIPSN (${v.sipsn.n} kab/kota)</td><td class="n">r ${num(v.sipsn.r, 3)}, MAPE ${num(v.sipsn.mape, 1)} persen</td></tr>
        <tr><td>Tipologi, ARI k means terhadap LPA</td><td class="n">${num(v.tipologi.ARI_km_lpa, 3)}</td></tr>
        <tr><td>Tipologi, ARI bootstrap k means (rerata; persentil 5)</td><td class="n">${num(v.tipologi.kmeans_boot_ARI[0], 3)}; ${num(v.tipologi.kmeans_boot_ARI[1], 3)}</td></tr>
        <tr><td>Rerata probabilitas posterior LPA</td><td class="n">${num(v.tipologi.lpa_mean_posterior, 3)}</td></tr>
      </tbody></table>
      <h3 style="margin-top:16px">Tahun data</h3><table class="t"><tbody>${PV.vintage.map((x) => `<tr><td>${esc(x.data)}</td><td>${esc(x.tahun)}</td><td>${esc(x.sumber)}</td></tr>`).join('')}</tbody></table></div>
    </div>
    <div class="box" style="margin-top:22px"><h3>Kamus data</h3><input id="kamusQ" type="search" placeholder="Saring kolom atau definisi" style="padding:7px 9px;border:1px solid var(--line);border-radius:4px;width:320px;margin-bottom:10px">
      <div class="tablewrap" id="kamusT"></div></div>
    <div class="box" style="margin-top:22px"><h3>Batasan yang perlu dibaca sebelum memakai angka</h3><ul style="margin:0;padding-left:18px;max-width:90ch">
      <li>Kode Kemendagri masih kosong; jalankan <code>pipeline/crosswalk_kemendagri.py</code> dengan berkas kode wilayah dari Open Data Jabar.</li>
      <li>Dana Desa per kabupaten adalah estimasi proporsional terhadap jumlah desa dari total Jawa Barat 2024; konfirmasi dengan rincian DJPK.</li>
      <li>Nilai ekonomi dihitung per sel kabupaten/kota kali tipe, lalu dibagi ke desa menurut porsi organik; angka desa adalah porsi, bukan studi kelayakan.</li>
      <li>Simulator memakai koefisien rerata yang dikalibrasi; perbedaan dengan program linear paper kurang dari satu poin persen pada tiga skenario.</li>
      <li>Kolom SO₂ satelit mendekati batas deteksi di banyak desa; gunakan sebagai penanda, bukan ukuran konsentrasi permukaan.</li>
    </ul></div>`;
  const draw = (q = '') => {
    q = q.toLowerCase();
    const rows = KAMUS.filter((r) => !q || (r.kolom + ' ' + r.definisi + ' ' + r.sumber).toLowerCase().includes(q));
    $('#kamusT').innerHTML = `<table class="t"><thead><tr><th>Kolom</th><th>Definisi</th><th>Satuan</th><th>Tahun</th><th>Sumber</th><th>Bukti</th></tr></thead><tbody>${rows.map((r) => `<tr><td><code>${esc(r.kolom)}</code></td><td>${esc(r.definisi)}</td><td>${esc(r.satuan)}</td><td>${esc(r.tahun_data)}</td><td>${esc(r.sumber)}</td><td>${esc(r.kekuatan_bukti)}</td></tr>`).join('')}</tbody></table>`;
  };
  draw(); $('#kamusQ').oninput = (e) => draw(e.target.value);
}

// ---------------------------------------------------------------- views and routing
const rendered = {};
function setView(v) {
  S.view = v;
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === v));
  const full = v !== 'peta';
  $('#layout').classList.toggle('full', full);
  $('#viewKab').hidden = v !== 'kab'; $('#viewSkenario').hidden = v !== 'skenario'; $('#viewData').hidden = v !== 'data';
  if (v === 'kab') renderKabView();
  if (v === 'skenario' && !rendered.sk) { renderSkenario(); rendered.sk = 1; }
  if (v === 'data' && !rendered.data) { renderData(); rendered.data = 1; }
  if (v === 'peta' && map) setTimeout(() => map.resize(), 0);
  // the kab view writes its own #kab=<kode>; the map view keeps a #desa link only when a desa is selected
  if (v === 'skenario' || v === 'data') history.replaceState(null, '', `#${v}`);
  if (v === 'peta') history.replaceState(null, '', S.sel != null ? `#desa=${S.sel}` : location.pathname + location.search);
}
function parseHash() {
  const h = location.hash.slice(1), o = {};
  h.split('&').forEach((kv) => { const [a, b] = kv.split('='); if (a) o[a] = b ?? true; });
  return o;
}

async function main() {
  try { await load(); } catch (e) {
    $('#loading').innerHTML = `<p>Data gagal dimuat: ${esc(e.message)}. Buka halaman melalui server web (GitHub Pages atau <code>python -m http.server</code>), bukan langsung dari berkas.</p>`; return;
  }
  initRail(); provSnapshot(); initMap(); drawRibbon();
  $$('.tabs button').forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  const h = parseHash();
  if (h.kab) { S.kabSel = h.kab === true ? null : h.kab; setView('kab'); } else if (h.skenario) setView('skenario'); else if (h.data) setView('data');
  $('#loading').hidden = true;
}
main();
