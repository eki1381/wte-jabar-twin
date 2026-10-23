// Skenario: browser re-computation of the 84 cells under user-set fiscal envelopes and prices, compared with
// the paper's linear programme; the setting is encoded in the URL so a scenario can be shared.
import { num, pct, rp, short, esc, kabTitle } from '../fmt.js';
import { $, $$, css, tcol, TIPE, copy, chartTheme, chart } from '../ui.js';
import { PRESET, BASE } from '../sim.js';
import * as simstate from '../simstate.js';
import { footer } from './ringkasan.js';

const SL = [
  { k: 'alpha', u: 'a', label: 'Bagian belanja modal kab/kota per tahun', min: 0, max: 0.1, step: 0.005, f: (v) => `${num(v * 100, 1)}%` },
  { k: 'silpa', u: 's', label: 'Bagian SiLPA 2025 kab/kota (sekali)', min: 0, max: 0.3, step: 0.01, f: (v) => `${num(v * 100)}%` },
  { k: 'dd', u: 'dd', label: 'Bagian Dana Desa per tahun (T2 dan T4)', min: 0, max: 0.1, step: 0.005, f: (v) => `${num(v * 100, 1)}%` },
  { k: 'bk', u: 'bk', label: 'Bagian bantuan keuangan provinsi per tahun', min: 0, max: 0.2, step: 0.01, f: (v) => `${num(v * 100)}%` },
  { k: 'tip', u: 'tip', label: 'Tipping fee TPA', min: 100000, max: 450000, step: 10000, f: (v) => rp(v) + '/t' },
  { k: 'pc', u: 'pc', label: 'Harga karbon', min: 0, max: 300000, step: 10000, f: (v) => rp(v) + '/t CO₂e' },
  { k: 'capm', u: 'cap', label: 'Tangkapan relatif terhadap desain', min: 0.5, max: 1.3, step: 0.05, f: (v) => `${num(v * 100)}%` },
  { k: 'cm', u: 'cm', label: 'Pengali biaya investasi', min: 0.6, max: 1.6, step: 0.05, f: (v) => num(v, 2) + '×' },
  { k: 'r', u: 'r', label: 'Tingkat diskonto', min: 0.06, max: 0.14, step: 0.005, f: (v) => `${num(v * 100, 1)}%` },
];
const P = simstate.P;
let el, ctx, store, C, K, PV, Chart, timer;

