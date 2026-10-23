"""Build the dashboard dataset (dataset/ for download, data/ for the web app) from the model outputs.

Usage
    python pipeline/build_dataset.py --src <folder hasil model> [--raw <folder data mentah>]

The source folder is the `out/` folder produced by the analysis scripts in pipeline/model/ (steps 01 to 11).
Column naming follows the Satu Data Jabar (Open Data Jabar) convention: kode_provinsi, nama_provinsi,
kode_kabupaten_kota, nama_kabupaten_kota, bps_kode_kecamatan, bps_nama_kecamatan, bps_kode_desa_kelurahan,
bps_nama_desa_kelurahan, kemendagri_kode_* (filled by pipeline/crosswalk_kemendagri.py), satuan, tahun.
"""
import argparse, json, os, gzip, re
import numpy as np, pandas as pd
from rules_rekomendasi import rekomendasi_desa, rekomendasi_kabkota, TAHAP_TAHUN, NAMA_TIPE

ap = argparse.ArgumentParser()
ap.add_argument('--src', default='/home/claude/wte/out')
ap.add_argument('--raw', default='/root/.claude/uploads/8575afab-4bf0-5ac1-ac64-ec19a70d5fc5')
ap.add_argument('--root', default=os.path.join(os.path.dirname(__file__), '..'))
A = ap.parse_args()
SRC, RAW, ROOT = A.src, A.raw, os.path.abspath(A.root)
DS = os.path.join(ROOT, 'dataset'); WEB = os.path.join(ROOT, 'data')
for d in [DS, WEB, f'{WEB}/series', f'{WEB}/meta']: os.makedirs(d, exist_ok=True)
J = lambda f: json.load(open(f'{SRC}/{f}'))
R2, R3, R4, R5, R8, R8b, R9 = [J(f'res_step{s}.json') for s in ['2', '3', '4', '5', '8', '8b', '9']]
NAMA_KAB = {'3201': 'Kabupaten Bogor', '3202': 'Kabupaten Sukabumi', '3203': 'Kabupaten Cianjur', '3204': 'Kabupaten Bandung',
            '3205': 'Kabupaten Garut', '3206': 'Kabupaten Tasikmalaya', '3207': 'Kabupaten Ciamis', '3208': 'Kabupaten Kuningan',
            '3209': 'Kabupaten Cirebon', '3210': 'Kabupaten Majalengka', '3211': 'Kabupaten Sumedang', '3212': 'Kabupaten Indramayu',
            '3213': 'Kabupaten Subang', '3214': 'Kabupaten Purwakarta', '3215': 'Kabupaten Karawang', '3216': 'Kabupaten Bekasi',
            '3217': 'Kabupaten Bandung Barat', '3218': 'Kabupaten Pangandaran', '3271': 'Kota Bogor', '3272': 'Kota Sukabumi',
            '3273': 'Kota Bandung', '3274': 'Kota Cirebon', '3275': 'Kota Bekasi', '3276': 'Kota Depok', '3277': 'Kota Cimahi',
            '3278': 'Kota Tasikmalaya', '3279': 'Kota Banjar'}

# ------------------------------------------------------------------ desa base
F = pd.read_parquet(f'{SRC}/desa_final.parquet')
F['idkab'] = F.idkab.astype(str); F['idkec'] = F.idkec.astype(str); F['iddesa'] = F.iddesa.astype(str)
G = pd.read_parquet(f'{SRC}/gee_annual.parquet')
GS = pd.read_parquet(f'{SRC}/gee_desa_summary.parquet')[['uid', 'co_mean', 'so2_mean', 'co_rise']]
SEAS = pd.read_parquet(f'{SRC}/seasonal_desa.parquet')
F = F.drop(columns=[c for c in F.columns if c.startswith('ntl_20')]).merge(G, on='uid', how='left').merge(GS, on='uid', how='left')
dup = F.iddesa.duplicated(keep=False)
W = pd.DataFrame({
    'uid': F.uid, 'kode_provinsi': 32, 'nama_provinsi': 'JAWA BARAT',
    'kode_kabupaten_kota': F.idkab.astype(int), 'nama_kabupaten_kota': F.idkab.map(NAMA_KAB).str.upper(),
    'bps_kode_kecamatan': F.idkec.astype(int), 'bps_nama_kecamatan': F.nmkec.str.strip(),
    'bps_kode_desa_kelurahan': F.iddesa.astype('int64'), 'bps_nama_desa_kelurahan': F.nmdesa.str.strip(),
    'kemendagri_kode_kecamatan': pd.NA, 'kemendagri_nama_kecamatan': pd.NA,
    'kemendagri_kode_desa_kelurahan': pd.NA, 'kemendagri_nama_desa_kelurahan': pd.NA,
    'kode_bps_ganda': dup.astype(int), 'bukan_permukiman': F.nonsettle.astype(int),
    'luas_km2': F.area_km2.round(4), 'lon': F.lon.round(5), 'lat': F.lat.round(5),
})
W['penduduk_model'] = F['pop'].round(0)
W['kepadatan_jiwa_km2'] = F.dens.round(1)
W['perkotaan_model'] = F.urban_m.astype(int)
for v, c in [('timbulan_total', 'W'), ('timbulan_organik', 'ORG'), ('sisa_makanan', 'FOOD')]:
    for q in ['p05', 'p50', 'p95']: W[f'{v}_ton_th_{q}'] = F[f'{c}_{q}'].round(1)
