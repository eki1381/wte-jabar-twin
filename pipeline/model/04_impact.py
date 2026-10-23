"""Step 4. Module assignment by type, IPCC FOD methane avoidance, energy recovery, jobs, and
financial and economic appraisal, all under Monte Carlo uncertainty."""
import pandas as pd, numpy as np, json
from scipy.optimize import brentq
rng = np.random.default_rng(11)
OUT = '/home/claude/wte/out'
F = pd.read_parquet(f'{OUT}/desa_model.parquet')
T = pd.read_parquet(f'{OUT}/typology.parquet')
F = F.merge(T, on='uid', how='left')
F['tipe'] = F.tipe.fillna(0).astype(int)  # 0 = non settlement polygons
ORG = np.load(f'{OUT}/mc_org.npy'); FOOD = np.load(f'{OUT}/mc_food.npy')
N = ORG.shape[1]
UMK = {'3275': 5690752.95, '3215': 5599593.21, '3216': 5558515.10, '3276': 5195721.78, '3271': 5126897.22, '3201': 4877211.17,
       '3214': 4792252.92, '3273': 4482914.09, '3277': 3863692.00, '3204': 3757284.86, '3217': 3736741.00, '3211': 3732088.02,
       '3202': 3604482.92, '3213': 3508626.53, '3203': 3104583.63, '3272': 3018634.94, '3278': 2801962.82, '3212': 2794237.00,
       '3206': 2699992.26, '3274': 2697685.47, '3209': 2681382.45, '3210': 2404632.62, '3205': 2328555.41, '3207': 2225279.16,
       '3218': 2221724.19, '3208': 2209519.29, '3279': 2204754.48}  # Kepgub Jabar 561.7/Kep.798-Kesra/2024
F['umk'] = F.idkab.astype(str).map(UMK)
TYPES = [1, 2, 3, 4]
# module design per type: capture range of organic (source separated and diverted), share of diverted food to AD,
# share of AD methane used for electricity (rest cooking gas), baseline share landfilled, MCF range, BSF share of non AD stream
MOD = {
    1: dict(name='Hub biogas perkotaan', cap=(0.40, 0.60), ad=0.75, elec=1.0, p_swds=(0.80, 0.95), mcf=(0.6, 0.8), bsf=0.2, jad=(5.9, 25, 60), jcp=(5.9, 20, 45)),
    2: dict(name='Komunal peri urban', cap=(0.35, 0.55), ad=0.50, elec=0.0, p_swds=(0.65, 0.85), mcf=(0.5, 0.8), bsf=0.3, jad=(13.6, 70, 115), jcp=(13.6, 60, 85)),
    3: dict(name='Simpul pasar dan event', cap=(0.45, 0.65), ad=0.70, elec=0.5, p_swds=(0.60, 0.85), mcf=(0.5, 0.8), bsf=0.3, jad=(13.6, 45, 90), jcp=(13.6, 40, 85)),
    4: dict(name='Agraris rumah tangga dan BUMDes', cap=(0.30, 0.50), ad=0.30, elec=0.0, p_swds=(0.25, 0.50), mcf=(0.4, 0.6), bsf=0.3, jad=(13.6, 70, 115), jcp=(13.6, 60, 85)),
}
PMR = F[F.tipe > 0].groupby('tipe').pmr.quantile(0.9).to_dict()
USD = 16000.0
YEARS = np.arange(2026, 2046); ramp = np.clip((YEARS - 2025) * 0.2, 0, 1)

def fod(dep, DOC, k, DOCf, MCF, Fr=0.5, OX=0.0):
    """IPCC 2006 Vol.5 Ch.3 first order decay; dep = wet t deposited per year (array over YEARS). returns t CH4 per year"""
    ddoc_acc = 0.0; out = []
    for w in dep:
        ddocm = w * DOC * DOCf * MCF
        dec = ddoc_acc * (1 - np.exp(-k))
        ddoc_acc = ddoc_acc * np.exp(-k) + ddocm
        out.append(dec * Fr * 16 / 12 * (1 - OX))
    return np.array(out)

def irr(cf):
    f = lambda r: np.sum(cf / (1 + r) ** np.arange(len(cf)))
    try: return brentq(f, -0.9, 3.0)
    except ValueError: return np.nan

