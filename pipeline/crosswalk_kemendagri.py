"""Fill the Kemendagri codes so every file joins with Satu Data Jabar (Open Data Jabar) datasets.

    python pipeline/crosswalk_kemendagri.py path/to/kode_wilayah_desa_kelurahan_jabar.csv

Source: the Open Data Jabar dataset on village codes and names (Kode Wilayah dan Nama Wilayah Desa Kelurahan),
which carries both BPS and Kemendagri codes. Column names differ slightly between releases, so the script looks for:
  BPS code         bps_kode_desa_kelurahan
  Kemendagri code  kemendagri_kode_desa_kelurahan
  names            kemendagri_nama_desa_kelurahan, kemendagri_kode_kecamatan, kemendagri_nama_kecamatan, bps_nama_kecamatan
Matching runs in two passes: exact BPS code, then name similarity within the same BPS kecamatan for the remainder
(threshold 0.85). Every match is written to dataset/crosswalk_kemendagri_laporan.csv with its method and score, so a
reviewer can check the uncertain ones before publication.
"""
import argparse, difflib, os, re, sys
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ap = argparse.ArgumentParser()
ap.add_argument('csv')
ap.add_argument('--root', default=ROOT)
ap.add_argument('--ambang', type=float, default=0.85, help='minimum name similarity for the second pass')
a = ap.parse_args()
DS = os.path.join(a.root, 'dataset')

src = pd.read_csv(a.csv, dtype=str)
src.columns = [c.strip().lower() for c in src.columns]
need = ['bps_kode_desa_kelurahan', 'kemendagri_kode_desa_kelurahan']
if any(c not in src.columns for c in need):
    sys.exit(f'berkas sumber harus memuat kolom {need}; kolom yang ada: {list(src.columns)}')
for c in ['kemendagri_nama_desa_kelurahan', 'kemendagri_kode_kecamatan', 'kemendagri_nama_kecamatan', 'bps_nama_desa_kelurahan', 'bps_kode_kecamatan']:
    if c not in src.columns: src[c] = None
src['bps_kode_desa_kelurahan'] = src.bps_kode_desa_kelurahan.str.replace(r'\D', '', regex=True)
src = src.drop_duplicates('bps_kode_desa_kelurahan')

dim = pd.read_csv(os.path.join(DS, 'dim_wilayah_desa.csv'), dtype={'bps_kode_desa_kelurahan': str, 'bps_kode_kecamatan': str})
norm = lambda s: re.sub(r'[^a-z0-9]', '', str(s).lower().replace('desa', '').replace('kelurahan', ''))
cols = ['kemendagri_kode_desa_kelurahan', 'kemendagri_nama_desa_kelurahan', 'kemendagri_kode_kecamatan', 'kemendagri_nama_kecamatan']

m = dim[['uid', 'bps_kode_kecamatan', 'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan']].merge(
    src[['bps_kode_desa_kelurahan'] + cols], on='bps_kode_desa_kelurahan', how='left')
m['metode'] = m.kemendagri_kode_desa_kelurahan.notna().map({True: 'kode BPS', False: None})
m['skor'] = m.metode.map({'kode BPS': 1.0})

# second pass: names within kecamatan (BPS kecamatan code is the first 7 digits of the BPS desa code)
src['kec'] = src.bps_kode_desa_kelurahan.str[:7]
left = m[m.metode.isna()].index
used = set(m.kemendagri_kode_desa_kelurahan.dropna())
for i in left:
    cand = src[(src.kec == str(m.at[i, 'bps_kode_kecamatan'])) & ~src.kemendagri_kode_desa_kelurahan.isin(used)]
    if cand.empty: continue
    target = norm(m.at[i, 'bps_nama_desa_kelurahan'])
    names = cand.kemendagri_nama_desa_kelurahan.fillna(cand.bps_nama_desa_kelurahan)
    sc = names.map(lambda n: difflib.SequenceMatcher(None, target, norm(n)).ratio())
    j = sc.idxmax()
    if sc[j] >= a.ambang:
        for c in cols: m.at[i, c] = cand.at[j, c]
        m.at[i, 'metode'], m.at[i, 'skor'] = 'nama dalam kecamatan', round(float(sc[j]), 3)
        used.add(cand.at[j, 'kemendagri_kode_desa_kelurahan'])

m.to_csv(os.path.join(DS, 'crosswalk_kemendagri_laporan.csv'), index=False)
upd = m.set_index('uid')[cols]
for f in ['dim_wilayah_desa.csv', 'desa_indikator_wide.csv', 'rekomendasi_desa.csv']:
    p = os.path.join(DS, f)
    if not os.path.exists(p): continue
    T = pd.read_csv(p, dtype=str)
    T = T.assign(**{c: T.uid.astype(int).map(upd[c]) for c in cols})  # columns keep their position when they already exist
    T.to_csv(p, index=False)
n = m.metode.value_counts(dropna=False).to_dict()
print(f'cocok {m.metode.notna().sum()} dari {len(m)} poligon: {n}')
print('periksa baris dengan metode "nama dalam kecamatan" atau kosong di dataset/crosswalk_kemendagri_laporan.csv')