W['timbulan_per_kapita_kg_hari'] = F.gen_pc.round(3)
W['kepadatan_organik_ton_km2_th'] = F.org_dens.round(1)
W['pangsa_nonrumahtangga'] = F.NHH_p50.round(3)
W['rasio_puncak_rerata'] = F.pmr.round(3); W['bulan_puncak'] = F.peak_month.astype(int)
W['tipe_desa'] = F.tipe.astype(int); W['nama_tipe_desa'] = F.tipe.map(NAMA_TIPE)
W['lpa_probabilitas_posterior'] = F.lpa_pmax.round(3)
W['jarak_tpa_km'] = (F.dist_tpa_m / 1000).round(2); W['jarak_sungai_km'] = (F.dist_river_m / 1000).round(2)
for c in ['pesantren', 'pasar', 'banksampah', 'school', 'health', 'all']:
    W[f'poi_{c}'] = F[f'poi_{c}'].astype(int)
W['luas_permukiman_osm_km2'] = F.lu_res_km2.round(3)
for y in [2022, 2023, 2024, 2025]:
    W[f'ntl_{y}'] = F[f'ntl_{y}'].round(3)
    W[f'co_{y}'] = (F[f'co_{y}'] * 1000).round(4); W[f'so2_{y}'] = (F[f'so2_{y}'] * 1e5).round(4)
W['ntl_pertumbuhan_2022_2025'] = (F.ntl_2025 / F.ntl_2022.replace(0, np.nan) - 1).round(3)
W['co_rerata_2022_2025'] = F.co_mean.round(4); W['so2_rerata_2022_2025'] = F.so2_mean.round(4)
W['kenaikan_co_kemarau'] = F.co_rise.round(4)
W['organik_dialihkan_ton_th'] = F.div_t.round(1)
W['input_ad_ton_th'] = F.ad_t.round(1)
W['metana_m3_th'] = F.ch4_m3.round(0); W['energi_biogas_mwh_th'] = F.eprim_mwh.round(1)
W['kapasitas_desain_kg_hari'] = (F.div_t * 1000 / 365 * F.pmr).round(0)
W['umk_2025_rp'] = F.umk

# ---- cell level economics allocated to desa proportional to diverted organics
C = pd.read_csv(f'{SRC}/cells_economics.csv', dtype={'idkab': str})
CM = pd.read_csv(f'{SRC}/cells_means.csv', dtype={'idkab': str})
LP = pd.read_csv(f'{SRC}/lp_dasar.csv', dtype={'idkab': str})[['cell', 'x', 'f_kab', 'f_dd', 'f_bk']]
PH = pd.read_csv(f'{SRC}/supply_curve_phase.csv', dtype={'idkab': str})[['cell', 'phase', 'vpt']]
C = C.merge(LP, on='cell').merge(PH, on='cell')
F['cell'] = F.idkab + '_' + F.tipe.astype(int).astype(str)
F['share_cell'] = F.div_t / F.groupby('cell').div_t.transform('sum')
Fc = F.merge(C[['cell', 'capex_p50', 'vgf_capital_p50', 'jobs_p50', 'ghg_p50', 'lpg_p50', 'eel_p50', 'fee_be_p50', 'avoid_unit_p50', 'mac_p50',
                'p_selffin', 'phase', 'f_kab', 'f_dd', 'f_bk']], on='cell', how='left')
