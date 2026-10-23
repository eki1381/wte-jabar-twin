"""Step 2. Intelligent dasymetric population, urban calibration, waste generation surface,
seasonal event model, Monte Carlo uncertainty.
"""
import pandas as pd, numpy as np, json
from scipy.optimize import nnls
from scipy import stats
rng = np.random.default_rng(20260926)
OUT = '/home/claude/wte/out'
F = pd.read_parquet(f'{OUT}/desa_features.parquet')
F['idkab'] = F.idkab.astype(str)
F['nd'] = 1 - F.nonsettle
F['rural_land'] = F.lu_none_km2 + F.lu_agr_km2
# VIIRS NTL (median of Apr to Oct 2024 monthly composites) times area = radiance sum proxy
G = pd.read_parquet(f'{OUT}/gee_annual.parquet')[['uid', 'ntl_2024']]
F = F.merge(G, on='uid', how='left')
F['ntl_sum'] = F.ntl_2024.fillna(0) * F.area_km2
res = {}

# ---------------- A. Kabkota population (Susenas 2021 to 2024, weights) ----------------
S = pd.read_parquet('/mnt/user-data/uploads/analysis_panel.parquet')
S = S[S.kode_prov == 32].copy()
S['kab'] = S.kabkota_id.astype(str)
P = S.groupby(['tahun', 'kab']).apply(lambda d: pd.Series({
    'pop5': d.fwt.sum(),
    'urb': np.average(d.urban, weights=d.fwt),
    'tabungan': np.average(d.punya_tabungan, weights=d.fwt),
    'kredit_any': np.average((d[['kredit_a', 'kredit_b', 'kredit_c', 'kredit_d']].sum(axis=1) > 0).astype(int), weights=d.fwt),
    'n': len(d)}), include_groups=False).reset_index()
P.to_csv(f'{OUT}/susenas_kab.csv', index=False)
P24 = P[P.tahun == 2024].set_index('kab')
BPS_TOTAL_2024 = 50.35e6  # BPS, mid 2024 projection (GoodStats citing BPS)
P24['pop'] = P24.pop5 / P24.pop5.sum() * BPS_TOTAL_2024
res['susenas_pop5_2024'] = float(P24.pop5.sum())
res['susenas_urban_share_2024'] = float(np.average(P24.urb, weights=P24.pop5))

# ---------------- B. Intelligent dasymetric regression (NNLS, through origin) ----------------
X_cols = ['nd', 'lu_res_km2', 'rural_land', 'poi_all', 'ntl_sum']
K = F.groupby('idkab')[X_cols].sum().join(P24[['pop']])
X = K[X_cols].values; y = K['pop'].values
beta, _ = nnls(X, y)
pred = X @ beta
r2 = 1 - ((y - pred) ** 2).sum() / ((y - y.mean()) ** 2).sum()
loo = []
for i in range(len(y)):
    m = np.arange(len(y)) != i
    b, _ = nnls(X[m], y[m]); loo.append(X[i] @ b)
loo = np.array(loo)
q2 = 1 - ((y - loo) ** 2).sum() / ((y - y.mean()) ** 2).sum()
mape = np.mean(np.abs(y - loo) / y) * 100
# bootstrap CI for coefficients
B = []
for _ in range(2000):
    idx = rng.integers(0, len(y), len(y)); b, _ = nnls(X[idx], y[idx]); B.append(b)
B = np.array(B)
# baseline model: equal share per desa (areal/administrative prior only)
b0, _ = nnls(X[:, :1], y); loo0 = []
for i in range(len(y)):
    m = np.arange(len(y)) != i; bb, _ = nnls(X[m][:, :1], y[m]); loo0.append(X[i, :1] @ bb)
