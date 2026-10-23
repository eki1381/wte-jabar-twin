"""Step 5. Fiscal space (APBD 2018 to 2025), competitiveness (IDSD 2022 to 2025) and household financial inclusion
(Susenas 2021 to 2024) at kabkota level; readiness index and potential by readiness matrix."""
import pandas as pd, numpy as np, json, re
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from scipy import stats
U = '/root/.claude/uploads/8575afab-4bf0-5ac1-ac64-ec19a70d5fc5'
OUT = '/home/claude/wte/out'
KAB = {'3201': 'Kab. Bogor', '3202': 'Kab. Sukabumi', '3203': 'Kab. Cianjur', '3204': 'Kab. Bandung', '3205': 'Kab. Garut',
       '3206': 'Kab. Tasikmalaya', '3207': 'Kab. Ciamis', '3208': 'Kab. Kuningan', '3209': 'Kab. Cirebon', '3210': 'Kab. Majalengka',
       '3211': 'Kab. Sumedang', '3212': 'Kab. Indramayu', '3213': 'Kab. Subang', '3214': 'Kab. Purwakarta', '3215': 'Kab. Karawang',
       '3216': 'Kab. Bekasi', '3217': 'Kab. Bandung Barat', '3218': 'Kab. Pangandaran', '3271': 'Kota Bogor', '3272': 'Kota Sukabumi',
       '3273': 'Kota Bandung', '3274': 'Kota Cirebon', '3275': 'Kota Bekasi', '3276': 'Kota Depok', '3277': 'Kota Cimahi',
       '3278': 'Kota Tasikmalaya', '3279': 'Kota Banjar'}
norm = lambda s: re.sub(r'\s+', ' ', str(s).replace('Kabupaten', 'Kab.').replace('Kab ', 'Kab. ').strip()).lower()
name2code = {norm(v): k for k, v in KAB.items()}
rows = []
# ---- APBD long format years ----
for yr, f, cols in [(2018, '42552d5b-APBD2018_10092020-Website.xlsx', dict(rev=3, pad=4, exp=20, cap=33, silpa=37)),
                    (2019, '3b492492-APBD2019_10092020-Website.xlsx', dict(rev=3, pad=4, exp=21, cap=34, silpa=37)),
                    (2020, '721496af-APBD-2020_per8Juli2020_value_1.xlsx', dict(rev=3, pad=4, exp=20, cap=33, silpa=36))]:
    d = pd.read_excel(f'{U}/{f}', header=None)
    for _, r in d.iterrows():
        c = name2code.get(norm(r[1]))
        if c: rows.append(dict(year=yr, kab=c, **{k: pd.to_numeric(r[v], errors='coerce') for k, v in cols.items()}))
# ---- APBD wide format years ----
for yr, f, sh in [(2021, '482d5371-APBD-2021_12082021_update_1.xlsx', 'FINAL'), (2022, '7b574381-APBD-2022_09062022_upd_1.xlsx', 'APBD 2022_FINAL'),
                  (2023, 'f37c062d-APBD_2023_12052023_1.xlsx', 'Sheet2'), (2024, '14854f3b-Anggaran_APBD_Ringkas_2024_08072024_2.xlsx', 'Sheet2'),
                  (2025, 'e7930d14-Anggaran_APBD_Ringkas_2025_28052025_1.xlsx', 'Tabel')]:
    d = pd.read_excel(f'{U}/{f}', sheet_name=sh, header=None)
    lab = d.iloc[:, 0].astype(str).str.strip()
    def row(pat):
        i = lab[lab.str.match(pat, case=False)].index
        return d.loc[i[0]] if len(i) else None
    R = {'rev': row(r'^4\.\s'), 'pad': row(r'^41\.\s'), 'exp': row(r'^5\.\s'), 'cap': row(r'^52\.\s'), 'silpa': row(r'^(6101|611)\.')}
    for j in range(1, d.shape[1]):
        c = name2code.get(norm(d.iloc[4, j]))
        if c: rows.append(dict(year=yr, kab=c, **{k: (pd.to_numeric(v[j], errors='coerce') if v is not None else np.nan) for k, v in R.items()}))