s = Fc.share_cell.fillna(0)
W['investasi_juta_rp'] = (Fc.capex_p50 * s / 1e6).round(1)
W['vgf_juta_rp'] = (Fc.vgf_capital_p50 * s / 1e6).round(1)
W['vgf_apbd_kabkota_juta_rp'] = (Fc.f_kab * s / 1e6).round(1)
W['vgf_dana_desa_juta_rp'] = (Fc.f_dd * s / 1e6).round(1)
W['vgf_bantuan_provinsi_juta_rp'] = (Fc.f_bk * s / 1e6).round(1)
W['pekerjaan_langsung'] = (Fc.jobs_p50 * s).round(2)
W['emisi_dihindari_t_co2e_th'] = (Fc.ghg_p50 * s).round(1)
W['lpg_diganti_ton_th'] = (Fc.lpg_p50 * s).round(2)
W['listrik_mwh_th'] = (Fc.eel_p50 * 1000 * s).round(1)
W['gate_fee_impas_rp_ton'] = Fc.fee_be_p50.round(0)
W['biaya_buang_dihindari_rp_ton'] = Fc.avoid_unit_p50.round(0)
W['mac_rp_t_co2e'] = Fc.mac_p50.round(0)
W['peluang_swadana'] = Fc.p_selffin.round(3)
W['tahap'] = Fc.phase.fillna(0).astype(int)
W['tahun_mulai'] = W.tahap.map(lambda t: TAHAP_TAHUN.get(t, (None, None))[0])
W['tahun_selesai'] = W.tahap.map(lambda t: TAHAP_TAHUN.get(t, (None, None))[1])

# ---- kecamatan hub for type 1 villages
t1 = F[F.tipe == 1].copy()
hub = t1.groupby('idkec').agg(hub_desa=('uid', 'size'), hub_organik_ton_th=('div_t', 'sum'))
pmr1 = F[F.tipe == 1].pmr.quantile(0.9)
hub['hub_kapasitas_ton_hari'] = (hub.hub_organik_ton_th / 365 * pmr1).round(1)
# indicative hub site: the type 1 village with the largest diverted organics in the kecamatan
site = t1.sort_values('div_t', ascending=False).drop_duplicates('idkec').set_index('idkec')[['uid', 'nmdesa']]
hub = hub.join(site.rename(columns={'uid': 'hub_uid_lokasi', 'nmdesa': 'hub_desa_lokasi'}))
W = W.merge(hub, left_on=F.idkec.where(F.tipe == 1), right_index=True, how='left').drop(columns='key_0', errors='ignore')
W['hub_desa_lokasi'] = W.hub_desa_lokasi.str.strip()

# ---- confidence score (0 to 100): structural evidence behind the village estimate
rw = ((F.W_p95 - F.W_p05) / F.W_p50).clip(0, 2)
osm = ((F.poi_all > 0) | (F.lu_res_km2 > 0)).astype(float)
ntl_ok = (F.ntl_2024 > 0.5).astype(float)
score = 100 * (0.25 * (1 - ((rw - rw.min()) / (rw.max() - rw.min() + 1e-9))) + 0.25 * osm + 0.2 * ntl_ok + 0.3 * F.lpa_pmax.fillna(0))
W['skor_keyakinan'] = score.round(0)
W['kategori_keyakinan'] = pd.cut(score, [-1, 65, 85, 101], labels=['rendah', 'sedang', 'tinggi']).astype(str)
W.loc[W.bukan_permukiman == 1, ['tipe_desa', 'tahap']] = 0
W.loc[W.bukan_permukiman == 1, 'nama_tipe_desa'] = 'Bukan permukiman'
W.loc[W.bukan_permukiman == 1, 'kategori_keyakinan'] = 'tidak berlaku'
W['co_desil_provinsi'] = pd.qcut(W.co_rerata_2022_2025.rank(method='first'), 10, labels=False) + 1

# ------------------------------------------------------------------ recommendations (desa)
REC = [rekomendasi_desa(r) for _, r in W.iterrows()]
RD = pd.DataFrame(REC)
W = W.join(RD[['rekomendasi_utama', 'kekuatan_bukti', 'jumlah_catatan']])
RD.insert(0, 'uid', W.uid)
for c in ['kondisi', 'aksi', 'catatan']: RD[c] = RD[c].map(lambda v: ' | '.join(v))
for c in ['kode_kabupaten_kota', 'nama_kabupaten_kota', 'bps_kode_kecamatan', 'bps_nama_kecamatan', 'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan']:
    RD.insert(1, c, W[c])
RD['tahun_data_rujukan'] = '2022 sampai 2025'; RD['tahun_rekomendasi'] = 2026

