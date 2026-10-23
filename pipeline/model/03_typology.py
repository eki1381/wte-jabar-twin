"""Step 3. Desa typology: k-means and latent profile analysis (Gaussian mixture), agreement and profiles."""
import pandas as pd, numpy as np, json
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture
from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score, adjusted_rand_score
OUT = '/home/claude/wte/out'
F = pd.read_parquet(f'{OUT}/desa_model.parquet')
S = F[F.nonsettle == 0].copy()
S['anchor'] = S[['poi_school', 'poi_pesantren', 'poi_pasar', 'poi_health', 'poi_banksampah', 'poi_waste']].sum(axis=1)
feat = pd.DataFrame({
    'log_dens': np.log(S.dens.clip(1)),
    'log_org': np.log(S.ORG_mean.clip(1)),
    'nhh_share': S.NHH_p50,
    'log_dist_tpa': np.log(S.dist_tpa_m.clip(100) / 1000),
})
Z = StandardScaler().fit_transform(feat)
res = {'n_units': int(len(S)), 'features': list(feat.columns)}
km_tab, gm_tab = [], []
for k in range(2, 9):
    km = KMeans(k, n_init=50, random_state=1).fit(Z)
    lab = km.labels_
    sil = silhouette_score(Z, lab, sample_size=4000, random_state=1)
    km_tab.append(dict(k=k, inertia=km.inertia_, silhouette=sil, CH=calinski_harabasz_score(Z, lab), DB=davies_bouldin_score(Z, lab)))
    gm = GaussianMixture(k, covariance_type='diag', n_init=10, random_state=1).fit(Z)
    p = gm.predict_proba(Z)
    ent = 1 + (p * np.log(np.clip(p, 1e-12, 1))).sum() / (len(Z) * np.log(k))  # relative entropy
    gm_tab.append(dict(k=k, BIC=gm.bic(Z), AIC=gm.aic(Z), entropy=ent, min_class=np.bincount(gm.predict(Z)).min() / len(Z)))
km_tab = pd.DataFrame(km_tab); gm_tab = pd.DataFrame(gm_tab)
print(km_tab.round(3)); print(gm_tab.round(3))
km_tab.to_csv(f'{OUT}/kmeans_selection.csv', index=False); gm_tab.to_csv(f'{OUT}/lpa_selection.csv', index=False)
K = 4  # set after inspecting indices (see paper)
km = KMeans(K, n_init=100, random_state=1).fit(Z)
gm = GaussianMixture(K, covariance_type='diag', n_init=20, random_state=1).fit(Z)
gs = GaussianMixture(K, covariance_type='spherical', n_init=20, random_state=1).fit(Z)
S['km'] = km.labels_; S['lpa'] = gm.predict(Z); S['lpa_pmax'] = gm.predict_proba(Z).max(1)
res['ARI_km_lpa'] = round(adjusted_rand_score(S.km, S.lpa), 3)
res['ARI_km_lpa_spherical'] = round(adjusted_rand_score(S.km, gs.predict(Z)), 3)
res['sil_k4'] = round(float(silhouette_score(Z, S.km)), 3)
# bootstrap stability of k-means (ARI between full solution and bootstrap refits)
rng = np.random.default_rng(7); ari = []
for b in range(100):
    idx = rng.integers(0, len(Z), len(Z))
    kb = KMeans(K, n_init=10, random_state=b).fit(Z[idx])
    ari.append(adjusted_rand_score(S.km, kb.predict(Z)))
res['kmeans_boot_ARI'] = [round(float(np.mean(ari)), 3), round(float(np.percentile(ari, 5)), 3)]
# order clusters by density, label as types
order = S.groupby('km').dens.median().sort_values(ascending=False).index.tolist()
S['tipe'] = S.km.map({c: i + 1 for i, c in enumerate(order)})
prof = S.groupby('tipe').agg(n=('uid', 'size'), pop=('pop', 'sum'), dens=('dens', 'median'), org_t=('ORG_mean', 'sum'),
                             org_desa=('ORG_mean', 'median'), nhh=('NHH_p50', 'median'), pmr=('pmr', 'median'),
                             anchor=('anchor', 'mean'), dist_tpa=('dist_tpa_m', 'median'), dist_river=('dist_river_m', 'median'),
                             urban=('urban_m', 'mean'), area=('area_km2', 'median'))
prof['pop_share'] = prof['pop'] / prof['pop'].sum(); prof['org_share'] = prof.org_t / prof.org_t.sum()
print(prof.round(3).T)
zc = pd.DataFrame(km.cluster_centers_, columns=feat.columns).loc[order].reset_index(drop=True); zc.index = zc.index + 1
print(zc.round(2))
ct = pd.crosstab(S.tipe, S.lpa); print(ct)
prof.to_csv(f'{OUT}/typology_profile.csv'); zc.to_csv(f'{OUT}/typology_centroids.csv')
S[['uid', 'tipe', 'lpa', 'lpa_pmax', 'anchor']].to_parquet(f'{OUT}/typology.parquet')
res['lpa_mean_posterior'] = round(float(S.lpa_pmax.mean()), 3)
json.dump(res, open(f'{OUT}/res_step3.json', 'w'), indent=1, default=float)
print(res)
