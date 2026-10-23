// Data dan metode: how every number is made, how well the model validates, the data dictionary, downloads,
// the digital-twin update loop, and the limits a reader should know.
import { num, esc } from '../fmt.js';
import { $, $$, debounce } from '../ui.js';
import { footer } from './ringkasan.js';

const TABS = [['alur', 'Alur model'], ['validasi', 'Validasi'], ['kamus', 'Kamus data'], ['unduh', 'Unduhan'], ['twin', 'Kembaran digital'], ['batasan', 'Batasan']];
const ALUR = [
  ['Surface penduduk dengan dasymetric cerdas', 'Total penduduk kabupaten/kota dari bobot Susenas 2024 (50,35 juta jiwa) dialokasikan ke desa dengan bobot kovariat yang diestimasi non-negative least squares pada 27 kabupaten/kota; persamaan kedua menjamin sifat piknofilaktik.',
    'wᵢ = β₀·Dᵢ + β₁·Resᵢ + β₂·Ruralᵢ + β₃·POIᵢ + β₄·NTLᵢ ,   Pᵢ = Pₖ · wᵢ / Σⱼ∈ₖ wⱼ', 'metodologi-2'],
  ['Surface timbulan dan kalender musiman', 'Timbulan provinsi berdistribusi segitiga dengan modus 25 ribu ton per hari. Komponen rumah tangga mengikuti penduduk dengan pengali perkotaan; nonrumah tangga mengikuti kernel titik minat 1 km. 3.000 iterasi Monte Carlo; profil musiman dari kalender 2025.',
    'PMR = maks bulanan / rerata bulanan  (faktor desain kapasitas)', 'metodologi-3'],
  ['Studi peristiwa kalender Hijriah', 'Kalender Hijriah bergeser sekitar 11 hari per tahun, sehingga paparan Ramadan dan Lebaran pada bulan Masehi yang sama berbeda antartahun. Efek tetap desa dan tahun kali bulan menyerap guncangan bersama; galat baku dua arah.',
    'yᵢₜ = Σₖ₌₂⁴ θₖ · (Eₜ × Tipeₖ,ᵢ) + αᵢ + λₜ + εᵢₜ', 'metodologi-4'],
  ['Tipologi desa', 'Empat indikator terstandar (log kepadatan, log organik, pangsa nonrumah tangga, log jarak TPA); k dipilih dengan silhouette, Calinski-Harabasz, Davies-Bouldin, BIC, dan entropi LPA; stabilitas 100 bootstrap.',
    'ARI(k-means, LPA) = 0,59 ;  ARI bootstrap = 0,90', 'metodologi-5'],
  ['Dampak emisi, energi, dan pekerjaan', 'Emisi metana TPA yang dihindari dengan First-Order Decay IPCC (2006), hanya untuk porsi yang kini berakhir di TPA; dikurangi emisi proyek (kebocoran AD, CH₄ dan N₂O pengomposan).',
    'CH₄(t) = F · (16/12) · (1 − OX) · DDOCacc(t − 1) · (1 − e⁻ᵏ) ,  DDOC = W · DOC · DOCf · MCF', 'metodologi-6'],
  ['Ekonomi sel dan optimasi fiskal', 'Kesenjangan kelayakan 84 sel (kabupaten/kota kali tipe) dihitung per iterasi; VGF dialokasikan dengan program linear di bawah amplop belanja modal, SiLPA, Dana Desa, dan bantuan keuangan provinsi.',
    'gap = capex·CRF + upah + O&M − pendapatan − emisi·harga karbon − biaya buang dihindari ;  VGF = maks(gap, 0) / CRF', 'metodologi-7'],
];
const FILES = [
  ['desa_indikator_wide.csv', 'Satu baris per desa, 96 kolom: identitas wilayah gaya Satu Data Jabar, penduduk, timbulan p05–p95, tipologi, NTL/CO/SO₂, dampak, ekonomi, tahap', '4,4 MB'],
  ['desa_indikator_long.csv.gz', 'Format panjang uid, indikator, nilai, satuan, tahun, sumber; siap diunggah ke portal data', '5,5 MB'],
  ['desa_bulanan_gee.csv.gz', 'Panel bulanan cahaya malam, SO₂, CO per desa, 48 bulan', '3,6 MB'],
  ['rekomendasi_desa.csv', 'Kondisi data bertanda tahun dan sumber, rekomendasi, aksi, aktor, instrumen, target, bukti, catatan', '10,2 MB'],
  ['desa_musiman_model_2025.csv', 'Kalender timbulan organik bulanan per desa', '2,9 MB'],
  ['kabkota_tahunan_long.csv', 'APBD 2018–2025, IDSD 2022–2025, Susenas 2021–2024, NTL 2022–2025', '0,4 MB'],
  ['kabkota_rencana.csv', 'Kesiapan, kuadran, VGF dan sumbernya per kabupaten/kota', '24 KB'],
  ['rekomendasi_kabkota.csv', 'Rekomendasi 27 kabupaten/kota', '50 KB'],
  ['sel_ekonomi_kabkota_tipe.csv', '84 sel ekonomi dengan persentil Monte Carlo dan koefisien rerata', '91 KB'],
  ['dim_wilayah_desa.csv', 'Dimensi wilayah, koordinat titik, kolom Kemendagri untuk crosswalk', '0,7 MB'],
  ['template_realisasi_bulanan.csv', 'Templat pelaporan realisasi bulanan (lapisan pemantauan)', '1 KB'],
  ['kamus_data.csv', 'Definisi, satuan, tahun, sumber, metode, dan kekuatan bukti setiap kolom', '14 KB'],
  ['ringkasan_provinsi.json', 'Indikator provinsi, validasi, skenario, kurva pasokan, tahap', '22 KB'],
];
let el, ctx, store, tab = 'alur';

