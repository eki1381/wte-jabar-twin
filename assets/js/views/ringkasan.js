// Ringkasan: landing story. Uses only small JSON files and SVG, so it paints fast without WebGL or Chart.js.
import { num, rp, pct, short, esc, kabTitle } from '../fmt.js';
import { $, $$, countUp, tcol, css, TIPE, MODUL } from '../ui.js';
import { svgChoropleth } from '../svgmap.js';
import { RAMPS, quantClasses, classOf } from '../scales.js';

const METRICS = [
  { id: 'org', label: 'Timbulan organik', get: (k) => k.timbulan_organik_ton_th, fmt: (v) => `${num(v / 1e3)} ribu ton per tahun`, ramp: 'hijau' },
  { id: 'vgf', label: 'Kebutuhan VGF', get: (k) => k.vgf, fmt: (v) => rp(v), ramp: 'biru' },
  { id: 'beban', label: 'VGF per belanja modal', get: (k) => k.vgf_per_belanja_modal_5th, fmt: (v) => pct(v, 1) + ' belanja modal 5 tahun', ramp: 'oranye' },
  { id: 'kerja', label: 'Pekerjaan langsung', get: (k) => k.jobs, fmt: (v) => `${num(v)} pekerjaan`, ramp: 'teal' },
];
let S = { metric: 'org' }, K, PV, GEO, ctxRef;

export async function mount(el, ctx) {
  ctxRef = ctx;
  [PV, K, GEO] = await Promise.all([ctx.store.prov(), ctx.store.kab(), ctx.store.geoKabRingan()]);
  render();
  addEventListener('tema', () => { if (!$('#v-ringkasan').hidden) drawMap(); });
}

