// Rekomendasi: from the paper's typology to an action for each of 5.984 desa. Overview, one tab per module,
// a filterable desa list with CSV export, the 2026–2030 roadmap, and the rules that write each recommendation.
import { num, pct, rp, short, esc, title, kabTitle, downloadCSV } from '../fmt.js';
import { $, $$, tcol, TIPE, TAHAP, BUKTI, MODUL, ICON, stack, table, debounce } from '../ui.js';
import { footer } from './ringkasan.js';

const TABS = [['gambaran', 'Gambaran'], ['t1', 'T1 Inti perkotaan'], ['t2', 'T2 Peri-urban'], ['t3', 'T3 Pasar dan event'], ['t4', 'T4 Agraris'], ['daftar', 'Daftar desa'], ['jalan', 'Peta jalan 2026–2030'], ['cara', 'Cara disusun']];
const BCOL = { kuat: '#1f9a68', sedang: '#e3a51c', indikatif: '#e2622b' };
const ASAL = {
  1: 'Temuan 3 dan Tabel 4: volume besar dan jarak ke TPA dekat, skala ekonomi hub tercapai tanpa biaya angkut besar.',
  2: 'Temuan 3 dan 4: modul komunal padat karya, ditambatkan pada kelembagaan lokal (tata kelola polisentris).',
  3: 'Temuan 2 dan 3: pangsa nonrumah tangga tertinggi dan lonjakan Lebaran nyata, sehingga perlu kapasitas cadangan musiman.',
  4: 'Temuan 3 dan 4: volume per desa enam kali lebih kecil dan TPA lima kali lebih jauh; pengolahan di rumah tangga atau desa paling murah.',
};
const PEN_DESC = {
  lebaran: 'Desa T3 dan T4 yang aktivitasnya naik relatif terhadap inti kota saat Lebaran; siapkan kapasitas cadangan dan layanan jemput hajatan.',
  tumbuh: 'Cahaya malam naik 40 persen atau lebih sejak 2022; rancang cadangan kapasitas 10 persen.',
  udara: 'CO rerata masuk desil tertinggi provinsi dan jauh dari TPA; indikasi pembakaran terbuka yang perlu diverifikasi.',
  batas: 'Profil desa dekat batas dua tipe; pertimbangkan modul tipe tetangga saat studi kelayakan.',
  timbang: 'Skor keyakinan estimasi rendah; timbang sampah di lapangan selama 30 hari sebelum memilih kapasitas.',
};
let el, ctx, store, R, PV, K, D, tab = 'gambaran', F = { q: '', k: '', t: '', p: '', b: '', pen: 0 }, page = 0;

