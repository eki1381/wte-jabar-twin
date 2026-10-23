"""Step 7. Merge the Google Earth Engine export (NTL, SO2, CO, NO2, WorldPop, HRSL, GHSL) into the desa model.
Usage: python3 07_merge_gee.py path/to/desa_jabar_ntl_s5p_pop.csv [path/to/desa_jabar_s5p_monthly_2024.csv]
Outputs: out/desa_gee.parquet, out/res_gee.json, fig/fig_gee_*.png
Analyses
 1. External validation of the dasymetric population against WorldPop 2020 and HRSL (Pearson, Spearman, MAPE, by type)
 2. NTL as a big data proxy of activity: rank correlation of NTL with modelled population and waste density
 3. NTL augmented dasymetric (kabkota NNLS with NTL sum) and LOOCV comparison
 4. Air quality co benefit screening: CO, SO2, NO2 against organic waste density and typology,
    OLS with kabkota fixed effects and cluster robust errors, plus monthly CO anomaly in Ramadan and Lebaran
"""
import sys, json, numpy as np, pandas as pd
from scipy import stats
from scipy.optimize import nnls
import statsmodels.formula.api as smf
OUT = '/home/claude/wte/out'
g = pd.read_csv(sys.argv[1])
F = pd.read_parquet(f'{OUT}/desa_final.parquet')
D = F.merge(g.drop(columns=[c for c in ['iddesa', 'idkab', 'nmkab', 'nmkec', 'nmdesa', 'system:index', '.geo'] if c in g.columns]), on='uid', how='left')
res = {'n_matched': int(D['ntl_2024_mean'].notna().sum()) if 'ntl_2024_mean' in D else 0}
S = D[(D.nonsettle == 0)].copy()
# 1. population validation
for ref in ['worldpop_2020', 'hrsl_pop']:
    if ref in S and S[ref].notna().sum() > 100:
        m = S[ref].notna() & (S[ref] > 0)
        # scale reference to the same provincial total (2020 vs 2024 levels)
        r = S.loc[m, ref] * S.loc[m, 'pop'].sum() / S.loc[m, ref].sum()
        res[f'val_{ref}'] = dict(pearson_log=round(stats.pearsonr(np.log(S.loc[m, 'pop']), np.log(r))[0], 3),
                                 spearman=round(stats.spearmanr(S.loc[m, 'pop'], r)[0], 3),
                                 mape=round(float(np.median(np.abs(S.loc[m, 'pop'] - r) / r) * 100), 1),
                                 by_type={int(t): round(stats.spearmanr(S.loc[m & (S.tipe == t), 'pop'], r[m & (S.tipe == t)])[0], 3) for t in [1, 2, 3, 4]})
# 2. NTL correlations
if 'ntl_2024_mean' in S:
    S['ntl'] = S['ntl_2024_mean']
    res['ntl_corr'] = {v: round(stats.spearmanr(S.ntl, S[v], nan_policy='omit')[0], 3) for v in ['dens', 'org_dens', 'NHH_p50', 'kde_evt']}
    res['ntl_by_type'] = S.groupby('tipe').ntl.median().round(2).to_dict()
    # 3. NTL augmented dasymetric at kabkota level
    P = S.groupby('idkab')['pop'].sum()
    X0 = S.assign(ntl_sum=S['ntl_2024_sum']).groupby('idkab')[['nd', 'lu_res_km2', 'rural_land', 'poi_all', 'ntl_sum']].sum()
    def loo(cols):
        X = X0[cols].values; y = P.loc[X0.index].values; e = []
        for i in range(len(y)):
            mm = np.arange(len(y)) != i; b, _ = nnls(X[mm], y[mm]); e.append(y[i] - X[i] @ b)
        e = np.array(e); return round(1 - (e ** 2).sum() / ((y - y.mean()) ** 2).sum(), 3), round(float(np.mean(np.abs(e) / y) * 100), 1)
    res['dasy_loo_base'] = loo(['nd', 'lu_res_km2', 'rural_land', 'poi_all'])
    res['dasy_loo_ntl'] = loo(['nd', 'lu_res_km2', 'rural_land', 'poi_all', 'ntl_sum'])
# 4. air quality screening
for gas in ['co_2024', 'so2_2024', 'no2_2024']:
    if gas in S and S[gas].notna().sum() > 100:
        d = S[[gas, 'org_dens', 'dens', 'tipe', 'idkab', 'dist_tpa_m']].dropna().copy()
        d['y'] = (d[gas] - d[gas].mean()) / d[gas].std()
        d['lorg'] = np.log(d.org_dens.clip(1)); d['ldist'] = np.log(d.dist_tpa_m / 1000)
        mdl = smf.ols('y ~ lorg + ldist + C(tipe) + C(idkab)', data=d).fit(cov_type='cluster', cov_kwds={'groups': d.idkab})
        res[f'aq_{gas}'] = dict(b_lorg=round(mdl.params['lorg'], 3), p_lorg=round(mdl.pvalues['lorg'], 4), b_ldist=round(mdl.params['ldist'], 3),
                                p_ldist=round(mdl.pvalues['ldist'], 4), r2=round(mdl.rsquared, 3), n=int(mdl.nobs),
                                type_median={int(t): float(v) for t, v in d.groupby('tipe')[gas].median().items()})
if len(sys.argv) > 2:
    mth = pd.read_csv(sys.argv[2]).merge(F[['uid', 'tipe']], on='uid')
    cols = [c for c in mth.columns if c.startswith('co_2024_')]
    z = mth[cols].sub(mth[cols].mean(1), axis=0).div(mth[cols].mean(1), axis=0)
    res['co_monthly_anomaly_by_type'] = z.groupby(mth.tipe).mean().round(4).to_dict()
D.to_parquet(f'{OUT}/desa_gee.parquet')
json.dump(res, open(f'{OUT}/res_gee.json', 'w'), indent=1, default=float)
print(json.dumps(res, indent=1, default=float))
