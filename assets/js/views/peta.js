// Peta desa: MapLibre choropleth of 5.986 desa polygons, organised by topic, with search, filters, an interactive
// legend, a year player, a desa drawer (summary, recommendation, monthly series, seasonal calendar) and compare.
import { num, pct, rp, esc, title, kabTitle, ok, median, short, BULAN, BLN, downloadCSV } from '../fmt.js';
import { $, $$, css, isDark, debounce, toast, copy, tcol, TIPE, TAHAP, BUKTI, chartTheme, chart } from '../ui.js';
import { RAMPS, quantClasses, fixedClasses, classOf, labelsFor, CAT } from '../scales.js';
import * as simstate from '../simstate.js';

let YEARS = [2022, 2023, 2024, 2025]; // replaced by provinsi.json tahun_tersedia, which grows with GEE updates
// Ramadan and Lebaran months: the month holding most days of Ramadan, and of the paper's Lebaran window (−7 to +6 days)
const RAMADAN = ['2022-04', '2023-04', '2024-03', '2025-03', '2026-03', '2027-02'];
const LEBARAN = ['2022-05', '2023-04', '2024-04', '2025-03', '2026-03', '2027-03'];

const TOPICS = [
  { id: 'timbulan', ic: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5', t: 'Timbulan', s: 'Organik dan kepadatan', q: 'Di desa mana sampah organik paling banyak muncul?',
    desc: 'Surface timbulan 2024 dari model dasymetric (Susenas, OSM, cahaya malam) dan 3.000 iterasi Monte Carlo yang dikalibrasi ke 25 ribu ton per hari (DLH Jabar).',
    read: 'Warna makin tua berarti makin banyak. Kelas kuantil membagi desa menjadi kelompok berukuran sama, jadi bandingkan peringkat, bukan selisih absolut. Klik kelas pada legenda untuk menyembunyikan atau menampilkannya.',
    layers: [
      { id: 'org', label: 'Organik', col: 'timbulan_organik_ton_th_p50', unit: 'ton per tahun', ramp: 'hijau', year: '2024', src: 'model Monte Carlo' },
      { id: 'orgd', label: 'Kepadatan', col: 'kepadatan_organik_ton_km2_th', unit: 'ton per km² per tahun', ramp: 'hijau', year: '2024', src: 'model Monte Carlo' },
      { id: 'kap', label: 'Per kapita', col: 'timbulan_per_kapita_kg_hari', unit: 'kg per jiwa per hari', ramp: 'hijau', year: '2024', src: 'model Monte Carlo' },
      { id: 'nrt', label: 'Nonrumah tangga', col: 'pangsa_nonrumahtangga', unit: 'pangsa pasar, komersial, fasilitas umum', ramp: 'oranye', year: '2024', src: 'kernel titik minat OSM', pct: true },
      { id: 'pk', label: 'Puncak musiman', col: 'rasio_puncak_rerata', unit: 'rasio puncak bulanan terhadap rerata', ramp: 'oranye', year: 'kalender 2025', src: 'model musiman' },
    ] },
  { id: 'tipologi', ic: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', t: 'Tipologi', s: 'Empat tipe desa', q: 'Modul waste-to-energy seperti apa yang cocok untuk tiap desa?',
    desc: 'Empat tipe dari k-means pada kepadatan, volume organik, pangsa nonrumah tangga, dan jarak ke TPA; dikonfirmasi latent profile analysis (ARI bootstrap 0,90).',
    read: 'Setiap tipe menentukan modul: T1 menyalurkan ke hub kecamatan, T2 digester komunal, T3 unit AD modular di pasar, T4 biodigester rumah tangga dan BSF. Kekuatan bukti menentukan apakah tindakan langsung dijalankan atau diuji dulu.',
    layers: [
      { id: 'tipe', label: 'Tipe desa', cat: 'tipe', col: 'tipe_desa', year: '2026', src: 'k-means dan LPA' },
      { id: 'lpa', label: 'Keyakinan tipe', col: 'lpa_probabilitas_posterior', unit: 'probabilitas posterior LPA', ramp: 'biru', year: '2026', src: 'latent profile analysis' },
      { id: 'conf', label: 'Skor keyakinan', col: 'skor_keyakinan', unit: 'skor 0–100', ramp: 'biru', year: '2026', src: 'lebar interval, OSM, NTL, LPA' },
      { id: 'bukti', label: 'Kekuatan bukti', cat: 'bukti', col: 'bukti', year: '2026', src: 'aturan rekomendasi' },
    ] },
  { id: 'aktivitas', ic: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z', t: 'Aktivitas', s: 'Cahaya malam dan udara', q: 'Di mana aktivitas tumbuh, dan seberapa bersih udaranya?',
    desc: 'Rerata area desa dari VIIRS DNB (median April–Oktober, nW/cm²/sr) dan kolom CO serta SO₂ Sentinel-5P, 2022–2025, diekstraksi lewat Google Earth Engine.',
    read: 'Geser atau putar tahun untuk melihat perubahan. Pilih satu desa untuk deret bulanan 48 bulan dibanding median tipenya, dengan Ramadan dan Lebaran diarsir. Resolusi Sentinel-5P sekitar 7 km: gunakan sebagai penanda.',
    layers: [
      { id: 'ntl', label: 'Cahaya malam', yearCol: 'ntl_', unit: 'nW per cm² per sr', ramp: 'malam', src: 'VIIRS via GEE' },
      { id: 'ntlg', label: 'Perubahan 2022–2025', col: 'ntl_pertumbuhan_2022_2025', unit: 'perubahan relatif', ramp: 'div', fixed: [-0.1, 0, 0.1, 0.25, 0.5], pct: true, year: '2022–2025', src: 'VIIRS via GEE' },
      { id: 'co', label: 'CO', yearCol: 'co_', unit: 'mmol per m²', ramp: 'oranye', src: 'Sentinel-5P via GEE' },
      { id: 'so2', label: 'SO₂', yearCol: 'so2_', unit: '10⁻⁵ mol per m²', ramp: 'ungu', src: 'Sentinel-5P via GEE' },
      { id: 'cok', label: 'CO kemarau', col: 'kenaikan_co_kemarau', unit: 'CO Agu–Okt dikurangi Jan–Mar, mmol per m²', ramp: 'oranye', year: '2022–2025', src: 'Sentinel-5P via GEE' },
    ] },
  { id: 'dampak', ic: 'M5 20c0-9 6-15 15-15 0 9-6 15-15 15zM5 20l8-8', t: 'Dampak', s: 'Emisi, energi, kerja', q: 'Apa yang diperoleh bila organik diolah di desa?',
    desc: 'Dampak tahunan modul pada tangkapan rerata desain: emisi metana TPA yang dihindari (IPCC FOD, kondisi tunak), energi biogas, LPG yang tergantikan, dan pekerjaan langsung.',
    read: 'Emisi dihindari hanya dihitung untuk porsi sampah yang kini benar-benar berakhir di TPA, sehingga desa agraris yang belum terlayani angkutan menyumbang emisi kecil meskipun pekerjaannya banyak.',
    layers: [
      { id: 'ghg', label: 'Emisi dihindari', col: 'emisi_dihindari_t_co2e_th', unit: 't CO₂e per tahun', ramp: 'teal', year: 'kondisi tunak', src: 'IPCC FOD' },
      { id: 'alih', label: 'Organik diolah', col: 'organik_dialihkan_ton_th', unit: 'ton per tahun', ramp: 'hijau', year: '2026–2030 (target)', src: 'model dampak' },
      { id: 'en', label: 'Energi biogas', col: 'energi_biogas_mwh_th', unit: 'MWh per tahun', ramp: 'oranye', year: '2026–2030 (target)', src: 'model dampak' },
      { id: 'kerja', label: 'Pekerjaan', col: 'pekerjaan_langsung', unit: 'pekerjaan langsung', ramp: 'ungu', year: '2026–2030 (target)', src: 'model dampak' },
      { id: 'lpg', label: 'LPG tergantikan', col: 'lpg_diganti_ton_th', unit: 'ton LPG per tahun', ramp: 'biru', year: '2026–2030 (target)', src: 'model dampak' },
    ] },
  { id: 'biaya', ic: 'M12 3v18M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7', t: 'Pembiayaan', s: 'VGF dan swadana', q: 'Berapa dana publik yang dibutuhkan tiap desa?',
    desc: 'Nilai ekonomi dihitung pada sel kabupaten/kota kali tipe (84 sel, Monte Carlo), lalu dibagi ke desa menurut porsi organik yang dialihkan. Angka desa adalah porsi, bukan studi kelayakan.',
    read: 'VGF (viability gap funding) adalah hibah modal yang menutup kesenjangan kelayakan selama 15 tahun. Biaya abatemen negatif berarti modul menghemat uang bersih per ton CO₂e.',
    layers: [
      { id: 'vgf', label: 'VGF desa', col: 'vgf_juta_rp', unit: 'juta rupiah, 2026–2030', ramp: 'biru', year: '2026–2030', src: 'model ekonomi sel' },
      { id: 'inv', label: 'Investasi', col: 'investasi_juta_rp', unit: 'juta rupiah', ramp: 'biru', year: '2026–2030', src: 'model ekonomi sel' },
      { id: 'swa', label: 'Peluang swadana', col: 'peluang_swadana', unit: 'peluang NPV positif lewat gate fee', ramp: 'hijau', fixed: [0.1, 0.25, 0.5, 0.75], pct: true, year: '2026', src: 'Monte Carlo 3.000 iterasi' },
      { id: 'mac', label: 'Biaya abatemen', col: 'mac_rp_t_co2e', unit: 'rupiah per t CO₂e', ramp: 'div', fixed: [-200000, 0, 100000, 300000, 600000], year: '2026', src: 'model ekonomi sel' },
      { id: 'gf', label: 'Gate fee impas', col: 'gate_fee_impas_rp_ton', unit: 'rupiah per ton', ramp: 'oranye', year: '2026', src: 'model ekonomi sel' },
    ] },
  { id: 'rencana', ic: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', t: 'Rencana', s: 'Tahap dan logistik', q: 'Kapan dan bagaimana modul dibangun?',
    desc: 'Tahap mengikuti kurva pasokan VGF: sel dengan VGF per t CO₂e terendah dibangun lebih dulu. T1 menyalurkan organik ke hub kecamatan; jarak ke TPA menentukan biaya angkut yang dihindari.',
    read: 'Tahap 1 (2026–2027) menyerap sel swadana dan termurah, Tahap 2 (2028–2029) sel menengah, Tahap 3 (2030) sel termahal. Lapisan hub menandai desa lokasi indikatif hub dan desa yang dilayaninya.',
    layers: [
      { id: 'tahap', label: 'Tahap', cat: 'tahap', col: 'tahap', year: '2026–2030', src: 'kurva pasokan VGF' },
      { id: 'hub', label: 'Hub kecamatan', cat: 'hub', col: '_hub', year: '2026', src: 'model lokasi hub' },
      { id: 'tpa', label: 'Jarak ke TPA', col: 'jarak_tpa_km', unit: 'km garis lurus', ramp: 'oranye', year: 'OSM diunduh 2026', src: 'OpenStreetMap' },
      { id: 'kapd', label: 'Kapasitas desain', col: 'kapasitas_desain_kg_hari', unit: 'kg per hari termasuk faktor puncak', ramp: 'hijau', year: '2026', src: 'model dampak' },
    ] },
  { id: 'skenario', ic: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6', t: 'Skenario', s: 'Status simulasi', q: 'Sel mana yang terdanai pada pengaturan fiskal saat ini?',
    desc: 'Status pendanaan sel (kabupaten/kota kali tipe) dari simulator di tab Skenario. Ubah amplop fiskal, tipping fee, atau harga karbon di sana; peta ini mengikuti.',
    read: 'Hijau tua: terdanai penuh atau swadana. Kuning: terdanai sebagian. Abu-abu: belum terdanai. Hasil simulator indikatif; angka resmi paper berasal dari program linear.',
    layers: [{ id: 'sim', label: 'Status skenario', cat: 'sim', col: '_sim', year: '2026–2030', src: 'simulasi di peramban' }] },
];
const LAYER = Object.fromEntries(TOPICS.flatMap((t) => t.layers.map((l) => [l.id, { ...l, topic: t.id }])));