ND = 3000
P = pd.DataFrame({
    'j': rng.integers(0, N, ND),
    'vs': rng.uniform(0.18, 0.24, ND), 'bmp': rng.uniform(0.30, 0.45, ND), 'eff': rng.uniform(0.70, 0.90, ND),
    'eta_e': rng.uniform(0.30, 0.38, ND), 'ef_grid': rng.triangular(0.80, 0.87, 0.90, ND),
    'ef_ad_ch4': rng.triangular(0.0, 0.8, 8.0, ND) / 1000, 'ef_cp_ch4': rng.triangular(0.03, 4.0, 8.0, ND) / 1000,
    'ef_cp_n2o': rng.triangular(0.06, 0.24, 0.6, ND) / 1000,
    'doc_food': rng.uniform(0.08, 0.20, ND), 'doc_green': rng.uniform(0.18, 0.22, ND), 'docf': rng.uniform(0.45, 0.55, ND),
    'k_food': rng.uniform(0.17, 0.70, ND), 'k_green': rng.uniform(0.15, 0.20, ND),
    'capex_ad': rng.triangular(50, 250, 670, ND) * USD, 'capex_cp': rng.triangular(30, 80, 200, ND) * USD,
    'p_elec': rng.uniform(1000, 1450, ND), 'p_lpg_fin': rng.uniform(6000, 7000, ND), 'p_lpg_econ': 14250.0, 'lpg_sub': 10000.0,
    'p_comp': rng.uniform(300, 800, ND), 'p_bsf': rng.uniform(4000, 7000, ND), 'avoid_fee': rng.uniform(150000, 386000, ND),
    'p_carbon': rng.triangular(30000, 96000, 144000, ND), 'r': rng.uniform(0.08, 0.12, ND), 'om': rng.uniform(0.02, 0.05, ND),
    'gwp_ch4': 28.0, 'gwp_n2o': 265.0,
})
for t in TYPES:
    lo, hi = MOD[t]['cap']; P[f'cap{t}'] = rng.uniform(lo, hi, ND)
    lo, hi = MOD[t]['p_swds']; P[f'sw{t}'] = rng.uniform(lo, hi, ND)
    lo, hi = MOD[t]['mcf']; P[f'mcf{t}'] = rng.uniform(lo, hi, ND)
    a, c, b = MOD[t]['jad']; P[f'jad{t}'] = rng.triangular(a, c, b, ND)
    a, c, b = MOD[t]['jcp']; P[f'jcp{t}'] = rng.triangular(a, c, b, ND)
