// Browser scenario engine for the 84 cells (kab/kota x tipe desa).
// Annual viability gap per cell, following pipeline/model/09_economics.py:
//   ann   = capex * CRF + labour + om * capex - revenue
//   avoid = throughput * collected share * (tipping fee + 2 * distance * transport cost)
//   gap   = ann - avoided emissions * carbon price - avoid
//   VGF   = max(gap, 0) / CRF      (capital grant that closes the gap over 15 years)
// Mean coefficients are calibrated to the Monte Carlo median: the gap difference at base parameters is kept as a fixed correction.
// Allocation is greedy by VGF per t CO2e (Dana Desa for T2 and T4 in kabupaten first, then APBD kab/kota, then provincial transfer),
// which approximates the paper's linear programme.

export const BASE = { tip: 268000, ctkm: 3000, pc: 90000, r: 0.10, capm: 1, cm: 1, alpha: 0.03, silpa: 0.10, dd: 0.03, bk: 0.05 };
export const PRESET = {
  konservatif: { alpha: 0.01, silpa: 0.03, dd: 0.01, bk: 0.02 },
  dasar: { alpha: 0.03, silpa: 0.10, dd: 0.03, bk: 0.05 },
  ambisius: { alpha: 0.05, silpa: 0.20, dd: 0.05, bk: 0.10 },
};
const YEARS = 5, LIFE = 15, BK_2025 = 2540464161181;
const crfOf = (r) => r / (1 - Math.pow(1 + r, -LIFE));

function gapOf(c, P) {
  const crf = crfOf(P.r);
  const capex = c.capex_rerata * P.capm * P.cm;
  const thr = c.thr_rerata * P.capm;
  const ann = capex * crf + c.labor_rerata * P.capm + c.om_rate_rerata * capex - c.rev_rerata * P.capm;
  const avoid = thr * c.sw_rerata * (P.tip + 2 * c.dist_km * P.ctkm);
  return ann - c.ghg_rerata * P.capm * P.pc - avoid;
}

export function simulate(cells, kabs, P) {
  const crf = crfOf(P.r);
  const kabMap = Object.fromEntries(kabs.map((k) => [k.kode_kabupaten_kota, k]));
  const envKab = {}, envDD = {};
  for (const k of kabs) {
    envKab[k.kode_kabupaten_kota] = P.alpha * (k.cap_2025 || 0) * YEARS + P.silpa * (k.silpa_2025 || 0);
    envDD[k.kode_kabupaten_kota] = +k.kode_kabupaten_kota < 3270 ? P.dd * (k.dana_desa_2024_estimasi || 0) * YEARS : 0;
  }
  let envBK = P.bk * BK_2025 * YEARS;
  const env0 = { kab: Object.values(envKab).reduce((a, b) => a + b, 0), dd: Object.values(envDD).reduce((a, b) => a + b, 0), bk: envBK };

  const rows = cells.map((c) => {
    const corr = (c.gap_p50 - gapOf(c, BASE)) * P.capm;
    const gap = gapOf(c, P) + corr;
    const vgf = Math.max(gap, 0) / crf;
    const ghg = c.ghg_p50 * P.capm;
    return { cell: c.cell, idkab: c.idkab, tipe: c.tipe, vgf, gap, ghg, thr: c.thr_p50 * P.capm, jobs: c.jobs_p50 * P.capm,
      capex: c.capex_p50 * P.capm * P.cm, ratio: ghg > 0 ? vgf / ghg : Infinity, x: 0, f_dd: 0, f_kab: 0, f_bk: 0 };
  });
  const order = [...rows].sort((a, b) => a.ratio - b.ratio);
  for (const r of order) {
    if (!(r.ghg > 0)) continue;
    let need = r.vgf;
    if (need <= 0) { r.x = 1; continue; }
    if (r.tipe === 2 || r.tipe === 4) { const t = Math.min(need, envDD[r.idkab] || 0); r.f_dd = t; envDD[r.idkab] -= t; need -= t; }
    { const t = Math.min(need, envKab[r.idkab] || 0); r.f_kab = t; envKab[r.idkab] -= t; need -= t; }
    { const t = Math.min(need, envBK); r.f_bk = t; envBK -= t; need -= t; }
    r.x = 1 - need / r.vgf;
  }
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const ghgAll = sum((r) => Math.max(r.ghg, 0));
  const pub = sum((r) => r.f_dd + r.f_kab + r.f_bk);
  const tot = {
    vgf_need: sum((r) => r.vgf), ghg: sum((r) => r.ghg * r.x), ghg_share: sum((r) => r.ghg * r.x) / ghgAll,
    thr: sum((r) => r.thr * r.x), jobs: sum((r) => r.jobs * r.x), used_dd: sum((r) => r.f_dd), used_kab: sum((r) => r.f_kab), used_bk: sum((r) => r.f_bk),
    public: pub, private: sum((r) => r.capex * r.x) - pub, full: rows.filter((r) => r.x > 0.99).length,
    partial: rows.filter((r) => r.x > 0.01 && r.x <= 0.99).length, none: rows.filter((r) => r.x <= 0.01).length,
    selffin: rows.filter((r) => r.vgf <= 0).length, env: env0,
  };
  const byKab = {};
  for (const r of rows) {
    const b = (byKab[r.idkab] ||= { need: 0, used: 0, ghg: 0, ghgAll: 0, env: 0 });
    b.need += r.vgf; b.used += r.f_dd + r.f_kab + r.f_bk; b.ghg += r.ghg * r.x; b.ghgAll += Math.max(r.ghg, 0);
  }
  for (const k of kabs) if (byKab[k.kode_kabupaten_kota]) {
    const kk = k.kode_kabupaten_kota;
    byKab[kk].env = P.alpha * (k.cap_2025 || 0) * YEARS + P.silpa * (k.silpa_2025 || 0) + (+kk < 3270 ? P.dd * (k.dana_desa_2024_estimasi || 0) * YEARS : 0);
    byKab[kk].nama = kabMap[kk].nama_kabupaten_kota;
  }
  return { rows, tot, byKab, cellX: Object.fromEntries(rows.map((r) => [r.cell, r.x])) };
}