const S = { t: 'timbulan', l: 'org', y: 2024, k: '', kc: '', tipe: new Set([1, 2, 3, 4]), tahap: new Set([1, 2, 3]), pen: 0, hide: new Set(),
  sel: null, tab: 'ringkasan', base: null, opacity: 0.85, borders: true, labels: true, pins: [], ser: 'ntl' };
let el, ctx, store, D, map, GEO, KABGEO, K, PV, byKab, Chart, playT, featBy, vals = [], sc = null, ready = null, medMemo = {};

export async function mount(root, c) {
  el = root; ctx = c; store = c.store;
  el.innerHTML = `
    <div class="mapwrap" id="mapwrap">
      <div id="map" role="application" aria-label="Peta desa Jawa Barat"></div>
      <div class="float lefty" id="lefty">
        <div class="searchbox"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input id="pSearch" type="search" placeholder="Cari desa, kecamatan, atau kab/kota…" autocomplete="off" aria-label="Cari wilayah" aria-controls="pSuggest"><kbd>/</kbd>
          <ul class="suggest panel" id="pSuggest" role="listbox" hidden></ul></div>
        <div class="panel topic-card" id="topicCard"></div>
      </div>
      <div class="float ctrls">
        <div class="panel ctrlgrp">
          <button id="zIn" aria-label="Perbesar" title="Perbesar"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
          <button id="zOut" aria-label="Perkecil" title="Perkecil"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
          <button id="zHome" aria-label="Kembali ke seluruh Jawa Barat" title="Seluruh Jawa Barat"><svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/></svg></button>
        </div>
        <button class="panel tampil-btn" id="tampilBtn" aria-expanded="false"><svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>Tampilan</button>
        <div class="panel tampil" id="tampil" hidden>
          <div class="lbl">Peta dasar</div>
          <div class="pills" id="baseSel">${[['terang', 'Terang'], ['gelap', 'Gelap'], ['citra', 'Citra'], ['polos', 'Polos']].map(([k, l]) => `<button class="pill s" data-b="${k}">${l}</button>`).join('')}</div>
          <div class="opt" style="margin-top:10px"><span>Kepekatan warna</span><input type="range" id="opac" min="0.3" max="1" step="0.05" value="0.85"></div>
          <label class="opt"><span>Batas kabupaten/kota</span><input type="checkbox" id="optBorder" checked></label>
          <label class="opt"><span>Label nama tempat</span><input type="checkbox" id="optLabel" checked></label>
        </div>
      </div>
      <div class="float panel legend" id="legend" aria-live="polite"></div>
      <div class="panel hovertip" id="hover" hidden></div>
      <aside class="panel drawer" id="drawer" aria-label="Detail desa"></aside>
      <div class="float panel compare" id="compare" hidden></div>
    </div>`;
  // on a phone the panels would cover the map: start them folded, the reader opens them when needed
  if (small()) { $('#lefty').classList.add('min'); $('#legend').classList.add('min'); }
  wireSearch(); wireCtrls();
  addEventListener('keydown', (e) => {
    if (el.hidden) return;
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); $('#pSearch').focus(); }
    if (e.key === 'Escape' && S.sel != null && document.activeElement?.id !== 'pSearch') closeDrawer();
  });
  addEventListener('tema', () => { if (map) { if (!S.baseChosen) setBase(isDark() ? 'gelap' : 'terang'); paint(); if (S.sel != null) drawTab(); } });
  store.rek().then((r) => { penDefs = r.penanda; const s = $('#fPen'); if (s && s.options.length === 1) s.insertAdjacentHTML('beforeend', penandaOpts()); });
  ready = init();
}

