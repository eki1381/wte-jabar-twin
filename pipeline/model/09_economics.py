"""Step 9. Regional economic analysis at kabkota x type cells (27 x 4):
 1. Cell level Monte Carlo: abatement, jobs, capex, annualised net cost, break even gate fee, avoided disposal cost
    (tipping plus distance based transport), marginal abatement cost (MAC) and fiscal net effect
 2. MACC and viability gap funding (VGF) optimisation (linear programme) under explicit fiscal envelopes
    from APBD kab/kota (belanja modal, SiLPA), Dana Desa and provincial Bantuan Keuangan
 3. NTL as economic activity proxy: association with IDSD PDRB score and with APBD capital spending (panel FE)
"""
import pandas as pd, numpy as np, json, re
from scipy.optimize import linprog
from scipy import stats
import pyfixest as pf
rng = np.random.default_rng(99)
OUT = '/home/claude/wte/out'; U = '/root/.claude/uploads/8575afab-4bf0-5ac1-ac64-ec19a70d5fc5'
F = pd.read_parquet(f'{OUT}/desa_final.parquet'); F['idkab'] = F.idkab.astype(str)
ORG = np.load(f'{OUT}/mc_org.npy'); FOOD = np.load(f'{OUT}/mc_food.npy'); N = ORG.shape[1]
exec(open('/home/claude/wte/04_impact.py').read().split("F['umk'] =")[0].split("UMK = ")[1].join(['UMK = ', '']) if False else '')
UMK = {'3275': 5690752.95, '3215': 5599593.21, '3216': 5558515.10, '3276': 5195721.78, '3271': 5126897.22, '3201': 4877211.17,
       '3214': 4792252.92, '3273': 4482914.09, '3277': 3863692.00, '3204': 3757284.86, '3217': 3736741.00, '3211': 3732088.02,
       '3202': 3604482.92, '3213': 3508626.53, '3203': 3104583.63, '3272': 3018634.94, '3278': 2801962.82, '3212': 2794237.00,
       '3206': 2699992.26, '3274': 2697685.47, '3209': 2681382.45, '3210': 2404632.62, '3205': 2328555.41, '3207': 2225279.16,
       '3218': 2221724.19, '3208': 2209519.29, '3279': 2204754.48}
MOD = {1: dict(cap=(0.40, 0.60), ad=0.75, elec=1.0, sw=(0.80, 0.95), mcf=(0.6, 0.8), bsf=0.2, jad=(5.9, 25, 60), jcp=(5.9, 20, 45)),
       2: dict(cap=(0.35, 0.55), ad=0.50, elec=0.0, sw=(0.65, 0.85), mcf=(0.5, 0.8), bsf=0.3, jad=(13.6, 70, 115), jcp=(13.6, 60, 85)),
       3: dict(cap=(0.45, 0.65), ad=0.70, elec=0.5, sw=(0.60, 0.85), mcf=(0.5, 0.8), bsf=0.3, jad=(13.6, 45, 90), jcp=(13.6, 40, 85)),
       4: dict(cap=(0.30, 0.50), ad=0.30, elec=0.0, sw=(0.25, 0.50), mcf=(0.4, 0.6), bsf=0.3, jad=(13.6, 70, 115), jcp=(13.6, 60, 85))}
PMR = F[F.tipe > 0].groupby('tipe').pmr.quantile(0.9).to_dict()
USD = 16000.0
S = F[F.tipe > 0].copy()
S['cell'] = S.idkab + '_' + S.tipe.astype(str)
cells = S.groupby('cell').agg(idkab=('idkab', 'first'), tipe=('tipe', 'first'), n_desa=('uid', 'size'), pop=('pop', 'sum'),
                              dist_km=('dist_tpa_m', lambda s: np.average(s / 1000, weights=S.loc[s.index, 'ORG_mean']))).reset_index()