# ------------------------------------------------------------------ kabupaten and kota
AP = pd.read_csv(f'{SRC}/apbd_panel.csv', dtype={'kab': str})
ID = pd.read_csv(f'{SRC}/idsd_panel.csv', dtype={'kab': str})
SU = pd.read_csv(f'{SRC}/susenas_kab.csv', dtype={'kab': str})
KR = pd.read_csv(f'{SRC}/kab_readiness.csv', dtype={'Unnamed: 0': str}).rename(columns={'Unnamed: 0': 'kab'})
KP = pd.read_csv(f'{SRC}/lp_kab_plan_dasar.csv', dtype={'idkab': str}).rename(columns={'idkab': 'kab'})
DD = pd.Series(R9['dd_kab']).rename('dana_desa_2024_estimasi')
def pdrb_scores():
    rows = []
    files = [('ffc49c79-Skor_IDSD_2022_Prov-Kab-Kota_LENGKAP_value_update_Mei_2023.xlsx', 'Indeks KabKota', 2022),
             ('a689181c-Skor_IDSD_2023_Prov-Kab-Kota_Update_Agustus_2024.xlsx', 'Nilai Indeks KabKota', 2023),
             ('a4a36d06-Value_SKOR_IDSD_2024_April_2025_150425.xlsx', 'SKOR_KabKota', 2024),
             ('42ba253e-VALUE_IDSD_2025_24022026.xlsx', 'SKOR_KabKota', 2025)]
    for f, sh, y in files:
        if not os.path.exists(f'{RAW}/{f}'): continue
        d = pd.read_excel(f'{RAW}/{f}', sheet_name=sh, header=None); hdr = d.iloc[:6].astype(str)
        kc = [c for c in d.columns if hdr[c].str.contains('Kode KabKota').any()][0]
        pc = [c for c in d.columns if (hdr[c].str.strip() == '10.01').any()][0]
        for _, r in d.iterrows():
            k = str(r[kc]).split('.')[0]
            if k in NAMA_KAB: rows.append(dict(kab=k, tahun=y, nilai=pd.to_numeric(r[pc], errors='coerce')))
    return pd.DataFrame(rows)
L = []
def add(df, kab, tahun, col, ind, sat, src, scale=1.0):
    for _, r in df.iterrows():
        v = r[col]
        if pd.notna(v): L.append(dict(kab=str(r[kab]), tahun=int(r[tahun]), indikator=ind, nilai=float(v) * scale, satuan=sat, sumber=src))
for col, ind, sat in [('rev', 'pendapatan_daerah', 'rupiah'), ('pad', 'pendapatan_asli_daerah', 'rupiah'), ('exp', 'belanja_daerah', 'rupiah'),
                      ('cap', 'belanja_modal', 'rupiah'), ('silpa', 'silpa_tahun_sebelumnya', 'rupiah'), ('pad_share', 'pangsa_pad', 'rasio'),
                      ('cap_share', 'pangsa_belanja_modal', 'rasio'), ('silpa_ratio', 'rasio_silpa_belanja', 'rasio')]:
    add(AP, 'kab', 'year', col, ind, sat, 'DJPK Kemenkeu, ringkasan APBD (anggaran)')
for col, ind in [('idsd', 'skor_idsd'), ('env_mgmt', 'skor_pengelolaan_lingkungan_idsd'), ('elec', 'skor_rasio_elektrifikasi_idsd'),
                 ('fiscal_cap', 'skor_kapasitas_fiskal_idsd'), ('credit', 'skor_kredit_idsd'), ('kur', 'skor_kur_idsd')]:
    add(ID, 'kab', 'year', col, ind, 'skor 0 sampai 5', 'BRIN, Indeks Daya Saing Daerah')
P = pdrb_scores()
if len(P): add(P, 'kab', 'tahun', 'nilai', 'skor_pdrb_idsd', 'skor 0 sampai 5', 'BRIN, Indeks Daya Saing Daerah (indikator 10.01)')
for col, ind, sat in [('pop5', 'penduduk_5_tahun_ke_atas_susenas', 'jiwa'), ('urb', 'pangsa_penduduk_perkotaan', 'rasio'),
                      ('tabungan', 'pangsa_memiliki_tabungan', 'rasio'), ('kredit_any', 'pangsa_mengakses_kredit', 'rasio')]:
    add(SU, 'kab', 'tahun', col, ind, sat, 'BPS, Susenas (bobot individu, diolah)')
GA = G.merge(F[['uid', 'idkab', 'area_km2']], on='uid')
for y in [2022, 2023, 2024, 2025]:
    t = GA.assign(v=GA[f'ntl_{y}'] * GA.area_km2).groupby('idkab').v.sum().reset_index(); t['tahun'] = y
    add(t, 'idkab', 'tahun', 'v', 'jumlah_radiansi_ntl', 'nW per cm2 per sr x km2', 'NOAA VIIRS DNB VCMSLCFG via Google Earth Engine (median April sampai Oktober)')