async function init() {
  // the map and its basemap start while desa data is still downloading
  const dataP = Promise.all([store.desa(), store.geoDesa(), store.geoKab(), store.kab(), store.prov()]);
  const mlgl = await store.maplibre();
  const esri = (p) => [`https://server.arcgisonline.com/ArcGIS/rest/services/${p}/MapServer/tile/{z}/{y}/{x}`];
  const attr = 'Peta dasar © Esri, HERE, Garmin, © OpenStreetMap contributors, komunitas pengguna GIS';
  S.base = isDark() ? 'gelap' : 'terang';
  map = new mlgl.Map({
    container: 'map', attributionControl: { compact: true }, maxZoom: 15, minZoom: 6.3, bounds: [[106.35, -7.85], [108.85, -5.9]],
    fitBoundsOptions: { padding: fitPad() }, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    style: { version: 8, sources: {
      terang: { type: 'raster', tileSize: 256, maxzoom: 16, tiles: esri('Canvas/World_Light_Gray_Base'), attribution: attr },
      terangLab: { type: 'raster', tileSize: 256, maxzoom: 16, tiles: esri('Canvas/World_Light_Gray_Reference') },
      gelap: { type: 'raster', tileSize: 256, maxzoom: 16, tiles: esri('Canvas/World_Dark_Gray_Base'), attribution: attr },
      gelapLab: { type: 'raster', tileSize: 256, maxzoom: 16, tiles: esri('Canvas/World_Dark_Gray_Reference') },
      citra: { type: 'raster', tileSize: 256, maxzoom: 18, tiles: esri('World_Imagery'), attribution: 'Citra © Esri, Maxar, Earthstar Geographics' },
    }, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': css('--bg2') } }] },
  });
  map.touchZoomRotate.disableRotation();
  // the style is inline, so layers can go on as soon as it is parsed; waiting for "load" would wait for basemap tiles
  if (!map.isStyleLoaded()) await new Promise((r) => map.once('style.load', r));
  for (const b of ['terang', 'gelap', 'citra']) map.addLayer({ id: 'base-' + b, type: 'raster', source: b, layout: { visibility: b === S.base ? 'visible' : 'none' } });
  const [d, geo, kg, k, pv] = await dataP;
  D = d; GEO = geo; KABGEO = kg; K = k; PV = pv;
  if (PV.tahun_tersedia?.length) { YEARS = PV.tahun_tersedia; if (!YEARS.includes(S.y)) S.y = YEARS[YEARS.length - 1]; }
  byKab = Object.fromEntries(K.map((x) => [x.kode_kabupaten_kota, x]));
  featBy = new Map(GEO.features.map((f) => [f.id, f]));
  // tiles cut only to z11 with a small buffer, still crisp when overzoomed. Keep the default simplification
  // tolerance: a coarser one breaks small desa into triangle shards at low zoom, leaving holes that cannot be clicked
  map.addSource('desa', { type: 'geojson', data: GEO, maxzoom: 11, buffer: 16 });
  map.addSource('kab', { type: 'geojson', data: KABGEO });
  map.addLayer({ id: 'desa-fill', type: 'fill', source: 'desa', paint: { 'fill-color': '#ccc', 'fill-opacity': ['case', ['boolean', ['feature-state', 'off'], false], 0.08, S.opacity] } });
  map.addLayer({ id: 'desa-line', type: 'line', source: 'desa', minzoom: 9, paint: { 'line-color': isDark() ? '#0b1310' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.15, 13, 0.9], 'line-opacity': 0.8 } });
  map.addLayer({ id: 'kab-line', type: 'line', source: 'kab', paint: { 'line-color': isDark() ? '#e5efe9' : '#10241b', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.9, 12, 2.4], 'line-opacity': 0.7 } });
  map.addLayer({ id: 'kab-sel', type: 'line', source: 'kab', filter: ['==', ['get', 'idkab'], ''], paint: { 'line-color': '#f5b52e', 'line-width': 3 } });
  for (const b of ['terang', 'gelap']) map.addLayer({ id: 'lab-' + b, type: 'raster', source: b + 'Lab', layout: { visibility: b === S.base || (S.base === 'citra' && b === 'gelap') ? 'visible' : 'none' } });
  map.addLayer({ id: 'desa-hl', type: 'line', source: 'desa', filter: ['==', ['id'], -1], paint: { 'line-color': '#2a78d6', 'line-width': 2 } });
  map.addLayer({ id: 'desa-sel', type: 'line', source: 'desa', filter: ['==', ['id'], -1], paint: { 'line-color': '#f5b52e', 'line-width': 3.2 } });
  map.addLayer({ id: 'desa-pin', type: 'line', source: 'desa', filter: ['in', ['id'], ['literal', []]], paint: { 'line-color': '#e2622b', 'line-width': 2.4, 'line-dasharray': [2, 1] } });
  wireMapEvents();
  updateBaseButtons();
}
const small = () => innerWidth <= 900;
const fitPad = () => (innerWidth > 900 ? { left: 390, right: 60, top: 30, bottom: 30 } : 20);

export async function update(params) {
  await ready;
  const lid = params.l && LAYER[params.l] ? params.l : null;
  S.t = params.t && TOPICS.some((t) => t.id === params.t) ? params.t : lid ? LAYER[lid].topic : S.t;
  S.l = lid && LAYER[lid].topic === S.t ? lid : (LAYER[S.l]?.topic === S.t ? S.l : TOPICS.find((t) => t.id === S.t).layers[0].id);
  if (params.y && YEARS.includes(+params.y)) S.y = +params.y;
  const k = params.k || '';
  if (k !== S.k) { S.k = k; S.kc = ''; }
  if (params.kc) S.kc = params.kc;
  S.hide.clear();
  await renderTopic();
  if (params.desa != null && params.desa !== '' && store.idx.has(+params.desa)) { if (S.sel !== +params.desa) select(+params.desa, true); }
  else if (S.k) zoomKab(S.k);
  map.resize();
  // a map warmed while hidden was sized offscreen; refit once on first show
  if (!shown && !S.k && S.sel == null) map.fitBounds([[106.35, -7.85], [108.85, -5.9]], { padding: fitPad(), duration: 0 });
  shown = true;
}
let shown = false;
// called by main.js while the reader is on another view: builds the map offscreen so opening Peta is instant
export async function warm(root, c) { await mount(root, c); await ready; await renderTopic(); }
export function hide() { stopPlay(); }

function sync() {
  ctx.setParams('peta', { t: S.t, l: S.l, y: LAYER[S.l].yearCol ? S.y : '', k: S.k, kc: S.kc, desa: S.sel ?? '' });
}