typ = F.tipe.values
wage = F.umk.values * 13 * 1.1  # 13 months incl. THR, plus 10 % social security
rows = []
for d, p in P.iterrows():
    org = ORG[:, int(p.j)]; food = FOOD[:, int(p.j)]; green = org - food
    rec = {}
    for t in TYPES:
        m = typ == t; mo = MOD[t]
        cap = p[f'cap{t}']
        dfood = food[m].sum() * cap; dgreen = green[m].sum() * cap
        ad_in = dfood * mo['ad']; cp_in = dfood * (1 - mo['ad']) + dgreen
        bsf_in = cp_in * mo['bsf']; comp_in = cp_in - bsf_in
        ch4_m3 = ad_in * p.vs * p.bmp * 1000 * p.eff
        e_prim = ch4_m3 * 9.97 / 1e6  # GWh
        e_el = e_prim * mo['elec'] * p.eta_e
        lpg_t = ch4_m3 * (1 - mo['elec']) * 35.9 * 0.55 / (46.1 * 0.60) / 1000
        # baseline FOD for diverted streams (only share that would reach SWDS)
        sw = p[f'sw{t}']; mcf = p[f'mcf{t}']
        ch4_base = fod(dfood * sw * ramp, p.doc_food, p.k_food, p.docf, mcf) + fod(dgreen * sw * ramp, p.doc_green, p.k_green, p.docf, mcf)
        ch4_ss = (dfood * p.doc_food + dgreen * p.doc_green) * sw * p.docf * mcf * 0.5 * 16 / 12  # steady state
        proj = (ad_in * p.ef_ad_ch4 + cp_in * p.ef_cp_ch4) * p.gwp_ch4 + cp_in * p.ef_cp_n2o * p.gwp_n2o
        disp = e_el * 1000 * p.ef_grid + lpg_t * 2.985
        net_10 = ch4_base[:10].mean() * p.gwp_ch4 + (disp - proj) * ramp[:10].mean()
        net_ss = ch4_ss * p.gwp_ch4 + disp - proj
        # jobs
        jobs = ad_in / 1e4 * p[f'jad{t}'] + cp_in / 1e4 * p[f'jcp{t}']
        # economics at full operation, 15 year life, capacity sized with seasonal design factor
        capex = (ad_in * p.capex_ad + cp_in * p.capex_cp) * PMR[t]
        wage_t = np.average(wage[m], weights=org[m])
        opex = jobs * wage_t + p.om * capex
        compost_t = comp_in * 0.35 + ad_in * 0.25
        rev_fin = e_el * 1e6 * p.p_elec + lpg_t * 1000 * p.p_lpg_fin + compost_t * 1000 * p.p_comp + bsf_in * 0.15 * 1000 * p.p_bsf
        rev_fee = (ad_in + cp_in) * sw * p.avoid_fee  # only the share that would have been collected and landfilled
        rev_c = net_ss * p.p_carbon
        years = 15; disc = (1 + p.r) ** -np.arange(1, years + 1)
        cf_fin = np.r_[-capex, np.full(years, rev_fin + rev_fee + rev_c - opex)]
        npv_fin = -capex + (rev_fin + rev_fee + rev_c - opex) * disc.sum()
        npv_nofee = -capex + (rev_fin + rev_c - opex) * disc.sum()
        econ_extra = lpg_t * 1000 * (p.p_lpg_econ - p.p_lpg_fin)  # economic value of LPG at unsubsidised price
        npv_econ = npv_fin + econ_extra * disc.sum()
        fee_be = ((capex / disc.sum()) + opex - rev_fin - rev_c) / (ad_in + cp_in)  # break even gate fee, Rp per t
        bcr = (rev_fin + rev_fee + rev_c) * disc.sum() / (capex + opex * disc.sum())
        rec.update({f'{k}{t}': v for k, v in dict(div=dfood + dgreen, org=org[m].sum(), ad=ad_in, cp=cp_in, ch4m3=ch4_m3, eprim=e_prim, eel=e_el,
                    lpg=lpg_t, net10=net_10, netss=net_ss, jobs=jobs, capex=capex, opex=opex, revfin=rev_fin, revfee=rev_fee, revc=rev_c,
                    npv=npv_fin, npv_nofee=npv_nofee, npv_econ=npv_econ, bcr=bcr, irr=irr(cf_fin), lpgsub=lpg_t * 1000 * p.lpg_sub,
                    ch4base10=ch4_base[:10].mean(), feebe=fee_be).items()})
    rows.append(rec)

R = pd.DataFrame(rows).copy()
R = pd.concat([R, pd.DataFrame({f'{k}_tot': R[[f'{k}{t}' for t in TYPES]].sum(1) for k in ['div', 'org', 'ad', 'cp', 'ch4m3', 'eprim', 'eel', 'lpg', 'net10', 'netss', 'jobs', 'capex', 'opex', 'revfin', 'revfee', 'revc', 'npv', 'npv_econ', 'lpgsub', 'ch4base10', 'npv_nofee']})], axis=1)
R['feebe_tot'] = sum(R[f'feebe{t}'] * (R[f'ad{t}'] + R[f'cp{t}']) for t in TYPES) / (R.ad_tot + R.cp_tot)
R['div_share'] = R.div_tot / R.org_tot
R.to_parquet(f'{OUT}/mc_impact.parquet')
q = lambda s: [float(np.nanpercentile(s, 5)), float(np.nanmedian(s)), float(np.nanpercentile(s, 95))]
res = {'province': {k: q(R[k]) for k in ['div_tot', 'org_tot', 'div_share', 'eprim_tot', 'eel_tot', 'lpg_tot', 'net10_tot', 'netss_tot',
                                          'jobs_tot', 'capex_tot', 'opex_tot', 'revfin_tot', 'revfee_tot', 'revc_tot', 'npv_tot', 'npv_econ_tot', 'npv_nofee_tot', 'lpgsub_tot', 'ch4base10_tot', 'feebe_tot']}}