q2_0 = 1 - ((y - np.array(loo0)) ** 2).sum() / ((y - y.mean()) ** 2).sum()
res['dasy'] = dict(beta=dict(zip(X_cols, beta.round(2).tolist())),
                   beta_ci90={c: np.percentile(B[:, j], [5, 95]).round(1).tolist() for j, c in enumerate(X_cols)},
                   R2=round(r2, 3), Q2_loo=round(q2, 3), MAPE_loo=round(mape, 1), Q2_loo_admin_only=round(q2_0, 3),
                   pearson_loo=round(stats.pearsonr(y, loo)[0], 3), spearman_loo=round(stats.spearmanr(y, loo)[0], 3))
print(res['dasy'])
F['w'] = F[X_cols].values @ beta
F.loc[F.nonsettle == 1, 'w'] = 0
F['pop'] = F.w / F.groupby('idkab').w.transform('sum') * F.idkab.map(P24['pop'])
F['dens'] = F['pop'] / F.area_km2

# ---------------- C. Urban calibration against Susenas ----------------
# threshold on density that reproduces provincial urban population share from Susenas
target = res['susenas_urban_share_2024']
ds = np.sort(F.dens.values)[::-1]
order = F.dens.sort_values(ascending=False)
cum = order.index.map(F['pop']).to_numpy().cumsum() / F['pop'].sum()
thr = order.iloc[np.searchsorted(cum, target)]
F['urban_m'] = (F.dens >= thr).astype(int)
uk = F.groupby('idkab').apply(lambda d: np.average(d.urban_m, weights=d['pop']), include_groups=False)
cmp = pd.DataFrame({'model': uk, 'susenas': P24.urb})
res['urban'] = dict(density_threshold=round(float(thr), 1), target_share=round(target, 3),
                    r=round(stats.pearsonr(cmp.model, cmp.susenas)[0], 3), rho=round(stats.spearmanr(cmp.model, cmp.susenas)[0], 3),
                    mae_pp=round(float((cmp.model - cmp.susenas).abs().mean() * 100), 1))
print(res['urban'])
cmp.to_csv(f'{OUT}/urban_validation.csv')
# continuous urbanity score (logistic of log density around threshold)
F['urbanity'] = 1 / (1 + np.exp(-(np.log(F.dens.clip(1)) - np.log(thr)) / 0.5))

# ---------------- D. Waste generation surface with Monte Carlo ----------------
N = 3000
def tri(a, c, b, n=N): return rng.triangular(a, c, b, n)
draw = pd.DataFrame({
    'T_tpd': tri(20000, 25000, 32000),        # provincial MSW, t/day (DLH Jabar 2024: 25,000 t/day)
    's_hh': rng.uniform(0.51, 0.59, N),       # household share (SIPSN 2025 national 51.4 %, Jabar 2021 59.2 %)
    'r_urb': rng.uniform(1.15, 1.45, N),      # urban to rural per capita ratio (SNI 3242:2008 3.0 vs 2.5 L)
    'mix': rng.uniform(0.2, 0.5, N),          # share of non household waste allocated by POI activity (rest by population)
    'f_food': rng.uniform(0.38, 0.45, N),     # food waste share (SIPSN 2022 to 2025: 39 to 41 %)
    'f_green': rng.uniform(0.10, 0.15, N),    # wood, branches, leaves (SIPSN 13 %)
    'f_org_nhh': rng.uniform(0.45, 0.65, N),  # organic share of market and commercial waste
})
draw.to_parquet(f'{OUT}/mc_draws_waste.parquet')
pop = F['pop'].values; urb = F.urbanity.values
act = (F.kde_evt * F.area_km2).values + 0.5 * F[['poi_pasar', 'poi_food', 'poi_retail', 'poi_event', 'poi_lodging']].sum(axis=1).values
act = np.sqrt(act)  # diminishing returns, damp OSM mapping bias in dense cities
act_s = act / act.sum(); pop_s = pop / pop.sum()
Wd = np.zeros((len(F), N), np.float32); Od = np.zeros_like(Wd); NHs = np.zeros_like(Wd); FOOD = np.zeros_like(Wd)
for k, r in draw.iterrows():
    T = r.T_tpd * 365
    hh_w = pop * (1 + (r.r_urb - 1) * urb); hh = T * r.s_hh * hh_w / hh_w.sum()
    nhh = T * (1 - r.s_hh) * (r.mix * act_s + (1 - r.mix) * pop_s)
    Wd[:, k] = hh + nhh
    food = hh * r.f_food + nhh * r.f_org_nhh * 0.8
    green = hh * r.f_green + nhh * r.f_org_nhh * 0.2
    FOOD[:, k] = food; Od[:, k] = food + green; NHs[:, k] = nhh / (hh + nhh)