idx = {c: np.where(S.cell.values == c)[0] for c in cells.cell}
uid_rows = S.index.values  # F index equals uid order
ORGc = np.stack([ORG[uid_rows[idx[c]]].sum(0) for c in cells.cell]); FOODc = np.stack([FOOD[uid_rows[idx[c]]].sum(0) for c in cells.cell])
C = len(cells); ND = N
t_ = cells.tipe.values; wage = cells.idkab.map(UMK).values * 13 * 1.1
def draw(a, b): return rng.uniform(a, b, ND)
def tri(a, c, b): return rng.triangular(a, c, b, ND)
p = dict(vs=draw(.18, .24), bmp=draw(.30, .45), eff=draw(.70, .90), eta=draw(.30, .38), efg=tri(.80, .87, .90),
         ad_ch4=tri(0, .8, 8) / 1000, cp_ch4=tri(.03, 4, 8) / 1000, cp_n2o=tri(.06, .24, .6) / 1000, docf=draw(.45, .55), doc_food=draw(.08, .20),
         doc_green=draw(.18, .22), capex_ad=tri(50, 250, 670) * USD, capex_cp=tri(30, 80, 200) * USD, p_elec=draw(1000, 1450),
         p_lpg=draw(6000, 7000), p_comp=draw(300, 800), p_bsf=draw(4000, 7000), tip=draw(150000, 386000), c_tkm=draw(2000, 4000),
         p_c=tri(30000, 96000, 144000), r=draw(.08, .12), om=draw(.02, .05))
for t in MOD:
    for k in ['cap', 'sw', 'mcf']: p[f'{k}{t}'] = draw(*MOD[t][k])
    p[f'jad{t}'] = tri(*MOD[t]['jad']); p[f'jcp{t}'] = tri(*MOD[t]['jcp'])
g = lambda name: np.stack([p[f'{name}{t}'] for t in t_])  # C x ND
cap = g('cap'); sw = g('sw'); mcf = g('mcf'); jad = g('jad'); jcp = g('jcp')
adsh = np.array([MOD[t]['ad'] for t in t_])[:, None]; elec = np.array([MOD[t]['elec'] for t in t_])[:, None]
bsfsh = np.array([MOD[t]['bsf'] for t in t_])[:, None]; pmr = np.array([PMR[t] for t in t_])[:, None]
dfood = FOODc * cap; dgreen = (ORGc - FOODc) * cap
ad = dfood * adsh; cp = dfood * (1 - adsh) + dgreen; bsf = cp * bsfsh; comp = cp - bsf; thr = ad + cp
ch4 = ad * p['vs'] * p['bmp'] * 1000 * p['eff']
eel = ch4 * 9.97e-6 * elec * p['eta']; lpg = ch4 * (1 - elec) * 35.9 * 0.55 / (46.1 * 0.60) / 1000
base = (dfood * p['doc_food'] + dgreen * p['doc_green']) * sw * p['docf'] * mcf * 0.5 * 16 / 12 * 28
proj = (ad * p['ad_ch4'] + cp * p['cp_ch4']) * 28 + cp * p['cp_n2o'] * 265
ghg = base + eel * 1000 * p['efg'] + lpg * 2.985 - proj
jobs = ad / 1e4 * jad + cp / 1e4 * jcp
capex = (ad * p['capex_ad'] + cp * p['capex_cp']) * pmr
opex = jobs * wage[:, None] + p['om'] * capex
rev = eel * 1e6 * p['p_elec'] + lpg * 1000 * p['p_lpg'] + (comp * 0.35 + ad * 0.25) * 1000 * p['p_comp'] + bsf * 0.15 * 1000 * p['p_bsf']
crf = p['r'] / (1 - (1 + p['r']) ** -15)
ann = capex * crf + opex - rev                     # annualised net cost before carbon and avoided disposal
avoid_unit = p['tip'] + 2 * cells.dist_km.values[:, None] * p['c_tkm']
avoid = thr * sw * avoid_unit                      # disposal cost saved only on the share that is collected today
fee_be = (ann - ghg * p['p_c']) / thr
mac = (ann - avoid) / np.where(ghg > 1, ghg, np.nan)   # social MAC, Rp per t CO2e
fiscal_net = fee_be * thr - avoid                  # positive = viability gap per year
q = lambda A: np.nanpercentile(A, [5, 50, 95], axis=1)
# per cell means of additive components (internally consistent coefficients for the browser scenario engine)
_m = lambda A: A.mean(1)
cm = cells[['cell', 'idkab', 'tipe', 'n_desa', 'pop', 'dist_km']].copy()
cm['thr'] = _m(thr); cm['capex'] = _m(capex); cm['labor'] = _m(jobs * wage[:, None]); cm['om_rate'] = float(p['om'].mean())
cm['rev'] = _m(rev); cm['ghg'] = _m(ghg); cm['jobs'] = _m(jobs); cm['sw'] = _m(sw); cm['eel_gwh'] = _m(eel); cm['lpg_t'] = _m(lpg)
cm['ad_t'] = _m(ad); cm['cp_t'] = _m(cp); cm['ch4_m3'] = _m(ch4)
cm.to_csv(f'{OUT}/cells_means.csv', index=False)
out = cells.copy()
for nm, A in dict(thr=thr, ghg=ghg, jobs=jobs, capex=capex, opex=opex, ann=ann, avoid=avoid, fee_be=fee_be, avoid_unit=avoid_unit, mac=mac,
                  gap=fiscal_net, eel=eel, lpg=lpg).items():
    lo, md, hi = q(A); out[f'{nm}_p05'] = lo; out[f'{nm}_p50'] = md; out[f'{nm}_p95'] = hi