res['by_type'] = {t: {k: q(R[f'{k}{t}']) for k in ['div', 'org', 'eprim', 'eel', 'lpg', 'net10', 'netss', 'jobs', 'capex', 'opex', 'revfin', 'revfee', 'revc', 'npv', 'npv_nofee', 'npv_econ', 'bcr', 'irr', 'feebe', 'ad', 'cp', 'lpg']} for t in TYPES}
res['by_type_prob_fee_below_386k'] = {t: float((R[f'feebe{t}'] < 386000).mean()) for t in TYPES}
res['by_type_prob_npv_pos'] = {t: float((R[f'npv{t}'] > 0).mean()) for t in TYPES}
res['by_type_prob_npv_nofee_pos'] = {t: float((R[f'npv_nofee{t}'] > 0).mean()) for t in TYPES}
res['PMR_design'] = PMR
res['modules'] = {t: MOD[t]['name'] for t in TYPES}
# global sensitivity: Spearman rank correlation of inputs with province net GHG and NPV
sens = {}
for tgt in ['netss_tot', 'npv_tot', 'eprim_tot', 'jobs_tot']:
    cols = [c for c in P.columns if c not in ('j', 'p_lpg_econ', 'lpg_sub', 'gwp_ch4', 'gwp_n2o')]
    X = P[cols].copy(); X['T_waste'] = ORG.sum(0)[P.j.values]
    sens[tgt] = X.corrwith(R[tgt], method='spearman').sort_values(key=abs, ascending=False).head(6).round(3).to_dict()
res['sensitivity'] = sens
json.dump(res, open(f'{OUT}/res_step4.json', 'w'), indent=1, default=float)
fmt = lambda v, s=1: [round(x / s, 2) for x in v]
pv = res['province']
print('diverted Mt', fmt(pv['div_tot'], 1e6), 'share', fmt(pv['div_share']), 'Eprim GWh', fmt(pv['eprim_tot']), 'Eel GWh', fmt(pv['eel_tot']))
print('LPG kt', fmt(pv['lpg_tot'], 1e3), 'net10 MtCO2e', fmt(pv['net10_tot'], 1e6), 'netSS', fmt(pv['netss_tot'], 1e6), 'jobs', fmt(pv['jobs_tot']))
print('fee_be tot k', fmt(pv['feebe_tot'],1e3)); print('capex T', fmt(pv['capex_tot'], 1e12), 'NPV T', fmt(pv['npv_tot'], 1e12), 'NPV nofee', fmt(pv['npv_nofee_tot'], 1e12), 'NPVecon', fmt(pv['npv_econ_tot'], 1e12), 'LPG subsidy saved bn', fmt(pv['lpgsub_tot'], 1e9))
for t in TYPES:
    b = res['by_type'][t]
    print(t, MOD[t]['name'], 'div kt', fmt(b['div'], 1e3), 'net kt', fmt(b['netss'], 1e3), 'jobs', fmt(b['jobs']), 'capex bn', fmt(b['capex'], 1e9), 'NPV bn', fmt(b['npv'], 1e9), 'BCR', fmt(b['bcr']), 'IRR', fmt(b['irr']), 'P(NPV>0)', res['by_type_prob_npv_pos'][t], 'fee_be k', fmt(b['feebe'], 1e3), 'P(fee<386k)', res['by_type_prob_fee_below_386k'][t])
print(json.dumps(sens, indent=1))

# central (expected value) desa level outputs for mapping and kabkota aggregation
pm = P.mean(numeric_only=True)
for t in TYPES:
    m = F.tipe == t; mo = MOD[t]; cap = np.mean(MOD[t]['cap'])
    F.loc[m, 'div_t'] = F.loc[m, 'ORG_mean'] * cap
    F.loc[m, 'ad_t'] = F.loc[m, 'FOOD_mean'] * cap * mo['ad']
F['div_t'] = F.div_t.fillna(0); F['ad_t'] = F.ad_t.fillna(0)
F['ch4_m3'] = F.ad_t * pm.vs * pm.bmp * 1000 * pm.eff
F['eprim_mwh'] = F.ch4_m3 * 9.97 / 1000
F.to_parquet(f'{OUT}/desa_final.parquet')
kab = F.groupby(['idkab', 'nmkab']).agg(pop=('pop', 'sum'), W=('W_mean', 'sum'), ORG=('ORG_mean', 'sum'), div=('div_t', 'sum'),
                                        eprim=('eprim_mwh', 'sum'), n_desa=('uid', 'size'),
                                        t1=('tipe', lambda s: (s == 1).sum()), t2=('tipe', lambda s: (s == 2).sum()),
                                        t3=('tipe', lambda s: (s == 3).sum()), t4=('tipe', lambda s: (s == 4).sum())).reset_index()
kab.to_csv(f'{OUT}/kab_summary.csv', index=False)
print(kab.round(0).to_string())