// ------------------------------------------------------------------ topic card, legend, paint
function setTopic(t) { S.t = t; S.l = TOPICS.find((x) => x.id === t).layers[0].id; S.hide.clear(); stopPlay(); renderTopic(); sync(); }
async function renderTopic() {
  const T = TOPICS.find((x) => x.id === S.t), L = LAYER[S.l];
  const kecs = S.k ? [...(await store.kecamatan()).values()].filter((r) => String(r.kab) === S.k).sort((a, b) => a.nama.localeCompare(b.nama)) : [];
  $('#topicCard').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
      <div><div class="kicker">Topik peta</div><h2>${esc(T.t)}: ${esc(L.label.toLowerCase())}</h2></div>
      <button class="xbtn collapse-btn" id="tcMin" aria-label="Buka atau ciutkan panel topik" aria-expanded="${!$('#lefty').classList.contains('min')}"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button>
    </div>
    <div class="body">
      <div class="tgrid" role="tablist" aria-label="Topik peta">${TOPICS.map((t) => `<button class="ttile" role="tab" data-t="${t.id}" aria-selected="${t.id === S.t}" title="${esc(t.s)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${t.ic}"/></svg>${esc(t.t)}</button>`).join('')}</div>
      <p class="q">${esc(T.q)}</p>
      <div class="pills" style="margin-top:10px" role="radiogroup" aria-label="Lapisan">${T.layers.map((l) => `<button class="pill s" role="radio" aria-pressed="${l.id === S.l}" aria-checked="${l.id === S.l}" data-l="${l.id}">${esc(l.label)}</button>`).join('')}</div>
      ${L.yearCol ? `<div class="yearctl"><button class="playbtn" id="play" aria-label="Putar tahun"><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg></button>
        <input type="range" id="yr" min="0" max="${YEARS.length - 1}" step="1" value="${YEARS.indexOf(S.y)}" aria-label="Tahun"><output id="yrOut">${S.y}</output></div>` : ''}
      <p class="desc">${esc(T.desc)}</p>
      <div class="row2">
        <label><span class="lbl">Wilayah</span><select class="sel" id="fKab"><option value="">Seluruh Jawa Barat</option>${[...K].sort((a, b) => kabTitle(a.nama_kabupaten_kota).localeCompare(kabTitle(b.nama_kabupaten_kota))).map((k) => `<option value="${k.kode_kabupaten_kota}" ${k.kode_kabupaten_kota === S.k ? 'selected' : ''}>${esc(kabTitle(k.nama_kabupaten_kota))}</option>`).join('')}</select></label>
        <label><span class="lbl">Kecamatan</span><select class="sel" id="fKec" ${S.k ? '' : 'disabled'}><option value="">${S.k ? 'Semua kecamatan' : 'Pilih wilayah dulu'}</option>${kecs.map((r) => `<option value="${r.kode}" ${String(r.kode) === S.kc ? 'selected' : ''}>${esc(title(r.nama))}</option>`).join('')}</select></label>
      </div>
      <details class="how"><summary>Saring tipe, tahap, dan penanda</summary><div>
        <div class="grp"><span class="lbl">Tipe desa</span><div class="pills" id="fTipe">${[1, 2, 3, 4].map((t) => `<button class="pill s" data-v="${t}" aria-pressed="${S.tipe.has(t)}"><i style="background:${tcol(t)}"></i>T${t}</button>`).join('')}</div></div>
        <div class="grp"><span class="lbl">Tahap</span><div class="pills" id="fTahap">${[1, 2, 3].map((t) => `<button class="pill s" data-v="${t}" aria-pressed="${S.tahap.has(t)}">Tahap ${t}</button>`).join('')}</div></div>
        <div class="grp"><span class="lbl">Penanda catatan</span><select class="sel" id="fPen"><option value="0">Semua desa</option>${penandaOpts()}</select></div>
      </div></details>
      <details class="how"><summary>Cara membaca topik ini</summary><div>${esc(T.read)}</div></details>
    </div>`;
  $$('#topicCard .ttile').forEach((b) => (b.onclick = () => setTopic(b.dataset.t)));
  $$('#topicCard [data-l]').forEach((b) => (b.onclick = () => { S.l = b.dataset.l; S.hide.clear(); stopPlay(); renderTopic(); sync(); }));
  $('#tcMin').onclick = () => $('#tcMin').setAttribute('aria-expanded', !$('#lefty').classList.toggle('min'));
  $('#fKab').onchange = (e) => { S.k = e.target.value; S.kc = ''; renderTopic(); zoomKab(S.k); sync(); };
  $('#fKec').onchange = (e) => { S.kc = e.target.value; paint(); zoomKec(S.kc); sync(); };
  $('#fPen').value = String(S.pen);
  $('#fPen').onchange = (e) => { S.pen = +e.target.value; paint(); };
  const chips = (id, set) => $$(`#${id} .pill`).forEach((b) => (b.onclick = () => { const v = +b.dataset.v; if (set.has(v) && set.size > 1) set.delete(v); else set.add(v); b.setAttribute('aria-pressed', set.has(v)); paint(); }));
  chips('fTipe', S.tipe); chips('fTahap', S.tahap);
  if (L.yearCol) {
    $('#yr').oninput = (e) => { S.y = YEARS[+e.target.value]; $('#yrOut').textContent = S.y; paint(); sync(); };
    $('#play').onclick = () => (playT ? stopPlay() : startPlay());
  }
  await paint();
}
let penDefs = null;
function penandaOpts() { return (penDefs || []).map((p) => `<option value="${p.bit}">${esc(p.label)} (${num(p.desa)})</option>`).join(''); }