KL = pd.DataFrame(L)
KL.insert(1, 'nama_kabupaten_kota', KL.kab.map(NAMA_KAB).str.upper())
KL = KL.rename(columns={'kab': 'kode_kabupaten_kota'})
KL.insert(0, 'nama_provinsi', 'JAWA BARAT'); KL.insert(0, 'kode_provinsi', 32)
# plan and readiness snapshot
SUMK = W[W.bukan_permukiman == 0].groupby('kode_kabupaten_kota').agg(
    jumlah_desa=('uid', 'size'), penduduk_model=('penduduk_model', 'sum'), timbulan_total_ton_th=('timbulan_total_ton_th_p50', 'sum'),
    timbulan_organik_ton_th=('timbulan_organik_ton_th_p50', 'sum'), organik_dialihkan_ton_th=('organik_dialihkan_ton_th', 'sum'),
    energi_biogas_mwh_th=('energi_biogas_mwh_th', 'sum'), desa_t1=('tipe_desa', lambda v: (v == 1).sum()), desa_t2=('tipe_desa', lambda v: (v == 2).sum()),
    desa_t3=('tipe_desa', lambda v: (v == 3).sum()), desa_t4=('tipe_desa', lambda v: (v == 4).sum()),
    hub_kecamatan=('hub_kapasitas_ton_hari', lambda v: v.notna().sum()))
SUMK.index = SUMK.index.astype(str)
hubs_k = W.dropna(subset=['hub_kapasitas_ton_hari']).drop_duplicates('bps_kode_kecamatan').groupby('kode_kabupaten_kota').size()
SUMK['hub_kecamatan'] = hubs_k.reindex(SUMK.index.astype(int)).fillna(0).astype(int).values
KK = SUMK.join(KR.set_index('kab')[['pad_share_mean', 'cap_share_mean', 'silpa_mean', 'fiscal_cap', 'env_mgmt', 'kur', 'idsd', 'tabungan', 'kredit_any',
                                     'dim_fiskal', 'dim_kelembagaan', 'dim_keuangan', 'readiness', 'potential', 'quadrant', 'cap_2025', 'exp_2025']])
KK = KK.join(KP.set_index('kab')[['capex', 'vgf', 'f_kab', 'f_dd', 'f_bk', 'ghg', 'thr', 'jobs']])
KK = KK.join(DD)
a25 = AP[AP.year == 2025].set_index('kab'); a18 = AP[AP.year == 2018].set_index('kab')
KK['silpa_2025'] = a25.silpa; KK['pangsa_belanja_modal_2018'] = a18.cap_share; KK['pangsa_belanja_modal_2025'] = a25.cap_share
KK['vgf_per_belanja_modal_5th'] = KK.vgf / (KK.cap_2025 * 5)
KK['umk_2025'] = F.groupby('idkab').umk.first()
ph = C.groupby('idkab').apply(lambda g: {int(t): int(p) for t, p in zip(g.tipe, g.phase)}, include_groups=False)
KK['tahap_per_tipe'] = ph
KK = KK.reset_index().rename(columns={'index': 'kode_kabupaten_kota', 'kode_kabupaten_kota': 'kode_kabupaten_kota'})
KK['kode_kabupaten_kota'] = KK['kode_kabupaten_kota'].astype(str)
KK.insert(1, 'nama_kabupaten_kota', KK.kode_kabupaten_kota.map(NAMA_KAB).str.upper())
RKL = [rekomendasi_kabkota(r, C[C.idkab == r.kode_kabupaten_kota]) for _, r in KK.iterrows()]
RK = pd.DataFrame(RKL)
for c in ['kondisi', 'aksi', 'catatan']: RK[c] = RK[c].map(lambda v: ' | '.join(v))
RK.insert(0, 'nama_kabupaten_kota', KK.nama_kabupaten_kota); RK.insert(0, 'kode_kabupaten_kota', KK.kode_kabupaten_kota)
KK = KK.join(RK[['rekomendasi_utama', 'instrumen_utama']])

# ------------------------------------------------------------------ cells
CE = C.merge(CM[['cell', 'thr', 'capex', 'labor', 'om_rate', 'rev', 'ghg', 'jobs', 'sw', 'eel_gwh', 'lpg_t']].add_suffix('_rerata').rename(columns={'cell_rerata': 'cell'}), on='cell')
CE.insert(1, 'nama_kabupaten_kota', CE.idkab.map(NAMA_KAB).str.upper())
CE['nama_tipe_desa'] = CE.tipe.map(NAMA_TIPE)
CE['tahun_mulai'] = CE.phase.map(lambda t: TAHAP_TAHUN[t][0]); CE['tahun_selesai'] = CE.phase.map(lambda t: TAHAP_TAHUN[t][1])

