"""Step 8b. Robust event study: common year by month shocks absorbed (uid + year x month FE), so only the
difference between village types is identified (a difference in differences on the Hijri calendar). Two way clustering
by kecamatan and year month. Placebo: calendar shifted by plus and minus 2 months."""
import pandas as pd, numpy as np, json, pyfixest as pf
OUT = '/home/claude/wte/out'
F = pd.read_parquet(f'{OUT}/desa_final.parquet'); P = pd.read_parquet(f'{OUT}/gee_panel.parquet')
days = pd.date_range('2022-01-01', '2025-12-31', freq='D'); cal = pd.DataFrame({'d': days})
cal['tahun'] = cal.d.dt.year; cal['bulan'] = cal.d.dt.month
RAM = [('2022-04-02', '2022-05-01'), ('2023-03-23', '2023-04-20'), ('2024-03-11', '2024-04-09'), ('2025-03-01', '2025-03-30')]
IDF = ['2022-05-02', '2023-04-22', '2024-04-10', '2025-03-31']; ADH = ['2022-07-10', '2023-06-29', '2024-06-17', '2025-06-06']
for c in ['ram', 'leb', 'adha']: cal[c] = 0
for a, b in RAM: cal.loc[cal.d.between(a, b), 'ram'] = 1
for x in IDF: x = pd.Timestamp(x); cal.loc[cal.d.between(x - pd.Timedelta(days=7), x + pd.Timedelta(days=6)), 'leb'] = 1
for x in ADH: x = pd.Timestamp(x); cal.loc[cal.d.between(x - pd.Timedelta(days=3), x + pd.Timedelta(days=3)), 'adha'] = 1
cal.loc[cal.leb == 1, 'ram'] = 0
M = cal.groupby(['tahun', 'bulan'])[['ram', 'leb', 'adha']].mean().reset_index()
def prep(Mx):
    D = P.merge(Mx, on=['tahun', 'bulan']).merge(F[['uid', 'tipe', 'nonsettle', 'idkab']], on='uid')
    D = D[D.nonsettle == 0].copy()
    D['kec'] = D.kdkab.astype(str) + '_' + D.kdkec.astype(str); D['ym'] = D.tahun * 100 + D.bulan
    D['y_ntl'] = np.arcsinh(D.ntl); D['y_co'] = D.co * 1000; D['y_so2'] = D.so2 * 1e5
    for v in ['ram', 'leb', 'adha']:
        for t in [2, 3, 4]: D[f'{v}_T{t}'] = D[v] * (D.tipe == t)
    return D
D = prep(M)
names = [f'{v}_T{t}' for v in ['ram', 'leb', 'adha'] for t in [2, 3, 4]]
def fit(D, y, vc={'CRV1': 'kec+ym'}):
    d = D.dropna(subset=[y]); m = pf.feols(f'{y} ~ ' + ' + '.join(names) + ' | uid + ym', data=d, vcov=vc)
    tb = m.tidy()
    return {n: dict(b=round(float(tb.loc[n, 'Estimate']), 4), se=round(float(tb.loc[n, 'Std. Error']), 4), p=round(float(tb.loc[n, 'Pr(>|t|)']), 4)) for n in names}, int(m._N)
R = {}
for y in ['y_ntl', 'y_co', 'y_so2']:
    R[y], n = fit(D, y); R[y]['n'] = n
    R[y + '_kabcluster'], _ = fit(D, y, {'CRV1': 'idkab+ym'})
for sh in [2, -2]:
    Mp = M.copy(); Mp['bulan'] = (Mp.bulan + sh - 1) % 12 + 1
    Mp = Mp.groupby(['tahun', 'bulan']).mean().reset_index()
    Mp = M[['tahun', 'bulan']].merge(Mp, on=['tahun', 'bulan'], how='left').fillna(0)
    Dp = prep(Mp)
    R[f'placebo_{sh:+d}m_ntl'], _ = fit(Dp, 'y_ntl')
# typical T1 level for converting asinh changes to percentage: exp(b)-1 approx for asinh at high values
print(json.dumps(R, indent=1))
json.dump(R, open(f'{OUT}/res_step8b.json', 'w'), indent=1)
