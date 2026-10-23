"""Shared writers for the dynamic layer of the twin (monthly GEE series).
Used by build_dataset.py (full rebuild) and gee_monthly_update.py (append new months).

Panel convention (dataset/desa_bulanan_gee.csv.gz):
  uid (0 based, desa_jabar.gpkg order), kode_kabupaten_kota, bps_kode_desa_kelurahan, tahun, bulan,
  ntl  nW per cm2 per sr (VIIRS DNB monthly VCMSLCFG, negative clipped to 0)
  so2  10^-5 mol per m2  (Sentinel 5P OFFL L3 SO2 column, raw mol per m2 times 1e5)
  co   mmol per m2       (Sentinel 5P OFFL L3 CO column, raw mol per m2 times 1e3)
"""
import glob, json, os
import numpy as np, pandas as pd

VARS = ['ntl', 'co', 'so2']


def _clean(x, nd=4):
    return [None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), nd) for v in x]


def month_labels(GP):
    ym = GP[['tahun', 'bulan']].drop_duplicates().sort_values(['tahun', 'bulan'])
    return [f'{int(y)}-{int(m):02d}' for y, m in ym.itertuples(index=False)], list(ym.itertuples(index=False, name=None))


def annual_from_panel(GP, min_dry_months=5):
    """Annual composites used by the map: NTL median April to October, gases annual mean.
    A year is returned only when it has at least `min_dry_months` dry season months."""
    dry = GP[GP.bulan.between(4, 10)]
    n = dry.groupby('tahun').bulan.nunique()
    years = [int(y) for y in n[n >= min_dry_months].index]
    a = dry[dry.tahun.isin(years)].groupby(['uid', 'tahun']).ntl.median().unstack()
    a.columns = [f'ntl_{int(y)}' for y in a.columns]
    g = GP[GP.tahun.isin(years)].groupby(['uid', 'tahun'])[['co', 'so2']].mean().unstack()
    g.columns = [f'{v}_{int(y)}' for v, y in g.columns]
    return a.join(g).round(4), years


def write_series(GP, tipe_by_uid, web_dir):
    """Rewrite the `seri` block of every data/series/kab_*.json shard and the provincial type medians."""
    labels, ym = month_labels(GP)
    idx = pd.MultiIndex.from_tuples(ym, names=['tahun', 'bulan'])
    for path in sorted(glob.glob(os.path.join(web_dir, 'series', 'kab_*.json'))):
        sh = json.load(open(path))
        kode = int(os.path.basename(path)[4:8])
        g = GP[GP.kode_kabupaten_kota == kode].set_index(['uid', 'tahun', 'bulan'])[VARS]
        sh['bulan'] = labels
        for u, d in sh['desa'].items():
            u = int(u)
            if u in g.index.get_level_values(0):
                s = g.loc[u].reindex(idx)
                d['seri'] = {v: _clean(s[v].values) for v in VARS}
            else:
                d['seri'] = None
        json.dump(sh, open(path, 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    T = GP.assign(tipe=GP.uid.map(tipe_by_uid)).dropna(subset=['tipe'])
    med = T.groupby(['tipe', 'tahun', 'bulan'])[VARS].median()
    prov_path = os.path.join(web_dir, 'provinsi.json')
    prov = json.load(open(prov_path))
    prov['bulan'] = labels
    prov['seri_median_tipe'] = {int(t): {v: _clean(med.loc[t].reindex(idx)[v].values) for v in VARS} for t in [1, 2, 3, 4]}
    json.dump(prov, open(prov_path, 'w'), ensure_ascii=False, allow_nan=False)
    return labels