A = pd.DataFrame(rows).groupby(['year', 'kab']).first().reset_index()
print(A.groupby('year').size().to_dict())
A['pad_share'] = A.pad / A.rev; A['cap_share'] = A.cap / A.exp; A['silpa_ratio'] = A.silpa / A.exp
A.to_csv(f'{OUT}/apbd_panel.csv', index=False)
# trend of capital spending share and PAD share, 2018 to 2025 (OLS slope per kab)
def slope(g, v):
    g = g.dropna(subset=[v]); return stats.linregress(g.year, g[v]).slope if len(g) > 3 else np.nan
AT = A.groupby('kab').apply(lambda g: pd.Series({'pad_share_mean': g.pad_share.mean(), 'cap_share_mean': g.cap_share.mean(),
                                                  'silpa_mean': g.silpa_ratio.mean(), 'pad_share_slope': slope(g, 'pad_share'),
                                                  'cap_share_slope': slope(g, 'cap_share'), 'exp_2025': g.loc[g.year == 2025, 'exp'].sum(),
                                                  'cap_2025': g.loc[g.year == 2025, 'cap'].sum(), 'cap_mean': g.cap.mean()}), include_groups=False)
# ---- IDSD ----
def idsd(f, sh, year):
    d = pd.read_excel(f'{U}/{f}', sheet_name=sh, header=None)
    hdr = d.iloc[:6].astype(str)
    kcol = [c for c in d.columns if hdr[c].str.contains('Kode KabKota').any()][0]
    def col(code):
        cs = [c for c in d.columns if (hdr[c].str.strip() == code).any()]
        return cs[0] if cs else None
    tot = [c for c in d.columns if hdr[c].str.contains('Total Indeks').any()][0]
    m = {'idsd': tot, 'env_mgmt': col('1.14'), 'elec': col('2.06'), 'fiscal_cap': col('4.02'), 'credit': col('9.01'), 'kur': col('9.02')}
    out = []
    for _, r in d.iterrows():
        k = str(r[kcol]).split('.')[0]
        if k in KAB: out.append(dict(kab=k, year=year, **{a: (pd.to_numeric(r[b], errors='coerce') if b is not None else np.nan) for a, b in m.items()}))
    return pd.DataFrame(out)
I = pd.concat([idsd('ffc49c79-Skor_IDSD_2022_Prov-Kab-Kota_LENGKAP_value_update_Mei_2023.xlsx', 'Indeks KabKota', 2022),
               idsd('a689181c-Skor_IDSD_2023_Prov-Kab-Kota_Update_Agustus_2024.xlsx', 'Nilai Indeks KabKota', 2023),
               idsd('a4a36d06-Value_SKOR_IDSD_2024_April_2025_150425.xlsx', 'SKOR_KabKota', 2024),
               idsd('42ba253e-VALUE_IDSD_2025_24022026.xlsx', 'SKOR_KabKota', 2025)])
