"""Step 10. Extra figures: NTL validation and calendar event study; public funds supply curve with fiscal envelopes."""
import pandas as pd, numpy as np, json, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
OUT = '/home/claude/wte/out'; FIG = '/home/claude/wte/fig'
INK, INK2, MUTED, GRID, BASE = '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#c3c2b7'
CAT = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7']
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 8, 'axes.edgecolor': BASE, 'axes.labelcolor': INK2, 'xtick.color': MUTED,
                     'ytick.color': MUTED, 'axes.titlesize': 9, 'axes.titleweight': 'bold', 'axes.titlecolor': INK, 'axes.grid': True,
                     'grid.color': GRID, 'grid.linewidth': 0.5, 'axes.spines.top': False, 'axes.spines.right': False, 'legend.frameon': False, 'savefig.dpi': 300})
R8 = json.load(open(f'{OUT}/res_step8.json')); R8b = json.load(open(f'{OUT}/res_step8b.json')); R9 = json.load(open(f'{OUT}/res_step9.json'))
V1 = pd.read_parquet('/home/claude/wte/out_v1/desa_final.parquet'); G = pd.read_parquet(f'{OUT}/gee_annual.parquet')
d = V1[V1.nonsettle == 0].merge(G, on='uid'); T = pd.read_parquet(f'{OUT}/typology.parquet'); d = d.drop(columns=['tipe']).merge(T[['uid', 'tipe']], on='uid')
prof = pd.read_csv(f'{OUT}/gee_monthly_profile_type.csv')
fig, axs = plt.subplots(1, 3, figsize=(7.4, 2.5), gridspec_kw={'width_ratios': [1.1, 1, 1.2]})
a = axs[0]
a.hexbin(np.log10(d.dens.clip(10)), np.log10(d.ntl_2024.clip(0.1)), gridsize=40, cmap=matplotlib.colors.LinearSegmentedColormap.from_list('b', ['#f4f8fe', '#9ec5f4', '#256abf', '#0d366b']), mincnt=1, lw=0)
a.set_xlabel('log10 kepadatan model v1 (tanpa NTL)'); a.set_ylabel('log10 NTL 2024 (nW/cm²/sr)'); a.grid(False)
a.set_title('a. NTL versus kepadatan', loc='left'); a.text(0.04, 0.92, f"ρ = {R8['ntl_vs_v1_density_spearman']:.2f}".replace('.', ','), transform=a.transAxes, fontsize=7, color=INK2)
a = axs[1]
for t, c in zip([1, 2, 3, 4], CAT):
    x = prof[prof.tipe == t]; a.plot(x.bulan, x.ntl - x.ntl.mean(), color=c, lw=1.5, label=f'T{t}')
a.axhline(0, color=BASE, lw=0.6); a.set_xticks(range(1, 13)); a.set_xticklabels(list('JFMAMJJASOND'))
a.set_title('b. Profil NTL bulanan', loc='left'); a.set_ylabel('asinh NTL, selisih rerata'); a.legend(fontsize=6, ncol=2, loc='lower center')
a = axs[2]
labs, b, se, cols, ys = [], [], [], [], []
y0 = 0
for grp, key, nm in [('Lebaran', 'leb', 'y_ntl'), ('Plasebo +2 bln', 'leb', 'placebo_+2m_ntl'), ('Ramadan', 'ram', 'y_ntl')]:
    for t in [2, 3, 4]:
        e = R8b[nm][f'{key}_T{t}']; b.append(e['b']); se.append(e['se']); cols.append(CAT[t - 1]); ys.append(y0); labs.append(f'{grp} T{t}'); y0 += 1
    y0 += 0.6
ys = np.array(ys)
for yy, bb, ss, cc in zip(ys, b, se, cols):
    a.plot([bb - 1.96 * ss, bb + 1.96 * ss], [yy, yy], color=cc, lw=1.6); a.plot(bb, yy, 'o', color=cc, ms=4.5, mec='white', mew=0.6)
a.axvline(0, color=INK2, lw=0.7); a.set_yticks(ys); a.set_yticklabels(labs, fontsize=6.3); a.invert_yaxis()
a.set_xlabel('Efek relatif terhadap T1 (asinh NTL)'); a.set_title('c. Studi peristiwa (FE desa, tahun×bulan)', loc='left', fontsize=8)
plt.tight_layout(w_pad=0.8); fig.savefig(f'{FIG}/fig7_ntl_event.png', bbox_inches='tight', facecolor='white'); plt.close()

s = pd.read_csv(f'{OUT}/supply_curve_phase.csv')
fig, a = plt.subplots(figsize=(6.2, 3.1))
x = np.r_[0, s.cum_ghg.values] / 1e3; yv = np.r_[0, s.cum_vgf.values] / 1e12
a.step(x, yv, where='post', color=CAT[0], lw=1.8)
tot = s.ghg_p50.sum() / 1e3
b1 = s[s.phase == 1].cum_ghg.max() / 1e3; b2 = s[s.phase <= 2].cum_ghg.max() / 1e3
for bx in (b1, b2): a.axvline(bx, color=MUTED, lw=0.7, ls='--')
a.text(b1 / 2, 2.6, 'Tahap 1\n2026 sampai 2027', ha='center', fontsize=6.5, color=INK2)
a.text((b1 + b2) / 2, 2.6, 'Tahap 2\n2028 sampai 2029', ha='center', fontsize=6.5, color=INK2)
a.text((b2 + tot) / 2, 3.05, 'Tahap 3\n2030', ha='center', fontsize=6.5, color=INK2)
env = R9['envelopes']
for nm, c, ls in [('konservatif', INK2, ':'), ('dasar', CAT[1], '--'), ('ambisius', CAT[2], '-.')]:
    v = (env[nm]['env_kab_total'] + env[nm]['env_dd_total'] + env[nm]['env_bk']) / 1e12
    if v < 4.2:
        a.axhline(v, color=c, lw=1, ls=ls); a.text(tot * 0.02, v + 0.07, f'amplop {nm}: Rp{v:.2f} triliun'.replace('.', ','), fontsize=6.3, color=INK2)
    else:
        a.text(tot * 0.02, 4.05, f'amplop {nm}: Rp{v:.2f} triliun (di atas skala)'.replace('.', ','), fontsize=6.3, color=INK2)
a.set_xlim(0, tot * 1.02); a.set_ylim(0, 4.3)
a.set_xlabel('Kumulatif emisi dihindari (ribu t CO₂e per tahun)'); a.set_ylabel('Kumulatif VGF publik (Rp triliun)')
plt.tight_layout(); fig.savefig(f'{FIG}/fig8_supply.png', bbox_inches='tight', facecolor='white'); plt.close()
print('ok')
