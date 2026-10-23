"""Step 6. Figures for the paper (PNG, 300 dpi)."""
import pandas as pd, numpy as np, geopandas as gpd, json, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap, ListedColormap, BoundaryNorm
from matplotlib.patches import FancyBboxPatch, Patch
OUT = '/home/claude/wte/out'; FIG = '/home/claude/wte/fig'
import os; os.makedirs(FIG, exist_ok=True)
INK, INK2, MUTED, GRID, BASE, SURF = '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#c3c2b7', '#ffffff'
CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7']
BLUE = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
ORNG = ['#fde6da', '#f9c2a5', '#f39a70', '#eb6834', '#c9501f', '#9c3b14', '#6e290d']
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 8, 'axes.edgecolor': BASE, 'axes.labelcolor': INK2,
                     'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.titlesize': 9, 'axes.titleweight': 'bold',
                     'axes.titlecolor': INK, 'axes.grid': True, 'grid.color': GRID, 'grid.linewidth': 0.5,
                     'axes.spines.top': False, 'axes.spines.right': False, 'legend.frameon': False, 'savefig.dpi': 300})
TNAME = {1: 'T1 Inti perkotaan', 2: 'T2 Permukiman peri urban', 3: 'T3 Simpul pasar dan event', 4: 'T4 Agraris perdesaan'}
F = pd.read_parquet(f'{OUT}/desa_final.parquet')
G = gpd.read_file(f'{OUT}/desa_utm.gpkg').merge(F.drop(columns=['iddesa']), on='uid')
KAB = G.dissolve('idkab').boundary
R2 = json.load(open(f'{OUT}/res_step2.json')); R3 = json.load(open(f'{OUT}/res_step3.json'))
R4 = json.load(open(f'{OUT}/res_step4.json')); R5 = json.load(open(f'{OUT}/res_step5.json'))

# ---------------- Figure 1: framework ----------------
fig, ax = plt.subplots(figsize=(7.2, 4.0)); ax.axis('off'); ax.set_xlim(0, 100); ax.set_ylim(0, 60)
def box(x, y, w, h, title, body, fc):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.4,rounding_size=1.2', fc=fc, ec=BASE, lw=0.8))
    ax.text(x + w / 2, y + h - 2.2, title, ha='center', va='top', fontsize=7.5, weight='bold', color=INK)
    ax.text(x + w / 2, y + h - 6.0, body, ha='center', va='top', fontsize=6.3, color=INK2, linespacing=1.35)
