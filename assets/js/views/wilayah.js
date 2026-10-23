// Wilayah: compare 27 kab/kota, then open the province or one kab/kota for its desa mini map, funding sources,
// recommendation, kecamatan, top desa, typology cells, and fiscal space.
import { num, pct, rp, short, esc, title, kabTitle, ok, downloadCSV } from '../fmt.js';
import { $, $$, css, tcol, TIPE, TAHAP, cellbar, stack, table, chartTheme, chart, debounce } from '../ui.js';
import { canvasMap } from '../svgmap.js';
import { RAMPS, quantClasses, classOf, CAT } from '../scales.js';
import { footer } from './ringkasan.js';

let el, ctx, store, K, PV, C, D, byKab, sel = '', mm = 'tipe', q = '', Chart, tbl;

export async function mount(root, c) {
  el = root; ctx = c; store = c.store;
  [K, PV, C] = await Promise.all([store.kab(), store.prov(), store.sel()]);
  byKab = Object.fromEntries(K.map((k) => [k.kode_kabupaten_kota, k]));
  el.innerHTML = `<div class="wrap">
    <div class="page-head"><div class="kicker">Wilayah</div><h1>Profil kabupaten/kota dan kecamatan</h1>
      <p class="lead">Bandingkan 27 kabupaten/kota, lalu buka satu wilayah untuk melihat sebaran tipe desa, sumber VGF, rekomendasi, kecamatan, dan desa dengan timbulan organik tertinggi.</p></div>
    <div class="split">
      <div class="card">
        <div class="card-head"><div><h3>27 kabupaten/kota</h3><p class="sub">Klik judul kolom untuk mengurutkan, klik baris untuk membuka profil.</p></div>
          <button class="btn-s" id="wProv">Seluruh Jawa Barat</button></div>
        <input class="inp" id="wQ" type="search" placeholder="Saring nama kabupaten/kota" aria-label="Saring kabupaten/kota" style="margin-bottom:10px">
        <div class="tbl-wrap" id="wTable"></div>
        <p class="note">Kuadran: I potensi dan kesiapan tinggi, II potensi tinggi kesiapan rendah, III potensi rendah kesiapan tinggi, IV keduanya rendah.</p>
      </div>
      <div class="card" id="wDetail" style="position:sticky;top:calc(var(--top-h) + 16px)"></div>
    </div>
    <div id="wMore"></div>
    ${footer()}
  </div>`;
  const rows = K.map((k) => ({ ...k, quad: (k.quadrant || '').split(':')[0].trim() }));
  const mxO = Math.max(...K.map((k) => k.timbulan_organik_ton_th)), mxV = Math.max(...K.map((k) => k.vgf));
  tbl = table($('#wTable'), {
    rows, rowKey: 'kode_kabupaten_kota', sortKey: 'timbulan_organik_ton_th', selected: sel, onRow: (r) => ctx.go('wilayah', { kab: r.kode_kabupaten_kota }),
    columns: [
      { key: 'nama_kabupaten_kota', label: 'Kabupaten/kota', fmt: (r) => `<b style="font-weight:650">${esc(kabTitle(r.nama_kabupaten_kota))}</b>`, sort: (r) => kabTitle(r.nama_kabupaten_kota) },
      { key: 'jumlah_desa', label: 'Desa', n: true, fmt: (r) => num(r.jumlah_desa) },
      { key: 'timbulan_organik_ton_th', label: 'Organik (ribu t)', n: true, fmt: (r) => cellbar(r.timbulan_organik_ton_th, mxO, num(r.timbulan_organik_ton_th / 1e3, 0)) },
      { key: 'vgf', label: 'VGF', n: true, fmt: (r) => cellbar(r.vgf, mxV, short(r.vgf), 'linear-gradient(90deg,#78a9e0,#1c5296)') },
      { key: 'vgf_per_belanja_modal_5th', label: 'VGF/BM', n: true, fmt: (r) => `${num(r.vgf_per_belanja_modal_5th * 100, 1)}%` },
      { key: 'quad', label: 'Kuadran', fmt: (r) => `<span class="chip">${esc(r.quad)}</span>` },
    ],
  });
  $('#wQ').addEventListener('input', debounce((e) => { q = e.target.value.toLowerCase(); tbl.redraw(rows.filter((r) => r.nama_kabupaten_kota.toLowerCase().includes(q))); }, 100));
  $('#wProv').onclick = () => ctx.go('wilayah', {});
  addEventListener('tema', () => { if (!el.hidden) render(); });
}