# ------------------------------------------------------------------ monthly series
GP = pd.read_parquet(f'{SRC}/gee_panel.parquet')[['uid', 'tahun', 'bulan', 'ntl', 'so2', 'co']]
GP = GP.merge(W[['uid', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan']], on='uid')
GP['co'] = (GP.co * 1000).round(4); GP['so2'] = (GP.so2 * 1e5).round(4); GP['ntl'] = GP.ntl.round(3)
SM = SEAS.melt(id_vars='uid', var_name='bulan', value_name='indeks')
SM['bulan'] = SM.bulan.str[1:].astype(int)
SM = SM.merge(W[['uid', 'timbulan_organik_ton_th_p50', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan']], on='uid')
SM['organik_ton_bulan'] = (SM.timbulan_organik_ton_th_p50 / 12 * SM.indeks).round(2); SM['indeks'] = SM.indeks.round(4)
SM['tahun'] = 2025

# ------------------------------------------------------------------ data dictionary
from kamus import KAMUS
kam = pd.DataFrame(KAMUS, columns=['kolom', 'tabel', 'definisi', 'satuan', 'tahun_data', 'sumber', 'metode', 'kekuatan_bukti'])

# ------------------------------------------------------------------ write dataset/
W.to_csv(f'{DS}/desa_indikator_wide.csv', index=False)
idcols = ['uid', 'kode_provinsi', 'nama_provinsi', 'kode_kabupaten_kota', 'nama_kabupaten_kota', 'bps_kode_kecamatan', 'bps_nama_kecamatan',
          'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan', 'kemendagri_kode_kecamatan', 'kemendagri_nama_kecamatan',
          'kemendagri_kode_desa_kelurahan', 'kemendagri_nama_desa_kelurahan', 'kode_bps_ganda', 'bukan_permukiman', 'luas_km2', 'lon', 'lat']
W[idcols].to_csv(f'{DS}/dim_wilayah_desa.csv', index=False)
meta_cols = kam.set_index('kolom')
num = [c for c in W.columns if c not in idcols and c in meta_cols.index and pd.api.types.is_numeric_dtype(W[c])]
LONG = W[['uid', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan'] + num].melt(
    id_vars=['uid', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan'], var_name='indikator', value_name='nilai').dropna(subset=['nilai'])
LONG = LONG.merge(meta_cols[['satuan', 'tahun_data', 'sumber']], left_on='indikator', right_index=True, how='left').rename(columns={'tahun_data': 'tahun'})
with gzip.open(f'{DS}/desa_indikator_long.csv.gz', 'wt') as fh: LONG.to_csv(fh, index=False)
with gzip.open(f'{DS}/desa_bulanan_gee.csv.gz', 'wt') as fh: GP[['uid', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan', 'tahun', 'bulan', 'ntl', 'so2', 'co']].to_csv(fh, index=False)
SM[['uid', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan', 'tahun', 'bulan', 'indeks', 'organik_ton_bulan']].to_csv(f'{DS}/desa_musiman_model_2025.csv', index=False)
KL.to_csv(f'{DS}/kabkota_tahunan_long.csv', index=False)
KK.drop(columns=['tahap_per_tipe']).to_csv(f'{DS}/kabkota_rencana.csv', index=False)
CE.to_csv(f'{DS}/sel_ekonomi_kabkota_tipe.csv', index=False)
RD.to_csv(f'{DS}/rekomendasi_desa.csv', index=False)
RK.to_csv(f'{DS}/rekomendasi_kabkota.csv', index=False)
kam.to_csv(f'{DS}/kamus_data.csv', index=False)
pd.DataFrame(columns=['periode', 'kode_kabupaten_kota', 'bps_kode_desa_kelurahan', 'modul', 'organik_terolah_ton', 'biogas_m3', 'listrik_kwh',
                      'lpg_diganti_kg', 'pekerja', 'gate_fee_dibayar_rp', 'sumber_pelaporan', 'catatan']).to_csv(f'{DS}/template_realisasi_bulanan.csv', index=False)

# ------------------------------------------------------------------ provincial summary
prov = dict(
    judul='Embrio digital twin waste to energy Jawa Barat', versi_data='2026-10', paper='Paramartha dan Apriliawan (2026), WJES',
    vintage=[dict(data='Batas desa dan kelurahan', tahun='2024', sumber='BPS'), dict(data='Penduduk kab/kota', tahun='2024', sumber='Susenas, BPS (diskalakan ke 50,35 juta jiwa)'),
             dict(data='Tata guna lahan, titik minat, sungai', tahun='diunduh 2026', sumber='OpenStreetMap'),
             dict(data='Cahaya malam, SO2, CO bulanan', tahun='2022 sampai 2025', sumber='VIIRS dan Sentinel 5P via Google Earth Engine'),
             dict(data='APBD kab/kota', tahun='2018 sampai 2025', sumber='DJPK Kemenkeu'), dict(data='IDSD', tahun='2022 sampai 2025', sumber='BRIN'),
             dict(data='Susenas keuangan inklusif', tahun='2021 sampai 2024', sumber='BPS'), dict(data='Kalender musiman model', tahun='2025', sumber='model penulis'),
             dict(data='Rencana dan rekomendasi', tahun='2026 sampai 2030', sumber='model penulis')],
    kpi=dict(timbulan_total_ton_th=R2['waste_total_Mt'], timbulan_organik_ton_th=R2['organic_total_Mt'], organik_dialihkan_ton_th=R4['province']['div_tot'],
             pangsa_dialihkan=R4['province']['div_share'], energi_biogas_gwh_th=R4['province']['eprim_tot'], listrik_gwh_th=R4['province']['eel_tot'],
             lpg_diganti_ton_th=R4['province']['lpg_tot'], emisi_dihindari_10th_t=R4['province']['net10_tot'], emisi_dihindari_tunak_t=R4['province']['netss_tot'],
             pekerjaan=R4['province']['jobs_tot'], investasi_rp=R4['province']['capex_tot'], vgf_rp=R9['vgf_total'][:3],
             gate_fee_impas_rp_ton=R4['province']['feebe_tot'], penghematan_subsidi_lpg_rp=R4['province']['lpgsub_tot']),
    validasi=dict(dasymetric=R2['dasy'], perkotaan=R2['urban'], sipsn=R2['sipsn_bench'], ntl_v1=R8['ntl_vs_v1_density_spearman'],
                  tipologi=R3, ari_v1_v2=R8['ARI_typology_v1_v2']),
    studi_peristiwa={k: R8b['y_ntl'][k] for k in ['leb_T2', 'leb_T3', 'leb_T4', 'ram_T2', 'ram_T3', 'ram_T4']},
    plasebo={k: R8b['placebo_+2m_ntl'][k] for k in ['leb_T2', 'leb_T3', 'leb_T4']},
    skenario=R9['envelopes'], kurva_pasokan=pd.read_csv(f'{SRC}/supply_curve_phase.csv')[['cell', 'tipe', 'ghg_p50', 'vgf_capital_p50', 'cum_ghg', 'cum_vgf', 'phase']].round(1).to_dict('records'),
    tahap={int(p): dict(tahun=(f'{TAHAP_TAHUN[p][0]} sampai {TAHAP_TAHUN[p][1]}' if TAHAP_TAHUN[p][0] != TAHAP_TAHUN[p][1] else str(TAHAP_TAHUN[p][0])), sel=int((C.phase == p).sum()), emisi_t=float(C.loc[C.phase == p, 'ghg_p50'].sum()),
                        organik_ton=float(C.loc[C.phase == p, 'thr_p50'].sum()), vgf_rp=float(C.loc[C.phase == p, 'vgf_capital_p50'].sum()),
                        investasi_rp=float(C.loc[C.phase == p, 'capex_p50'].sum()), pekerjaan=float(C.loc[C.phase == p, 'jobs_p50'].sum())) for p in [1, 2, 3]},
    profil_tipe={int(t): dict(nama=NAMA_TIPE[t], desa=int((W.tipe_desa == t).sum())) for t in [1, 2, 3, 4]},
    amplop_dasar=dict(belanja_modal_kabkota_2025=float(AP[AP.year == 2025].cap.sum()), silpa_kabkota_2025=float(AP[AP.year == 2025].silpa.sum()),
                      dana_desa_2024=6.19e12, bantuan_keuangan_provinsi_2025=R9['bk_prov_2025']),
    parameter_skenario=dict(tipping_fee_rp_ton=268000, biaya_angkut_rp_tkm=3000, harga_karbon_rp_t=90000, diskonto=0.10, umur_th=15,
                            catatan='Nilai dasar adalah rerata sebaran Monte Carlo; simulasi di dashboard bersifat indikatif dan memakai koefisien rerata per sel.'),
)
prov['parameter_skenario']['catatan'] = ('Simulasi dashboard memakai koefisien rerata per sel yang dikalibrasi ke median Monte Carlo (selisih kesenjangan pada nilai dasar '
                                         'ditambahkan sebagai koreksi tetap), lalu alokasi rakus berdasarkan VGF per t CO2e. Hasilnya indikatif; angka resmi paper berasal dari program linear.')
json.dump(prov, open(f'{WEB}/provinsi.json', 'w'), ensure_ascii=False, default=float, allow_nan=False)
json.dump(prov, open(f'{DS}/ringkasan_provinsi.json', 'w'), ensure_ascii=False, default=float, indent=1)

# ------------------------------------------------------------------ write data/ (web): columnar desa attributes, kab, cells, series shards
web_cols = ['uid', 'kode_kabupaten_kota', 'bps_kode_kecamatan', 'bps_nama_kecamatan', 'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan', 'bukan_permukiman',
            'luas_km2', 'penduduk_model', 'kepadatan_jiwa_km2', 'timbulan_total_ton_th_p05', 'timbulan_total_ton_th_p50', 'timbulan_total_ton_th_p95',
            'timbulan_organik_ton_th_p05', 'timbulan_organik_ton_th_p50', 'timbulan_organik_ton_th_p95', 'timbulan_per_kapita_kg_hari',
            'kepadatan_organik_ton_km2_th', 'pangsa_nonrumahtangga', 'rasio_puncak_rerata', 'bulan_puncak', 'tipe_desa', 'lpa_probabilitas_posterior',
            'jarak_tpa_km', 'poi_pesantren', 'poi_pasar', 'poi_banksampah', 'ntl_2022', 'ntl_2023', 'ntl_2024', 'ntl_2025', 'ntl_pertumbuhan_2022_2025',
            'co_2022', 'co_2023', 'co_2024', 'co_2025', 'so2_2022', 'so2_2023', 'so2_2024', 'so2_2025', 'co_rerata_2022_2025', 'kenaikan_co_kemarau',
            'organik_dialihkan_ton_th', 'metana_m3_th', 'energi_biogas_mwh_th', 'kapasitas_desain_kg_hari', 'investasi_juta_rp', 'vgf_juta_rp',
            'vgf_apbd_kabkota_juta_rp', 'vgf_dana_desa_juta_rp', 'vgf_bantuan_provinsi_juta_rp', 'pekerjaan_langsung', 'emisi_dihindari_t_co2e_th',
            'lpg_diganti_ton_th', 'gate_fee_impas_rp_ton', 'biaya_buang_dihindari_rp_ton', 'mac_rp_t_co2e', 'peluang_swadana', 'tahap', 'hub_desa',
            'hub_organik_ton_th', 'hub_kapasitas_ton_hari', 'hub_desa_lokasi', 'skor_keyakinan', 'kategori_keyakinan', 'umk_2025_rp']
col = {c: [None if (isinstance(v, float) and np.isnan(v)) else (v.item() if hasattr(v, 'item') else v) for v in W[c].tolist()] for c in web_cols}
json.dump(col, open(f'{WEB}/desa.json', 'w'), ensure_ascii=False, separators=(',', ':'))
recw = {int(u): {k: r[k] for k in ['rekomendasi_utama', 'kondisi', 'aksi', 'aktor', 'instrumen', 'target', 'tahap_teks', 'kekuatan_bukti', 'catatan']} for u, r in zip(W.uid, REC)}
for k in NAMA_KAB:  # recommendations and series sharded per kabupaten/kota
    uids = W.loc[W.kode_kabupaten_kota == int(k), 'uid'].tolist()
    sm = SM[SM.kode_kabupaten_kota == int(k)].sort_values(['uid', 'bulan'])
    seas = {int(u): d.organik_ton_bulan.tolist() for u, d in sm.groupby('uid')}
    out = dict(bulan=[], desa={int(u): dict(seri=None, musiman=seas.get(int(u)), rek=recw[int(u)]) for u in uids})
    json.dump(out, open(f'{WEB}/series/kab_{k}.json', 'w'), ensure_ascii=False, separators=(',', ':'), allow_nan=False, default=lambda o: None if o is pd.NA else str(o))
from twin_io import write_series
write_series(GP, dict(zip(W.uid, W.tipe_desa)), WEB)  # fills seri in every shard plus provincial medians and month list
_p = json.load(open(f'{WEB}/provinsi.json')); _p['tahun_tersedia'] = sorted(int(c[4:]) for c in W.columns if re.fullmatch(r'ntl_\d{4}', c))
json.dump(_p, open(f'{WEB}/provinsi.json', 'w'), ensure_ascii=False, allow_nan=False)
kabw = []
for _, r in KK.iterrows():
    k = r.kode_kabupaten_kota
    ts = KL[KL.kode_kabupaten_kota == k].pivot_table(index='tahun', columns='indikator', values='nilai').reset_index()
    rk = RKL[_]
    d = {c: (None if (isinstance(v, float) and np.isnan(v)) else v) for c, v in r.drop(labels=['tahap_per_tipe']).items()}
    d['tahap_per_tipe'] = r.tahap_per_tipe; d['seri'] = {c: [None if pd.isna(v) else float(v) for v in ts[c]] for c in ts.columns}; d['rek'] = rk
    kabw.append(d)
json.dump(kabw, open(f'{WEB}/kabkota.json', 'w'), ensure_ascii=False, default=lambda o: None if o is pd.NA else (o.item() if hasattr(o, 'item') else str(o)))
json.dump(json.loads(CE.to_json(orient='records')), open(f'{WEB}/sel.json', 'w'), ensure_ascii=False)
json.dump(json.loads(kam.to_json(orient='records')), open(f'{WEB}/meta/kamus_data.json', 'w'), ensure_ascii=False)
print('desa', W.shape, 'long', LONG.shape, 'bulanan', GP.shape, 'kab long', KL.shape, 'sel', CE.shape)
print(RD.kekuatan_bukti.value_counts().to_dict()); print(W.kategori_keyakinan.value_counts().to_dict())
