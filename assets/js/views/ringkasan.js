// Ringkasan: landing story. Uses only small JSON files and SVG, so it paints fast without WebGL or Chart.js.
import { num, rp, pct, short, esc, kabTitle } from '../fmt.js';
import { $, $$, countUp, tcol, css, TIPE, MODUL, lowData } from '../ui.js';
import { svgChoropleth, fit, drawFeatures } from '../svgmap.js';
import { RAMPS, quantClasses, classOf } from '../scales.js';

const METRICS = [
  { id: 'org', label: 'Timbulan organik', get: (k) => k.timbulan_organik_ton_th, fmt: (v) => `${num(v / 1e3)} ribu ton per tahun`, ramp: 'hijau' },
  { id: 'vgf', label: 'Kebutuhan VGF', get: (k) => k.vgf, fmt: (v) => rp(v), ramp: 'biru' },
  { id: 'beban', label: 'VGF per belanja modal', get: (k) => k.vgf_per_belanja_modal_5th, fmt: (v) => pct(v, 1) + ' belanja modal 5 tahun', ramp: 'oranye' },
  { id: 'kerja', label: 'Pekerjaan langsung', get: (k) => k.jobs, fmt: (v) => `${num(v)} pekerjaan`, ramp: 'teal' },
];
let S = { metric: 'org' }, K, PV, GEO, REK, ctxRef;

export async function mount(el, ctx) {
  ctxRef = ctx;
  [PV, K, GEO, REK] = await Promise.all([ctx.store.prov(), ctx.store.kab(), ctx.store.geoKabRingan(), ctx.store.rek()]);
  render(); drawHero();
  addEventListener('tema', () => { if (!$('#v-ringkasan').hidden) drawMap(); });
}