export async function mount(root, c) {
  el = root; ctx = c; store = c.store;
  el.innerHTML = `<div class="wrap">
    <div class="page-head"><div class="kicker">Data dan metode</div><h1>Bagaimana angka di dashboard dibuat</h1>
      <p class="lead">Rumus, parameter, validasi, dan sumber ditulis terbuka agar bisa diperiksa dan dikalibrasi bersama perangkat daerah. Setiap angka dapat ditelusuri ke berkas di folder <code>dataset/</code>.</p></div>
    <div class="tabsbar" role="tablist">${TABS.map(([k, l]) => `<button class="pill" role="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="mBody"></div>${footer()}</div>`;
  $$('[data-tab]', el).forEach((b) => (b.onclick = () => ctx.go('metode', { tab: b.dataset.tab })));
}
export async function update(params) {
  tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'alur';
  $$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  await ({ alur, validasi, kamus, unduh, twin, batasan }[tab])();
}

function alur() {
  $('#mBody').innerHTML = `<div class="steps">${ALUR.map(([h, p, eq, sec], i) => `<div class="step" style="grid-template-columns:40px minmax(0,1fr)"><span class="n">${i + 1}</span>
    <div><h3>${esc(h)}</h3><p>${esc(p)}</p><div class="prose"><div class="eq" style="margin:10px 0 6px">${esc(eq)}</div></div><a class="link" href="#paper?s=${sec}" style="font-size:13px">Bagian metodologi di paper →</a></div></div>`).join('')}</div>`;
}
async function validasi() {
  const [PV, P] = await Promise.all([store.prov(), store.paper()]), v = PV.validasi;
  const rows = [
    ['Dasymetric, Q² validasi silang tinggalkan satu', num(v.dasymetric.Q2_loo, 3), 'Model v2 dengan cahaya malam; tanpa kovariat 0,015'],
    ['Dasymetric, korelasi di luar sampel', num(v.dasymetric.pearson_loo, 3), `Spearman ${num(v.dasymetric.spearman_loo, 3)}`],
    ['Dasymetric, MAPE validasi silang', `${num(v.dasymetric.MAPE_loo, 1)}%`, '27 kabupaten/kota'],
    ['Model tanpa NTL (v1) terhadap radiansi VIIRS desa', num(v.ntl_v1, 3), 'validasi independen: NTL tidak dipakai dalam v1'],
    ['Pangsa perkotaan model terhadap Susenas', num(v.perkotaan.r, 3), `ambang ${num(v.perkotaan.density_threshold)} jiwa/km², MAE ${num(v.perkotaan.mae_pp, 1)} poin`],
    ['Timbulan terhadap SIPSN', `r ${num(v.sipsn.r, 3)}`, `n = ${v.sipsn.n} kabupaten/kota dengan data; MAPE ${num(v.sipsn.mape, 1)}%`],
    ['Tipologi, ARI k-means terhadap LPA', num(v.tipologi.ARI_km_lpa, 3), `silhouette k = 4: ${num(v.tipologi.sil_k4, 3)}`],
    ['Tipologi, ARI bootstrap k-means', `${num(v.tipologi.kmeans_boot_ARI[0], 3)}`, `persentil 5: ${num(v.tipologi.kmeans_boot_ARI[1], 3)}`],
    ['Rerata probabilitas posterior LPA', num(v.tipologi.lpa_mean_posterior, 3), `${num(v.tipologi.n_units)} unit desa`],
    ['Kesepakatan tipologi v1 dan v2', num(v.ari_v1_v2, 3), 'ARI antarmodel penduduk'],
  ];
  const t3 = P.sections.flatMap((s) => [s, ...s.subs]).flatMap((x) => x.blocks).find((b) => b.type === 'table' && b.caption.startsWith('Tabel 3'));
  $('#mBody').innerHTML = `<div class="grid g2">
    <div class="card"><h3>Ringkasan validasi dari data dashboard</h3><div class="tbl-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>Uji</th><th class="n">Statistik</th><th>Keterangan</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td class="n"><b>${esc(r[1])}</b></td><td class="muted" style="font-size:12.5px">${esc(r[2])}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h3>${esc(t3?.caption || 'Tabel 3')}</h3><div class="tbl-wrap" style="margin-top:10px"><table class="t"><thead><tr>${(t3?.rows[0] || []).map((c) => `<th style="text-transform:none;letter-spacing:0">${esc(c)}</th>`).join('')}</tr></thead><tbody>${(t3?.rows.slice(1) || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="note">${esc(t3?.source || '')}</p></div>
  </div>`;
}
async function kamus() {
  const K = await store.kamus(), tabs = [...new Set(K.map((r) => r.tabel))], bukti = [...new Set(K.map((r) => r.kekuatan_bukti))];
  $('#mBody').innerHTML = `<div class="card">
    <div class="grid" style="grid-template-columns:2fr 1fr 1fr;gap:10px"><label><span class="lbl">Cari kolom, definisi, atau sumber</span><input class="inp" id="kQ" type="search" placeholder="mis. timbulan, VGF, Sentinel"></label>
      <label><span class="lbl">Tabel</span><select class="sel" id="kT"><option value="">Semua</option>${tabs.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label>
      <label><span class="lbl">Kekuatan bukti</span><select class="sel" id="kB"><option value="">Semua</option>${bukti.map((t) => `<option>${esc(t)}</option>`).join('')}</select></label></div>
    <p class="note" id="kN"></p><div class="tbl-wrap" id="kTbl" style="max-height:640px"></div></div>`;
  const draw = () => {
    const q = $('#kQ').value.toLowerCase(), t = $('#kT').value, b = $('#kB').value;
    const rows = K.filter((r) => (!q || `${r.kolom} ${r.definisi} ${r.sumber} ${r.metode}`.toLowerCase().includes(q)) && (!t || r.tabel === t) && (!b || r.kekuatan_bukti === b));
    $('#kN').textContent = `${rows.length} dari ${K.length} kolom`;
    $('#kTbl').innerHTML = `<table class="t"><thead><tr><th>Kolom</th><th>Definisi</th><th>Satuan</th><th>Tahun</th><th>Sumber dan metode</th><th>Bukti</th></tr></thead><tbody>${rows.map((r) => `<tr><td><code style="font-size:12px">${esc(r.kolom)}</code></td><td style="min-width:240px">${esc(r.definisi)}</td><td>${esc(r.satuan)}</td><td>${esc(r.tahun_data)}</td><td style="min-width:200px;font-size:12.5px">${esc(r.sumber)}<br><span class="muted">${esc(r.metode)}</span></td><td>${['kuat', 'sedang', 'indikatif'].includes(r.kekuatan_bukti) ? `<span class="badge ${r.kekuatan_bukti}">${r.kekuatan_bukti}</span>` : `<span class="muted">${esc(r.kekuatan_bukti)}</span>`}</td></tr>`).join('')}</tbody></table>`;
  };
  $('#kQ').addEventListener('input', debounce(draw, 120)); $('#kT').onchange = draw; $('#kB').onchange = draw; draw();
}
function unduh() {
  $('#mBody').innerHTML = `<div class="grid g2" style="align-items:start">
    <div class="dl-list grid" style="gap:10px">${FILES.map(([f, d, s]) => `<a href="dataset/${f}" download><b>${esc(f)}</b><span>${esc(d)}</span><em>${s} ↓</em></a>`).join('')}</div>
    <div class="grid" style="gap:16px">
      <div class="card"><h3>Kunci dan konvensi</h3><p class="note" style="font-size:13.5px;color:var(--ink2)">Semua berkas memakai kunci <code>uid</code> (urutan poligon batas BPS 2024, 0–5985) dan kolom identitas gaya Satu Data Jabar: <code>kode_provinsi</code>, <code>kode_kabupaten_kota</code>, <code>bps_kode_desa_kelurahan</code>, <code>kemendagri_kode_desa_kelurahan</code>, <code>satuan</code>, <code>tahun</code>. Kode Kemendagri diisi dengan <code>pipeline/crosswalk_kemendagri.py</code>.</p></div>
      <div class="card"><h3>Lisensi dan sitasi</h3><p class="note" style="font-size:13.5px;color:var(--ink2)">Kode MIT. Data turunan di <code>data/</code> dan <code>dataset/</code> berlisensi CC BY 4.0; cantumkan Paramartha dan Apriliawan (2026). Data sumber mengikuti lisensi pemiliknya (BPS, DJPK, BRIN, OpenStreetMap ODbL, NOAA, Copernicus). Huruf Plus Jakarta Sans berlisensi SIL OFL.</p></div>
      <div class="card"><h3>Kode dan pipeline</h3><p class="note" style="font-size:13.5px;color:var(--ink2)">Skrip model paper 01–11, pembangun dataset, mesin aturan rekomendasi, dan skrip GEE tersedia di repositori.</p><a class="btn-s solid" style="margin-top:10px" href="https://github.com/eki1381/wte-jabar-twin" rel="noopener">Buka repositori GitHub</a></div>
    </div></div>`;
}
function twin() {
  $('#mBody').innerHTML = `<div class="arch">
      <div><b>Lapisan dasar statis</b>Batas desa BPS 2024, penduduk dasymetric, timbulan Monte Carlo, tipologi, dan ekonomi sel. Dijalankan ulang saat ada sensus, Susenas, atau batas baru.</div>
      <div><b>Lapisan dinamis</b>Panel bulanan VIIRS dan Sentinel-5P dari Google Earth Engine. CSV bulan baru di folder <code>incoming/</code> digabung otomatis oleh GitHub Actions.</div>
      <div><b>Lapisan skenario</b>Simulator 84 sel di peramban: amplop fiskal, tipping fee, harga karbon, tangkapan, dan biaya investasi. Skenario bisa dibagikan lewat tautan.</div>
      <div><b>Lapisan pemantauan</b>Templat realisasi bulanan per desa. Data timbangan lapangan menggantikan estimasi model dan mempersempit interval.</div></div>
    <section class="sect"><div class="sect-head"><div><h2>Pembaruan bulanan</h2></div></div><div class="steps">
      ${[['Unggah aset', 'Di Google Earth Engine, unggah gee/desa_jabar_gee.zip sebagai aset (sekali saja).'], ['Ekstraksi', 'Jalankan gee/02_gee_bulanan_desa_jabar.js untuk rentang bulan baru, lalu unduh CSV dari Google Drive.'], ['Commit', 'Simpan CSV ke incoming/. Workflow "Perbarui data GEE" menggabungkannya, memperbarui deret desa, median tipe, kolom tahunan, dan bundel data web, lalu menerbitkan ulang situs.'], ['Teks rekomendasi', 'Pembaruan bulanan tidak mengubah teks rekomendasi; teks dibangun ulang hanya lewat build_dataset.py agar tetap merujuk tahun data yang tertulis.']].map(([h, p], i) => `<div class="step" style="grid-template-columns:40px minmax(0,1fr)"><span class="n">${i + 1}</span><div><h3>${h}</h3><p>${esc(p)}</p></div></div>`).join('')}</div></section>
    <section class="sect card"><h3>Kinerja situs</h3><p class="note" style="font-size:13.5px;color:var(--ink2)">Halaman ringkasan hanya memuat ringkasan provinsi dan kabupaten/kota (puluhan kilobita) dan menggambar peta kabupaten/kota sebagai SVG. Pustaka peta, geometri desa, dan kolom desa dimuat saat dibutuhkan, dipecah per bundel kolom, dan disimpan oleh service worker sehingga kunjungan berikutnya terbuka seketika dan tetap bisa dibaca saat luring.</p></section>`;
}
function batasan() {
  const L = [
    ['Angka desa adalah porsi', 'Nilai ekonomi dihitung pada sel kabupaten/kota kali tipe, lalu dibagi ke desa menurut porsi organik yang dialihkan. Gunakan sebagai titik awal, bukan studi kelayakan.'],
    ['Timbulan belum ditimbang di desa', 'Validasi tersedia di tingkat kabupaten/kota (SIPSN, 5 wilayah dengan data). Desa dengan bukti indikatif dianjurkan menimbang 30 hari.'],
    ['Dana Desa estimasi', 'Dana Desa per kabupaten adalah estimasi proporsional terhadap jumlah desa dari total Jawa Barat 2024 (Rp6,19 triliun); konfirmasi dengan rincian DJPK.'],
    ['Satelit kualitas udara', 'Kolom SO₂ dekat batas deteksi; resolusi Sentinel-5P sekitar 7 km. Gunakan sebagai penanda, bukan konsentrasi permukaan.'],
    ['Simulator indikatif', 'Simulator memakai koefisien rerata yang dikalibrasi ke median Monte Carlo; selisih dengan program linear paper kurang dari satu poin persen pada tiga skenario.'],
    ['Kode Kemendagri', 'Batas desa bersumber dari BPS; kode Kemendagri diisi lewat crosswalk Open Data Jabar.'],
    ['Peta dasar', 'Ubin dari Esri (Light Gray, Dark Gray, World Imagery) dengan data OpenStreetMap dan mitra Esri; patuhi ketentuan atribusinya.'],
  ];
  $('#mBody').innerHTML = `<div class="grid g2">${L.map(([h, p]) => `<div class="card flat"><h3>${esc(h)}</h3><p class="note" style="font-size:13.8px;color:var(--ink2)">${esc(p)}</p></div>`).join('')}</div>`;
}