export async function update(params) {
  sel = params.kab && byKab[params.kab] ? params.kab : '';
  tbl.redraw(undefined, sel);
  await render();
}

async function render() {
  D = await store.desa();
  const k = sel ? byKab[sel] : null;
  const rowsIdx = []; for (let i = 0; i < store.N; i++) if (!D.bukan_permukiman[i] && (!k || String(D.kode_kabupaten_kota[i]) === sel)) rowsIdx.push(i);
  const sum = (c) => rowsIdx.reduce((a, i) => a + (D[c][i] || 0), 0);
  const tipeN = [1, 2, 3, 4].map((t) => rowsIdx.filter((i) => D.tipe_desa[i] === t).length);
  const fund = k ? { kab: k.f_kab, dd: k.f_dd, bk: k.f_bk } : { kab: K.reduce((a, x) => a + x.f_kab, 0), dd: K.reduce((a, x) => a + x.f_dd, 0), bk: K.reduce((a, x) => a + x.f_bk, 0) };
  const vgf = k ? k.vgf : K.reduce((a, x) => a + x.vgf, 0);
  $('#wDetail').innerHTML = `
    <div class="card-head"><div><div class="kicker">${k ? 'Kabupaten/kota' : 'Provinsi'}</div><h2 style="font-size:22px;font-weight:780;margin-top:4px">${k ? esc(kabTitle(k.nama_kabupaten_kota)) : 'Seluruh Jawa Barat'}</h2>
      ${k ? `<p class="sub">Kuadran ${esc(k.quadrant)}</p>` : '<p class="sub">27 kabupaten/kota, batas desa BPS 2024</p>'}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-s solid" id="wMap">Lihat di peta</button><button class="btn-s" id="wCsv"><svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>CSV desa</button></div></div>
    <div class="mini-kpis">
      <div><b>${num(rowsIdx.length)}</b><span>desa/kelurahan</span></div>
      <div><b>${num(sum('timbulan_organik_ton_th_p50') / 1e3)} rb t</b><span>organik per tahun</span></div>
      <div><b>${short(vgf)}</b><span>VGF lima tahun${k ? `, ${pct(k.vgf_per_belanja_modal_5th, 1)} belanja modal` : ''}</span></div>
      <div><b>${num(sum('pekerjaan_langsung'))}</b><span>pekerjaan langsung</span></div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px;gap:8px;flex-wrap:wrap"><b style="font-size:14px">Peta desa</b>
      <div class="seg" id="wMM">${[['tipe', 'Tipe'], ['org', 'Organik'], ['tahap', 'Tahap']].map(([a, b]) => `<button data-m="${a}" aria-pressed="${mm === a}">${b}</button>`).join('')}</div></div>
    <canvas class="minimap" id="wCanvas" aria-label="Peta mini desa"></canvas>
    <div class="legend-row" id="wLeg"></div>
    <div class="h4">Sumber VGF, skenario dasar</div>
    ${stack([{ v: fund.kab, color: '#0d3b2c', label: 'APBD kab/kota' }, { v: fund.dd, color: '#3f9a72', label: 'Dana Desa' }, { v: fund.bk, color: '#f5b52e', label: 'Bantuan provinsi' }], 'lg')}
    <div class="legend-row"><span><i style="background:#0d3b2c"></i>APBD kab/kota ${short(fund.kab)}</span><span><i style="background:#3f9a72"></i>Dana Desa ${short(fund.dd)}</span><span><i style="background:#f5b52e"></i>Bantuan provinsi ${short(fund.bk)}</span></div>
    ${k ? recBlock(k) : quadBlock()}`;
  $('#wMap').onclick = () => ctx.go('peta', k ? { k: sel } : {});
  $('#wCsv').onclick = async () => {
    await store.allDesa();
    const cols = Object.keys(D);
    downloadCSV(`desa_${k ? sel : 'jawa_barat'}.csv`, rowsIdx.map((i) => Object.fromEntries(cols.map((c) => [c, D[c][i]]))));
  };
  $$('#wMM button').forEach((b) => (b.onclick = () => { mm = b.dataset.m; $$('#wMM button').forEach((x) => x.setAttribute('aria-pressed', x === b)); drawMini(rowsIdx, tipeN); }));
  drawMini(rowsIdx, tipeN);
  await renderMore(k, rowsIdx);
}