out['p_selffin'] = (fiscal_net <= 0).mean(1)          # probability the cell needs no public capital (gate fee within avoided cost)
VGF = np.clip(fiscal_net, 0, None) / crf         # capital grant equivalent of the gap (C x ND)
out['vgf_capital_p50'] = np.median(VGF, axis=1)
out['vgf_capital_p90'] = np.percentile(VGF, 90, axis=1)
out['jobs_per_bn_capex'] = out.jobs_p50 / (out.capex_p50 / 1e9)
out = out.sort_values('mac_p50').reset_index(drop=True)
out.to_csv(f'{OUT}/cells_economics.csv', index=False)
res = {}
tot = lambda A: np.percentile(A.sum(0), [5, 50, 95])
res['province'] = dict(ghg=tot(ghg).round(-3).tolist(), avoid=tot(avoid).round(-9).tolist(), ann=tot(ann).round(-9).tolist(),
                       gap=tot(fiscal_net).round(-9).tolist(), capex=tot(capex).round(-9).tolist(),
                       p_province_selffin=float((fiscal_net.sum(0) <= 0).mean()))
res['by_type'] = {int(t): dict(mac_p50=float(np.nanmedian(((ann - avoid)[t_ == t].sum(0)) / ghg[t_ == t].sum(0))),
                               fee_be_p50=float(np.median(((ann - ghg * p['p_c'])[t_ == t].sum(0)) / thr[t_ == t].sum(0))),
                               avoid_unit_p50=float(np.median(avoid[t_ == t].sum(0) / thr[t_ == t].sum(0))),
                               vgf_p50=float(np.median(VGF[t_ == t].sum(0))), capex_p50=float(np.median(capex[t_ == t].sum(0))),
                               p_selffin=float((fiscal_net[t_ == t].sum(0) <= 0).mean()),
                               jobs_per_bn=float(np.median(jobs[t_ == t].sum(0) / (capex[t_ == t].sum(0) / 1e9)))) for t in [1, 2, 3, 4]}
vt = VGF.sum(0)
res['vgf_total'] = np.percentile(vt, [5, 50, 90, 95]).round(-9).tolist()
res['n_cells'] = int(C); res['cells_selffin_p50'] = int((out.gap_p50 <= 0).sum())
res['cells_mac_negative'] = int((out.mac_p50 < 0).sum())
res['ghg_share_mac_negative'] = float(out.loc[out.mac_p50 < 0, 'ghg_p50'].sum() / out.ghg_p50.sum())
print(json.dumps(res, indent=1))

