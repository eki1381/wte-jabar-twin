"""Step 8. GEE panel analyses.
 A. Independent validation of the OSM only dasymetric surface (v1) with VIIRS NTL; robustness of typology to the NTL model (v2)
 B. Calendar event study 2022 to 2025 (Ramadan, Lebaran window, Idul Adha) with desa, month of year and year fixed effects.
    Identification: the Hijri calendar moves about 11 days per year, so within the same Gregorian month the exposure differs across years.
 C. Air quality screening: CO and SO2 against organic waste density and waste service distance, and dry season CO rise.
"""
import pandas as pd, numpy as np, json, pyfixest as pf
from scipy import stats
from sklearn.metrics import adjusted_rand_score
OUT = '/home/claude/wte/out'
res = {}
F = pd.read_parquet(f'{OUT}/desa_final.parquet')           # v2 (NTL augmented) model
V1 = pd.read_parquet('/home/claude/wte/out_v1/desa_final.parquet')
G = pd.read_parquet(f'{OUT}/gee_annual.parquet')
P = pd.read_parquet(f'{OUT}/gee_panel.parquet')
S = F[F.nonsettle == 0].drop(columns=[c for c in F.columns if c.startswith('ntl_')]).merge(G, on='uid')
S1 = V1[V1.nonsettle == 0].merge(G, on='uid')
# ---------------- A. validation ----------------
res['ntl_vs_v1_density_spearman'] = round(stats.spearmanr(S1.ntl_2024, S1.dens)[0], 3)
res['ntl_vs_v1_density_pearson_log'] = round(stats.pearsonr(np.log(S1.ntl_2024.clip(0.05)), np.log(S1.dens.clip(1)))[0], 3)
res['ntl_vs_v1_orgdens_spearman'] = round(stats.spearmanr(S1.ntl_2024, S1.org_dens)[0], 3)
res['ntl_vs_v1_by_type'] = {int(t): round(stats.spearmanr(g.ntl_2024, g.dens)[0], 3) for t, g in S1.groupby('tipe')}
res['ntl_median_by_type_v2'] = S.groupby('tipe').ntl_2024.median().round(2).to_dict()
res['ntl_growth_22_25_by_type'] = (S.groupby('tipe').ntl_2025.median() / S.groupby('tipe').ntl_2022.median() - 1).round(3).to_dict()
T1 = pd.read_parquet('/home/claude/wte/out_v1/typology.parquet'); T2 = pd.read_parquet(f'{OUT}/typology.parquet')
tt = T1.merge(T2, on='uid', suffixes=('_v1', '_v2'))
res['ARI_typology_v1_v2'] = round(adjusted_rand_score(tt.tipe_v1, tt.tipe_v2), 3)
res['share_same_type_v1_v2'] = round(float((tt.tipe_v1 == tt.tipe_v2).mean()), 3)
res['pop_v1_v2_spearman'] = round(stats.spearmanr(V1.set_index('uid').loc[F.uid, 'pop'], F['pop'])[0], 3)
res['pop_v1_v2_median_abs_diff_pct'] = round(float(np.median(np.abs(F.set_index('uid')['pop'] / V1.set_index('uid')['pop'].replace(0, np.nan) - 1)) * 100), 1)
print(json.dumps(res, indent=1))

# ---------------- B. event study ----------------
days = pd.date_range('2022-01-01', '2025-12-31', freq='D')
cal = pd.DataFrame({'d': days}); cal['tahun'] = cal.d.dt.year; cal['bulan'] = cal.d.dt.month
RAM = [('2022-04-02', '2022-05-01'), ('2023-03-23', '2023-04-20'), ('2024-03-11', '2024-04-09'), ('2025-03-01', '2025-03-30')]
IDF = ['2022-05-02', '2023-04-22', '2024-04-10', '2025-03-31']
ADH = ['2022-07-10', '2023-06-29', '2024-06-17', '2025-06-06']
cal['ram'] = 0; cal['leb'] = 0; cal['adha'] = 0
for a, b in RAM: cal.loc[cal.d.between(a, b), 'ram'] = 1
for x in IDF:  # mudik and Lebaran window: 7 days before to 6 days after Idul Fitri
    x = pd.Timestamp(x); cal.loc[cal.d.between(x - pd.Timedelta(days=7), x + pd.Timedelta(days=6)), 'leb'] = 1