q = lambda A: np.percentile(A, [5, 50, 95], axis=1)
for name, A in [('W', Wd), ('ORG', Od), ('FOOD', FOOD), ('NHH', NHs)]:
    lo, md, hi = q(A); F[f'{name}_p05'] = lo; F[f'{name}_p50'] = md; F[f'{name}_p95'] = hi
F['W_mean'] = Wd.mean(1); F['ORG_mean'] = Od.mean(1); F['FOOD_mean'] = FOOD.mean(1)
F['org_dens'] = F.ORG_mean / F.area_km2           # t/km2/yr
F['gen_pc'] = F.W_mean / F['pop'].clip(1) * 1000 / 365  # kg/cap/day
F['cv_W'] = Wd.std(1) / Wd.mean(1)
tot = Wd.sum(0); org = Od.sum(0); food_t = FOOD.sum(0)
res['waste_total_Mt'] = np.percentile(tot, [5, 50, 95]).round(-3).tolist()
res['organic_total_Mt'] = np.percentile(org, [5, 50, 95]).round(-3).tolist()
res['food_total_Mt'] = np.percentile(food_t, [5, 50, 95]).round(-3).tolist()
res['organic_share'] = np.percentile(org / tot, [5, 50, 95]).round(3).tolist()
np.save(f'{OUT}/mc_org.npy', Od); np.save(f'{OUT}/mc_food.npy', FOOD)

# External benchmark: SIPSN 2021 reported generation (Databoks, 2021), thousand t/yr
bench = {'3202': 397.9, '3271': 245.92, '3207': 208.8, '3211': 161.46, '3272': 65.79}
kab_w = F.groupby('idkab').W_mean.sum() / 1000
bk = pd.DataFrame({'model_kt': kab_w.reindex(bench.keys()), 'sipsn_kt': pd.Series(bench)})
# model is 2024; SIPSN 2021: scale model back with Susenas 2021/2024 population ratio
p21 = P[P.tahun == 2021].set_index('kab').pop5; p24 = P24.pop5
bk['model_kt_2021'] = bk.model_kt * (p21 / p24).reindex(bk.index)
bk['ape'] = (bk.model_kt_2021 - bk.sipsn_kt).abs() / bk.sipsn_kt * 100
res['sipsn_bench'] = dict(r=round(stats.pearsonr(bk.model_kt_2021, bk.sipsn_kt)[0], 3), mape=round(bk.ape.mean(), 1), n=len(bk))
bk.to_csv(f'{OUT}/sipsn_benchmark.csv')
print(bk, res['sipsn_bench'])
kpc = (F.groupby('idkab').W_mean.sum()/F.groupby('idkab')['pop'].sum()*1000/365).round(3); print(kpc.to_dict())

# ---------------- E. Seasonal event model (2025 calendar) ----------------
# Month flags. Ramadan 1 to 30 Mar 2025, Idul Fitri 31 Mar and 1 Apr, Idul Adha 6 Jun, school holiday late Jun to mid Jul,
# year end holiday Dec, wedding (hajatan) peaks Apr to Jun (Syawal, Dzulhijjah) and Jan to Feb (Rajab, Syaban);
# low hajatan in Ramadan (Mar) and Muharram (late Jun to Jul).
months = np.arange(1, 13)
ram = np.array([0, 0, 1, .4, 0, 0, 0, 0, 0, 0, 0, 0])          # Ramadan and Lebaran intensity
adha = np.array([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])
hol = np.array([0, 0, 0, .7, 0, .6, .8, 0, 0, 0, 0, 1])          # school and national holidays (tourism)
haj = np.array([.6, .6, -1, 1, .8, .8, -.6, .3, .3, .3, .2, .2])  # hajatan season index
M = 2000
prm = pd.DataFrame({'u_hh_ram': rng.uniform(.10, .25, M), 'u_mk_ram': rng.uniform(.20, .40, M), 'u_mk_adha': rng.uniform(.10, .20, M),
                    'u_ev_hol': rng.uniform(.20, .50, M), 'u_ev_haj': rng.uniform(.10, .30, M), 'u_hh_haj': rng.uniform(.02, .06, M)})