# ---------------- fiscal envelopes ----------------
A = pd.read_csv(f'{OUT}/apbd_panel.csv', dtype={'kab': str})
a25 = A[A.year == 2025].set_index('kab')
kabs = sorted(UMK)
n_poly = F[F.nonsettle == 0].groupby('idkab').size()
is_kab = pd.Series({k: int(k) < 3270 for k in kabs})
DD_TOTAL = 6.19e12  # Dana Desa Jawa Barat 2024
dd_kab = (n_poly[is_kab[is_kab].index] / n_poly[is_kab[is_kab].index].sum() * DD_TOTAL).reindex(kabs).fillna(0)
BK_PROV_2025 = 2540464161181.0
SCEN = {'konservatif': dict(alpha=0.01, silpa=0.03, dd=0.01, bk=0.02), 'dasar': dict(alpha=0.03, silpa=0.10, dd=0.03, bk=0.05), 'ambisius': dict(alpha=0.05, silpa=0.20, dd=0.05, bk=0.10)}
YEARS = 5
res['envelopes'] = {}
lp_out = {}
for sname, sc in SCEN.items():
    env_kab = (sc['alpha'] * a25.cap.reindex(kabs) * YEARS + sc['silpa'] * a25.silpa.reindex(kabs)).fillna(0)
    env_dd = sc['dd'] * dd_kab * YEARS
    env_bk = sc['bk'] * BK_PROV_2025 * YEARS
    # decision variables: x_c (implementation share) and funding flows f_kab_c, f_dd_c, f_bk_c for the capital viability gap
    o = out.copy(); o['vgf'] = o.vgf_capital_p50
    nC = len(o); nv = 4 * nC
    # maximise abatement: minimise -ghg*x ; tiny penalty on public funds to prefer lower use
    cvec = np.r_[-o.ghg_p50.values, np.full(nC, 2e-12), np.full(nC, 1e-12), np.full(nC, 3e-12)]  # prefer Dana Desa, then kab/kota, province as backstop
    Aeq = np.zeros((nC, nv)); beq = np.zeros(nC)
    for i in range(nC):
        Aeq[i, i] = -o.vgf.iloc[i]; Aeq[i, nC + i] = 1; Aeq[i, 2 * nC + i] = 1; Aeq[i, 3 * nC + i] = 1
    Aub, bub = [], []
    for k in kabs:
        row = np.zeros(nv); m = (o.idkab == k).values; row[nC:2 * nC][m] = 1; Aub.append(row); bub.append(env_kab[k])
        row = np.zeros(nv); m2 = m & o.tipe.isin([2, 4]).values; row[2 * nC:3 * nC][m2] = 1; Aub.append(row); bub.append(env_dd[k])
    row = np.zeros(nv); row[3 * nC:] = 1; Aub.append(row); bub.append(env_bk)
    # Dana Desa only for type 2 and 4 cells in kabupaten
    bounds = [(0, 1)] * nC + [(0, None)] * nC + [(0, None) if (o.tipe.iloc[i] in (2, 4) and is_kab[o.idkab.iloc[i]]) else (0, 0) for i in range(nC)] + [(0, None)] * nC
    sol = linprog(cvec, A_ub=np.array(Aub), b_ub=np.array(bub), A_eq=Aeq, b_eq=beq, bounds=bounds, method='highs')
    x = sol.x[:nC]; o['x'] = x; o['f_kab'] = sol.x[nC:2 * nC]; o['f_dd'] = sol.x[2 * nC:3 * nC]; o['f_bk'] = sol.x[3 * nC:]
    ghg_all = o.ghg_p50.sum()
    lp_out[sname] = o
    res['envelopes'][sname] = dict(env_kab_total=float(env_kab.sum()), env_dd_total=float(env_dd.sum()), env_bk=float(env_bk),
                                   vgf_total_need=float(o.vgf.sum()), ghg_achieved=float((o.ghg_p50 * x).sum()), ghg_share=float((o.ghg_p50 * x).sum() / ghg_all),
                                   thr_achieved=float((o.thr_p50 * x).sum()), jobs=float((o.jobs_p50 * x).sum()),
                                   used_kab=float(o.f_kab.sum()), used_dd=float(o.f_dd.sum()), used_bk=float(o.f_bk.sum()),
                                   private_capex=float((o.capex_p50 * x).sum() - (o.f_kab + o.f_dd + o.f_bk).sum()),
                                   cells_full=int((x > 0.99).sum()), cells_partial=int(((x > 0.01) & (x <= 0.99)).sum()))
    o.to_csv(f'{OUT}/lp_{sname}.csv', index=False)