for x in ADH:
    x = pd.Timestamp(x); cal.loc[cal.d.between(x - pd.Timedelta(days=3), x + pd.Timedelta(days=3)), 'adha'] = 1
cal.loc[cal.leb == 1, 'ram'] = 0  # mutually exclusive exposure
M = cal.groupby(['tahun', 'bulan'])[['ram', 'leb', 'adha']].mean().reset_index()
res['calendar_exposure'] = M[(M.ram > 0) | (M.leb > 0) | (M.adha > 0)].round(2).to_dict('records')
D = P.merge(M, on=['tahun', 'bulan']).merge(F[['uid', 'tipe', 'idkab', 'nonsettle']], on='uid')
D = D[D.nonsettle == 0].copy()
D['kec'] = D.kdkab.astype(str) + '_' + D.kdkec.astype(str)
D['y_ntl'] = np.arcsinh(D.ntl)
D['y_co'] = D.co * 1000          # mmol per m2
D['y_so2'] = D.so2 * 1e5         # 10^-5 mol per m2
for t in [1, 2, 3, 4]: D[f'T{t}'] = (D.tipe == t).astype(int)
for v in ['ram', 'leb', 'adha']:
    for t in [1, 2, 3, 4]: D[f'{v}_T{t}'] = D[v] * D[f'T{t}']
ES = {}
def tidy(fit, names):
    tb = fit.tidy().loc[names]
    return {n: dict(b=round(float(tb.loc[n, 'Estimate']), 4), se=round(float(tb.loc[n, 'Std. Error']), 4), p=round(float(tb.loc[n, 'Pr(>|t|)']), 4)) for n in names}
for y in ['y_ntl', 'y_co', 'y_so2']:
    d = D.dropna(subset=[y])
    f0 = pf.feols(f'{y} ~ ram + leb + adha | uid + bulan + tahun', data=d, vcov={'CRV1': 'kec'})
    het = ' + '.join([f'{v}_T{t}' for v in ['ram', 'leb', 'adha'] for t in [1, 2, 3, 4]])
    f1 = pf.feols(f'{y} ~ {het} | uid + bulan + tahun', data=d, vcov={'CRV1': 'kec'})
    ES[y] = dict(pooled=tidy(f0, ['ram', 'leb', 'adha']), by_type=tidy(f1, [f'{v}_T{t}' for v in ['ram', 'leb', 'adha'] for t in [1, 2, 3, 4]]),
                 n=int(f0._N), mean_dep=round(float(d[y].mean()), 4))
    # Wald test that Lebaran effect equals across types
    print(y, ES[y]['pooled'])