export async function mount(root, c) {
  el = root; ctx = c; store = c.store;
  [C, K, PV] = await Promise.all([store.sel(), store.kab(), store.prov()]);
  const k = PV.kpi;
  const kp = (v, d, unit, lab, col) => `<div class="kpi" style="--kc:${col}"><b>${num(v[1] / d, 2)}<small>${unit}</small></b><span>${lab}</span><em>interval 90%: ${num(v[0] / d, 2)}–${num(v[2] / d, 2)}</em></div>`;
  el.innerHTML = `<div class="wrap">
    <div class="page-head"><div class="kicker">Skenario pembiayaan 2026–2030</div><h1>Berapa dana publik yang dibutuhkan, dan dari pos mana?</h1>
      <p class="lead">Angka provinsi berasal dari model paper (Monte Carlo 3.000 iterasi, program linear di bawah amplop fiskal). Simulator menghitung ulang 84 sel kabupaten/kota kali tipe di peramban, sehingga pengaruh setiap asumsi kebijakan langsung terlihat.</p></div>
    <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      ${kp(k.organik_dialihkan_ton_th, 1e6, 'juta t', 'organik dialihkan per tahun', 'var(--leaf)')}
      ${kp(k.emisi_dihindari_tunak_t, 1e6, 'juta t', 'CO₂e dihindari per tahun, tunak', 'var(--sky)')}
      ${kp(k.vgf_rp, 1e12, 'triliun', 'rupiah VGF lima tahun, median total', 'var(--accent)')}
      ${kp(k.pekerjaan, 1e3, 'ribu', 'pekerjaan langsung', 'var(--ember)')}
    </div>
    <section class="sect split">
      <div class="card">
        <div class="card-head"><div><h3>Simulator</h3><p class="sub">Pilih preset atau geser asumsi</p></div>
          <div style="display:flex;gap:6px"><button class="btn-s" id="sReset">Atur ulang</button><button class="btn-s solid" id="sShare"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>Bagikan</button></div></div>
        <div class="pills" id="sPreset" style="margin-bottom:16px">${Object.keys(PRESET).map((p) => `<button class="pill s" data-p="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</div>
        <div class="sliders">${SL.map((s) => `<label class="sl"><span class="top"><span>${esc(s.label)}</span><output id="o_${s.k}"></output></span><input type="range" id="s_${s.k}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`).join('')}</div>
        <div style="margin-top:18px"><div style="display:flex;justify-content:space-between;font-size:13px"><b>Potensi abatemen terdanai</b><b id="sShare2"></b></div><div class="gauge"><i id="sGauge"></i></div></div>
        <div class="sim-out" id="sOut"></div>
        <p class="note">${esc(PV.parameter_skenario.catatan)}</p>
      </div>
      <div class="card"><h3>Kurva pasokan abatemen</h3><p class="sub">Sel diurutkan dari VGF per t CO₂e terendah; garis putus: amplop publik pada pengaturan simulator</p>
        <div class="chartbox tall" style="margin-top:10px"><canvas id="sSupply" aria-label="Kurva pasokan abatemen"></canvas></div>
        <div class="h4">Pembanding program linear paper</div>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Skenario</th><th class="n">Abatemen terdanai</th><th class="n">Dana Desa</th><th class="n">APBD kab/kota</th><th class="n">Provinsi</th><th class="n">Swasta</th></tr></thead><tbody>
          ${Object.entries(PV.skenario).map(([n, s]) => `<tr><td>${n[0].toUpperCase() + n.slice(1)}</td><td class="n">${pct(s.ghg_share, 1)}</td><td class="n">${short(s.used_dd)}</td><td class="n">${short(s.used_kab)}</td><td class="n">${short(s.used_bk)}</td><td class="n">${short(s.private_capex)}</td></tr>`).join('')}</tbody></table></div>
      </div>
    </section>
    <section class="sect card"><h3>Kesenjangan VGF per kabupaten/kota</h3><p class="sub">Lima tahun, pada pengaturan simulator. Klik batang untuk membuka profil wilayah.</p><div class="chartbox" style="height:560px;margin-top:10px"><canvas id="sKab" aria-label="Kesenjangan per kabupaten/kota"></canvas></div></section>
    ${footer()}</div>`;
  $$('#sPreset .pill').forEach((b) => (b.onclick = () => { Object.assign(P, PRESET[b.dataset.p]); syncUI(); run(); }));
  SL.forEach((s) => ($('#s_' + s.k).oninput = (e) => { P[s.k] = +e.target.value; syncUI(); run(); }));
  $('#sReset').onclick = () => { Object.assign(P, BASE); syncUI(); run(); };
  $('#sShare').onclick = () => copy(location.href, 'Tautan skenario disalin');
  addEventListener('tema', () => { if (!el.hidden) draw(simstate.run(C, K)); });
}

export function update(params) {
  for (const s of SL) if (params[s.u] != null && !isNaN(+params[s.u])) P[s.k] = Math.min(s.max, Math.max(s.min, +params[s.u]));
  syncUI(); run(true);
}

function syncUI() {
  SL.forEach((s) => { const i = $('#s_' + s.k); i.value = P[s.k]; $('#o_' + s.k).textContent = s.f(P[s.k]); });
  const match = Object.entries(PRESET).find(([, v]) => Object.entries({ ...BASE, ...v }).every(([k, x]) => Math.abs(P[k] - x) < 1e-9));
  $$('#sPreset .pill').forEach((b) => b.setAttribute('aria-pressed', match?.[0] === b.dataset.p));
}
function run(now) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const sim = simstate.run(C, K), t = sim.tot, base = PV.skenario.dasar;
    const params = Object.fromEntries(SL.filter((s) => Math.abs(P[s.k] - BASE[s.k]) > 1e-9).map((s) => [s.u, P[s.k]]));
    ctx.setParams('skenario', params);
    const d = (v, b, f) => { const x = v - b; return Math.abs(x) < 1e-6 * Math.max(1, Math.abs(b)) ? '' : `<em class="${x > 0 ? 'up' : 'down'}">${x > 0 ? '▲' : '▼'} ${f(Math.abs(x))} vs dasar</em>`; };
    $('#sShare2').textContent = pct(t.ghg_share);
    $('#sGauge').style.width = (100 * t.ghg_share).toFixed(1) + '%';
    $('#sOut').innerHTML = `
      <div><b>${num(t.ghg / 1e6, 2)} juta t</b><span>CO₂e per tahun dari sel terdanai</span>${d(t.ghg, base.ghg_achieved, (x) => num(x / 1e6, 2) + ' jt t')}</div>
      <div><b>${rp(t.vgf_need)}</b><span>kebutuhan VGF; amplop publik ${short(t.env.kab + t.env.dd + t.env.bk)}</span></div>
      <div><b>${rp(t.public)}</b><span>dana publik terpakai: kab/kota ${short(t.used_kab)}, Dana Desa ${short(t.used_dd)}, provinsi ${short(t.used_bk)}</span></div>
      <div><b>${rp(t.private)}</b><span>investasi swasta dan perbankan yang ikut bergerak</span>${d(t.private, base.private_capex, short)}</div>
      <div><b>${t.full} dari 84</b><span>sel terdanai penuh atau swadana; ${t.partial} sebagian, ${t.none} belum</span></div>
      <div><b>${num(t.jobs)}</b><span>pekerjaan langsung; ${num(t.thr / 1e6, 2)} juta t organik per tahun</span>${d(t.jobs, base.jobs, (x) => num(x))}</div>`;
    draw(sim);
  }, now ? 0 : 40);
}

async function draw(sim) {
  Chart ||= await store.chartjs(); chartTheme(Chart);
  const pts = PV.kurva_pasokan, col = { 1: '#0d3b2c', 2: '#3f9a72', 3: '#e3a51c' }, envT = (sim.tot.env.kab + sim.tot.env.dd + sim.tot.env.bk) / 1e12;
  const maxX = Math.max(...pts.map((q) => q.cum_ghg)) / 1e6;
  const kn = (id) => kabTitle(K.find((x) => x.kode_kabupaten_kota === id)?.nama_kabupaten_kota || id);
  chart($('#sSupply'), { type: 'scatter', data: { datasets: [
    ...[1, 2, 3].map((p) => ({ label: `Tahap ${p}`, showLine: false, pointRadius: 3.6, pointHoverRadius: 6, backgroundColor: col[p], borderColor: col[p],
      data: pts.filter((q) => q.phase === p).map((q) => ({ x: q.cum_ghg / 1e6, y: q.cum_vgf / 1e12, cell: q.cell, tipe: q.tipe })) })),
    { label: 'Amplop publik simulator', type: 'line', data: [{ x: 0, y: envT }, { x: maxX, y: envT }], borderColor: css('--ember'), borderDash: [6, 4], borderWidth: 2, pointRadius: 0 }] },
  options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => (c.raw.cell ? `${kn(c.raw.cell.split('_')[0])}, ${TIPE[c.raw.tipe]}: kumulatif ${num(c.raw.x, 2)} juta t, ${num(c.raw.y, 2)} triliun` : `Amplop ${num(envT, 2)} triliun`) } } },
    scales: { x: { title: { display: true, text: 'emisi dihindari kumulatif (juta t CO₂e per tahun)' }, min: 0 }, y: { title: { display: true, text: 'VGF kumulatif (triliun rupiah)' }, min: 0 } } } }, Chart);
  const b = sim.byKab, ks = Object.keys(b).sort((x, y) => b[y].need - b[x].need);
  chart($('#sKab'), { type: 'bar', data: { labels: ks.map(kn), datasets: [
    { label: 'VGF terdanai', data: ks.map((k) => b[k].used / 1e9), backgroundColor: css('--brand3'), borderRadius: 3 },
    { label: 'VGF belum terdanai', data: ks.map((k) => Math.max(b[k].need - b[k].used, 0) / 1e9), backgroundColor: '#e3a51c', borderRadius: 3 }] },
  options: { indexAxis: 'y', onClick: (_, els) => { if (els[0]) ctx.go('wilayah', { kab: ks[els[0].index] }); },
    plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: Rp${num(c.raw, 1)} miliar` } } },
    scales: { x: { stacked: true, title: { display: true, text: 'miliar rupiah, lima tahun' } }, y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, font: { size: 11 } } } } } }, Chart);
}