function startPlay() {
  const b = $('#play'); if (b) b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  playT = setInterval(() => { S.y = YEARS[(YEARS.indexOf(S.y) + 1) % YEARS.length]; const r = $('#yr'); if (r) { r.value = YEARS.indexOf(S.y); $('#yrOut').textContent = S.y; } paint(); }, 1300);
}
function stopPlay() { clearInterval(playT); playT = null; const b = $('#play'); if (b) b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>'; }

const colOf = (L) => (L.yearCol ? L.yearCol + S.y : L.col);
async function valuesFor(L) {
  const N = store.N;
  if (L.col === '_sim') {
    const [C, Kk] = await Promise.all([store.sel(), store.kab()]), sim = simstate.run(C, Kk);
    return Array.from({ length: N }, (_, i) => { const x = sim.cellX[`${D.kode_kabupaten_kota[i]}_${D.tipe_desa[i]}`]; return ok(x) ? (x > 0.99 ? 2 : x > 0.01 ? 1 : 0) : null; });
  }
  if (L.col === '_hub') {
    await store.cols(['hub_desa_lokasi']);
    return Array.from({ length: N }, (_, i) => (D.tipe_desa[i] !== 1 || !D.hub_desa_lokasi[i] ? null : D.hub_desa_lokasi[i] === D.bps_nama_desa_kelurahan[i] ? 1 : 2));
  }
  const c = colOf(L); await store.cols([c]);
  return Array.from({ length: N }, (_, i) => (D.bukan_permukiman[i] ? null : D[c][i]));
}
function passFilter(i) {
  if (S.k && String(D.kode_kabupaten_kota[i]) !== S.k) return false;
  if (S.kc && String(D.bps_kode_kecamatan[i]) !== S.kc) return false;
  const t = D.tipe_desa[i]; if (t && !S.tipe.has(t)) return false;
  const p = D.tahap[i]; if (p && !S.tahap.has(p)) return false;
  if (S.pen && !(D.penanda[i] & S.pen)) return false;
  return true;
}
const classIdx = (L, v) => (L.cat ? CAT[L.cat]().values.indexOf(v) : classOf(v, sc.breaks));

async function paint() {
  if (!map) return;
  const L = LAYER[S.l]; vals = await valuesFor(L);
  if (L !== LAYER[S.l]) return;
  if (L.cat) { const c = CAT[L.cat](); sc = { cat: true, breaks: [], colors: c.colors, labels: c.labels, values: c.values }; }
  else { sc = L.fixed ? fixedClasses(L.fixed, L.ramp) : quantClasses(vals, L.ramp, 6); sc.labels = labelsFor(sc, L.pct, sc.min ?? Math.min(...vals.filter(ok)), sc.max ?? Math.max(...vals.filter(ok))); }
  const counts = new Array(sc.colors.length).fill(0);
  for (let i = 0; i < store.N; i++) {
    const v = vals[i], m = !ok(v), ci = m ? -1 : classIdx(L, v), on = passFilter(i) && !(ci >= 0 && S.hide.has(ci));
    if (!m && ci >= 0 && passFilter(i)) counts[ci]++;
    map.setFeatureState({ source: 'desa', id: D.uid[i] }, { c: ci, off: !on });
  }
  const expr = ['match', ['to-number', ['feature-state', 'c'], -1]];
  sc.colors.forEach((c, i) => expr.push(i, c));
  expr.push(isDark() ? '#26332e' : '#dfe4e0');
  map.setPaintProperty('desa-fill', 'fill-color', expr);
  map.setPaintProperty('desa-fill', 'fill-opacity', ['case', ['boolean', ['feature-state', 'off'], false], 0.07, S.opacity]);
  map.setPaintProperty('desa-line', 'line-color', S.base === 'gelap' || S.base === 'citra' ? '#0b1310' : '#ffffff');
  map.setPaintProperty('kab-line', 'line-color', S.base === 'terang' || S.base === 'polos' && !isDark() ? '#10241b' : '#e5efe9');
  renderLegend(L, counts);
}
function renderLegend(L, counts) {
  const yr = L.yearCol ? S.y : L.year, lg = $('#legend');
  const shown = counts.reduce((a, b) => a + b, 0), tot = Math.max(1, shown);
  const seg = (i, flex) => `<button class="seg" data-i="${i}" aria-pressed="${!S.hide.has(i)}" style="flex:${flex} 1 0;background:${sc.colors[i]}" title="${esc(sc.labels[i])}: ${num(counts[i])} desa" aria-label="${esc(sc.labels[i])}, ${num(counts[i])} desa"></button>`;
  let body;
  if (sc.cat) {
    // categories: segment length is the share of desa, so the bar doubles as a distribution
    body = `<div class="lgbar">${sc.colors.map((_, i) => seg(i, Math.max(counts[i], tot * 0.04))).join('')}</div>
      <div class="lgcats">${sc.colors.map((c, i) => `<button class="cls" data-i="${i}" aria-pressed="${!S.hide.has(i)}"><i style="background:${c}"></i>${esc(sc.labels[i])}<b>${num(counts[i])}</b></button>`).join('')}</div>`;
  } else {
    // classes: equal segments with the class limits at their edges and the desa count under each
    const real = vals.filter(ok), f = (x) => (L.pct ? pct(x, Math.abs(x) < 0.1 ? 1 : 0) : short(x));
    const edges = [sc.min ?? Math.min(...real), ...sc.breaks, sc.max ?? Math.max(...real)], n = sc.colors.length;
    body = `<div class="lgticks">${edges.map((v, i) => `<span style="left:${(100 * i) / n}%">${esc(f(v))}</span>`).join('')}</div>
      <div class="lgbar">${sc.colors.map((_, i) => seg(i, 1)).join('')}</div>
      <div class="lgcnt">${counts.map((c) => `<span>${num(c)}</span>`).join('')}</div>`;
  }
  lg.innerHTML = `<div class="lg-top"><h4>${esc(L.label)}${L.yearCol ? ' ' + S.y : ''}<small>${esc(L.unit || 'kategori')}</small></h4><button class="xbtn collapse-btn" id="lgMin" aria-label="Buka atau ciutkan legenda" aria-expanded="${!lg.classList.contains('min')}"><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button></div>
    ${body}
    <div class="foot">${num(shown)} desa tampil · data ${esc(String(yr))}, ${esc(L.src)}${sc.cat ? '' : '. Kelas ' + (L.fixed ? 'tetap' : 'kuantil')}. Klik warna untuk menyembunyikan.</div>`;
  $$('#legend [data-i]').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; S.hide.has(i) ? S.hide.delete(i) : S.hide.add(i); paint(); }));
  $('#lgMin').onclick = () => $('#lgMin').setAttribute('aria-expanded', !lg.classList.toggle('min'));
}
const fmtVal = (L, v) => {
  if (!ok(v)) return 'tanpa data';
  if (L.cat) return CAT[L.cat]().labels[CAT[L.cat]().values.indexOf(v)] || '';
  if (L.pct) return pct(v, Math.abs(v) < 0.1 ? 1 : 0);
  const d = Math.abs(v) < 10 ? 2 : Math.abs(v) < 100 ? 1 : 0;
  return `${num(v, d)} ${L.unit}`;
};

// ------------------------------------------------------------------ map events
function wireMapEvents() {
  const hv = $('#hover');
  let last = null;
  map.on('mousemove', 'desa-fill', (e) => {
    const f = e.features[0], i = store.idx.get(f.id); if (i == null) return;
    map.getCanvas().style.cursor = 'pointer';
    if (last !== f.id) { map.setFilter('desa-hl', ['==', ['id'], f.id]); last = f.id; }
    const L = LAYER[S.l];
    hv.innerHTML = `<b>${esc(title(D.bps_nama_desa_kelurahan[i]))}</b><span class="muted">${esc(title(D.bps_nama_kecamatan[i]))}, ${esc(kabName(D.kode_kabupaten_kota[i]))}</span><br>${esc(L.label)}: <b style="display:inline">${esc(fmtVal(L, vals[i]))}</b>`;
    hv.hidden = false;
    const W = el.clientWidth; const x = e.point.x + 16, y = e.point.y + 16;
    hv.style.left = Math.min(x, W - 290) + 'px'; hv.style.top = y + 'px';
  });
  map.on('mouseleave', 'desa-fill', () => { hv.hidden = true; last = null; map.getCanvas().style.cursor = ''; map.setFilter('desa-hl', ['==', ['id'], -1]); });
  map.on('click', 'desa-fill', (e) => select(e.features[0].id, false));
  // touching the map means the reader wants to see it: fold the topic panel out of the way
  const fold = () => { if (small() && !$('#lefty').classList.contains('min')) { $('#lefty').classList.add('min'); $('#tcMin')?.setAttribute('aria-expanded', false); } };
  map.on('dragstart', fold); map.on('click', fold);
}
const kabName = (k) => kabTitle(byKab[String(k)]?.nama_kabupaten_kota || String(k));
function bboxOf(fs) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  const walk = (a) => { if (typeof a[0] === 'number') { if (a[0] < x0) x0 = a[0]; if (a[0] > x1) x1 = a[0]; if (a[1] < y0) y0 = a[1]; if (a[1] > y1) y1 = a[1]; } else a.forEach(walk); };
  fs.forEach((f) => walk(f.geometry.coordinates)); return [[x0, y0], [x1, y1]];
}
function zoomKab(k) {
  map.setFilter('kab-sel', ['==', ['get', 'idkab'], k || '']);
  if (!k) { map.fitBounds([[106.35, -7.85], [108.85, -5.9]], { padding: fitPad(), duration: 600 }); return; }
  const f = KABGEO.features.find((x) => String(x.properties.idkab) === k);
  if (f) map.fitBounds(bboxOf([f]), { padding: fitPad(), duration: 700 });
}
function zoomKec(kc) {
  if (!kc) return zoomKab(S.k);
  const fs = []; for (let i = 0; i < store.N; i++) if (String(D.bps_kode_kecamatan[i]) === kc) fs.push(featBy.get(D.uid[i]));
  if (fs.length) map.fitBounds(bboxOf(fs), { padding: fitPad(), duration: 700, maxZoom: 13 });
}