export async function mount(root, c) {
  el = root; ctx = c; store = c.store;
  [R, PV, K, D] = await Promise.all([store.rek(), store.prov(), store.kab(), store.desa()]);
  const tot = Object.values(R.tipe).reduce((a, t) => a + t.desa, 0);
  el.innerHTML = `<div class="wrap">
    <div class="page-head"><div class="kicker">Rekomendasi sampai tingkat desa</div><h1>Dari temuan paper ke tindakan di ${num(tot)} desa</h1>
      <p class="lead">Setiap desa mendapat satu modul sesuai tipenya, waktu pelaksanaan dari kurva pasokan VGF, aktor, instrumen, target, dan kekuatan bukti. Kondisi data selalu ditulis lebih dulu, lengkap dengan tahun dan sumbernya.</p></div>
    <div class="tabsbar" role="tablist">${TABS.map(([k, l]) => `<button class="pill" role="tab" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="rBody"></div>${footer()}</div>`;
  $$('[data-tab]', el).forEach((b) => (b.onclick = () => ctx.go('rekomendasi', { tab: b.dataset.tab })));
}

export function update(params) {
  tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'gambaran';
  if (tab === 'daftar') { F = { q: params.q || '', k: params.k || '', t: params.t || '', p: params.p || '', b: params.b || '', pen: +params.pen || 0 }; page = 0; }
  $$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
  ({ gambaran, daftar, jalan, cara }[tab] || tipeTab)();
}

function gambaran() {
  $('#rBody').innerHTML = `
    <div class="mods">${[1, 2, 3, 4].map((t) => `<button class="mod" style="--mc:${tcol(t)}" data-t="${t}"><span class="ic">${ICON[t]}</span><h3>${esc(TIPE[t])}</h3><p>${esc(MODUL[t])}</p><div class="n">${num(R.tipe[t].desa)} <small class="muted" style="font-size:13px;font-weight:600">desa</small></div></button>`).join('')}</div>
    <section class="sect"><div class="sect-head"><div><h2>Empat modul dan sebaran kekuatan bukti</h2><p>Bukti kuat dijalankan langsung, sedang didahului uji coba terukur enam bulan, indikatif didahului penimbangan lapangan 30 hari.</p></div></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>Tipe</th><th>Modul</th><th>Asal di paper</th><th style="min-width:170px">Kekuatan bukti</th><th class="n">Desa</th><th class="n">Tahap 1</th><th class="n">Tahap 2</th><th class="n">Tahap 3</th></tr></thead><tbody>
      ${[1, 2, 3, 4].map((t) => { const x = R.tipe[t]; return `<tr class="click" data-t="${t}"><td><span class="chip t" style="background:${tcol(t)}">T${t}</span></td><td style="min-width:220px">${esc(MODUL[t])}</td><td style="min-width:240px;color:var(--ink2);font-size:13px">${esc(ASAL[t])}</td>
        <td>${stack(Object.entries(x.bukti).map(([k, v]) => ({ v, color: BCOL[k], label: k })))}<div style="font-size:11.5px;color:var(--muted);margin-top:4px">${Object.entries(x.bukti).map(([k, v]) => `${k} ${num(v)}`).join(' · ')}</div></td>
        <td class="n">${num(x.desa)}</td>${[1, 2, 3].map((p) => `<td class="n">${num(x.tahap[p])}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>
      <div class="legend-row">${Object.entries(BCOL).map(([k, c]) => `<span><i style="background:${c}"></i>${k}</span>`).join('')}</div></section>
    <section class="sect"><div class="sect-head"><div><h2>Penanda catatan</h2><p>Catatan otomatis yang menambah kedalaman rekomendasi. Klik kartu untuk melihat desanya.</p></div></div>
      <div class="grid g5">${R.penanda.map((p) => `<button class="card" data-pen="${p.bit}" style="text-align:left;cursor:pointer"><b style="font-size:24px;font-weight:800;display:block">${num(p.desa)}</b><b style="font-size:14px">${esc(p.label)}</b><p class="note" style="margin-top:6px">${esc(PEN_DESC[p.id])}</p></button>`).join('')}</div></section>`;
  $$('[data-t]', $('#rBody')).forEach((b) => (b.onclick = () => ctx.go('rekomendasi', { tab: 't' + b.dataset.t })));
  $$('[data-pen]', $('#rBody')).forEach((b) => (b.onclick = () => ctx.go('rekomendasi', { tab: 'daftar', pen: b.dataset.pen })));
}

function tipeTab() {
  const t = +tab[1], x = R.tipe[t];
  const byK = {}; for (let i = 0; i < store.N; i++) if (D.tipe_desa[i] === t) byK[D.kode_kabupaten_kota[i]] = (byK[D.kode_kabupaten_kota[i]] || 0) + 1;
  const topK = Object.entries(byK).sort((a, b) => b[1] - a[1]).slice(0, 8), mx = topK[0]?.[1] || 1;
  const kName = (k) => kabTitle(K.find((z) => z.kode_kabupaten_kota === String(k))?.nama_kabupaten_kota || k);
  $('#rBody').innerHTML = `
    <div class="card" style="border-top:5px solid ${tcol(t)}">
      <div style="display:flex;gap:16px;align-items:start;flex-wrap:wrap"><span class="mod" style="--mc:${tcol(t)};padding:0;border:0;box-shadow:none;cursor:default"><span class="ic" style="width:52px;height:52px">${ICON[t]}</span></span>
        <div style="flex:1;min-width:260px"><div class="kicker" style="color:${tcol(t)}">${num(x.desa)} desa</div><h2 style="font-size:24px;font-weight:780;margin-top:4px">${esc(TIPE[t])}</h2><p style="margin-top:6px;color:var(--ink2)">${esc(MODUL[t])}. ${esc(ASAL[t])}</p></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-s solid" id="rList">Daftar desa tipe ini</button><button class="btn-s" id="rMap">Lihat di peta</button></div></div>
      <div class="mini-kpis" style="margin-top:16px;grid-template-columns:repeat(6,minmax(0,1fr))">
        <div><b>${num(x.organik_dialihkan_ton_th / 1e3)} rb t</b><span>organik diolah per tahun</span></div>
        <div><b>${num(x.emisi_t / 1e3)} rb t</b><span>CO₂e dihindari per tahun</span></div>
        <div><b>${num(x.energi_mwh / 1e3, 1)} GWh</b><span>energi biogas per tahun</span></div>
        <div><b>${num(x.pekerjaan)}</b><span>pekerjaan langsung</span></div>
        <div><b>${short(x.vgf_juta_rp * 1e6)}</b><span>VGF bagian desa</span></div>
        <div><b>${short(x.investasi_juta_rp * 1e6)}</b><span>investasi</span></div>
      </div>
    </div>
    <section class="sect grid g2">
      <div class="card"><h3>Paket tindakan</h3>
        <dl class="kv"><dt>Aktor</dt><dd>${esc(x.aktor)}</dd><dt>Instrumen</dt><dd>${esc(x.instrumen)}</dd></dl>
        ${x.aksi_umum.length ? `<div class="h4">Langkah yang berlaku untuk semua desa tipe ini</div><ul class="acts">${x.aksi_umum.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        <div class="h4">Contoh rekomendasi (desa dengan pengalihan terbesar)</div><div class="rec-main">${esc(x.contoh)}</div></div>
      <div class="card"><h3>Kekuatan bukti dan tahap</h3>
        <div class="h4" style="margin-top:10px">Kekuatan bukti</div>${stack(Object.entries(x.bukti).map(([k, v]) => ({ v, color: BCOL[k], label: k })), 'lg')}
        <div class="legend-row">${Object.entries(x.bukti).map(([k, v]) => `<span><i style="background:${BCOL[k]}"></i>${k} ${num(v)} (${pct(v / x.desa)})</span>`).join('')}</div>
        <div class="h4">Tahap pelaksanaan</div>${[1, 2, 3].map((p) => `<div class="hbar"><span>${esc(TAHAP[p])}</span><div class="tr"><i style="width:${(100 * x.tahap[p]) / x.desa}%;background:${['#0d3b2c', '#3f9a72', '#a9dcc2'][p - 1]}"></i></div><span class="v">${num(x.tahap[p])}</span></div>`).join('')}
        <div class="h4">Penanda catatan</div>${R.penanda.filter((p) => x.penanda[p.id]).map((p) => `<div class="hbar"><span>${esc(p.label)}</span><div class="tr"><i style="width:${(100 * x.penanda[p.id]) / x.desa}%;background:var(--accent)"></i></div><span class="v">${num(x.penanda[p.id])}</span></div>`).join('') || '<p class="note">Tidak ada penanda.</p>'}</div>
    </section>
    <section class="sect card"><h3>Kabupaten/kota dengan desa tipe ini terbanyak</h3>
      <div style="margin-top:10px">${topK.map(([k, n]) => `<div class="hbar" style="cursor:pointer" data-k="${k}"><span>${esc(kName(k))}</span><div class="tr"><i style="width:${(100 * n) / mx}%;background:${tcol(t)}"></i></div><span class="v">${num(n)}</span></div>`).join('')}</div></section>`;
  $('#rList').onclick = () => ctx.go('rekomendasi', { tab: 'daftar', t: String(t) });
  $('#rMap').onclick = () => ctx.go('peta', { t: 'tipologi', l: 'tipe' });
  $$('[data-k]', $('#rBody')).forEach((r) => (r.onclick = () => ctx.go('rekomendasi', { tab: 'daftar', t: String(t), k: r.dataset.k })));
}

function daftar() {
  const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`;
  $('#rBody').innerHTML = `
    <div class="card">
      <div class="grid" style="grid-template-columns:2fr repeat(5,minmax(0,1fr));gap:10px">
        <label><span class="lbl">Cari desa atau kecamatan</span><input class="inp" id="dQ" type="search" value="${esc(F.q)}" placeholder="mis. Cibiru"></label>
        <label><span class="lbl">Kabupaten/kota</span><select class="sel" id="dK">${opt('', 'Semua', F.k)}${[...K].sort((a, b) => kabTitle(a.nama_kabupaten_kota).localeCompare(kabTitle(b.nama_kabupaten_kota))).map((k) => opt(k.kode_kabupaten_kota, kabTitle(k.nama_kabupaten_kota), F.k)).join('')}</select></label>
        <label><span class="lbl">Tipe</span><select class="sel" id="dT">${opt('', 'Semua', F.t)}${[1, 2, 3, 4].map((t) => opt(t, TIPE[t], F.t)).join('')}</select></label>
        <label><span class="lbl">Tahap</span><select class="sel" id="dP">${opt('', 'Semua', F.p)}${[1, 2, 3].map((p) => opt(p, TAHAP[p], F.p)).join('')}</select></label>
        <label><span class="lbl">Kekuatan bukti</span><select class="sel" id="dB">${opt('', 'Semua', F.b)}${[1, 2, 3].map((b) => opt(b, BUKTI[b], F.b)).join('')}</select></label>
        <label><span class="lbl">Penanda</span><select class="sel" id="dPen">${opt(0, 'Semua', F.pen)}${R.penanda.map((p) => opt(p.bit, p.label, F.pen)).join('')}</select></label>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 10px;gap:10px;flex-wrap:wrap"><b id="dCount"></b>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-s" id="dReset">Atur ulang</button><button class="btn-s solid" id="dCsv"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Unduh hasil saringan (CSV)</button>
          <a class="btn-s" href="dataset/rekomendasi_desa.csv" download>Teks rekomendasi lengkap (CSV)</a></div></div>
      <div class="tbl-wrap" id="dTable" style="max-height:none"></div>
      <div class="pager"><span id="dPage"></span><span style="display:flex;gap:6px"><button class="btn-s" id="dPrev">← Sebelumnya</button><button class="btn-s" id="dNext">Berikutnya →</button></span></div>
    </div>`;
  const apply = () => { page = 0; ctx.setParams('rekomendasi', { tab: 'daftar', ...Object.fromEntries(Object.entries(F).filter(([, v]) => v)) }); drawList(); };
  $('#dQ').addEventListener('input', debounce((e) => { F.q = e.target.value; apply(); }, 150));
  for (const [id, key] of [['dK', 'k'], ['dT', 't'], ['dP', 'p'], ['dB', 'b'], ['dPen', 'pen']]) $('#' + id).onchange = (e) => { F[key] = key === 'pen' ? +e.target.value : e.target.value; apply(); };
  $('#dReset').onclick = () => { F = { q: '', k: '', t: '', p: '', b: '', pen: 0 }; daftar(); apply(); };
  $('#dPrev').onclick = () => { page = Math.max(0, page - 1); drawList(); };
  $('#dNext').onclick = () => { page++; drawList(); };
  $('#dCsv').onclick = () => downloadCSV('rekomendasi_desa_saringan.csv', filtered().map((i) => ({
    uid: D.uid[i], bps_kode_desa_kelurahan: D.bps_kode_desa_kelurahan[i], desa: D.bps_nama_desa_kelurahan[i], kecamatan: D.bps_nama_kecamatan[i], kode_kabupaten_kota: D.kode_kabupaten_kota[i],
    tipe_desa: D.tipe_desa[i], tahap: D.tahap[i], kekuatan_bukti: BUKTI[D.bukti[i]], organik_dialihkan_ton_th: D.organik_dialihkan_ton_th[i], vgf_juta_rp: D.vgf_juta_rp[i],
    emisi_dihindari_t_co2e_th: D.emisi_dihindari_t_co2e_th[i], pekerjaan_langsung: D.pekerjaan_langsung[i] })));
  drawList();
}
function filtered() {
  const q = F.q.toLowerCase().trim(), out = [];
  for (let i = 0; i < store.N; i++) {
    if (D.bukan_permukiman[i]) continue;
    if (F.k && String(D.kode_kabupaten_kota[i]) !== F.k) continue;
    if (F.t && D.tipe_desa[i] !== +F.t) continue;
    if (F.p && D.tahap[i] !== +F.p) continue;
    if (F.b && D.bukti[i] !== +F.b) continue;
    if (F.pen && !(D.penanda[i] & F.pen)) continue;
    if (q && !D.bps_nama_desa_kelurahan[i].toLowerCase().includes(q) && !D.bps_nama_kecamatan[i].toLowerCase().includes(q)) continue;
    out.push(i);
  }
  return out;
}
function drawList() {
  const ids = filtered();
  const kName = (k) => kabTitle(K.find((z) => z.kode_kabupaten_kota === String(k))?.nama_kabupaten_kota || k);
  const rows = ids.map((i) => ({ uid: D.uid[i], nm: title(D.bps_nama_desa_kelurahan[i]), kc: title(D.bps_nama_kecamatan[i]), kb: kName(D.kode_kabupaten_kota[i]), t: D.tipe_desa[i], p: D.tahap[i], b: D.bukti[i],
    alih: D.organik_dialihkan_ton_th[i], vgf: D.vgf_juta_rp[i], ghg: D.emisi_dihindari_t_co2e_th[i] }));
  $('#dCount').textContent = `${num(ids.length)} desa`;
  const el2 = $('#dTable');
  const t = table(el2, { rows, rowKey: 'uid', sortKey: 'alih', onRow: (r) => ctx.go('peta', { desa: r.uid }), pageSize: 50,
    onPage: ({ page: p, pages }) => { page = p; $('#dPage').textContent = `Halaman ${p + 1} dari ${pages}`; $('#dPrev').disabled = p === 0; $('#dNext').disabled = p >= pages - 1; },
    columns: [
      { key: 'nm', label: 'Desa', fmt: (r) => `<b style="font-weight:650">${esc(r.nm)}</b><br><small class="muted">Kec. ${esc(r.kc)}, ${esc(r.kb)}</small>` },
      { key: 't', label: 'Tipe', fmt: (r) => `<span class="chip t" style="background:${tcol(r.t)}">T${r.t}</span>` },
      { key: 'p', label: 'Tahap', fmt: (r) => `Tahap ${r.p}` },
      { key: 'b', label: 'Bukti', fmt: (r) => `<span class="badge ${BUKTI[r.b]}">${BUKTI[r.b] || '–'}</span>` },
      { key: 'alih', label: 'Organik diolah (t/th)', n: true, fmt: (r) => num(r.alih) },
      { key: 'vgf', label: 'VGF', n: true, fmt: (r) => rp((r.vgf || 0) * 1e6) },
      { key: 'ghg', label: 'Emisi dihindari (t)', n: true, fmt: (r) => num(r.ghg) },
    ] });
  $('#dPrev').onclick = () => { t.go(t.page - 1); el2.scrollIntoView({ block: 'nearest' }); };
  $('#dNext').onclick = () => { t.go(t.page + 1); el2.scrollIntoView({ block: 'nearest' }); };
}

function jalan() {
  const T = PV.tahap, tot = { e: 0, o: 0, v: 0, i: 0, j: 0 };
  [1, 2, 3].forEach((p) => { tot.e += T[p].emisi_t; tot.o += T[p].organik_ton; tot.v += T[p].vgf_rp; tot.i += T[p].investasi_rp; tot.j += T[p].pekerjaan; });
  let cum = 0;
  $('#rBody').innerHTML = `
    <div class="timeline">${[1, 2, 3].map((p) => { const x = T[p]; cum += x.emisi_t; return `<div><div class="yr">${p === 1 ? '2026–2027' : p === 2 ? '2028–2029' : '2030'}</div><h3>Tahap ${p}</h3>
      <div class="mini-kpis" style="grid-template-columns:1fr 1fr"><div><b>${num(x.sel)}</b><span>sel kab/kota × tipe</span></div><div><b>${num(x.organik_ton / 1e3)} rb t</b><span>organik diolah per tahun</span></div>
        <div><b>${num(x.emisi_t / 1e3)} rb t</b><span>CO₂e dihindari per tahun</span></div><div><b>${short(x.vgf_rp)}</b><span>VGF</span></div><div><b>${short(x.investasi_rp)}</b><span>investasi</span></div><div><b>${num(x.pekerjaan)}</b><span>pekerjaan</span></div></div>
      <div class="bar"><i style="width:${(100 * cum) / tot.e}%"></i></div><p class="note">${pct(cum / tot.e)} emisi dihindari tercapai secara kumulatif</p></div>`; }).join('')}</div>
    <section class="sect grid g2">
      <div class="callout"><h4>Mengapa urutannya begini</h4><p>Sel diurutkan dari VGF per t CO₂e terendah. Tahap 1 menyerap sel swadana dan sel termurah, misalnya modul di Pangandaran, Banjar, dan Ciamis yang sudah swadana karena biaya angkut yang dihindari tinggi, sehingga ${pct(T[1].emisi_t / tot.e)} penghindaran emisi tercapai dengan ${pct(T[1].vgf_rp / tot.v)} VGF.</p></div>
      <div class="callout warm"><h4>Yang perlu disiapkan sebelum Tahap 1</h4><p>Alihkan pembayaran tipping fee menjadi gate fee berbasis kinerja, tetapkan operator hub dan BUMDes, lalu jalankan penimbangan lapangan untuk desa dengan bukti indikatif. Kurva lengkap ada di tab Skenario.</p></div>
    </section>
    <p class="note"><a class="link" href="#skenario">Buka simulator dan kurva pasokan abatemen →</a></p>`;
}

function cara() {
  const steps = [
    ['Kondisi data', 'Setiap butir diberi [tahun; sumber]: penduduk dan kepadatan, timbulan organik dengan interval 90 persen, pangsa nonrumah tangga dan bulan puncak, jarak TPA, cahaya malam dan perubahannya, tipe desa dan probabilitas posteriornya.'],
    ['Rekomendasi utama', 'Sesuai tipe: T1 menyalurkan organik ke hub kecamatan; T2 digester komunal dan pengomposan yang ditambatkan pada bank sampah, pesantren, atau pasar; T3 unit AD modular dengan cadangan kapasitas musiman; T4 biodigester rumah tangga, kompos, dan BSF melalui BUMDes.'],
    ['Waktu', 'Dari kurva pasokan VGF: Tahap 1 (2026–2027), Tahap 2 (2028–2029), Tahap 3 (2030).'],
    ['Aktor, instrumen, target', 'Termasuk sumber pembiayaan dari program linear skenario dasar: APBD kabupaten/kota, Dana Desa, atau bantuan keuangan provinsi.'],
    ['Kekuatan bukti', 'Mengikuti skor keyakinan (lebar interval, bukti OSM, cahaya malam, posterior LPA): tinggi menjadi kuat, sedang menjadi sedang, rendah menjadi indikatif. Bunyi tindakan mengikuti bukti.'],
    ['Catatan otomatis', 'Lonjakan Lebaran untuk T3 dan T4, cadangan kapasitas 10 persen bila cahaya malam naik 40 persen atau lebih, penanda CO tinggi jauh dari TPA, desa perbatasan tipe, dan anjuran penimbangan bila keyakinan rendah.'],
  ];
  $('#rBody').innerHTML = `<div class="steps">${steps.map(([h, p], i) => `<div class="step"><span class="n">${i + 1}</span><div><h3>${h}</h3><p>${p}</p></div><span></span></div>`).join('')}</div>
    <section class="sect grid g3">${[['kuat', 'Jalankan langsung', 'Skor keyakinan tinggi: interval sempit, bukti OSM dan cahaya malam konsisten, posterior LPA tinggi.'], ['sedang', 'Uji coba enam bulan', 'Uji coba terukur dengan penimbangan harian, lalu skala penuh bila tonase terkonfirmasi.'], ['indikatif', 'Timbang dulu 30 hari', 'Bukti lemah; penimbangan lapangan 30 hari sebelum memilih kapasitas modul.']].map(([k, h, p]) => `<div class="card" style="border-top:4px solid ${BCOL[k]}"><span class="badge ${k}">${k}</span><h3 style="margin-top:8px">${h}</h3><p class="note">${p}</p></div>`).join('')}</section>
    <p class="note">Aturan ditulis di <code>pipeline/rules_rekomendasi.py</code>. Mengubah aturan lalu menjalankan <code>build_dataset.py</code> dan <code>build_web.py</code> menulis ulang seluruh rekomendasi.</p>`;
}
