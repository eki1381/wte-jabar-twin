"""
Menyiapkan data web yang ringan dari keluaran build_dataset.py (dan setiap pembaruan GEE).

Masukan : data/desa.json (kolomnar, sumber kebenaran web), dataset/desa_indikator_wide.csv, dataset/rekomendasi_desa.csv
Keluaran:
  data/desa/<bundel>.json   kolom desa dipecah per bundel agar peta hanya memuat kolom lapisan aktif
                            (inti, timbulan, satelit, ekonomi, lokasi); angka dibulatkan empat angka penting
  data/rekomendasi.json     ringkasan modul per tipe, kekuatan bukti, tahap, dan penanda catatan
  data/meta/versi.json      sidik versi data untuk penyegaran cache service worker

Geometri disederhanakan sekali dengan mapshaper (lihat README):
  npx mapshaper data/geo/desa_jabar.topojson -simplify 50% keep-shapes -o quantization=20000 format=topojson data/geo/desa_jabar_web.topojson
  npx mapshaper data/geo/kabkota_jabar.geojson -simplify 6% keep-shapes -o precision=0.0001 format=geojson data/geo/kabkota_ringan.geojson

Pemakaian: python pipeline/build_web.py
"""
import hashlib, json, math, os, re
import pandas as pd

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB, DS = os.path.join(BASE, 'data'), os.path.join(BASE, 'dataset')

BUNDLES = {
    'inti': ['uid', 'kode_kabupaten_kota', 'bps_kode_kecamatan', 'bps_nama_kecamatan', 'bps_kode_desa_kelurahan', 'bps_nama_desa_kelurahan',
             'bukan_permukiman', 'tipe_desa', 'tahap', 'penduduk_model', 'timbulan_organik_ton_th_p50', 'organik_dialihkan_ton_th',
             'vgf_juta_rp', 'investasi_juta_rp', 'emisi_dihindari_t_co2e_th', 'energi_biogas_mwh_th', 'pekerjaan_langsung',
             'skor_keyakinan', 'kategori_keyakinan', 'hub_desa', 'lon', 'lat', 'bukti', 'penanda'],
    'timbulan': ['luas_km2', 'kepadatan_jiwa_km2', 'timbulan_total_ton_th_p05', 'timbulan_total_ton_th_p50', 'timbulan_total_ton_th_p95',
                 'timbulan_organik_ton_th_p05', 'timbulan_organik_ton_th_p95', 'timbulan_per_kapita_kg_hari', 'kepadatan_organik_ton_km2_th',
                 'pangsa_nonrumahtangga', 'rasio_puncak_rerata', 'bulan_puncak', 'lpa_probabilitas_posterior'],
    'satelit': ['ntl_2022', 'ntl_2023', 'ntl_2024', 'ntl_2025', 'ntl_pertumbuhan_2022_2025', 'co_2022', 'co_2023', 'co_2024', 'co_2025',
                'so2_2022', 'so2_2023', 'so2_2024', 'so2_2025', 'co_rerata_2022_2025', 'kenaikan_co_kemarau'],
    'ekonomi': ['metana_m3_th', 'kapasitas_desain_kg_hari', 'vgf_apbd_kabkota_juta_rp', 'vgf_dana_desa_juta_rp', 'vgf_bantuan_provinsi_juta_rp',
                'lpg_diganti_ton_th', 'gate_fee_impas_rp_ton', 'biaya_buang_dihindari_rp_ton', 'mac_rp_t_co2e', 'peluang_swadana', 'umk_2025_rp'],
    'lokasi': ['jarak_tpa_km', 'poi_pesantren', 'poi_pasar', 'poi_banksampah', 'hub_organik_ton_th', 'hub_kapasitas_ton_hari', 'hub_desa_lokasi'],
}
# penanda catatan rekomendasi (bit), dikenali dari kalimat awal catatan di rules_rekomendasi.py
PENANDA = [
    ('lebaran', 'Lonjakan Lebaran', 'Lonjakan Lebaran'),
    ('tumbuh', 'Aktivitas tumbuh cepat', 'Aktivitas tumbuh cepat'),
    ('udara', 'Indikasi kualitas udara', 'CO tinggi jauh dari TPA'),
    ('batas', 'Desa berada di batas tipologi', 'Di batas tipologi'),
    ('timbang', 'Keyakinan estimasi rendah', 'Perlu penimbangan lapangan'),
]
BUKTI = {'kuat': 1, 'sedang': 2, 'indikatif': 3}


