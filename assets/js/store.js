// Data layer: every file is fetched once and memoised. Desa columns live in bundles (see pipeline/build_web.py)
// so a map layer only pulls the columns it draws.
const memo = new Map();
export function getJSON(url) {
  if (!memo.has(url)) {
    memo.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); })
      .catch((e) => { memo.delete(url); throw e; }));
  }
  return memo.get(url);
}

export const prov = () => getJSON('data/provinsi.json');
export const kab = () => getJSON('data/kabkota.json');
export const sel = () => getJSON('data/sel.json');
export const kamus = () => getJSON('data/meta/kamus_data.json');
export const paper = () => getJSON('data/paper.json');
export const rek = () => getJSON('data/rekomendasi.json');
export const geoKabRingan = () => getJSON('data/geo/kabkota_ringan.geojson');
export const geoKab = () => getJSON('data/geo/kabkota_jabar.geojson');
export const shard = (kode) => getJSON(`data/series/kab_${kode}.json`);

export const BUNDLE_OF = {};
const BUNDLES = {
  inti: ['uid', 'kode_kabupaten_kota', 'bps_kode_kecamatan', 'bps_nama_kecamatan', 'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan', 'bukan_permukiman',
    'tipe_desa', 'tahap', 'penduduk_model', 'timbulan_organik_ton_th_p50', 'organik_dialihkan_ton_th', 'vgf_juta_rp', 'investasi_juta_rp',
    'emisi_dihindari_t_co2e_th', 'energi_biogas_mwh_th', 'pekerjaan_langsung', 'skor_keyakinan', 'kategori_keyakinan', 'hub_desa', 'lon', 'lat', 'bukti', 'penanda'],
  timbulan: ['luas_km2', 'kepadatan_jiwa_km2', 'timbulan_total_ton_th_p05', 'timbulan_total_ton_th_p50', 'timbulan_total_ton_th_p95', 'timbulan_organik_ton_th_p05',
    'timbulan_organik_ton_th_p95', 'timbulan_per_kapita_kg_hari', 'kepadatan_organik_ton_km2_th', 'pangsa_nonrumahtangga', 'rasio_puncak_rerata', 'bulan_puncak', 'lpa_probabilitas_posterior'],
  satelit: ['ntl_2022', 'ntl_2023', 'ntl_2024', 'ntl_2025', 'ntl_pertumbuhan_2022_2025', 'co_2022', 'co_2023', 'co_2024', 'co_2025', 'so2_2022', 'so2_2023', 'so2_2024', 'so2_2025',
    'co_rerata_2022_2025', 'kenaikan_co_kemarau'],
  ekonomi: ['metana_m3_th', 'kapasitas_desain_kg_hari', 'vgf_apbd_kabkota_juta_rp', 'vgf_dana_desa_juta_rp', 'vgf_bantuan_provinsi_juta_rp', 'lpg_diganti_ton_th',
    'gate_fee_impas_rp_ton', 'biaya_buang_dihindari_rp_ton', 'mac_rp_t_co2e', 'peluang_swadana', 'umk_2025_rp'],
  lokasi: ['jarak_tpa_km', 'poi_pesantren', 'poi_pasar', 'poi_banksampah', 'hub_organik_ton_th', 'hub_kapasitas_ton_hari', 'hub_desa_lokasi'],
};
for (const [b, cols] of Object.entries(BUNDLES)) for (const c of cols) BUNDLE_OF[c] = b;

// D: one columnar object that grows as bundles arrive; N, idx (uid -> row) are set once the core bundle is in
export const D = {};
export let N = 0;
export const idx = new Map();
const loaded = {};
function bundle(name) {
  return (loaded[name] ||= getJSON(`data/desa/${name}.json`).then((b) => {
    Object.assign(D, b);
    if (name === 'inti') { N = b.uid.length; b.uid.forEach((u, i) => idx.set(u, i)); }
    return D;
  }));
}
export const desa = () => bundle('inti');
export async function cols(list) {
  await bundle('inti');
  const of = (c) => BUNDLE_OF[c] || (/^(ntl|co|so2)_\d{4}$/.test(c) ? 'satelit' : null);
  await Promise.all([...new Set(list.map(of).filter(Boolean))].map(bundle));
  return D;
}
export const allDesa = () => Promise.all(Object.keys(BUNDLES).map(bundle)).then(() => D);

// kecamatan aggregates derived on the client from the core bundle
let kecMemo;
export async function kecamatan() {
  if (kecMemo) return kecMemo;
  await desa();
  const m = new Map();
  for (let i = 0; i < N; i++) {
    const k = D.bps_kode_kecamatan[i];
    let r = m.get(k);
    if (!r) m.set(k, (r = { kode: k, nama: D.bps_nama_kecamatan[i], kab: D.kode_kabupaten_kota[i], desa: 0, pend: 0, org: 0, alih: 0, vgf: 0, emisi: 0, kerja: 0, tipe: [0, 0, 0, 0, 0], rows: [] }));
    r.desa++; r.pend += D.penduduk_model[i] || 0; r.org += D.timbulan_organik_ton_th_p50[i] || 0; r.alih += D.organik_dialihkan_ton_th[i] || 0;
    r.vgf += D.vgf_juta_rp[i] || 0; r.emisi += D.emisi_dihindari_t_co2e_th[i] || 0; r.kerja += D.pekerjaan_langsung[i] || 0; r.tipe[D.tipe_desa[i] || 0]++; r.rows.push(i);
  }
  for (const r of m.values()) r.dom = r.tipe.indexOf(Math.max(...r.tipe.slice(1)), 1);
  return (kecMemo = m);
}

// geometry: topojson-client is tiny and only fetched with the desa geometry
const scripts = {};
export function loadScript(src) {
  return (scripts[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.append(s);
  }));
}
export function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l);
}
let geoMemo;
export function geoDesa() {
  return (geoMemo ||= Promise.all([getJSON('data/geo/desa_jabar_web.topojson'), loadScript('assets/vendor/topojson-client.min.js')]).then(([topo]) => {
    const g = topojson.feature(topo, topo.objects[Object.keys(topo.objects)[0]]);
    g.features.forEach((f) => { f.id = f.properties.uid; });
    return g;
  }));
}
export function maplibre() {
  loadCSS('assets/vendor/maplibre-gl.css');
  return loadScript('assets/vendor/maplibre-gl.js').then(() => window.maplibregl);
}
export function chartjs() {
  return loadScript('assets/vendor/chart.umd.js').then(() => window.Chart);
}

// warm the map path while the reader is still on the landing page
export function prefetchMap() {
  desa(); geoDesa(); geoKab();
  const l = document.createElement('link'); l.rel = 'prefetch'; l.href = 'assets/vendor/maplibre-gl.js'; document.head.append(l);
}