print(I.groupby('year').size().to_dict()); print(I[I.year == 2025].describe().round(2))
I.to_csv(f'{OUT}/idsd_panel.csv', index=False)
I25 = I[I.year == 2025].set_index('kab'); I22 = I[I.year == 2022].set_index('kab')
# ---- Susenas financial inclusion ----
S = pd.read_csv(f'{OUT}/susenas_kab.csv', dtype={'kab': str})
S24 = S[S.tahun == 2024].set_index('kab'); S21 = S[S.tahun == 2021].set_index('kab')
# ---- WtE potential by kab ----
K = pd.read_csv(f'{OUT}/kab_summary.csv', dtype={'idkab': str}).set_index('idkab')
D = pd.DataFrame(index=list(KAB)); D['nama'] = pd.Series(KAB)
D = D.join(AT).join(I25[['idsd', 'env_mgmt', 'elec', 'fiscal_cap', 'kur']]).join((I25.idsd - I22.idsd).rename('idsd_change'))
D = D.join(S24[['tabungan', 'kredit_any', 'urb']]).join((S24.tabungan - S21.tabungan).rename('tabungan_change'))
D = D.join(K[['pop', 'ORG', 'div', 'eprim', 't1', 't2', 't3', 't4', 'n_desa']])
# theory driven composite: fiscal, institutional, financial inclusion dimensions (equal weights of z scores)
DIM = {'fiskal': ['pad_share_mean', 'cap_share_mean', 'fiscal_cap'], 'kelembagaan': ['idsd', 'env_mgmt'], 'keuangan': ['tabungan', 'kur']}
ready_vars = sum(DIM.values(), [])
zs = lambda s: (s - s.mean()) / s.std()
for k, v in DIM.items(): D[f'dim_{k}'] = pd.concat([zs(D[c]) for c in v], axis=1).mean(1)
D['readiness_eq'] = D[[f'dim_{k}' for k in DIM]].mean(1)
Z = StandardScaler().fit_transform(D[ready_vars].fillna(D[ready_vars].median()))
pca = PCA().fit(Z)
load = pd.Series(pca.components_[0], index=ready_vars)
if load.sum() < 0: load = -load
D['readiness_pca'] = Z @ load.values
D['readiness'] = zs(D.readiness_eq)
# Cronbach alpha of the seven standardised indicators
Zs = pd.DataFrame(Z, columns=ready_vars); kk = Zs.shape[1]
alpha = kk / (kk - 1) * (1 - Zs.var().sum() / Zs.sum(1).var())
D['potential'] = (np.log(D['div']) - np.log(D['div']).mean()) / np.log(D['div']).std()
D['quadrant'] = np.select([(D.potential >= 0) & (D.readiness >= 0), (D.potential >= 0) & (D.readiness < 0), (D.potential < 0) & (D.readiness >= 0)],
                          ['I: potensi tinggi, kesiapan tinggi', 'II: potensi tinggi, kesiapan rendah', 'III: potensi rendah, kesiapan tinggi'],
                          'IV: potensi rendah, kesiapan rendah')
# capex need (central estimate: median unit capex scaled from Monte Carlo totals) relative to capital spending
imp = json.load(open(f'{OUT}/res_step4.json'))
capex_per_t = imp['province']['capex_tot'][1] / imp['province']['div_tot'][1]
D['capex_need'] = D['div'] * capex_per_t
D['capex_to_cap2025'] = D.capex_need / D.cap_2025
D['capex_5yr_share'] = D.capex_need / 5 / D.cap_2025
res = {'pca_var_explained': pca.explained_variance_ratio_[:3].round(3).tolist(), 'pca_loadings': load.round(3).to_dict(),
       'rho_pca_eq': round(stats.spearmanr(D.readiness_pca, D.readiness_eq)[0], 3), 'cronbach_alpha': round(float(alpha), 3), 'dim_corr': D[[f'dim_{k}' for k in DIM]].corr().round(2).to_dict(),
       'corr_pot_ready': round(stats.spearmanr(D.potential, D.readiness)[0], 3),
       'quadrants': D.quadrant.value_counts().to_dict(), 'capex_per_t_Rp': capex_per_t,
       'capex_5yr_share_median': round(float(D.capex_5yr_share.median()), 3), 'capex_5yr_share_range': [round(float(D.capex_5yr_share.min()), 3), round(float(D.capex_5yr_share.max()), 3)],
       'jabar_tabungan_2021_2024': [float(np.average(S21.tabungan, weights=S21.pop5)), float(np.average(S24.tabungan, weights=S24.pop5))],
       'jabar_kredit_2024': float(np.average(S24.kredit_any, weights=S24.pop5)),
       'cap_share_prov_mean_by_year': A.groupby('year').apply(lambda g: g.cap.sum() / g.exp.sum(), include_groups=False).round(3).to_dict(),
       'pad_share_prov_by_year': A.groupby('year').apply(lambda g: g.pad.sum() / g.rev.sum(), include_groups=False).round(3).to_dict()}
print(json.dumps(res, indent=1, default=float))
D.to_csv(f'{OUT}/kab_readiness.csv')
print(D[['nama', 'pad_share_mean', 'cap_share_mean', 'fiscal_cap', 'env_mgmt', 'tabungan', 'idsd', 'readiness', 'potential', 'quadrant', 'capex_5yr_share']].round(3).sort_values('readiness').to_string())
json.dump(res, open(f'{OUT}/res_step5.json', 'w'), indent=1, default=float)