# robustness: kabkota clusters and 2023 to 2025 only
d = D.dropna(subset=['y_ntl'])
het = ' + '.join([f'leb_T{t}' for t in [1, 2, 3, 4]] + [f'ram_T{t}' for t in [1, 2, 3, 4]])
r1 = pf.feols(f'y_ntl ~ {het} | uid + bulan + tahun', data=d, vcov={'CRV1': 'idkab'})
r2 = pf.feols(f'y_ntl ~ {het} | uid + bulan + tahun', data=d[d.tahun >= 2023], vcov={'CRV1': 'kec'})
r3 = pf.feols(f'y_ntl ~ {het} | uid + bulan^tahun', data=d, vcov={'CRV1': 'kec'}) if False else None
ES['robust_kab_cluster'] = tidy(r1, [f'leb_T{t}' for t in [1, 2, 3, 4]])
ES['robust_2023_2025'] = tidy(r2, [f'leb_T{t}' for t in [1, 2, 3, 4]])
# placebo: shift the Lebaran window by +2 months (should be null)
Mp = M.copy(); Mp['bulan'] = (Mp.bulan + 2 - 1) % 12 + 1
dp = P.merge(Mp.rename(columns={'ram': 'ram_p', 'leb': 'leb_p', 'adha': 'adha_p'}), on=['tahun', 'bulan'])
dp = dp.merge(F[['uid', 'tipe', 'nonsettle']], on='uid'); dp = dp[dp.nonsettle == 0]
dp['kec'] = dp.kdkab.astype(str) + '_' + dp.kdkec.astype(str); dp['y_ntl'] = np.arcsinh(dp.ntl)
for t in [1, 2, 3, 4]: dp[f'lebp_T{t}'] = dp.leb_p * (dp.tipe == t)
rp = pf.feols('y_ntl ~ ' + ' + '.join([f'lebp_T{t}' for t in [1, 2, 3, 4]]) + ' | uid + bulan + tahun', data=dp.dropna(subset=['y_ntl']), vcov={'CRV1': 'kec'})
ES['placebo_plus2m'] = tidy(rp, [f'lebp_T{t}' for t in [1, 2, 3, 4]])
res['event_study'] = ES
print(json.dumps({k: ES[k] for k in ['robust_kab_cluster', 'robust_2023_2025', 'placebo_plus2m']}, indent=1))
print(json.dumps(ES['y_ntl']['by_type'], indent=1))

# ---------------- C. air quality screening ----------------
S['lorg'] = np.log(S.org_dens.clip(1)); S['ldist'] = np.log(S.dist_tpa_m / 1000)
S['agr_sh'] = (S.lu_agr_km2 / S.area_km2).clip(0, 1); S['ldens'] = np.log(S.dens.clip(1))
S['co_mean'] = S[['co_2022', 'co_2023', 'co_2024', 'co_2025']].mean(1) * 1000
S['so2_mean'] = S[['so2_2022', 'so2_2023', 'so2_2024', 'so2_2025']].mean(1) * 1e5
# dry season CO rise per desa: mean CO Aug to Oct minus mean CO Jan to Mar (all years)
cc = P.assign(season=np.select([P.bulan.between(8, 10), P.bulan.between(1, 3)], ['dry', 'wet'], 'o')).query('season != "o"')
rise = cc.groupby(['uid', 'season']).co.mean().unstack()
S = S.merge(((rise.dry - rise.wet) * 1000).rename('co_rise').reset_index(), on='uid', how='left')
AQ = {}
for y in ['co_mean', 'so2_mean', 'co_rise']:
    m = pf.feols(f'{y} ~ lorg + ldist + agr_sh | idkab', data=S, vcov={'CRV1': 'idkab'})
    tb = m.tidy()
    AQ[y] = {v: dict(b=round(float(tb.loc[v, 'Estimate']), 4), p=round(float(tb.loc[v, 'Pr(>|t|)']), 4)) for v in ['lorg', 'ldist', 'agr_sh']}
    AQ[y]['by_type_median'] = S.groupby('tipe')[y].median().round(4).to_dict(); AQ[y]['n'] = int(m._N)
res['air_quality'] = AQ
print(json.dumps(AQ, indent=1))
# monthly profiles by type for figure
prof = D.groupby(['tipe', 'bulan']).agg(ntl=('y_ntl', 'mean'), co=('y_co', 'mean'), so2=('y_so2', 'mean')).reset_index()
prof.to_csv(f'{OUT}/gee_monthly_profile_type.csv', index=False)
S[['uid', 'ntl_2022', 'ntl_2024', 'ntl_2025', 'co_mean', 'so2_mean', 'co_rise']].to_parquet(f'{OUT}/gee_desa_summary.parquet')
json.dump(res, open(f'{OUT}/res_step8.json', 'w'), indent=1, default=float)