function render() {
  const k = PV.kpi, e = PV.studi_peristiwa, tot = Object.values(PV.profil_tipe).reduce((a, t) => a + t.desa, 0);
  const sumOrgT1 = PV.profil_tipe[1].desa;
  $('#ribbon').innerHTML = [
    kpi(tot, 0, '', 'desa dan kelurahan berpenghuni, 27 kabupaten/kota', 'batas BPS 2024'),
    kpi(k.timbulan_organik_ton_th[1] / 1e6, 2, 'juta t', 'sampah organik per tahun', `interval 90%: ${num(k.timbulan_organik_ton_th[0] / 1e6, 2)}–${num(k.timbulan_organik_ton_th[2] / 1e6, 2)}`),
    kpi(k.emisi_dihindari_10th_t[1] / 1e6, 2, 'juta t', 'CO₂e per tahun dihindari, dekade pertama', `tunak ${num(k.emisi_dihindari_tunak_t[1] / 1e6, 2)} juta t`),
    kpi(k.vgf_rp[1] / 1e12, 2, 'triliun', 'rupiah VGF publik lima tahun', 'swasta menanggung sekitar 70% investasi'),
    kpi(k.pekerjaan[1], 0, '', 'pekerjaan langsung', `energi biogas ${num(k.energi_biogas_gwh_th[1])} GWh per tahun`),
  ].join('');
  countUp($('#ribbon'));
  $('#ringkasanBody').innerHTML = `
    <section class="sect">
      <div class="sect-head"><div><h2>Enam temuan utama paper</h2><p>Setiap temuan punya tempat di dashboard: buka peta, wilayah, atau simulator untuk melihat angkanya sampai tingkat desa.</p></div>
        <a class="btn-s" href="#paper">Baca paper lengkap →</a></div>
      <div class="finds">
        ${find(1, vizScale(), 'var(--leaf)', `${num(k.timbulan_organik_ton_th[1] / 1e6, 2)} juta ton`, 'Sampah organik delapan kali lebih besar daripada yang terlapor', `SIPSN 2021 hanya mencatat sekitar 1,07 juta ton sampah. ${num(sumOrgT1)} desa inti perkotaan, 15 persen unit desa, menyumbang 47 persen sampah organik.`, 'hasil-dan-pembahasan-1', ['peta', { t: 'timbulan' }], 'Lihat peta timbulan')}
        ${find(2, vizLebaran(), 'var(--ember)', `+${num((Math.exp(e.leb_T4.b) - 1) * 100)} persen`, 'Saat Lebaran, puncak aktivitas pindah ke desa agraris', `Cahaya malam desa agraris naik relatif terhadap inti kota (p = ${num(e.leb_T4.p, 3)}); uji plasebo tidak mereproduksinya. Puncak sampah ikut bergeser ke desa terjauh dari TPA.`, 'hasil-dan-pembahasan-2', ['peta', { t: 'aktivitas' }], 'Lihat deret cahaya malam')}
        ${find(3, vizTipe(), 'var(--sky)', '4 tipe desa', 'Ruang desa membentuk empat tipe dengan modul berbeda', `Inti perkotaan, peri-urban, simpul pasar dan event, serta agraris; stabil pada bootstrap (ARI ${num(PV.validasi.tipologi.kmeans_boot_ARI[0], 2)}).`, 'hasil-dan-pembahasan-3', ['peta', { t: 'tipologi' }], 'Lihat peta tipologi')}
        ${find(4, vizSplit(), 'var(--t4)', `${num(k.emisi_dihindari_10th_t[1] / 1e6, 2)} juta t CO₂e`, 'Manfaat iklim di kota, pekerjaan tersebar ke desa', `Pengalihan ${num(k.pangsa_dialihkan[1] * 100)} persen organik menghindari emisi terutama di inti kota, sedangkan 67 persen dari ${num(k.pekerjaan[1])} pekerjaan berada di luar inti kota.`, 'hasil-dan-pembahasan-4', ['peta', { t: 'dampak' }], 'Lihat peta dampak')}
        ${find(5, vizGap(), 'var(--accent)', rp(k.vgf_rp[1]), 'Kesenjangan kecil dan bisa ditutup realokasi anggaran', 'Modul belum layak berdiri sendiri, tetapi porsi kecil belanja modal, SiLPA, Dana Desa, dan bantuan provinsi cukup menutup VGF pada skenario dasar.', 'hasil-dan-pembahasan-5', ['skenario', {}], 'Coba simulator')}
        ${find(6, vizQuad(), 'var(--brand3)', 'ρ = 0,04', 'Daerah berpotensi besar belum tentu siap membiayai', 'Potensi pengalihan organik dan kesiapan pembiayaan hampir tidak berkorelasi, sehingga dukungan provinsi perlu dibedakan menurut kuadran kabupaten/kota.', 'hasil-dan-pembahasan-6', ['wilayah', {}], 'Bandingkan wilayah')}
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

const kpi = (v, d, unit, label, sub) => `<div><dd><b><span data-count="${v}" data-dec="${d}">${num(v, d)}</span>${unit ? `<small>${unit}</small>` : ''}</b></dd><dt>${label}</dt><dd><em>${sub}</em></dd></div>`;
const find = (n, viz, c, big, h, p, sec, go, gl) => `<article class="find" style="--fc:${c}"><div class="fviz">${viz}</div><div class="fbody"><span class="fno">Temuan ${n}</span><h3>${h}</h3><div class="big">${big}</div><p>${p}</p>
  <div style="display:flex;gap:14px;flex-wrap:wrap"><a class="link" href="#" data-go='${JSON.stringify(go)}'>${gl} →</a><a class="link" href="#paper?s=${sec}" style="color:var(--muted)">Bagian paper</a></div></div></article>`;

// ------------------------------------------------------------------ finding charts: small SVGs drawn from the same data as the text
const VW = 300, VH = 96;
const svg = (label, body) => `<svg viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${esc(label)}">${body}</svg>`;
const T = (x, y, t, o = '') => `<text x="${x}" y="${y}" font-size="10.5" style="fill:var(--muted)" ${o}>${t}</text>`;
const TB = (x, y, t, o = '') => `<text x="${x}" y="${y}" font-size="11" font-weight="700" style="fill:var(--ink)" ${o}>${t}</text>`;
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// 1: reported waste against the modelled surface, with the 90 percent interval
function vizScale() {
  const k = PV.kpi, rows = [
    ['Tercatat SIPSN 2021', [1.07, 1.07, 1.07], 'var(--muted)'],
    ['Model, semua sampah', k.timbulan_total_ton_th.map((v) => v / 1e6), 'var(--fc)'],
    ['Model, organik', k.timbulan_organik_ton_th.map((v) => v / 1e6), 'color-mix(in srgb, var(--fc) 55%, var(--card2))'],
  ];
  const x0 = 122, x = (v) => x0 + (v / 11.5) * (VW - x0 - 34);
  return svg('Sampah tercatat dibanding model', rows.map(([l, [lo, m, hi], c], i) => {
    const y = 6 + i * 27;
    return `${T(0, y + 11, l)}<rect x="${x0}" y="${y}" width="${x(m) - x0}" height="15" rx="3" style="fill:${c}"/>`
      + (hi > lo ? `<line x1="${x(lo)}" x2="${x(hi)}" y1="${y + 7.5}" y2="${y + 7.5}" style="stroke:var(--ink);stroke-width:1.2"/>` : '')
      + TB(x(hi) + 5, y + 11.5, num(m, 2));
  }).join('') + T(VW, VH - 1, 'juta ton per tahun; garis: interval 90%', 'text-anchor="end"'));
}

// 2: Lebaran effect against the shifted-calendar placebo, per village type
function vizLebaran() {
  const e = PV.studi_peristiwa, p = PV.plasebo, x0 = 92, lo = -0.25, hi = 0.32, x = (v) => x0 + ((v - lo) / (hi - lo)) * (VW - x0 - 6);
  const row = (o, y, c) => `<line x1="${x(o.b - 1.96 * o.se)}" x2="${x(o.b + 1.96 * o.se)}" y1="${y}" y2="${y}" style="stroke:${c};stroke-width:2.5;stroke-linecap:round"/><circle cx="${x(o.b)}" cy="${y}" r="4" style="fill:${c}"/>`;
  const name = { 2: 'Peri urban', 3: 'Pasar, event', 4: 'Agraris' };
  return svg('Efek Lebaran dan plasebo per tipe desa', `<line x1="${x(0)}" x2="${x(0)}" y1="2" y2="${VH - 14}" style="stroke:var(--line);stroke-width:1.5"/>`
    + [2, 3, 4].map((t, i) => {
      const y = 12 + i * 25;
      return T(0, y + 4, name[t]) + row(p['leb_T' + t], y + 6, 'color-mix(in srgb, var(--muted) 55%, transparent)') + row(e['leb_T' + t], y - 2, 'var(--fc)');
    }).join('')
    + T(x(0), VH - 1, '0', 'text-anchor="middle"')
    + `<circle cx="${VW - 116}" cy="${VH - 4}" r="3.5" style="fill:var(--fc)"/>` + T(VW - 109, VH - 1, 'Lebaran')
    + `<circle cx="${VW - 54}" cy="${VH - 4}" r="3.5" style="fill:var(--muted)"/>` + T(VW - 47, VH - 1, 'plasebo'));
}

// 3: four village types as one stacked bar
function vizTipe() {
  const d = [1, 2, 3, 4].map((t) => PV.profil_tipe[t].desa), tot = d.reduce((a, b) => a + b, 0);
  let x = 0;
  return svg('Jumlah desa per tipe', T(0, 12, 'Desa dan kelurahan menurut tipe') + d.map((v, i) => {
    const w = (v / tot) * VW, cx = x + w / 2;
    const r = `<rect x="${x + 1}" y="22" width="${w - 2}" height="26" rx="4" style="fill:var(--t${i + 1})"/>${TB(cx, 66, 'T' + (i + 1), 'text-anchor="middle"')}${T(cx, 80, num(v), 'text-anchor="middle"')}`;
    x += w; return r;
  }).join(''));
}

// 4: where avoided emissions and jobs fall, inner-city type against the rest
function vizSplit() {
  const tp = REK.tipe, sh = (key) => tp[1][key] / [1, 2, 3, 4].reduce((a, t) => a + tp[t][key], 0), x0 = 92, W = VW - x0;
  const bar = (y, l, s) => T(0, y + 13, l)
    + `<rect x="${x0}" y="${y}" width="${W * s - 1}" height="18" rx="3" style="fill:var(--t1)"/><rect x="${x0 + W * s + 1}" y="${y}" width="${W * (1 - s) - 1}" height="18" rx="3" style="fill:var(--fc)"/>`
    + `<text x="${x0 + 6}" y="${y + 13}" font-size="10.5" font-weight="700" fill="#fff">${num(s * 100)}%</text><text x="${VW - 6}" y="${y + 13}" font-size="10.5" font-weight="700" fill="#fff" text-anchor="end">${num((1 - s) * 100)}%</text>`;
  return svg('Pangsa emisi dihindari dan pekerjaan di inti kota', bar(8, 'Emisi dihindari', sh('emisi_t')) + bar(36, 'Pekerjaan', sh('pekerjaan'))
    + `<rect x="${x0}" y="${VH - 12}" width="9" height="9" rx="2" style="fill:var(--t1)"/>` + T(x0 + 13, VH - 4, 'inti perkotaan')
    + `<rect x="${x0 + 96}" y="${VH - 12}" width="9" height="9" rx="2" style="fill:var(--fc)"/>` + T(x0 + 109, VH - 4, 'desa lain'));
}

// 5: yearly public VGF against the four yearly funding sources it can draw on
function vizGap() {
  const a = PV.amplop_dasar, src = [['Belanja modal', a.belanja_modal_kabkota_2025], ['Dana Desa', a.dana_desa_2024], ['SiLPA', a.silpa_kabkota_2025], ['Bantuan prov.', a.bantuan_keuangan_provinsi_2025]];
  const tot = src.reduce((s, [, v]) => s + v, 0), vgf = PV.kpi.vgf_rp[1] / 5, op = [1, 0.78, 0.6, 0.45];
  let x = 0;
  return svg('VGF publik per tahun dibanding sumber dana', T(0, 10, 'Sumber dana per tahun: ' + rp(tot))
    + src.map(([l, v], i) => {
      const w = (v / tot) * VW;
      const r = `<rect x="${x + 1}" y="16" width="${w - 2}" height="22" rx="3" style="fill:var(--muted);opacity:${op[i]}"/>` + (w > 56 ? `<text x="${x + 6}" y="31" font-size="10" font-weight="600" fill="#fff">${l}</text>` : '');
      x += w; return r;
    }).join('')
    + T(0, 60, 'VGF publik per tahun: ' + rp(vgf))
    + `<rect x="1" y="66" width="${Math.max(3, (vgf / tot) * VW)}" height="22" rx="3" style="fill:var(--fc)"/>` + TB((vgf / tot) * VW + 8, 82, num((vgf / tot) * 100, 1) + '% dari sumber dana'));
}

// 6: potential against financing readiness for the 27 kab/kota
function vizQuad() {
  const xs = K.map((k) => k.potential), ys = K.map((k) => k.readiness), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (v) => 16 + ((v - x0) / (x1 - x0)) * (VW - 32), Y = (v) => 80 - ((v - y0) / (y1 - y0)) * 72, mx = median(xs), my = median(ys);
  return svg('Potensi dan kesiapan pembiayaan 27 kabupaten/kota',
    `<line x1="${X(mx)}" x2="${X(mx)}" y1="4" y2="84" style="stroke:var(--line);stroke-dasharray:3 3"/><line x1="8" x2="${VW - 8}" y1="${Y(my)}" y2="${Y(my)}" style="stroke:var(--line);stroke-dasharray:3 3"/>`
    + K.map((k) => `<circle cx="${X(k.potential)}" cy="${Y(k.readiness)}" r="4" style="fill:var(--fc);opacity:.8"><title>${esc(kabTitle(k.nama_kabupaten_kota))}</title></circle>`).join('')
    + T(VW - 8, VH - 1, 'potensi →', 'text-anchor="end"') + T(0, VH - 1, '↑ kesiapan'));
}

// ------------------------------------------------------------------ hero map: kab/kota at once, desa mosaic once the Peta data is cached
const HERO = ['#1d4a3a', '#24734f', '#3a9d5d', '#8cc152', '#e0c43a', '#f5b52e'];
function drawHero() {
  const box = $('#heroMap'); if (!box || box.dataset.done) return;
  box.dataset.done = 1;
  const F = fit(GEO.features, 1000);
  const byK = Object.fromEntries(K.map((k) => [k.kode_kabupaten_kota, k]));
  const br = quantClasses(K.map((k) => k.timbulan_organik_ton_th), 'hijau', 6).breaks, col = (v) => HERO[classOf(v, br)];
  box.innerHTML = `<canvas aria-hidden="true"></canvas><svg viewBox="0 0 1000 ${F.H}" role="img" aria-label="Peta timbulan organik; pilih kabupaten/kota untuk membuka peta desanya">
    <g class="hm-fill">${GEO.features.map((f) => `<path d="${F.path(f.geometry)}" fill="${col(byK[f.properties.idkab]?.timbulan_organik_ton_th || 0)}"/>`).join('')}</g>
    ${GEO.features.map((f) => `<path class="hm-kab" d="${F.path(f.geometry)}" data-k="${f.properties.idkab}" tabindex="0"/>`).join('')}</svg><div class="hm-tip" hidden></div>`;
  const tip = box.querySelector('.hm-tip');
  box.querySelectorAll('.hm-kab').forEach((p) => {
    const k = byK[p.dataset.k];
    p.onmousemove = (e) => {
      const r = box.getBoundingClientRect();
      tip.innerHTML = `<b>${esc(kabTitle(k.nama_kabupaten_kota))}</b>${num(k.timbulan_organik_ton_th)} ton organik per tahun · ${num(k.jumlah_desa)} desa`;
      tip.hidden = false;
      tip.style.left = Math.max(0, Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth)) + 'px'; tip.style.top = e.clientY - r.top + 14 + 'px';
    };
    p.onmouseleave = () => (tip.hidden = true);
    p.onclick = () => ctxRef.go('peta', { k: p.dataset.k });
    p.onkeydown = (e) => { if (e.key === 'Enter') ctxRef.go('peta', { k: p.dataset.k }); };
  });
  // the desa mosaic reuses the downloads that warm the Peta tab; on slow connections the kab map stays
  if (lowData()) return;
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
  const go = () => idle(async () => {
    const [D, geo] = await Promise.all([ctxRef.store.desa(), ctxRef.store.geoDesa()]);
    const v = D.timbulan_organik_ton_th_p50, idx = ctxRef.store.idx, ok = [];
    for (let i = 0; i < v.length; i++) if (!D.bukan_permukiman[i] && v[i] != null) ok.push(v[i]);
    // skewed breaks: most desa stay dark and the densest few glow, so hotspots read at a glance
    ok.sort((x, y) => x - y);
    const b = [0.35, 0.6, 0.8, 0.92, 0.98].map((q) => ok[Math.floor(q * (ok.length - 1))]), cv = box.querySelector('canvas'), dpr = Math.min(2, devicePixelRatio || 1), w = box.clientWidth, s = w / 1000;
    cv.width = Math.round(w * dpr); cv.height = Math.round(F.H * s * dpr);
    const c = cv.getContext('2d'); c.scale(dpr * s, dpr * s);
    drawFeatures(c, geo.features, F.xy, (f) => { const i = idx.get(f.id); return i == null || D.bukan_permukiman[i] || v[i] == null ? '#18382d' : HERO[classOf(v[i], b)]; });
    box.classList.add('fine');
  }, { timeout: 4000 });
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
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