for sname, sc in SCEN.items():
    env_total = sc['alpha'] * a25.cap.sum() * YEARS + sc['silpa'] * a25.silpa.sum() + sc['dd'] * DD_TOTAL * YEARS + sc['bk'] * BK_PROV_2025 * YEARS
    res['envelopes'][sname]['p_cover_vgf'] = float((vt <= env_total).mean())
print(json.dumps(res['envelopes'], indent=1))
# public funds supply curve: cells sorted by VGF per t CO2e
sc_ = out.assign(vpt=out.vgf_capital_p50 / out.ghg_p50).sort_values('vpt')
sc_['cum_ghg'] = sc_.ghg_p50.cumsum(); sc_['cum_vgf'] = sc_.vgf_capital_p50.cumsum()
sc_.to_csv(f'{OUT}/supply_curve.csv', index=False)
res['supply_curve'] = dict(ghg_at_zero_vgf=float(sc_.loc[sc_.vgf_capital_p50 <= 1e6, 'ghg_p50'].sum()), share_ghg_zero_vgf=float(sc_.loc[sc_.vgf_capital_p50 <= 1e6, 'ghg_p50'].sum() / sc_.ghg_p50.sum()),
                           vgf_for_80pct=float(sc_.loc[sc_.cum_ghg <= 0.8 * sc_.ghg_p50.sum(), 'cum_vgf'].max()))
# kab level plan (base scenario)
o = lp_out['dasar']
kp = o.assign(ghg_x=o.ghg_p50 * o.x, thr_x=o.thr_p50 * o.x, jobs_x=o.jobs_p50 * o.x, capex_x=o.capex_p50 * o.x).groupby('idkab').agg(
    ghg=('ghg_x', 'sum'), thr=('thr_x', 'sum'), jobs=('jobs_x', 'sum'), capex=('capex_x', 'sum'), f_kab=('f_kab', 'sum'), f_dd=('f_dd', 'sum'),
    f_bk=('f_bk', 'sum'), vgf=('vgf', 'sum'), ghg_pot=('ghg_p50', 'sum'))
kp['impl_share'] = kp.ghg / kp.ghg_pot
kp.to_csv(f'{OUT}/lp_kab_plan_dasar.csv')
print((kp[['capex','vgf','f_kab','f_dd','f_bk']]/1e9).round(1).join(kp[['ghg','thr','jobs','impl_share']].round(2)).to_string())

# ---------------- NTL and the regional economy ----------------
G = pd.read_parquet(f'{OUT}/gee_annual.parquet').merge(F[['uid', 'idkab', 'area_km2', 'nonsettle']], on='uid')
ks = []
for y in [2022, 2023, 2024, 2025]:
    tmp = G.assign(s=G[f'ntl_{y}'] * G.area_km2).groupby('idkab').s.sum().rename('ntl_sum').reset_index(); tmp['year'] = y; ks.append(tmp)
KN = pd.concat(ks)
I = pd.read_csv(f'{OUT}/idsd_panel.csv', dtype={'kab': str})
def idsd_pdrb(f, sh, year):
    d = pd.read_excel(f'{U}/{f}', sheet_name=sh, header=None); hdr = d.iloc[:6].astype(str)
    kcol = [c for c in d.columns if hdr[c].str.contains('Kode KabKota').any()][0]
    pc = [c for c in d.columns if (hdr[c].str.strip() == '10.01').any()][0]
    return pd.DataFrame([dict(kab=str(r[kcol]).split('.')[0], year=year, pdrb_score=pd.to_numeric(r[pc], errors='coerce')) for _, r in d.iterrows() if str(r[kcol]).split('.')[0] in UMK])