// ------------------------------------------------------------------ controls
function wireCtrls() {
  $('#zIn').onclick = () => map?.zoomIn(); $('#zOut').onclick = () => map?.zoomOut();
  $('#zHome').onclick = () => { S.k = ''; S.kc = ''; renderTopic(); zoomKab(''); sync(); };
  $('#tampilBtn').onclick = () => { const p = $('#tampil'); p.hidden = !p.hidden; $('#tampilBtn').setAttribute('aria-expanded', !p.hidden); };
  $$('#baseSel .pill').forEach((b) => (b.onclick = () => { S.baseChosen = true; setBase(b.dataset.b); }));
  $('#opac').oninput = (e) => { S.opacity = +e.target.value; map?.setPaintProperty('desa-fill', 'fill-opacity', ['case', ['boolean', ['feature-state', 'off'], false], 0.07, S.opacity]); };
  $('#optBorder').onchange = (e) => map?.setLayoutProperty('kab-line', 'visibility', e.target.checked ? 'visible' : 'none');
  $('#optLabel').onchange = (e) => { S.labels = e.target.checked; setBase(S.base); };
}
function setBase(b) {
  S.base = b; if (!map) return;
  for (const x of ['terang', 'gelap', 'citra']) map.setLayoutProperty('base-' + x, 'visibility', x === b ? 'visible' : 'none');
  const lab = b === 'terang' ? 'terang' : b === 'polos' ? null : 'gelap';
  for (const x of ['terang', 'gelap']) map.setLayoutProperty('lab-' + x, 'visibility', S.labels && x === lab ? 'visible' : 'none');
  map.setPaintProperty('bg', 'background-color', css('--bg2'));
  updateBaseButtons(); paint();
}
const updateBaseButtons = () => $$('#baseSel .pill').forEach((x) => x.setAttribute('aria-pressed', x.dataset.b === S.base));