function render() {
  const k = PV.kpi, e = PV.studi_peristiwa, tot = Object.values(PV.profil_tipe).reduce((a, t) => a + t.desa, 0);
  const sumOrgT1 = PV.profil_tipe[1].desa;
  $('#ringkasanBody').innerHTML = `
    <div class="kpis">
      ${kpi(tot, 0, '', 'desa dan kelurahan berpenghuni, 27 kabupaten/kota', 'batas BPS 2024', 'var(--brand3)')}
      ${kpi(k.timbulan_organik_ton_th[1] / 1e6, 2, 'juta t', 'sampah organik per tahun', `interval 90%: ${num(k.timbulan_organik_ton_th[0] / 1e6, 2)}–${num(k.timbulan_organik_ton_th[2] / 1e6, 2)}`, 'var(--leaf)')}
      ${kpi(k.emisi_dihindari_10th_t[1] / 1e6, 2, 'juta t', 'CO₂e per tahun dihindari pada dekade pertama', `tunak ${num(k.emisi_dihindari_tunak_t[1] / 1e6, 2)} juta t`, 'var(--sky)')}
      ${kpi(k.vgf_rp[1] / 1e12, 2, 'triliun', 'rupiah VGF publik lima tahun (median)', 'swasta menanggung sekitar 70% investasi', 'var(--accent)')}
      ${kpi(k.pekerjaan[1], 0, '', 'pekerjaan langsung, dua pertiga di luar kota', `energi biogas ${num(k.energi_biogas_gwh_th[1])} GWh per tahun`, 'var(--ember)')}
    </div>

    <section class="sect">
      <div class="sect-head"><div><h2>Enam temuan utama paper</h2><p>Setiap temuan punya tempat di dashboard: buka peta, wilayah, atau simulator untuk melihat angkanya sampai tingkat desa.</p></div>
        <a class="btn-s" href="#paper">Baca paper lengkap →</a></div>
      <div class="finds">
        ${find(1, 'var(--leaf)', `${num(k.timbulan_organik_ton_th[1] / 1e6, 2)} juta ton`, 'Sampah organik delapan kali lebih besar daripada yang terlapor', `SIPSN 2021 hanya mencatat sekitar 1,07 juta ton sampah. ${num(sumOrgT1)} desa inti perkotaan, 15 persen unit desa, menyumbang 47 persen sampah organik.`, 'hasil-dan-pembahasan-1', ['peta', { t: 'timbulan' }], 'Lihat peta timbulan')}
        ${find(2, 'var(--ember)', `+${num((Math.exp(e.leb_T4.b) - 1) * 100)} persen`, 'Saat Lebaran, puncak aktivitas pindah ke desa agraris', `Cahaya malam desa agraris naik relatif terhadap inti kota (p = ${num(e.leb_T4.p, 3)}); uji plasebo tidak mereproduksinya. Puncak sampah ikut bergeser ke desa terjauh dari TPA.`, 'hasil-dan-pembahasan-2', ['peta', { t: 'aktivitas' }], 'Lihat deret cahaya malam')}
        ${find(3, 'var(--sky)', '4 tipe desa', 'Ruang desa membentuk empat tipe dengan modul berbeda', `Inti perkotaan, peri-urban, simpul pasar dan event, serta agraris; stabil pada bootstrap (ARI ${num(PV.validasi.tipologi.kmeans_boot_ARI[0], 2)}).`, 'hasil-dan-pembahasan-3', ['peta', { t: 'tipologi' }], 'Lihat peta tipologi')}
        ${find(4, 'var(--t4)', `${num(k.emisi_dihindari_10th_t[1] / 1e6, 2)} juta t CO₂e`, 'Manfaat iklim di kota, pekerjaan tersebar ke desa', `Pengalihan ${num(k.pangsa_dialihkan[1] * 100)} persen organik menghindari emisi terutama di inti kota, sedangkan 67 persen dari ${num(k.pekerjaan[1])} pekerjaan berada di luar inti kota.`, 'hasil-dan-pembahasan-4', ['peta', { t: 'dampak' }], 'Lihat peta dampak')}
        ${find(5, 'var(--accent)', rp(k.vgf_rp[1]), 'Kesenjangan kecil dan bisa ditutup realokasi anggaran', 'Modul belum layak berdiri sendiri, tetapi porsi kecil belanja modal, SiLPA, Dana Desa, dan bantuan provinsi cukup menutup VGF pada skenario dasar.', 'hasil-dan-pembahasan-5', ['skenario', {}], 'Coba simulator')}
        ${find(6, 'var(--brand3)', 'ρ = 0,04', 'Daerah berpotensi besar belum tentu siap membiayai', 'Potensi pengalihan organik dan kesiapan pembiayaan hampir tidak berkorelasi, sehingga dukungan provinsi perlu dibedakan menurut kuadran kabupaten/kota.', 'hasil-dan-pembahasan-6', ['wilayah', {}], 'Bandingkan wilayah')}
      </div>
    </section>

    <section class="sect">
      <div class="sect-head"><div><h2>Peta kabupaten/kota</h2><p>Arahkan kursor untuk angka, klik untuk membuka profil wilayah.</p></div>
        <div class="pills" id="rkMetric">${METRICS.map((m) => `<button class="pill s" aria-pressed="${m.id === S.metric}" data-m="${m.id}">${m.label}</button>`).join('')}</div></div>
      <div class="split">
        <div class="card"><div id="rkMap"></div><div class="legend-row" id="rkLegend"></div></div>
        <div class="card"><h3 id="rkRankTitle"></h3><p class="sub">Sepuluh kabupaten/kota teratas</p><div id="rkRank" style="margin-top:12px"></div></div>
      </div>
    </section>

    <section class="sect">
      <div class="sect-head"><div><h2>Dari paper sampai tindakan di desa</h2><p>Alur dashboard mengikuti alur paper, sehingga setiap angka bisa ditelusuri dari temuan sampai rekomendasi.</p></div></div>
      <div class="steps">
        ${step(1, 'Ukur timbulan tiap desa', 'Penduduk dialokasikan dengan dasymetric cerdas (Susenas, OSM, cahaya malam), lalu timbulan dihitung lewat 3.000 iterasi Monte Carlo.', 'peta', { t: 'timbulan' }, 'Peta timbulan')}
        ${step(2, 'Kenali pola waktu', 'Panel 48 bulan VIIRS dan Sentinel-5P menunjukkan pergeseran aktivitas saat Lebaran dan perubahan kualitas udara.', 'peta', { t: 'aktivitas' }, 'Peta aktivitas')}
        ${step(3, 'Kelompokkan desa', 'K-means dan latent profile analysis membentuk empat tipe yang menentukan skala dan teknologi modul.', 'rekomendasi', {}, 'Modul per tipe')}
        ${step(4, 'Tulis rekomendasi per desa', 'Setiap rekomendasi diawali kondisi data bertanda tahun dan sumber, lalu modul, waktu, aktor, instrumen, target, dan kekuatan bukti.', 'rekomendasi', { tab: 'daftar' }, 'Daftar desa')}
        ${step(5, 'Hitung dan uji pembiayaan', 'Kesenjangan kelayakan 84 sel dihitung ulang di peramban di bawah amplop APBD, Dana Desa, dan bantuan provinsi.', 'skenario', {}, 'Simulator')}
      </div>
    </section>

    <section class="sect grid g2">
      <div class="card">
        <h3>Empat tipe desa, empat modul</h3><p class="sub">Jumlah desa per tipe dan modul teknologinya</p>
        <div style="margin-top:14px">${[1, 2, 3, 4].map((t) => `<div class="hbar" style="grid-template-columns:160px minmax(0,1fr) 60px"><span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${tcol(t)};margin-right:7px"></i>${esc(TIPE[t].slice(3))}</span><div class="tr"><i style="width:${(100 * PV.profil_tipe[t].desa) / 2422}%;background:${tcol(t)}"></i></div><span class="v">${num(PV.profil_tipe[t].desa)}</span></div><p class="note" style="margin:0 0 8px 0">${esc(MODUL[t])}</p>`).join('')}</div>
        <a class="link" href="#rekomendasi" style="font-size:13.5px">Buka rekomendasi per tipe →</a>
      </div>
      <div class="card">
        <h3>Lonjakan Lebaran pada cahaya malam</h3><p class="sub">Efek relatif terhadap inti perkotaan, interval 95 persen, panel desa 2022–2025</p>
        <div id="rkEvent" style="margin-top:10px"></div>
        <p class="note">Batang oranye: jendela Lebaran. Abu-abu: plasebo, kalender digeser dua bulan. Titik di kanan garis nol berarti desa tipe itu lebih terang daripada inti kota saat Lebaran.</p>
      </div>
    </section>

    <section class="sect grid g2">
      <div class="card"><h3>Cara memakai dashboard</h3>
        <ul class="acts" style="margin-top:10px">
          <li><b>Peta:</b> pilih topik di bilah atas, klik desa untuk kondisi data, rekomendasi, dan deret bulanan. Tekan <kbd>/</kbd> untuk mencari desa.</li>
          <li><b>Wilayah:</b> urutkan 27 kabupaten/kota, buka satu wilayah untuk kecamatan dan desa teratas.</li>
          <li><b>Rekomendasi:</b> saring desa menurut tipe, tahap, kekuatan bukti, dan penanda, lalu unduh CSV.</li>
          <li><b>Skenario:</b> geser amplop fiskal, tipping fee, atau harga karbon dan lihat sel yang terdanai. Tautannya bisa dibagikan.</li>
          <li><b>Tanya data</b> (<kbd>Ctrl K</kbd>): ketik pertanyaan seperti "timbulan organik Kab. Bogor" atau "desa VGF tertinggi di Garut".</li>
        </ul></div>
      <div class="card"><h3>Yang perlu diingat saat membaca</h3>
        <ul class="acts" style="margin-top:10px">
          <li>Angka ekonomi dihitung per sel kabupaten/kota kali tipe, lalu dibagi ke desa menurut porsi organik; angka desa adalah porsi, bukan studi kelayakan.</li>
          <li>Timbulan desa belum divalidasi dengan timbangan lapangan; validasi tersedia di tingkat kabupaten/kota.</li>
          <li>Kolom CO dan SO₂ Sentinel-5P beresolusi sekitar 7 km; gunakan sebagai penanda, bukan ukuran konsentrasi permukaan.</li>
          <li>Kekuatan bukti setiap rekomendasi ditulis eksplisit: kuat, sedang, atau indikatif.</li>
        </ul></div>
    </section>
    ${footer()}`;
  countUp($('#ringkasanBody'));
  $$('#rkMetric .pill').forEach((b) => (b.onclick = () => { S.metric = b.dataset.m; $$('#rkMetric .pill').forEach((x) => x.setAttribute('aria-pressed', x === b)); drawMap(); }));
  $$('[data-go]', $('#ringkasanBody')).forEach((a) => (a.onclick = (ev) => { ev.preventDefault(); const [v, p] = JSON.parse(a.dataset.go); ctxRef.go(v, p); }));
  drawMap(); drawEvent();
}

const kpi = (v, d, unit, label, sub, c) => `<div class="kpi" style="--kc:${c}"><b><span data-count="${v}" data-dec="${d}">${num(v, d)}</span>${unit ? `<small>${unit}</small>` : ''}</b><span>${label}</span><em>${sub}</em></div>`;
const find = (n, c, big, h, p, sec, go, gl) => `<article class="find" style="--fc:${c}"><span class="n">${n}</span><h3>${h}</h3><div class="big">${big}</div><p>${p}</p>
  <div style="display:flex;gap:14px;flex-wrap:wrap"><a class="link" href="#" data-go='${JSON.stringify(go)}'>${gl} →</a><a class="link" href="#paper?s=${sec}" style="color:var(--muted)">Bagian paper</a></div></article>`;
const step = (n, h, p, v, prm, l) => `<div class="step"><span class="n">${n}</span><div><h3>${h}</h3><p>${p}</p></div><a class="btn-s" href="#" data-go='${JSON.stringify([v, prm])}'>${l} →</a></div>`;

function drawMap() {
  const m = METRICS.find((x) => x.id === S.metric);
  const vals = K.map(m.get), sc = quantClasses(vals, m.ramp, 5), byK = Object.fromEntries(K.map((k) => [k.kode_kabupaten_kota, k]));
  svgChoropleth($('#rkMap'), GEO, {
    color: (id) => { const k = byK[id]; return k ? sc.colors[classOf(m.get(k), sc.breaks)] : css('--line'); },
    tip: (id) => { const k = byK[id]; return k ? `<b>${esc(kabTitle(k.nama_kabupaten_kota))}</b>${esc(m.label)}: ${esc(m.fmt(m.get(k)))}<br><span class="muted">${num(k.jumlah_desa)} desa · kuadran ${esc((k.quadrant || '').split(':')[0])}</span>` : ''; },
    onClick: (id) => ctxRef.go('wilayah', { kab: id }),
  });
  $('#rkLegend').innerHTML = sc.colors.map((c, i) => `<span><i style="background:${c}"></i>${i === 0 ? '≤ ' + short(sc.breaks[0]) : i === sc.breaks.length ? '> ' + short(sc.breaks[i - 1]) : short(sc.breaks[i - 1]) + '–' + short(sc.breaks[i])}</span>`).join('');
  const top = [...K].sort((a, b) => m.get(b) - m.get(a)).slice(0, 10), mx = m.get(top[0]);
  $('#rkRankTitle').textContent = m.label;
  $('#rkRank').innerHTML = top.map((k) => `<div class="hbar" style="cursor:pointer" data-k="${k.kode_kabupaten_kota}"><span>${esc(kabTitle(k.nama_kabupaten_kota))}</span><div class="tr"><i style="width:${(100 * m.get(k)) / mx}%;background:${RAMPS[m.ramp][4]}"></i></div><span class="v">${m.id === 'beban' ? pct(m.get(k), 1) : short(m.get(k))}</span></div>`).join('');
  $$('#rkRank .hbar').forEach((r) => (r.onclick = () => ctxRef.go('wilayah', { kab: r.dataset.k })));
}

// forest plot: event study and placebo, plain SVG
function drawEvent() {
  const e = PV.studi_peristiwa, p = PV.plasebo, rows = [2, 3, 4];
  const all = rows.flatMap((t) => [e[`leb_T${t}`], p[`leb_T${t}`]]).flatMap((o) => [o.b - 1.96 * o.se, o.b + 1.96 * o.se]);
  const lo = Math.min(-0.05, ...all), hi = Math.max(...all) + 0.02, W = 560, L = 150, R = 64, rowH = 46, H = rows.length * rowH + 30;
  const x = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const ticks = [-0.2, -0.1, 0, 0.1, 0.2, 0.3].filter((t) => t >= lo && t <= hi);
  const ink = css('--ink2'), mut = css('--muted'), line = css('--line');
  $('#rkEvent').innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Studi peristiwa Lebaran">
    ${ticks.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="6" y2="${H - 22}" stroke="${t === 0 ? mut : line}" stroke-width="${t === 0 ? 1.5 : 1}" ${t === 0 ? '' : 'stroke-dasharray="3 3"'}/><text x="${x(t)}" y="${H - 6}" font-size="11" fill="${mut}" text-anchor="middle">${num(t, 1)}</text>`).join('')}
    ${rows.map((t, i) => {
      const y = 22 + i * rowH, a = e[`leb_T${t}`], b = p[`leb_T${t}`];
      const bar = (o, yy, c) => `<line x1="${x(o.b - 1.96 * o.se)}" x2="${x(o.b + 1.96 * o.se)}" y1="${yy}" y2="${yy}" stroke="${c}" stroke-width="3" stroke-linecap="round"/><circle cx="${x(o.b)}" cy="${yy}" r="5.5" fill="${c}"/>`;
      return `<text x="0" y="${y + 5}" font-size="12.5" fill="${ink}" font-weight="650">${esc(TIPE[t].slice(3))}</text>${bar(b, y + 12, '#a3aea8')}${bar(a, y - 2, '#e2622b')}<text x="${x(a.b + 1.96 * a.se) + 8}" y="${y + 2}" font-size="11.5" fill="${ink}" font-weight="700">${num(a.b, 3)}${a.p < 0.01 ? '**' : a.p < 0.05 ? '*' : ''}</text>`;
    }).join('')}</svg>`;
}

export function footer() {
  return `<footer class="footer"><div>Rujukan: Paramartha, D. Y. dan Apriliawan, Y. E. (2026). <i>Dari Komunitas Menjadi Energi</i>. WJES 2026. Kode MIT, data turunan CC BY 4.0.</div>
    <div><a class="link" href="#metode?tab=unduh">Unduh dataset</a> · <a class="link" href="https://github.com/eki1381/wte-jabar-twin" rel="noopener">GitHub</a></div></footer>`;
}