PD = pd.concat([idsd_pdrb('ffc49c79-Skor_IDSD_2022_Prov-Kab-Kota_LENGKAP_value_update_Mei_2023.xlsx', 'Indeks KabKota', 2022),
                idsd_pdrb('a689181c-Skor_IDSD_2023_Prov-Kab-Kota_Update_Agustus_2024.xlsx', 'Nilai Indeks KabKota', 2023),
                idsd_pdrb('a4a36d06-Value_SKOR_IDSD_2024_April_2025_150425.xlsx', 'SKOR_KabKota', 2024),
                idsd_pdrb('42ba253e-VALUE_IDSD_2025_24022026.xlsx', 'SKOR_KabKota', 2025)])
X = KN.rename(columns={'idkab': 'kab'}).merge(PD, on=['kab', 'year']).merge(A.rename(columns={'year': 'year'}), on=['kab', 'year'])
X['lntl'] = np.log(X.ntl_sum); X['lcap'] = np.log(X.cap); X['lpad'] = np.log(X.pad); X['lexp'] = np.log(X.exp)
Al = A.copy(); Al['year'] = Al.year + 1; Al = Al.rename(columns={'cap': 'cap_l1', 'exp': 'exp_l1'})[['kab', 'year', 'cap_l1', 'exp_l1']]
X = X.merge(Al, on=['kab', 'year'], how='left'); X['lcap_l1'] = np.log(X.cap_l1); X['cap_sh_l1'] = X.cap_l1 / X.exp_l1
res['ntl_econ'] = dict(spearman_ntl_pdrbscore_2025=round(stats.spearmanr(X[X.year == 2025].ntl_sum, X[X.year == 2025].pdrb_score)[0], 3),
                       spearman_ntl_exp_2025=round(stats.spearmanr(X[X.year == 2025].ntl_sum, X[X.year == 2025].exp)[0], 3),
                       ntl_growth_22_25_prov=round(float(KN[KN.year == 2025].ntl_sum.sum() / KN[KN.year == 2022].ntl_sum.sum() - 1), 3))
m1 = pf.feols('lntl ~ lcap_l1 + lpad | kab + year', data=X.dropna(subset=['lcap_l1']), vcov={'CRV1': 'kab'})
m2 = pf.feols('lntl ~ cap_sh_l1 | kab + year', data=X.dropna(subset=['cap_sh_l1']), vcov={'CRV1': 'kab'})
tb1 = m1.tidy(); tb2 = m2.tidy()
res['ntl_econ']['fe_lntl_lcap_l1'] = dict(b=round(float(tb1.loc['lcap_l1', 'Estimate']), 4), se=round(float(tb1.loc['lcap_l1', 'Std. Error']), 4), p=round(float(tb1.loc['lcap_l1', 'Pr(>|t|)']), 4), n=int(m1._N))
res['ntl_econ']['fe_lntl_lpad'] = dict(b=round(float(tb1.loc['lpad', 'Estimate']), 4), p=round(float(tb1.loc['lpad', 'Pr(>|t|)']), 4))
res['ntl_econ']['fe_lntl_capshare_l1'] = dict(b=round(float(tb2.loc['cap_sh_l1', 'Estimate']), 4), p=round(float(tb2.loc['cap_sh_l1', 'Pr(>|t|)']), 4), n=int(m2._N))
print(json.dumps(res['ntl_econ'], indent=1))
res['dd_kab'] = dd_kab.round(-6).to_dict(); res['bk_prov_2025'] = BK_PROV_2025
json.dump(res, open(f'{OUT}/res_step9.json', 'w'), indent=1, default=float)
print(out[['cell', 'thr_p50', 'ghg_p50', 'mac_p50', 'fee_be_p50', 'avoid_unit_p50', 'p_selffin', 'vgf_capital_p50', 'jobs_p50']].round(0).head(40).to_string())
