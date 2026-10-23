"""Append new months of GEE data (VIIRS NTL, Sentinel 5P SO2 and CO) to the twin.

    python pipeline/gee_monthly_update.py incoming/desa_jabar_bulanan_2026-01_2026-07.csv

Input CSV: uid, [iddesa], tahun, bulan, ntl, so2, co in native units (ntl nW per cm2 per sr; so2 and co mol per m2),
as written by gee/02_gee_bulanan_desa_jabar.js. Rows for months already in the panel are replaced (newer extraction wins).

What it updates
  dataset/desa_bulanan_gee.csv.gz          monthly panel (long)
  data/series/kab_*.json                   per desa monthly series behind the time ribbon
  data/provinsi.json                       month list, medians per desa type, available years, data version
  data/desa.json, dataset/desa_indikator_wide.csv
                                           annual map columns ntl_YYYY (median April to October), co_YYYY, so2_YYYY
                                           for every year with at least five dry season months
It does not re-run the waste, typology or economic model; those belong to pipeline/model and change only with new base data.
"""
import argparse, gzip, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from twin_io import write_series, annual_from_panel

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ap = argparse.ArgumentParser()
ap.add_argument('csv', nargs='+', help='one or more GEE monthly CSV exports')
ap.add_argument('--root', default=ROOT)
ap.add_argument('--uid-offset', type=int, default=None, help='subtract from uid; detected automatically when omitted')
a = ap.parse_args()
DS, WEB = os.path.join(a.root, 'dataset'), os.path.join(a.root, 'data')

dim = pd.read_csv(os.path.join(DS, 'dim_wilayah_desa.csv'), usecols=['uid', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan'])
panel_path = os.path.join(DS, 'desa_bulanan_gee.csv.gz')
P = pd.read_csv(panel_path)

new = pd.concat([pd.read_csv(f) for f in a.csv], ignore_index=True)
need = {'uid', 'tahun', 'bulan', 'ntl', 'so2', 'co'}
miss = need - set(new.columns)
if miss: sys.exit(f'kolom hilang: {sorted(miss)}')

# uid convention: twin uses 0 based (desa_jabar.gpkg order). Some exports are 1 based; detect with iddesa when present.
off = a.uid_offset
if off is None:
    off = 0
    if 'iddesa' in new.columns:
        ref = dim.set_index('uid').bps_kode_desa_kelurahan
        score = {o: (new.drop_duplicates('uid').assign(u=lambda d: d.uid - o).set_index('u').iddesa.astype('int64')
                     .reindex(ref.index) == ref).mean() for o in (0, 1)}
        off = max(score, key=score.get)
        print(f'deteksi offset uid {off} (kecocokan iddesa {score[off]:.3f})')
    elif new.uid.min() == 1 and new.uid.max() == len(dim):
        off = 1
new['uid'] = new.uid - off
bad = ~new.uid.isin(dim.uid)
if bad.any(): print(f'peringatan: {bad.sum()} baris dengan uid di luar 0 sampai {len(dim) - 1} dibuang'); new = new[~bad]

# units and cleaning identical to pipeline/model/08a_gee_prepare.py and build_dataset.py
new['ntl'] = new.ntl.clip(lower=0).round(3)
new['co'] = (new.co * 1000).round(4)
new['so2'] = (new.so2 * 1e5).round(4)
new = new.merge(dim, on='uid')[P.columns]

key = ['uid', 'tahun', 'bulan']
added = new[key].drop_duplicates()
P = pd.concat([P.merge(added, on=key, how='left', indicator=True).query('_merge == "left_only"').drop(columns='_merge'), new])
P = P.sort_values(key).reset_index(drop=True)
with gzip.open(panel_path, 'wt') as fh: P.to_csv(fh, index=False)
print(f'panel: {len(P)} baris, {P[["tahun", "bulan"]].drop_duplicates().shape[0]} bulan, ditambah atau diganti {len(new)} baris')

# series shards and provincial medians
D = json.load(open(os.path.join(WEB, 'desa.json')))
tipe = dict(zip(D['uid'], D['tipe_desa']))
labels = write_series(P, tipe, WEB)

# annual map columns
A, years = annual_from_panel(P)
pos = {u: i for i, u in enumerate(D['uid'])}
for c in A.columns:
    col = D.get(c) or [None] * len(D['uid'])
    for u, v in A[c].items():
        col[pos[u]] = None if pd.isna(v) else float(v)
    D[c] = col
json.dump(D, open(os.path.join(WEB, 'desa.json'), 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
Wp = os.path.join(DS, 'desa_indikator_wide.csv')
W = pd.read_csv(Wp)
W = W.drop(columns=[c for c in A.columns if c in W.columns]).merge(A.reset_index(), on='uid', how='left')
W.to_csv(Wp, index=False)

prov = json.load(open(os.path.join(WEB, 'provinsi.json')))
prov['tahun_tersedia'] = years
prov['versi_data'] = f'{pd.Timestamp.today():%Y-%m} (GEE sampai {labels[-1]})'
for v in prov.get('vintage', []):
    if v['data'].startswith('Cahaya malam'): v['tahun'] = f'{labels[0][:4]} sampai {labels[-1]}'
json.dump(prov, open(os.path.join(WEB, 'provinsi.json'), 'w'), ensure_ascii=False, allow_nan=False)
print(f'selesai: deret {labels[0]} sampai {labels[-1]}, tahun peta {years}')