def arr(x1, y1, x2, y2): ax.annotate('', (x2, y2), (x1, y1), arrowprops=dict(arrowstyle='-|>', color=MUTED, lw=0.9))
box(1, 36, 22, 22, '1. Data', '5.986 poligon desa (BPS)\nOSM: lahan, POI, sungai\nSusenas 2021 sampai 2024\nIDSD 2022 sampai 2025\nAPBD 2018 sampai 2025\nGEE: NTL, SO2, CO', '#f4f8fe')
box(26, 38, 22, 20, '2. Surface timbulan', 'Dasymetric cerdas (NNLS)\ndikalibrasi ke Susenas\nKDE POI sebagai aktivitas\nMonte Carlo 3.000 iterasi\nModel kalender musiman', '#f4f8fe')
box(51, 38, 22, 20, '3. Tipologi desa', 'k means (k = 4)\nLatent profile analysis\nuji ARI dan bootstrap\nempat modul teknologi', '#f4f8fe')
box(76, 38, 23, 20, '4. Dampak', 'IPCC First Order Decay\nenergi biogas dan LPG\nlapangan kerja hijau\nNPV, BCR, gate fee impas', '#f4f8fe')
box(14, 6, 30, 22, '5. Validasi', 'LOOCV populasi kabupaten dan kota\nPangsa perkotaan versus Susenas\nBenchmark timbulan SIPSN\nNTL VIIRS dan studi peristiwa\nkalender Hijriah 2022 sampai 2025', '#fef6f1')
box(56, 6, 30, 22, '6. Kebijakan', 'MAC, gate fee, dan VGF\nper kabupaten/kota dan tipe\nOptimasi LP amplop fiskal APBD,\nDana Desa, bantuan keuangan\nPeta jalan bertahap 2026 sampai 2030', '#fef6f1')
for x in (23.8, 48.8, 73.8): arr(x, 48, x + 2.0, 48)
arr(37, 37.5, 31, 28.8); arr(87, 37.5, 74, 28.8); arr(44.8, 17, 55.2, 17)
fig.savefig(f'{FIG}/fig1_kerangka.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------------- Figure 2: maps ----------------
fig, axs = plt.subplots(2, 2, figsize=(7.2, 6.4))
def mapbase(a, title):
    a.set_axis_off(); a.set_title(title, loc='left', fontsize=8); KAB.plot(ax=a, color='#ffffff', lw=0.35)
S = G[G.nonsettle == 0]
b1 = [0, 250, 500, 1000, 2500, 5000, 10000, 1e9]
cm = ListedColormap(BLUE); nb = BoundaryNorm(b1, len(BLUE))
S.plot(column='dens', ax=axs[0, 0], cmap=cm, norm=nb, lw=0); mapbase(axs[0, 0], 'a. Kepadatan penduduk (jiwa per km2)')
axs[0, 0].legend(handles=[Patch(color=BLUE[i], label=l) for i, l in enumerate(['<250', '250 sampai 500', '500 sampai 1.000', '1.000 sampai 2.500', '2.500 sampai 5.000', '5.000 sampai 10.000', '>10.000'])], loc='lower left', fontsize=5.5, handlelength=1, borderaxespad=0)
b2 = [0, 50, 100, 200, 500, 1000, 3000, 1e9]
S.plot(column='org_dens', ax=axs[0, 1], cmap=ListedColormap(ORNG), norm=BoundaryNorm(b2, len(ORNG)), lw=0)
mapbase(axs[0, 1], 'b. Timbulan organik (ton per km2 per th)')
axs[0, 1].legend(handles=[Patch(color=ORNG[i], label=l) for i, l in enumerate(['<50', '50 sampai 100', '100 sampai 200', '200 sampai 500', '500 sampai 1.000', '1.000 sampai 3.000', '>3.000'])], loc='lower left', fontsize=5.5, handlelength=1, borderaxespad=0)
S.plot(column='tipe', ax=axs[1, 0], cmap=ListedColormap(CAT), norm=BoundaryNorm([0.5, 1.5, 2.5, 3.5, 4.5], 4), lw=0)
mapbase(axs[1, 0], 'c. Tipologi desentralisasi WtE')
cnt = S.tipe.value_counts()
axs[1, 0].legend(handles=[Patch(color=CAT[t - 1], label=f'{TNAME[t]} ({cnt[t]:,} desa)'.replace(',', '.')) for t in [1, 2, 3, 4]], loc='lower left', fontsize=5.5, handlelength=1, borderaxespad=0)
Kr = pd.read_csv(f'{OUT}/kab_readiness.csv', dtype={'Unnamed: 0': str}).rename(columns={'Unnamed: 0': 'idkab'})
kg = G.dissolve('idkab').reset_index()[['idkab', 'geometry']].merge(Kr, on='idkab')
qcol = {'I': CAT[0], 'II': CAT[1], 'III': CAT[2], 'IV': CAT[3]}
kg['qc'] = kg.quadrant.str.split(':').str[0].map(qcol)
kg.plot(color=kg.qc, ax=axs[1, 1], ec='white', lw=0.5); axs[1, 1].set_axis_off(); axs[1, 1].set_title('d. Kuadran potensi dan kesiapan', loc='left', fontsize=8)
ql = {'I': 'I potensi tinggi, siap tinggi', 'II': 'II potensi tinggi, siap rendah', 'III': 'III potensi rendah, siap tinggi', 'IV': 'IV potensi rendah, siap rendah'}
axs[1, 1].legend(handles=[Patch(color=qcol[k], label=v) for k, v in ql.items()], loc='lower left', fontsize=5.5, handlelength=1, borderaxespad=0)
plt.tight_layout(); fig.savefig(f'{FIG}/fig2_peta.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------------- Figure 3: validation and seasonality ----------------
fig, axs = plt.subplots(1, 4, figsize=(7.4, 2.3))
# (a) LOOCV kabkota population, recompute quickly
from scipy.optimize import nnls
Sv = pd.read_csv(f'{OUT}/susenas_kab.csv', dtype={'kab': str}); P24 = Sv[Sv.tahun == 2024].set_index('kab')
P24['pop'] = P24.pop5 / P24.pop5.sum() * 50.35e6
Fx = F.copy(); Fx['idkab'] = Fx.idkab.astype(str)
K = Fx.groupby('idkab')[['nd', 'lu_res_km2', 'rural_land', 'poi_all', 'ntl_sum']].sum().join(P24['pop'])
X = K.iloc[:, :5].values; y = K['pop'].values; loo = []
for i in range(len(y)):
    m = np.arange(len(y)) != i; b, _ = nnls(X[m], y[m]); loo.append(X[i] @ b)
a = axs[0]; a.scatter(y / 1e6, np.array(loo) / 1e6, s=12, color=CAT[0], ec='white', lw=0.4, zorder=3)
lim = [0, 7]; a.plot(lim, lim, color=MUTED, lw=0.8, ls='--'); a.set_xlim(lim); a.set_ylim(lim)
a.set_xlabel('Susenas (juta jiwa)'); a.set_ylabel('Prediksi LOOCV (juta jiwa)')
a.set_title('a. Populasi kab/kota', loc='left'); a.text(0.3, 6.2, f"Q2 = {R2['dasy']['Q2_loo']:.2f}\nr = {R2['dasy']['pearson_loo']:.2f}", fontsize=6.5, color=INK2)
U = pd.read_csv(f'{OUT}/urban_validation.csv')
a = axs[1]; a.scatter(U.susenas * 100, U.model * 100, s=12, color=CAT[0], ec='white', lw=0.4, zorder=3); a.plot([0, 100], [0, 100], color=MUTED, lw=0.8, ls='--')
a.set_xlabel('Susenas (%)'); a.set_ylabel('Model (%)'); a.set_title('b. Pangsa perkotaan', loc='left')
a.text(3, 88, f"r = {R2['urban']['r']:.2f}\nMAE = {R2['urban']['mae_pp']:.1f} poin", fontsize=6.5, color=INK2)
B = pd.read_csv(f'{OUT}/sipsn_benchmark.csv')
a = axs[2]; a.scatter(B.sipsn_kt, B.model_kt_2021, s=14, color=CAT[0], ec='white', lw=0.4, zorder=3); a.plot([0, 500], [0, 500], color=MUTED, lw=0.8, ls='--')
a.set_xlabel('SIPSN 2021 (ribu ton)'); a.set_ylabel('Model (ribu ton)'); a.set_title('c. Timbulan (n = 5)', loc='left')
a.text(15, 420, f"r = {R2['sipsn_bench']['r']:.2f}\nMAPE = {R2['sipsn_bench']['mape']:.1f}%", fontsize=6.5, color=INK2)
a = axs[3]; mo = np.arange(1, 13); cp = R2['seasonal']['comp_profiles']
for k, c, l in [('household', CAT[0], 'Rumah tangga'), ('market', CAT[1], 'Pasar'), ('event', CAT[2], 'Event dan wisata')]:
    a.plot(mo, cp[k], color=c, lw=1.6, label=l)
a.plot(mo, R2['seasonal']['prov_index'], color=INK, lw=1.0, ls=':', label='Provinsi')
a.axhline(1, color=BASE, lw=0.6); a.set_xticks(mo); a.set_xticklabels(list('JFMAMJJASOND'))
a.set_title('d. Indeks musiman 2025', loc='left'); a.set_ylabel('Indeks (rerata = 1)'); a.legend(fontsize=5.3, loc='lower right', ncol=1)
plt.tight_layout(w_pad=0.8); fig.savefig(f'{FIG}/fig3_validasi.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------------- Figure 4: typology selection and profiles ----------------
km = pd.read_csv(f'{OUT}/kmeans_selection.csv'); lp = pd.read_csv(f'{OUT}/lpa_selection.csv'); zc = pd.read_csv(f'{OUT}/typology_centroids.csv', index_col=0)
fig, axs = plt.subplots(1, 3, figsize=(7.2, 2.4), gridspec_kw={'width_ratios': [1, 1, 1.5]})
a = axs[0]; a.plot(km.k, km.silhouette, color=CAT[0], marker='o', ms=4, lw=1.6); a.axvline(4, color=MUTED, lw=0.7, ls='--')
a.set_title('a. Silhouette k means', loc='left'); a.set_xlabel('k'); a.set_xticks(range(2, 9))
a = axs[1]; a.plot(lp.k, lp.BIC / 1000, color=CAT[1], marker='o', ms=4, lw=1.6); a.axvline(4, color=MUTED, lw=0.7, ls='--')
a.set_title('b. BIC LPA (ribu)', loc='left'); a.set_xlabel('k'); a.set_xticks(range(2, 9))
a = axs[2]; a.grid(False)
lab = ['Log kepadatan', 'Log volume organik', 'Pangsa non RT', 'Log jarak TPA']
div = LinearSegmentedColormap.from_list('d', ['#256abf', '#f0efec', '#e34948'])
im = a.imshow(zc.values, cmap=div, vmin=-2, vmax=2, aspect='auto')
a.set_xticks(range(4)); a.set_xticklabels(lab, rotation=20, ha='right', fontsize=6.3); a.set_yticks(range(4)); a.set_yticklabels([TNAME[t] for t in [1, 2, 3, 4]], fontsize=6.3)
for i in range(4):
    for j in range(4): a.text(j, i, f'{zc.values[i, j]:.2f}', ha='center', va='center', fontsize=6.3, color=INK)
a.set_title('c. Centroid terstandar (skor z)', loc='left')
plt.tight_layout(); fig.savefig(f'{FIG}/fig4_tipologi.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------------- Figure 5: Monte Carlo outcomes and break even gate fee ----------------
M = pd.read_parquet(f'{OUT}/mc_impact.parquet')
fig, axs = plt.subplots(1, 4, figsize=(7.4, 2.3))
def hist(a, v, title, xlabel, c=CAT[0]):
    a.hist(v, bins=40, color=c, ec='white', lw=0.3); q = np.percentile(v, [5, 50, 95])
    for x, ls in zip(q, [':', '-', ':']): a.axvline(x, color=INK, lw=0.8, ls=ls)
    a.set_title(title, loc='left'); a.set_xlabel(xlabel + f'\nP50 {q[1]:.2f}; 90%: {q[0]:.2f} sampai {q[2]:.2f}', fontsize=6.5); a.set_yticks([])
hist(axs[0], M.net10_tot / 1e6, 'a. Emisi dihindari', 'juta t CO2e per tahun')
hist(axs[1], M.eprim_tot / 1000, 'b. Energi biogas', 'TWh per tahun')
hist(axs[2], M.jobs_tot / 1000, 'c. Pekerjaan hijau', 'ribu pekerja langsung')
a = axs[3]; data = [M[f'feebe{t}'] / 1000 for t in [1, 2, 3, 4]]
bp = a.boxplot(data, widths=0.55, showfliers=False, patch_artist=True, medianprops=dict(color=INK, lw=1))
for p, c in zip(bp['boxes'], CAT): p.set_facecolor(c); p.set_alpha(0.85); p.set_edgecolor('white')
a.axhline(386, color=INK2, lw=0.9, ls='--'); a.set_ylim(-300, 1450); a.text(0.55, 1440, 'garis putus: tipping fee\nLegok Nangka Rp386 ribu', fontsize=5.3, color=INK2, ha='left', va='top')
a.set_xticks([1, 2, 3, 4]); a.set_xticklabels(['T1', 'T2', 'T3', 'T4']); a.set_ylabel('ribu Rp per ton'); a.set_title('d. Gate fee impas', loc='left')
plt.tight_layout(w_pad=0.7); fig.savefig(f'{FIG}/fig5_montecarlo.png', bbox_inches='tight', facecolor='white'); plt.close()

# ---------------- Figure 6: potential vs readiness ----------------
fig, a = plt.subplots(figsize=(5.4, 3.6))
for q, c in qcol.items():
    d = Kr[Kr.quadrant.str.startswith(q + ':')]
    a.scatter(d.readiness, d.potential, s=np.sqrt(d['div']) / 6, color=c, alpha=0.9, ec='white', lw=0.6, label=ql[q], zorder=3)
for _, r in Kr.iterrows():
    off = {'Kab. Garut': (-22, 8), 'Kab. Sukabumi': (4, 6), 'Kab. Cirebon': (-30, -2), 'Kab. Karawang': (-40, -10), 'Kab. Ciamis': (-24, 5),
           'Kab. Kuningan': (6, -6), 'Kab. Majalengka': (4, -7), 'Kab. Purwakarta': (-40, -8), 'Kab. Bandung': (4, -8), 'Kab. Bekasi': (4, 5),
           'Kota Bekasi': (4, -8), 'Kota Cimahi': (4, -6)}.get(r.nama, (3, 2))
    a.annotate(r.nama.replace('Kab. ', '').replace('Kota ', 'Kt '), (r.readiness, r.potential), fontsize=5.2, color=INK2, xytext=off, textcoords='offset points')
a.axhline(0, color=BASE, lw=0.8); a.axvline(0, color=BASE, lw=0.8)
a.set_xlabel('Indeks kesiapan (skor z: fiskal, kelembagaan, keuangan inklusif)'); a.set_ylabel('Potensi pengalihan organik (skor z log)')
a.legend(fontsize=5.8, loc='lower right')
plt.tight_layout(); fig.savefig(f'{FIG}/fig6_kuadran.png', bbox_inches='tight', facecolor='white'); plt.close()
print('ok')
