// Tanya data: an offline question box. It answers simple questions from the dashboard's own data (sums, top desa,
// definitions) with the year and source of each number, and doubles as a search for desa, kecamatan, kab/kota and pages.
import { num, rp, esc, title, kabTitle } from './fmt.js';
import { $, $$, TIPE } from './ui.js';

const IND = [
  { re: /organik|sampah organik|timbulan/, col: 'timbulan_organik_ton_th_p50', label: 'Timbulan organik', f: (v) => `${num(v)} ton per tahun`, src: '2024; model Monte Carlo' },
  { re: /diolah|dialihkan|pengalihan/, col: 'organik_dialihkan_ton_th', label: 'Organik yang diolah modul', f: (v) => `${num(v)} ton per tahun`, src: '2026–2030 target; model dampak' },
  { re: /penduduk|jiwa/, col: 'penduduk_model', label: 'Penduduk', f: (v) => `${num(v)} jiwa`, src: '2024; dasymetric Susenas' },
  { re: /vgf|dana publik|kesenjangan|hibah/, col: 'vgf_juta_rp', label: 'Kebutuhan VGF', f: (v) => rp(v * 1e6), src: '2026–2030; model ekonomi sel' },
  { re: /investasi|modal/, col: 'investasi_juta_rp', label: 'Investasi', f: (v) => rp(v * 1e6), src: '2026–2030; model ekonomi sel' },
  { re: /emisi|co2|karbon|gas rumah kaca/, col: 'emisi_dihindari_t_co2e_th', label: 'Emisi dihindari', f: (v) => `${num(v)} t CO₂e per tahun`, src: 'kondisi tunak; IPCC FOD' },
  { re: /pekerjaan|kerja|lapangan/, col: 'pekerjaan_langsung', label: 'Pekerjaan langsung', f: (v) => `${num(v)} pekerjaan`, src: '2026–2030 target; model dampak' },
  { re: /energi|biogas|listrik|mwh/, col: 'energi_biogas_mwh_th', label: 'Energi biogas', f: (v) => `${num(v)} MWh per tahun`, src: '2026–2030 target; model dampak' },
];
const GLOS = [
  ['VGF', 'Viability gap funding: hibah modal publik yang menutup kesenjangan kelayakan modul selama umur 15 tahun, dihitung sebagai maks(gap, 0) / CRF.'],
  ['Tipping fee', 'Biaya yang dibayar pemerintah daerah per ton sampah yang dibuang ke TPA; TPPAS Legok Nangka disepakati Rp386 ribu per ton.'],
  ['Gate fee', 'Pembayaran per ton kepada operator pengolahan; paper mengusulkan mengalihkan tipping fee menjadi gate fee berbasis kinerja.'],
  ['MAC', 'Marginal abatement cost: biaya bersih per ton CO₂e yang dihindari. Nilai negatif berarti modul menghemat uang.'],
  ['Dasymetric', 'Metode mengalokasikan penduduk kabupaten ke desa dengan bobot kovariat (permukiman, lahan, titik minat, cahaya malam) yang diestimasi dari data.'],
  ['LPA', 'Latent profile analysis: model campuran Gaussian untuk mengonfirmasi tipologi k-means; posterior menunjukkan keyakinan keanggotaan tipe.'],
  ['NTL', 'Night-time lights: radiansi cahaya malam VIIRS DNB, proksi aktivitas ekonomi; median April sampai Oktober agar bebas awan.'],
  ['PMR', 'Peak-to-mean ratio: rasio timbulan bulan puncak terhadap rerata; faktor desain kapasitas modul.'],
  ['FOD', 'First-Order Decay IPCC 2006: model peluruhan karbon organik di TPA untuk menghitung metana yang dihindari.'],
  ['AD', 'Anaerobic digestion: penguraian organik tanpa oksigen yang menghasilkan biogas dan digestat.'],
  ['BSF', 'Black soldier fly: larva maggot yang mengurai sampah organik menjadi pakan dan pupuk.'],
  ['SiLPA', 'Sisa lebih perhitungan anggaran: saldo APBD yang tidak terpakai pada tahun sebelumnya.'],
  ['Kuadran', 'Pengelompokan kabupaten/kota menurut potensi pengalihan organik dan indeks kesiapan pembiayaan (I sampai IV).'],
  ['Tahap', 'Urutan pembangunan dari kurva pasokan VGF: Tahap 1 2026–2027, Tahap 2 2028–2029, Tahap 3 2030.'],
  ['Kekuatan bukti', 'Kuat dijalankan langsung, sedang didahului uji coba enam bulan, indikatif didahului penimbangan lapangan 30 hari.'],
];
const PAGES = [
  ['Peta timbulan organik', 'peta', { t: 'timbulan' }], ['Peta tipe desa', 'peta', { t: 'tipologi', l: 'tipe' }], ['Peta cahaya malam', 'peta', { t: 'aktivitas', l: 'ntl' }],
  ['Peta CO dan SO₂', 'peta', { t: 'aktivitas', l: 'co' }], ['Peta emisi dihindari', 'peta', { t: 'dampak' }], ['Peta VGF desa', 'peta', { t: 'biaya' }], ['Peta tahap pelaksanaan', 'peta', { t: 'rencana', l: 'tahap' }],
  ['Profil wilayah', 'wilayah', {}], ['Rekomendasi per tipe', 'rekomendasi', {}], ['Daftar desa dan unduhan CSV', 'rekomendasi', { tab: 'daftar' }], ['Peta jalan 2026–2030', 'rekomendasi', { tab: 'jalan' }],
  ['Simulator pembiayaan', 'skenario', {}], ['Temuan paper', 'paper', {}], ['Kamus data', 'metode', { tab: 'kamus' }], ['Unduh dataset', 'metode', { tab: 'unduh' }], ['Validasi model', 'metode', { tab: 'validasi' }],
];
const EX = ['timbulan organik Kab. Bogor', 'desa VGF tertinggi di Garut', 'berapa pekerjaan di Kota Bandung', 'apa itu VGF', 'emisi dihindari Jawa Barat', 'Cibiru'];
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
let ctx, D, K, store, act = 0, items = [];