def prof(p):
    hh = 1 + p.u_hh_ram * ram + p.u_hh_haj * haj
    mk = 1 + p.u_mk_ram * ram + p.u_mk_adha * adha
    ev = 1 + p.u_ev_hol * hol + p.u_ev_haj * haj
    return [x / x.mean() for x in (hh, mk, ev)]
PR = np.array([prof(p) for _, p in prm.iterrows()])  # M x 3 x 12
mp = PR.mean(0)
# desa weights of components: household vs market vs event (split non household into market 37 % and event/commercial 63 %)
nh = F.NHH_p50.values
wcomp = np.c_[1 - nh, nh * 0.37, nh * 0.63]
prof_desa = wcomp @ mp            # n x 12
F['pmr'] = prof_desa.max(1)       # peak to mean ratio
F['seas_cv'] = prof_desa.std(1)
F['peak_month'] = prof_desa.argmax(1) + 1
# provincial monthly series and harmonic fit
prov = (F.ORG_mean.values[:, None] * prof_desa).sum(0)
t = months
Xh = np.c_[np.ones(12), np.cos(2*np.pi*t/12), np.sin(2*np.pi*t/12), np.cos(4*np.pi*t/12), np.sin(4*np.pi*t/12)]
coef, *_ = np.linalg.lstsq(Xh, prov / prov.mean(), rcond=None)
fit = Xh @ coef
res['seasonal'] = dict(prov_index=(prov / prov.mean()).round(3).tolist(),
                       amp1=round(float(np.hypot(coef[1], coef[2])), 3), amp2=round(float(np.hypot(coef[3], coef[4])), 3),
                       R2=round(float(1 - ((prov/prov.mean() - fit) ** 2).sum() / ((prov/prov.mean() - 1) ** 2).sum()), 3),
                       pmr_p50=round(float(F.pmr.median()), 3), pmr_p95=round(float(F.pmr.quantile(.95)), 3),
                       pmr_max=round(float(F.pmr.max()), 3),
                       comp_profiles={k: mp[i].round(3).tolist() for i, k in enumerate(['household', 'market', 'event'])},
                       comp_ci={k: [np.percentile(PR[:, i, :].max(1), [5, 95]).round(3).tolist()] for i, k in enumerate(['household', 'market', 'event'])})
print(res['seasonal'])
pd.DataFrame(prof_desa, columns=[f'm{m}' for m in months]).assign(uid=F.uid.values).to_parquet(f'{OUT}/seasonal_desa.parquet')

res['pop_desa'] = dict(mean=round(F['pop'].mean()), median=round(F['pop'].median()), p05=round(F['pop'].quantile(.05)),
                       p95=round(F['pop'].quantile(.95)), dens_median=round(F.dens.median()), dens_p95=round(F.dens.quantile(.95)))
res['gen_pc'] = dict(median=round(float(F.gen_pc.median()), 3), p05=round(float(F.gen_pc.quantile(.05)), 3), p95=round(float(F.gen_pc.quantile(.95)), 3))
F.to_parquet(f'{OUT}/desa_model.parquet')
json.dump(res, open(f'{OUT}/res_step2.json', 'w'), indent=1, default=float)
print(json.dumps({k: res[k] for k in ['waste_total_Mt', 'organic_total_Mt', 'food_total_Mt', 'organic_share', 'pop_desa', 'gen_pc']}, indent=1))