function recBlock(k) {
  const r = k.rek || {}, kb = (r.kekuatan_bukti || '').split(' ')[0];
  return `<div class="h4">Rekomendasi ${esc(String(r.tahun_rekomendasi || 2026))}</div>
    <div class="rec-main">${esc(r.rekomendasi_utama || '')}</div>
    <dl class="kv"><dt>Aktor</dt><dd>${esc(r.aktor || '')}</dd><dt>Instrumen</dt><dd>${esc(r.instrumen_utama || '')}</dd><dt>Target</dt><dd>${esc(r.target || '')}</dd>
      <dt>Bukti</dt><dd><span class="badge ${esc(kb)}">${esc(r.kekuatan_bukti || '')}</span></dd></dl>
    <details class="how"><summary>Kondisi data dan langkah</summary><div>
      <ul class="cond">${(r.kondisi || []).map((s) => { const m = s.match(/^(.*)\s\[(.+)\]$/); return `<li>${esc(m ? m[1] : s)}${m ? `<span class="src">${esc(m[2])}</span>` : ''}</li>`; }).join('')}</ul>
      <ul class="acts">${(r.aksi || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
      ${(r.catatan || []).length ? `<div class="notes">${r.catatan.map((c) => `<p>${esc(c)}</p>`).join('')}</div>` : ''}</div></details>`;
}
function quadBlock() {
  const qs = ['I', 'II', 'III', 'IV'].map((qd) => ({ qd, ks: K.filter((k) => (k.quadrant || '').startsWith(qd + ':')) }));
  const lab = { I: 'Potensi tinggi, kesiapan tinggi', II: 'Potensi tinggi, kesiapan rendah', III: 'Potensi rendah, kesiapan tinggi', IV: 'Keduanya rendah' };
  return `<div class="h4">Kuadran potensi dan kesiapan pembiayaan</div>
    <div class="grid g2" style="gap:10px">${qs.map(({ qd, ks }) => `<div style="border:1px solid var(--line);border-radius:11px;padding:10px 12px;background:var(--card2)"><b>Kuadran ${qd}</b> <span class="muted" style="font-size:12px">${ks.length} wilayah</span>
      <div style="font-size:12px;color:var(--muted)">${lab[qd]}</div><div style="font-size:12.5px;margin-top:4px">${ks.map((k) => `<a href="#wilayah?kab=${k.kode_kabupaten_kota}" class="link" style="font-weight:600">${esc(kabTitle(k.nama_kabupaten_kota))}</a>`).join(', ')}</div></div>`).join('')}</div>
    <p class="note">Potensi pengalihan organik dan kesiapan pembiayaan hampir tidak berkorelasi (ρ = 0,04), sehingga dukungan provinsi perlu dibedakan per kuadran.</p>`;
}

async function drawMini(rowsIdx, tipeN) {
  const geo = await store.geoDesa(), set = new Set(rowsIdx.map((i) => D.uid[i]));
  const fs = geo.features.filter((f) => set.has(f.id));
  let colorOf, leg;
  if (mm === 'tipe') { colorOf = (u) => tcol(D.tipe_desa[store.idx.get(u)]); leg = [1, 2, 3, 4].map((t, j) => `<span><i style="background:${tcol(t)}"></i>${esc(TIPE[t])} ${num(tipeN[j])}</span>`); }
  else if (mm === 'tahap') { const c = CAT.tahap(); colorOf = (u) => c.colors[(D.tahap[store.idx.get(u)] || 1) - 1]; leg = c.values.map((v, j) => `<span><i style="background:${c.colors[j]}"></i>${esc(TAHAP[v])} ${num(rowsIdx.filter((i) => D.tahap[i] === v).length)}</span>`); }
  else {
    const vals = rowsIdx.map((i) => D.timbulan_organik_ton_th_p50[i]), sc = quantClasses(vals, 'hijau', 5);
    colorOf = (u) => sc.colors[classOf(D.timbulan_organik_ton_th_p50[store.idx.get(u)], sc.breaks)];
    leg = sc.colors.map((c, j) => `<span><i style="background:${c}"></i>${j === 0 ? '< ' + short(sc.breaks[0]) : j === sc.breaks.length ? '≥ ' + short(sc.breaks[j - 1]) : short(sc.breaks[j - 1]) + '–' + short(sc.breaks[j])} t</span>`);
  }
  const cv = $('#wCanvas'); if (!cv) return;
  canvasMap(cv, fs, colorOf, { stroke: css('--card') });
  $('#wLeg').innerHTML = leg.join('');
}