export async function open(c, q = '') {
  ctx = c; store = c.store;
  if ($('.tanya')) return;
  const box = document.createElement('div');
  box.className = 'tanya'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Tanya data');
  box.innerHTML = `<div class="panel tanya-box"><div class="tanya-in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/></svg>
      <input id="tq" placeholder="Tanya data atau cari desa, kecamatan, kab/kota…" autocomplete="off" aria-label="Pertanyaan"><button class="xbtn" id="tx" aria-label="Tutup"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="tanya-out" id="tout" role="listbox"></div>
    <div class="tanya-foot">Coba: ${EX.map((e) => `<button class="pill" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}<span style="margin-left:auto">Jawaban dihitung dari data dashboard, tanpa layanan luar.</span></div></div>`;
  document.body.append(box);
  const close = () => { box.remove(); document.removeEventListener('keydown', key); };
  const key = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { act = Math.min(act + 1, items.length - 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { act = Math.max(act - 1, 0); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[act]) { items[act].go(); close(); }
  };
  document.addEventListener('keydown', key);
  box.onclick = (e) => { if (e.target === box) close(); };
  $('#tx').onclick = close;
  const inp = $('#tq'); inp.value = q; inp.focus();
  $$('[data-ex]', box).forEach((b) => (b.onclick = () => { inp.value = b.dataset.ex; run(inp.value, close); inp.focus(); }));
  [D, K] = await Promise.all([store.desa(), store.kab()]);
  inp.oninput = () => run(inp.value, close);
  run(inp.value, close);
}

function mark() { $$('#tout .it').forEach((x, j) => x.setAttribute('aria-selected', j === act)); $$('#tout .it')[act]?.scrollIntoView({ block: 'nearest' }); }

function findKab(q) {
  // "kota bandung" vs "kabupaten bandung": prefer the one the question names, else the kabupaten
  const hits = K.filter((k) => q.includes(norm(k.nama_kabupaten_kota.replace(/^(KABUPATEN|KOTA) /, ''))));
  if (!hits.length) return null;
  const isKota = /\bkota\b/.test(q), isKab = /\bkab(upaten)?\b/.test(q);
  return hits.sort((a, b) => b.nama_kabupaten_kota.length - a.nama_kabupaten_kota.length)
    .find((k) => (isKota ? k.nama_kabupaten_kota.startsWith('KOTA') : isKab ? k.nama_kabupaten_kota.startsWith('KAB') : k.nama_kabupaten_kota.startsWith('KAB'))) || hits[0];
}

async function run(raw, close) {
  const q = norm(raw), out = $('#tout'); act = 0; items = []; handlers.length = 0;
  if (!q) { out.innerHTML = `<div class="grp">Halaman</div>${PAGES.slice(0, 8).map((p) => item('→', p[0], 'Buka', () => ctx.go(p[1], p[2]))).join('')}`; wire(close); return; }
  let answer = '';
  const g = GLOS.find(([t]) => q.includes(norm(t)) && (/apa itu|arti|maksud|definisi/.test(q) || q === norm(t)));
  const ind = IND.find((x) => x.re.test(q)), kab = findKab(q), superl = /tertinggi|terbesar|terbanyak|paling besar|paling tinggi|teratas|top/.test(q), low = /terendah|terkecil|paling kecil/.test(q);
  if (g) answer = `<div class="answer"><h4>Definisi</h4><p><b>${esc(g[0])}</b>: ${esc(g[1])}</p></div>`;
  else if (ind) {
    await store.cols([ind.col]);
    const rows = []; for (let i = 0; i < store.N; i++) if (!D.bukan_permukiman[i] && (!kab || String(D.kode_kabupaten_kota[i]) === kab.kode_kabupaten_kota)) rows.push(i);
    const where = kab ? kabTitle(kab.nama_kabupaten_kota) : 'Jawa Barat';
    if (superl || low) {
      const top = rows.sort((a, b) => (low ? 1 : -1) * ((D[ind.col][a] || 0) - (D[ind.col][b] || 0))).slice(0, 5);
      answer = `<div class="answer"><h4>${esc(ind.label)}, lima desa ${low ? 'terendah' : 'tertinggi'} di ${esc(where)}</h4><ol>${top.map((i) => `<li><button class="link" data-uid="${D.uid[i]}">${esc(title(D.bps_nama_desa_kelurahan[i]))}</button>, Kec. ${esc(title(D.bps_nama_kecamatan[i]))}: <b>${esc(ind.f(D[ind.col][i]))}</b></li>`).join('')}</ol><p class="src">Data ${esc(ind.src)}. Klik nama desa untuk membukanya di peta.</p></div>`;
    } else {
      const sum = rows.reduce((a, i) => a + (D[ind.col][i] || 0), 0);
      answer = `<div class="answer"><h4>${esc(ind.label)}, ${esc(where)}</h4><p><b style="font-size:20px">${esc(ind.f(sum))}</b> dari ${num(rows.length)} desa dan kelurahan.</p><p class="src">Data ${esc(ind.src)}. Jumlah median per desa; total provinsi resmi dan intervalnya ada di Ringkasan.</p></div>`;
    }
  } else if (kab && /berapa|jumlah|ringkas|profil/.test(q)) {
    answer = `<div class="answer"><h4>${esc(kabTitle(kab.nama_kabupaten_kota))}</h4><p>${num(kab.jumlah_desa)} desa, timbulan organik ${num(kab.timbulan_organik_ton_th)} ton per tahun, VGF ${rp(kab.vgf)} (${num(kab.vgf_per_belanja_modal_5th * 100, 1)} persen belanja modal lima tahun), kuadran ${esc((kab.quadrant || '').split(':')[0])}.</p></div>`;
  }
  // search matches
  const kabs = K.filter((k) => norm(k.nama_kabupaten_kota).includes(q) || (kab && k === kab)).slice(0, 3);
  const kecs = q.length >= 3 ? [...(await store.kecamatan()).values()].filter((r) => norm(r.nama).includes(q)).slice(0, 4) : [];
  const ds = []; if (q.length >= 3) for (let i = 0; i < store.N && ds.length < 6; i++) if (norm(D.bps_nama_desa_kelurahan[i]).includes(q)) ds.push(i);
  const pages = PAGES.filter((p) => norm(p[0]).split(' ').some((w) => w.length > 3 && q.includes(w))).slice(0, 4);
  const kn = (k) => kabTitle(K.find((z) => z.kode_kabupaten_kota === String(k))?.nama_kabupaten_kota || k);
  let html = answer;
  const list = [];
  kabs.forEach((k) => list.push(['Kab/kota', item('KK', kabTitle(k.nama_kabupaten_kota), `${num(k.jumlah_desa)} desa · profil wilayah`, () => ctx.go('wilayah', { kab: k.kode_kabupaten_kota }))]));
  kecs.forEach((r) => list.push(['Kecamatan', item('Kc', title(r.nama), `${kn(r.kab)} · ${num(r.desa)} desa`, () => ctx.go('peta', { k: String(r.kab), kc: String(r.kode) }))]));
  ds.forEach((i) => list.push(['Desa', item('Ds', title(D.bps_nama_desa_kelurahan[i]), `Kec. ${title(D.bps_nama_kecamatan[i])}, ${kn(D.kode_kabupaten_kota[i])} · ${TIPE[D.tipe_desa[i]] || ''}`, () => ctx.go('peta', { desa: D.uid[i] }))]));
  pages.forEach((p) => list.push(['Halaman', item('→', p[0], 'Buka', () => ctx.go(p[1], p[2]))]));
  let last = '';
  for (const [grp, h] of list) { if (grp !== last) { html += `<div class="grp">${grp}</div>`; last = grp; } html += h; }
  if (!html) html = '<p class="muted" style="padding:14px">Belum ada jawaban. Coba sebut indikator (organik, VGF, emisi, pekerjaan, energi, penduduk) dan nama kabupaten/kota, atau ketik nama desa.</p>';
  out.innerHTML = html;
  $$('[data-uid]', out).forEach((b) => (b.onclick = () => { ctx.go('peta', { desa: +b.dataset.uid }); close(); }));
  wire(close);
}
const handlers = [];
function item(ic, t, s, go) { handlers.push(go); return `<div class="it" role="option" data-h="${handlers.length - 1}"><span class="ic">${esc(ic)}</span><div><b>${esc(t)}</b><small>${esc(s)}</small></div></div>`; }
function wire(close) {
  items = $$('#tout .it').map((x) => ({ el: x, go: handlers[+x.dataset.h] }));
  items.forEach((it, j) => (it.el.onclick = () => { it.go(); close(); }, it.el.onmousemove = () => { act = j; mark(); }));
  mark();
}
