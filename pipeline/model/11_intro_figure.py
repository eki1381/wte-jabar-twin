"""Intro figure: indicative and pooled data not used in the main analysis.
(a) regional capital spending per capita 2024 by province (pooled national APBD, Susenas 2024 weights, age 5 and over)
(b) capital spending share of kab/kota APBD 2021 to 2025: West Java vs rest of Java vs outside Java (pooled national APBD)
(c) waste data gap for West Java: SIPSN 2021 reported vs DLH 2024 statement vs 0.7 kg per capita norm (secondary, indicative)"""
import pandas as pd, numpy as np, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
OUT = '/home/claude/wte/out'; FIG = '/home/claude/wte/fig'
INK, INK2, MUTED, GRID, BASE = '#0b0b0b', '#52514e', '#898781', '#e1e0d9', '#c3c2b7'
CAT = ['#2a78d6', '#eb6834', '#1baf7a']
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 7.5, 'axes.edgecolor': BASE, 'axes.labelcolor': INK2, 'xtick.color': MUTED,
                     'ytick.color': MUTED, 'axes.titlesize': 8.5, 'axes.titleweight': 'bold', 'axes.titlecolor': INK, 'axes.grid': True,
                     'grid.color': GRID, 'grid.linewidth': 0.5, 'axes.spines.top': False, 'axes.spines.right': False, 'legend.frameon': False, 'savefig.dpi': 300})
a = pd.read_csv(f'{OUT}/intro_prov_2024.csv', index_col=0).sort_values('cap_pc')
t = pd.read_csv(f'{OUT}/intro_capshare_trend.csv', index_col=0)
fig = plt.figure(figsize=(7.4, 3.6)); gs = fig.add_gridspec(1, 3, width_ratios=[1.25, 1, 0.95], wspace=0.7)
ax = fig.add_subplot(gs[0]); ax.grid(axis='y', visible=False)
top = a.head(12)
cols = [CAT[0] if n == 'Jawa Barat' else BASE for n in top.index]
ax.barh(range(len(top)), top.cap_pc / 1000, color=cols, height=0.7)
ax.set_yticks(range(len(top))); ax.set_yticklabels(top.index, fontsize=6.5)
for i, (n, v) in enumerate(zip(top.index, top.cap_pc / 1000)):
    ax.text(v + 12, i, f'{v:,.0f}'.replace(',', '.'), va='center', fontsize=6, color=INK2)
ax.set_xlim(0, 1000)
ax.set_title('a. Belanja modal per kapita,\n12 provinsi terendah, 2024', loc='left')
jb = a.loc['Jawa Barat']
ax.set_xlabel(f"ribu Rp per penduduk\nJawa Barat: {jb.pop_sh*100:.1f}% penduduk, {jb.cap_share_nat*100:.1f}% belanja modal".replace('.', ','))
ax = fig.add_subplot(gs[1])
for c, col, ls in [('Jawa Barat', CAT[0], '-'), ('Jawa lainnya', CAT[1], '--'), ('Luar Jawa', CAT[2], '-.')]:
    ax.plot(t.index, t[c] * 100, color=col, lw=1.8, ls=ls, marker='o', ms=3.5, label=c)
ax.set_xticks(t.index); ax.set_ylabel('% belanja kab/kota'); ax.set_ylim(8, 20)
ax.set_title('b. Pangsa belanja modal\nAPBD kab/kota', loc='left'); ax.legend(fontsize=6.3, loc='lower left')
ax = fig.add_subplot(gs[2]); ax.grid(axis='x', visible=False)
vals = [1.07, 25000 * 365 / 1e6, 50.35e6 * 0.7 * 365 / 1e9]
labs = ['SIPSN\n2021', 'DLH\n2024', 'Norma\n0,7 kg']
ax.bar(range(3), vals, color=[BASE, CAT[0], CAT[1]], width=0.62)
for i, v in enumerate(vals): ax.text(i, v + 0.25, f'{v:.2f}'.replace('.', ','), ha='center', fontsize=6.5, color=INK)
ax.set_xticks(range(3)); ax.set_xticklabels(labs, fontsize=6.3); ax.set_ylabel('juta ton per tahun'); ax.set_ylim(0, 15)
ax.set_title('c. Timbulan Jawa Barat,\nterlapor versus indikatif', loc='left')
fig.savefig(f'{FIG}/fig0_intro.png', bbox_inches='tight', facecolor='white'); plt.close()
print(a.loc['Jawa Barat'].round(3).to_dict(), a.index.get_loc('Jawa Barat') + 1, len(a))