def r4(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return v
    if v == 0:
        return 0
    x = round(v, max(0, 3 - int(math.floor(math.log10(abs(v))))))
    return int(x) if float(x).is_integer() else x


def main():
    D = json.load(open(os.path.join(WEB, 'desa.json'), encoding='utf-8'))
    W = pd.read_csv(os.path.join(DS, 'desa_indikator_wide.csv'), usecols=['uid', 'lon', 'lat']).set_index('uid')
    R = pd.read_csv(os.path.join(DS, 'rekomendasi_desa.csv')).set_index('uid')
    uids = D['uid']
    D['lon'] = [r4(W.lon.get(u)) for u in uids]
    D['lat'] = [r4(W.lat.get(u)) for u in uids]
    D['bukti'] = [BUKTI.get(R.kekuatan_bukti.get(u), 0) for u in uids]
    cat = R.catatan.fillna('')
    D['penanda'] = [sum(1 << i for i, (_, key, _) in enumerate(PENANDA) if key in cat.get(u, '')) for u in uids]

    # years appended by gee_monthly_update.py (ntl_2026, ...) join the satellite bundle automatically
    yearly = sorted(c for c in D if re.fullmatch(r'(ntl|co|so2)_\d{4}', c))
    BUNDLES['satelit'] = yearly + [c for c in BUNDLES['satelit'] if c not in yearly]
    os.makedirs(os.path.join(WEB, 'desa'), exist_ok=True)
    used = set()
    for name, cols in BUNDLES.items():
        out = {c: [r4(v) for v in D[c]] for c in cols}
        used.update(cols)
        json.dump(out, open(os.path.join(WEB, 'desa', f'{name}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    missing = [c for c in D if c not in used]
    if missing:
        print('kolom desa.json yang tidak masuk bundel:', missing)

    # ringkasan rekomendasi per tipe
    T = pd.DataFrame({c: D[c] for c in ['uid', 'tipe_desa', 'tahap', 'bukti', 'penanda', 'organik_dialihkan_ton_th', 'emisi_dihindari_t_co2e_th',
                                         'energi_biogas_mwh_th', 'pekerjaan_langsung', 'vgf_juta_rp', 'investasi_juta_rp']})
    T = T.join(R[['aktor', 'instrumen', 'aksi', 'rekomendasi_utama']], on='uid')
    tipe = {}
    for t in [1, 2, 3, 4]:
        x = T[T.tipe_desa == t]
        aksi = x.aksi.fillna('').str.split(' | ', regex=False).explode()
        aksi_umum = [a for a, n in aksi.value_counts().items() if n >= 0.95 * len(x)]
        tipe[t] = dict(
            desa=int(len(x)), aktor=x.aktor.mode().iat[0], instrumen=x.instrumen.mode().iat[0], aksi_umum=aksi_umum,
            contoh=x.sort_values('organik_dialihkan_ton_th', ascending=False).rekomendasi_utama.iat[0],
            bukti={k: int((x.bukti == v).sum()) for k, v in BUKTI.items()},
            tahap={int(p): int((x.tahap == p).sum()) for p in [1, 2, 3]},
            penanda={k: int(((x.penanda // (1 << i)) % 2).sum()) for i, (k, _, _) in enumerate(PENANDA)},
            organik_dialihkan_ton_th=float(x.organik_dialihkan_ton_th.sum()), emisi_t=float(x.emisi_dihindari_t_co2e_th.sum()),
            energi_mwh=float(x.energi_biogas_mwh_th.sum()), pekerjaan=float(x.pekerjaan_langsung.sum()),
            vgf_juta_rp=float(x.vgf_juta_rp.sum()), investasi_juta_rp=float(x.investasi_juta_rp.sum()))
    rek = dict(tipe=tipe, penanda=[dict(id=k, label=l, bit=1 << i, desa=int(((T.penanda // (1 << i)) % 2).sum())) for i, (k, _, l) in enumerate(PENANDA)],
               bukti_kode={v: k for k, v in BUKTI.items()})
    json.dump(rek, open(os.path.join(WEB, 'rekomendasi.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    h = hashlib.sha1()
    for root, _, files in os.walk(WEB):
        for f in sorted(files):
            if f.endswith(('.json', '.topojson', '.geojson')):
                h.update(open(os.path.join(root, f), 'rb').read())
    json.dump({'versi': h.hexdigest()[:10]}, open(os.path.join(WEB, 'meta', 'versi.json'), 'w'))
    print('bundel', {k: len(v) for k, v in BUNDLES.items()}, 'penanda', [p['desa'] for p in rek['penanda']], 'versi', h.hexdigest()[:10])


if __name__ == '__main__':
    main()