// ------------------------------------------------------------------ search
function wireSearch() {
  const inp = $('#pSearch'), ul = $('#pSuggest');
  let hits = [], act = -1, names = null;
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '');
  const show = () => {
    ul.hidden = !hits.length;
    ul.innerHTML = hits.map((h, j) => `<li role="option" aria-selected="${j === act}" data-j="${j}"><span><span class="k">${h.kind}</span>${esc(h.name)}</span><small>${esc(h.sub)}</small></li>`).join('');
    $$('li', ul).forEach((li) => (li.onmousedown = (e) => { e.preventDefault(); pick(hits[+li.dataset.j]); }));
  };
  const pick = async (h) => {
    ul.hidden = true; inp.value = h.name; inp.blur();
    if (h.kind === 'Desa') select(h.uid, true);
    else if (h.kind === 'Kab/kota') { S.k = h.kode; S.kc = ''; await renderTopic(); zoomKab(S.k); sync(); }
    else { S.k = String(h.kab); S.kc = String(h.kode); await renderTopic(); zoomKec(S.kc); sync(); }
  };
  inp.addEventListener('input', debounce(async () => {
    const q = norm(inp.value.trim()); act = -1;
    if (q.length < 2) { hits = []; show(); return; }
    await store.desa();
    if (!names) names = D.bps_nama_desa_kelurahan.map(norm);
    const kab = K.filter((k) => norm(k.nama_kabupaten_kota).includes(q)).slice(0, 3).map((k) => ({ kind: 'Kab/kota', name: kabTitle(k.nama_kabupaten_kota), sub: `${num(k.jumlah_desa)} desa`, kode: k.kode_kabupaten_kota }));
    const kec = [...(await store.kecamatan()).values()].filter((r) => norm(r.nama).includes(q)).slice(0, 4).map((r) => ({ kind: 'Kec.', name: title(r.nama), sub: kabName(r.kab), kode: r.kode, kab: r.kab }));
    const ds = [];
    for (let i = 0; i < store.N && ds.length < 60; i++) if (names[i].includes(q)) ds.push(i);
    ds.sort((a, b) => (names[a].startsWith(q) ? 0 : 1) - (names[b].startsWith(q) ? 0 : 1));
    hits = [...kab, ...kec, ...ds.slice(0, 8).map((i) => ({ kind: 'Desa', name: title(D.bps_nama_desa_kelurahan[i]), sub: `${title(D.bps_nama_kecamatan[i])}, ${kabName(D.kode_kabupaten_kota[i])}`, uid: D.uid[i] }))];
    show();
  }, 90));
  inp.onkeydown = (e) => {
    if (e.key === 'ArrowDown') { act = Math.min(act + 1, hits.length - 1); show(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act = Math.max(act - 1, 0); show(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits.length) pick(hits[Math.max(act, 0)]);
    else if (e.key === 'Escape') { ul.hidden = true; inp.blur(); }
  };
  inp.onblur = () => setTimeout(() => (ul.hidden = true), 120);
}

// ------------------------------------------------------------------ drawer
async function select(uid, fly) {
  const i = store.idx.get(uid); if (i == null) return;
  S.sel = uid;
  map.setFilter('desa-sel', ['==', ['id'], uid]);
  if (fly) map.fitBounds(bboxOf([featBy.get(uid)]), { padding: innerWidth > 900 ? { left: 400, right: 460, top: 80, bottom: 80 } : { top: 60, bottom: innerHeight * 0.55, left: 30, right: 30 }, maxZoom: 13, duration: 800 });
  $('#mapwrap').classList.add('has-drawer');
  $('#drawer').classList.add('open');
  sync();
  await drawDrawer();
}
function closeDrawer() {
  S.sel = null; map.setFilter('desa-sel', ['==', ['id'], -1]);
  $('#drawer').classList.remove('open'); $('#mapwrap').classList.remove('has-drawer'); sync();
}
let rec = null, shardData = null;
async function drawDrawer() {
  const uid = S.sel, i = store.idx.get(uid), t = D.tipe_desa[i], b = D.bukti[i];
  const pinned = S.pins.includes(uid);
  $('#drawer').innerHTML = `
    <div class="dh"><h2>${esc(title(D.bps_nama_desa_kelurahan[i]))}</h2>
      <div class="where">Kec. ${esc(title(D.bps_nama_kecamatan[i]))}, ${esc(kabName(D.kode_kabupaten_kota[i]))} · BPS ${D.bps_kode_desa_kelurahan[i]}</div>
      <div class="chips">${t ? `<span class="chip t" style="background:${tcol(t)}">${esc(TIPE[t])}</span>` : '<span class="chip">Bukan permukiman</span>'}
        ${D.tahap[i] ? `<span class="chip">${esc(TAHAP[D.tahap[i]])}</span>` : ''}${b ? `<span class="badge ${BUKTI[b]}">Bukti ${BUKTI[b]}</span>` : ''}</div>
      <div class="x"><button class="xbtn" id="dClose" aria-label="Tutup detail desa"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div></div>
    <div class="dtabs" role="tablist">${[['ringkasan', 'Ringkasan'], ['rek', 'Rekomendasi'], ['deret', 'Deret waktu'], ['kal', 'Kalender']].map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${l}</button>`).join('')}</div>
    <div class="db" id="dBody"><div class="skel" style="height:220px"></div></div>
    <div class="df">
      <button class="btn-s ${pinned ? 'solid' : ''}" id="dPin"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>${pinned ? 'Dibandingkan' : 'Bandingkan'}</button>
      <button class="btn-s" id="dLink"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>Salin tautan</button>
      <button class="btn-s" id="dCsv"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>CSV</button>
      <button class="btn-s" id="dKab">Profil wilayah</button>
    </div>`;
  $('#dClose').onclick = closeDrawer;
  $$('.dtabs button', $('#drawer')).forEach((x) => (x.onclick = () => { S.tab = x.dataset.tab; $$('.dtabs button', $('#drawer')).forEach((y) => y.setAttribute('aria-selected', y === x)); drawTab(); }));
  $('#dLink').onclick = () => copy(location.href);
  $('#dPin').onclick = () => togglePin(uid);
  $('#dKab').onclick = () => ctx.go('wilayah', { kab: String(D.kode_kabupaten_kota[i]) });
  $('#dCsv').onclick = async () => {
    await store.allDesa();
    const row = {}; Object.keys(D).forEach((c) => (row[c] = D[c][i]));
    if (rec?.rek) Object.entries(rec.rek).forEach(([k, v]) => (row['rek_' + k] = Array.isArray(v) ? v.join(' | ') : v));
    downloadCSV(`desa_${D.bps_kode_desa_kelurahan[i]}.csv`, [row]);
  };
  const kode = D.kode_kabupaten_kota[i];
  [shardData] = await Promise.all([store.shard(kode), store.cols(['timbulan_organik_ton_th_p05', 'jarak_tpa_km', 'ntl_2024', 'kepadatan_organik_ton_km2_th'])]);
  if (S.sel !== uid) return;
  rec = shardData.desa[uid] || shardData.desa[String(uid)];
  drawTab();
}
function typeMedian(col, t) {
  const key = col + t;
  if (!(key in medMemo)) { const a = []; for (let i = 0; i < store.N; i++) if (D.tipe_desa[i] === t && ok(D[col][i])) a.push(D[col][i]); medMemo[key] = median(a); }
  return medMemo[key];
}
function rankOf(col, i, within) {
  const v = D[col][i]; let r = 1, n = 0;
  for (let j = 0; j < store.N; j++) { if (within && D.kode_kabupaten_kota[j] !== D.kode_kabupaten_kota[i]) continue; if (!ok(D[col][j]) || D.bukan_permukiman[j]) continue; n++; if (D[col][j] > v) r++; }
  return [r, n];
}
async function drawTab() {
  const uid = S.sel, i = store.idx.get(uid), body = $('#dBody'); if (i == null || !body) return;
  const t = D.tipe_desa[i];
  if (S.tab === 'ringkasan') {
    if (!t) { body.innerHTML = '<p class="muted">Poligon ini bukan permukiman (waduk atau taman nasional), sehingga tidak dianalisis.</p>'; return; }
    const [rp1, np1] = rankOf('timbulan_organik_ton_th_p50', i), [rk, nk] = rankOf('timbulan_organik_ton_th_p50', i, true);
    const vs = [
      ['Organik', 'timbulan_organik_ton_th_p50', 'ton'], ['Kepadatan organik', 'kepadatan_organik_ton_km2_th', 't/km²'], ['Jarak ke TPA', 'jarak_tpa_km', 'km'], ['Cahaya malam 2024', 'ntl_2024', 'nW'],
    ].map(([lab, c, u]) => {
      const v = D[c][i], m = typeMedian(c, t), mx = Math.max(v || 0, m || 0) * 1.25 || 1;
      return `<div class="row"><span>${lab}</span><div class="tr" title="garis: median ${esc(TIPE[t])}"><i style="left:${(100 * m) / mx}%"></i><b style="left:${(100 * (v || 0)) / mx}%;background:${tcol(t)}"></b></div><span class="v">${num(v, v < 10 ? 1 : 0)} ${u}</span></div>`;
    }).join('');
    body.innerHTML = `
      <div class="facts">
        <div><b>${num(D.penduduk_model[i])}</b><span>jiwa, model 2024</span></div>
        <div><b>${num(D.timbulan_organik_ton_th_p50[i])} t</b><span>organik per tahun (${num(D.timbulan_organik_ton_th_p05[i])}–${num(D.timbulan_organik_ton_th_p95[i])})</span></div>
        <div><b>${num(D.organik_dialihkan_ton_th[i])} t</b><span>diolah modul per tahun</span></div>
        <div><b>${rp((D.vgf_juta_rp[i] || 0) * 1e6)}</b><span>VGF bagian desa, 2026–2030</span></div>
        <div><b>${num(D.emisi_dihindari_t_co2e_th[i])} t</b><span>CO₂e per tahun dihindari</span></div>
        <div><b>${num(D.pekerjaan_langsung[i], 1)}</b><span>pekerjaan langsung</span></div>
      </div>
      <p class="rank">Timbulan organik peringkat <b>${num(rp1)}</b> dari ${num(np1)} desa di Jawa Barat dan <b>${num(rk)}</b> dari ${num(nk)} di ${esc(kabName(D.kode_kabupaten_kota[i]))}.</p>
      <div class="vs"><div class="h4" style="margin-top:6px">Dibanding median ${esc(TIPE[t])}</div>${vs}<p class="note">Titik: desa ini. Garis abu-abu: median tipenya.</p></div>
      <div class="h4">Kondisi data</div>
      <ul class="cond">${(rec?.rek?.kondisi || []).map((s) => { const m = s.match(/^(.*)\s\[(.+)\]$/); return `<li>${esc(m ? m[1] : s)}${m ? `<span class="src">${esc(m[2])}</span>` : ''}</li>`; }).join('')}</ul>`;
  } else if (S.tab === 'rek') {
    const r = rec?.rek;
    if (!r) { body.innerHTML = '<p class="muted">Rekomendasi tidak tersedia untuk poligon ini.</p>'; return; }
    const kb = (r.kekuatan_bukti || '').split(' ')[0];
    body.innerHTML = `<div class="rec-main">${esc(r.rekomendasi_utama)}</div>
      <dl class="kv"><dt>Waktu</dt><dd>${esc(r.tahap_teks || '')}</dd><dt>Aktor</dt><dd>${esc(r.aktor || '')}</dd><dt>Instrumen</dt><dd>${esc(r.instrumen || '')}</dd>
        <dt>Target</dt><dd>${esc(r.target || '')}</dd><dt>Bukti</dt><dd><span class="badge ${esc(kb)}">${esc(r.kekuatan_bukti || '')}</span></dd></dl>
      <div class="h4">Langkah</div><ul class="acts">${(r.aksi || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      ${(r.catatan || []).length ? `<div class="h4">Catatan</div><div class="notes">${r.catatan.map((c) => `<p>${esc(c)}</p>`).join('')}</div>` : ''}`;
  } else if (S.tab === 'deret') {
    body.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div class="seg" id="serSeg">${[['ntl', 'Cahaya malam'], ['co', 'CO'], ['so2', 'SO₂']].map(([k, l]) => `<button data-v="${k}" aria-pressed="${S.ser === k}">${l}</button>`).join('')}</div></div>
      <div class="chartbox" style="height:240px;margin-top:12px"><canvas id="serChart" aria-label="Deret bulanan"></canvas></div>
      <p class="note">Bulanan Januari 2022 sampai ${esc(lastMonth())}. Arsir oranye: bulan Lebaran; arsir hijau: Ramadan. Garis putus: median ${esc(TIPE[t] || 'tipe')}.</p>`;
    $$('#serSeg button').forEach((b) => (b.onclick = () => { S.ser = b.dataset.v; drawTab(); }));
    await drawSeries(i);
  } else {
    await store.cols(['rasio_puncak_rerata', 'bulan_puncak']);
    if (S.sel !== uid || S.tab !== 'kal') return;
    body.innerHTML = `<div class="chartbox" style="height:220px"><canvas id="kalChart" aria-label="Kalender timbulan"></canvas></div>
      <p class="note">Kalender timbulan organik bulanan model 2025 (Ramadan, Lebaran, Iduladha, libur sekolah dan akhir tahun, musim hajatan). Puncak pada ${esc(BULAN[(D.bulan_puncak[i] || 1) - 1])}; kapasitas modul dirancang dengan rasio puncak terhadap rerata ${num(D.rasio_puncak_rerata[i], 2)}.</p>`;
    await drawKal(i);
  }
}
const lastMonth = () => { const b = (PV.bulan || []).slice(-1)[0] || '2025-12'; return `${BULAN[+b.slice(5) - 1]} ${b.slice(0, 4)}`; };
async function charts() { if (!Chart) { Chart = await store.chartjs(); } chartTheme(Chart); return Chart; }
const shadePlugin = {
  id: 'shade',
  beforeDatasetsDraw(ch) {
    const { ctx: c, chartArea: a, scales: { x } } = ch; if (!a) return;
    const labels = ch.data.labels, w = x.width / labels.length;
    c.save();
    labels.forEach((l, j) => { const r = RAMADAN.includes(l), lb = LEBARAN.includes(l); if (!r && !lb) return; c.fillStyle = lb ? 'rgba(226,98,43,.18)' : 'rgba(31,154,104,.12)'; c.fillRect(x.getPixelForValue(j) - w / 2, a.top, w, a.bottom - a.top); });
    c.restore();
  },
};
async function drawSeries(i) {
  const C = await charts(), t = D.tipe_desa[i], labels = PV.bulan, v = S.ser;
  const UNIT = { ntl: 'nW per cm² per sr', co: 'mmol per m²', so2: '10⁻⁵ mol per m²' };
  const ds = [{ label: title(D.bps_nama_desa_kelurahan[i]), data: rec?.seri?.[v] || [], borderColor: css('--ink'), backgroundColor: css('--ink'), borderWidth: 2, pointRadius: 0, spanGaps: true, tension: 0.25 }];
  if (t) ds.push({ label: 'Median ' + TIPE[t], data: PV.seri_median_tipe[t][v], borderColor: tcol(t), borderDash: [5, 4], borderWidth: 1.6, pointRadius: 0, spanGaps: true, tension: 0.25 });
  chart($('#serChart'), { type: 'line', data: { labels, datasets: ds }, plugins: [shadePlugin], options: {
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { title: (it) => { const [y, m] = it[0].label.split('-'); return `${BULAN[+m - 1]} ${y}${LEBARAN.includes(it[0].label) ? ', Lebaran' : RAMADAN.includes(it[0].label) ? ', Ramadan' : ''}`; },
      label: (c) => `${c.dataset.label}: ${ok(c.raw) ? num(c.raw, 2) : 'tanpa citra'} ${UNIT[v]}` } } },
    scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (_, j) => (j % 12 === 0 ? labels[j].slice(0, 4) : '') } }, y: { title: { display: true, text: UNIT[v] } } } } }, C);
}
async function drawKal(i) {
  const C = await charts(), m = rec?.musiman || [], t = D.tipe_desa[i], mx = Math.max(...m);
  chart($('#kalChart'), { type: 'bar', data: { labels: BLN, datasets: [{ data: m, backgroundColor: m.map((x) => (x === mx ? tcol(t) : css('--line'))), borderRadius: 4 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${num(c.raw, 1)} ton organik` } } }, scales: { x: { grid: { display: false } }, y: { title: { display: true, text: 'ton per bulan' } } } } }, C);
}

// ------------------------------------------------------------------ compare tray
function togglePin(uid) {
  const k = S.pins.indexOf(uid);
  if (k >= 0) S.pins.splice(k, 1); else { if (S.pins.length >= 3) { toast('Maksimal tiga desa; hapus salah satu dulu'); return; } S.pins.push(uid); }
  map.setFilter('desa-pin', ['in', ['id'], ['literal', S.pins]]);
  drawCompare();
  if (S.sel === uid) { const b = $('#dPin'); b.classList.toggle('solid', S.pins.includes(uid)); b.lastChild.textContent = S.pins.includes(uid) ? 'Dibandingkan' : 'Bandingkan'; }
}
async function drawCompare() {
  const box = $('#compare');
  if (!S.pins.length) { box.hidden = true; return; }
  await store.cols(['jarak_tpa_km', 'kepadatan_organik_ton_km2_th']);
  const rows = [
    ['Tipe', (i) => (D.tipe_desa[i] ? `<span class="chip t" style="background:${tcol(D.tipe_desa[i])}">T${D.tipe_desa[i]}</span>` : '–')],
    ['Penduduk', (i) => num(D.penduduk_model[i])], ['Organik (t/th)', (i) => num(D.timbulan_organik_ton_th_p50[i])], ['Kepadatan (t/km²)', (i) => num(D.kepadatan_organik_ton_km2_th[i])],
    ['Diolah (t/th)', (i) => num(D.organik_dialihkan_ton_th[i])], ['VGF', (i) => rp((D.vgf_juta_rp[i] || 0) * 1e6)], ['Emisi (t CO₂e)', (i) => num(D.emisi_dihindari_t_co2e_th[i])],
    ['Pekerjaan', (i) => num(D.pekerjaan_langsung[i], 1)], ['Jarak TPA (km)', (i) => num(D.jarak_tpa_km[i], 1)], ['Tahap', (i) => (D.tahap[i] ? 'Tahap ' + D.tahap[i] : '–')],
  ];
  const ids = S.pins.map((u) => store.idx.get(u));
  box.hidden = false;
  box.innerHTML = `<div class="ch"><b style="font-size:14px">Bandingkan desa</b><button class="xbtn" id="cmpClose" aria-label="Tutup perbandingan"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="tbl-wrap" style="max-height:260px"><table class="t"><thead><tr><th></th>${ids.map((i, j) => `<th class="n"><button class="link" data-u="${S.pins[j]}" style="text-transform:none;letter-spacing:0">${esc(title(D.bps_nama_desa_kelurahan[i]))}</button> <button class="link" data-x="${S.pins[j]}" aria-label="Hapus" style="color:var(--muted)">×</button></th>`).join('')}</tr></thead>
    <tbody>${rows.map(([l, f]) => `<tr><td>${l}</td>${ids.map((i) => `<td class="n">${f(i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  $('#cmpClose').onclick = () => { S.pins = []; map.setFilter('desa-pin', ['in', ['id'], ['literal', []]]); drawCompare(); };
  $$('[data-u]', box).forEach((b) => (b.onclick = () => select(+b.dataset.u, true)));
  $$('[data-x]', box).forEach((b) => (b.onclick = () => togglePin(+b.dataset.x)));
}