async function renderMore(k, rowsIdx) {
  const kec = [...(await store.kecamatan()).values()].filter((r) => !k || String(r.kab) === sel);
  const top = [...rowsIdx].sort((a, b) => D.timbulan_organik_ton_th_p50[b] - D.timbulan_organik_ton_th_p50[a]).slice(0, 12);
  const cells = k ? C.filter((c) => c.idkab === sel).sort((a, b) => a.tipe - b.tipe) : null;
  $('#wMore').innerHTML = `
    <section class="sect grid g2">
      <div class="card"><h3>${k ? 'Kecamatan' : 'Kecamatan dengan organik terbanyak'}</h3><p class="sub">${k ? `${kec.length} kecamatan; klik untuk membuka di peta` : 'Seluruh Jawa Barat; klik untuk membuka di peta'}</p><div class="tbl-wrap" id="wKec" style="margin-top:10px;max-height:460px"></div></div>
      <div class="card"><h3>Desa dengan timbulan organik tertinggi</h3><p class="sub">Klik untuk membuka detail desa di peta</p><div class="tbl-wrap" id="wTop" style="margin-top:10px;max-height:460px"></div></div>
    </section>
    ${k ? `<section class="sect card"><h3>Empat sel tipologi</h3><p class="sub">Median dan interval 90 persen dari 3.000 iterasi Monte Carlo; VGF p90 adalah kebutuhan pada kondisi buruk satu dari sepuluh.</p>
      <div class="tbl-wrap" style="margin-top:10px"><table class="t"><thead><tr><th>Tipe</th><th class="n">Desa</th><th class="n">Organik diolah (t/th)</th><th class="n">Investasi</th><th class="n">VGF median</th><th class="n">VGF p90</th><th class="n">MAC (Rp/t CO₂e)</th><th class="n">Peluang swadana</th><th class="n">Pekerjaan</th><th>Tahap</th></tr></thead>
      <tbody>${cells.map((c) => `<tr><td><span class="chip t" style="background:${tcol(c.tipe)}">${esc(TIPE[c.tipe])}</span></td><td class="n">${num(c.n_desa)}</td><td class="n">${num(c.thr_p50)}<br><small class="muted">${num(c.thr_p05)}–${num(c.thr_p95)}</small></td>
        <td class="n">${short(c.capex_p50)}</td><td class="n">${short(c.vgf_capital_p50)}</td><td class="n">${short(c.vgf_capital_p90)}</td><td class="n">${num(c.mac_p50)}</td><td class="n">${pct(c.p_selffin)}</td><td class="n">${num(c.jobs_p50)}</td><td>${esc(TAHAP[c.phase])}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="sect grid g2">
      <div class="card"><h3>Ruang fiskal APBD 2018–2025</h3><p class="sub">Pangsa belanja modal, rasio SiLPA terhadap belanja, dan pangsa PAD (DJPK)</p><div class="chartbox" style="margin-top:10px"><canvas id="wApbd"></canvas></div></div>
      <div class="card"><h3>IDSD dan inklusi keuangan</h3><p class="sub">Skor IDSD BRIN 2022–2025 (1–5) dan Susenas 2021–2024 (persen rumah tangga)</p><div class="chartbox" style="margin-top:10px"><canvas id="wIdsd"></canvas></div></div>
    </section>` : ''}`;
  const mxK = Math.max(...kec.map((r) => r.org));
  table($('#wKec'), { rows: kec.map((r) => ({ ...r, nm: title(r.nama), kb: kabTitle(byKab[String(r.kab)]?.nama_kabupaten_kota || '') })), rowKey: 'kode', sortKey: 'org', limit: k ? 0 : 25,
    onRow: (r) => ctx.go('peta', { k: String(r.kab), kc: String(r.kode) }),
    columns: [{ key: 'nm', label: 'Kecamatan', fmt: (r) => `${esc(r.nm)}${k ? '' : `<br><small class="muted">${esc(r.kb)}</small>`}` }, { key: 'desa', label: 'Desa', n: true, fmt: (r) => num(r.desa) },
      { key: 'org', label: 'Organik (t)', n: true, fmt: (r) => cellbar(r.org, mxK, short(r.org)) }, { key: 'vgf', label: 'VGF', n: true, fmt: (r) => short(r.vgf * 1e6) },
      { key: 'dom', label: 'Tipe dominan', fmt: (r) => `<span class="chip t" style="background:${tcol(r.dom)}">T${r.dom}</span>` }] });
  table($('#wTop'), { rows: top.map((i) => ({ uid: D.uid[i], nm: title(D.bps_nama_desa_kelurahan[i]), kc: title(D.bps_nama_kecamatan[i]), org: D.timbulan_organik_ton_th_p50[i], t: D.tipe_desa[i], vgf: D.vgf_juta_rp[i] })), rowKey: 'uid', sortKey: 'org',
    onRow: (r) => ctx.go('peta', { desa: r.uid }),
    columns: [{ key: 'nm', label: 'Desa', fmt: (r) => `${esc(r.nm)}<br><small class="muted">Kec. ${esc(r.kc)}</small>` }, { key: 'org', label: 'Organik (t/th)', n: true, fmt: (r) => num(r.org) },
      { key: 'vgf', label: 'VGF', n: true, fmt: (r) => short(r.vgf * 1e6) }, { key: 't', label: 'Tipe', fmt: (r) => `<span class="chip t" style="background:${tcol(r.t)}">T${r.t}</span>` }] });
  if (k) drawFiscal(k);
}

async function drawFiscal(k) {
  Chart ||= await store.chartjs(); chartTheme(Chart);
  const s = k.seri, yrs = s.tahun.map(String), sub = (key) => s[key] || yrs.map(() => null);
  const line = (label, data, color, dash) => ({ label, data, borderColor: color, backgroundColor: color, tension: 0.25, pointRadius: 2.5, borderDash: dash || [], spanGaps: true });
  chart($('#wApbd'), { type: 'line', data: { labels: yrs, datasets: [
    line('Pangsa belanja modal', sub('pangsa_belanja_modal').map((v) => (ok(v) ? v * 100 : null)), css('--brand3')),
    line('Rasio SiLPA terhadap belanja', sub('rasio_silpa_belanja').map((v) => (ok(v) ? v * 100 : null)), '#e3a51c'),
    line('Pangsa PAD', sub('pangsa_pad').map((v) => (ok(v) ? v * 100 : null)), css('--sky'), [4, 3])] },
  options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${num(c.raw, 1)} persen` } } }, scales: { y: { title: { display: true, text: 'persen' } }, x: { grid: { display: false } } } } }, Chart);
  const keep = yrs.map((y) => +y >= 2021), f = (arr, m = 1) => arr.filter((_, j) => keep[j]).map((v) => (ok(v) ? v * m : null));
  chart($('#wIdsd'), { type: 'line', data: { labels: yrs.filter((_, j) => keep[j]), datasets: [
    { ...line('Skor IDSD', f(sub('skor_idsd')), css('--brand3')), yAxisID: 'y' },
    { ...line('Pengelolaan lingkungan', f(sub('skor_pengelolaan_lingkungan_idsd')), css('--t3')), yAxisID: 'y' },
    { ...line('Kapasitas fiskal', f(sub('skor_kapasitas_fiskal_idsd')), css('--t4')), yAxisID: 'y' },
    { ...line('Memiliki tabungan (%)', f(sub('pangsa_memiliki_tabungan'), 100), css('--ember'), [4, 3]), yAxisID: 'y2' },
    { ...line('Mengakses kredit (%)', f(sub('pangsa_mengakses_kredit'), 100), '#a46a00', [2, 2]), yAxisID: 'y2' }] },
  options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { min: 1, max: 5, title: { display: true, text: 'skor IDSD' } }, y2: { position: 'right', min: 0, title: { display: true, text: 'persen' }, grid: { display: false } }, x: { grid: { display: false } } } } }, Chart);
}
