"""Transparent rule engine for granular WtE recommendations.

Every recommendation follows: KONDISI DATA (indicator, value, year, source) -> REKOMENDASI -> AKSI -> AKTOR -> INSTRUMEN
-> TARGET -> TAHAP -> KEKUATAN BUKTI. Rules only use quantities produced by the model, and the strength label limits how
strong the recommendation is phrased (bukti kuat: jalankan; sedang: uji coba terukur; indikatif: pantau dan ukur).
"""
import math

NAMA_TIPE = {0: 'Bukan permukiman', 1: 'T1 Inti perkotaan', 2: 'T2 Permukiman peri urban', 3: 'T3 Simpul pasar dan event', 4: 'T4 Agraris perdesaan'}
TAHAP_TAHUN = {1: (2026, 2027), 2: (2028, 2029), 3: (2030, 2030)}
MODUL = {1: 'hub biogas kecamatan dengan pembangkit listrik dan panas gabungan (CHP)',
         2: 'digester komunal dan pengomposan yang ditambatkan pada lembaga komunitas',
         3: 'unit anaerobic digestion (AD) modular di pasar atau destinasi dengan cadangan musiman',
         4: 'biodigester rumah tangga, pengomposan, dan larva black soldier fly (BSF) yang dikelola BUMDes'}
BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']


def f(x, d=0):
    """Indonesian number format (thousand dot, decimal comma)."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return 'tidak tersedia'
    s = f'{x:,.{d}f}'
    return s.replace(',', 'X').replace('.', ',').replace('X', '.')


def tahap_teks(t):
    if t not in TAHAP_TAHUN:
        return 'tidak dijadwalkan'
    a, b = TAHAP_TAHUN[t]
    return f'Tahap {t} ({a})' if a == b else f'Tahap {t} ({a} sampai {b})'


def rekomendasi_desa(r):
    t = int(r.tipe_desa)
    if r.bukan_permukiman == 1 or t == 0:
        return dict(rekomendasi_utama='Bukan wilayah permukiman; tidak ada modul pengolahan yang direkomendasikan.', kondisi=[], aksi=[], aktor='', instrumen='',
                    target='', tahap_teks='tidak dijadwalkan', kekuatan_bukti='tidak berlaku', catatan=[], jumlah_catatan=0)
    K = [  # data conditions, always with year and source
        f'Penduduk model {f(r.penduduk_model)} jiwa, kepadatan {f(r.kepadatan_jiwa_km2)} jiwa per km² [2024; dasymetric Susenas dan VIIRS]',
        f'Timbulan organik {f(r.timbulan_organik_ton_th_p50)} ton per tahun (interval 90 persen {f(r.timbulan_organik_ton_th_p05)} sampai {f(r.timbulan_organik_ton_th_p95)}) '
        f'dari total {f(r.timbulan_total_ton_th_p50)} ton [2024; model Monte Carlo]',
        f'Pangsa sampah nonrumah tangga {f(r.pangsa_nonrumahtangga * 100)} persen; puncak musiman {BULAN[int(r.bulan_puncak) - 1]} dengan rasio puncak {f(r.rasio_puncak_rerata, 2)} [kalender 2025; model]',
        f'Jarak ke TPA {f(r.jarak_tpa_km, 1)} km [OSM landfill, diunduh 2026]',
        f'Cahaya malam {f(r.ntl_2024, 1)} nW per cm² per sr pada 2024, berubah {f((r.ntl_pertumbuhan_2022_2025 or 0) * 100)} persen sejak 2022 [VIIRS 2022 sampai 2025]',
        f'Tipe {NAMA_TIPE[t]} (probabilitas posterior LPA {f(r.lpa_probabilitas_posterior, 2)}) [tipologi k means dan LPA, 2026]',
    ]
    A, N = [], []
    cap = r.kapasitas_desain_kg_hari
    host = ('bank sampah' if r.poi_banksampah > 0 else 'pesantren' if r.poi_pesantren > 0 else 'pasar' if r.poi_pasar > 0
            else 'TPS3R atau bank sampah unit yang ditetapkan desa')
    if t == 1:
        hub = f'hub kecamatan {str(r.bps_nama_kecamatan).title()}'
        if isinstance(r.hub_desa_lokasi, str):
            hub += f' (lokasi indikatif Desa/Kel. {r.hub_desa_lokasi.title()}, kapasitas {f(r.hub_kapasitas_ton_hari, 1)} ton per hari, melayani {f(r.hub_desa)} desa)'
        utama = f'Salurkan sekitar {f(r.organik_dialihkan_ton_th)} ton organik per tahun ke {hub} melalui pemilahan di sumber.'
        A += [f'Wajibkan pemilahan organik rumah tangga, pasar, dan kuliner dengan target tangkapan 40 sampai 60 persen',
              f'Jadwalkan angkutan organik terpisah ke hub; kontribusi desa {f(cap)} kg per hari kapasitas desain']
        aktor = 'DLH kabupaten/kota, operator hub (badan usaha), RW dan bank sampah'
        instr = 'Kontrak gate fee berbasis tonase 15 tahun (KPBU skala kecil) dan VGF bila diperlukan'
    elif t == 2:
        utama = f'Bangun digester komunal dan pengomposan sekitar {f(cap)} kg per hari yang ditambatkan pada {host}.'
        A += [f'Gunakan biogas untuk memasak bagi rumah tangga dan dapur komunal; perkiraan LPG yang diganti {f(r.lpg_diganti_ton_th, 1)} ton per tahun',
              'Kelola melalui kelompok swadaya masyarakat atau bank sampah dengan iuran layanan']
        aktor = 'Pemerintah desa, bank sampah, pesantren, DLH kabupaten/kota'
        instr = 'Dana Desa (penyertaan modal BUMDes), bantuan keuangan provinsi, kredit hijau'
    elif t == 3:
        utama = f'Pasang unit AD modular sekitar {f(cap)} kg per hari di {host if r.poi_pasar > 0 else "pasar atau destinasi utama desa"} dengan cadangan kapasitas musiman.'
        A += ['Sediakan cadangan 13 sampai 15 persen berupa kompos atau BSF untuk lonjakan Ramadan dan Lebaran',
              'Wajibkan pemilahan sampah organik oleh pengelola pasar dan penyelenggara event']
        aktor = 'Pengelola pasar atau destinasi, DLH kabupaten/kota, pemerintah desa'
        instr = 'Retribusi pasar yang dialihkan menjadi gate fee, kontrak operator, VGF'
    else:
        utama = f'Kembangkan pengolahan desa sekitar {f(cap)} kg per hari berupa biodigester rumah tangga, kompos, dan BSF melalui BUMDes.'
        A += ['Prioritaskan rumah tangga peternak dan petani untuk biodigester; salurkan kompos dan digestat ke lahan pertanian',
              'Siapkan layanan jemput sampah hajatan dan pasar desa pada dua minggu sekitar Idulfitri']
        aktor = 'Pemerintah desa dan BUMDes, kelompok tani, DLH kabupaten'
        instr = 'Dana Desa operasional dan penyertaan modal BUMDes, KUR'
    # financing state from the kabkota x type cell
    if r.peluang_swadana >= 0.5:
        A.append(f'Sel ini cenderung swadana: gate fee impas Rp{f(r.gate_fee_impas_rp_ton)} per ton di bawah biaya pembuangan yang dihindari Rp{f(r.biaya_buang_dihindari_rp_ton)} per ton')
    else:
        src = max([('APBD kabupaten/kota', r.vgf_apbd_kabkota_juta_rp or 0), ('Dana Desa', r.vgf_dana_desa_juta_rp or 0), ('bantuan keuangan provinsi', r.vgf_bantuan_provinsi_juta_rp or 0)], key=lambda x: x[1])
        A.append(f'Kebutuhan VGF bagian desa sekitar Rp{f(r.vgf_juta_rp, 1)} juta dari investasi Rp{f(r.investasi_juta_rp, 1)} juta, dengan sumber utama {src[0]} (skenario dasar)')
    strength = {'tinggi': 'kuat', 'sedang': 'sedang', 'rendah': 'indikatif'}.get(r.kategori_keyakinan, 'sedang')
    # claim proportional to evidence: the weaker the evidence, the more the action is staged behind measurement
    low1 = utama[0].lower() + utama[1:]
    if strength == 'sedang':
        utama = f'Uji coba terukur enam bulan dengan penimbangan harian, lalu skala penuh bila tonase terkonfirmasi: {low1}'
    elif strength == 'indikatif':
        utama = f'Ukur dahulu: timbang timbulan lapangan selama 30 hari; bila hasilnya dalam interval model, {low1}'
    # conditional rules
    if t in (3, 4):
        N.append('Lonjakan Lebaran: aktivitas desa tipe ini naik relatif terhadap inti kota saat Lebaran (VIIRS 2022 sampai 2025, studi peristiwa). '
                 'Bukti berupa proksi cahaya malam, jadi kapasitas cadangan dijalankan sebagai uji coba dengan penimbangan harian.')
    if (r.ntl_pertumbuhan_2022_2025 or 0) >= 0.40:
        N.append(f'Aktivitas tumbuh cepat (cahaya malam naik {f(r.ntl_pertumbuhan_2022_2025 * 100)} persen pada 2022 sampai 2025); rencanakan cadangan pertumbuhan kapasitas 10 persen.')
    if r.co_desil_provinsi >= 10 and r.jarak_tpa_km >= 20:
        N.append('Indikasi kualitas udara: CO rerata 2022 sampai 2025 masuk 10 persen tertinggi dan jauh dari TPA. Resolusi Sentinel 5P sekitar 7 km sehingga hanya untuk pemantauan pembakaran terbuka.')
    if r.kategori_keyakinan == 'rendah':
        N.append(f'Keyakinan estimasi rendah (skor {f(r.skor_keyakinan)} dari 100: bukti OSM terbatas, cahaya malam lemah, atau desa di batas tipe); lakukan penimbangan timbulan lapangan sebelum investasi.')
    if r.lpa_probabilitas_posterior < 0.6:
        N.append('Desa berada di batas tipologi; pertimbangkan modul tipe tetangga sesuai kondisi lapangan.')
    target = (f'{f(r.organik_dialihkan_ton_th)} ton organik per tahun dialihkan, {f(r.emisi_dihindari_t_co2e_th)} t CO₂e per tahun dihindari (kondisi tunak), '
              f'{f(r.energi_biogas_mwh_th)} MWh energi biogas, {f(r.pekerjaan_langsung, 1)} pekerjaan langsung')
    return dict(rekomendasi_utama=utama, kondisi=K, aksi=A, aktor=aktor, instrumen=instr, target=target, tahap_teks=tahap_teks(int(r.tahap)),
                kekuatan_bukti=strength, catatan=N, jumlah_catatan=len(N))


def rekomendasi_kabkota(r, cells):
    q = str(r.quadrant).split(':')[0]
    instr_map = {'I': 'KPBU dan kontrak gate fee untuk hub, obligasi hijau daerah',
                 'II': 'Prioritas bantuan keuangan provinsi, penjaminan kredit hijau, kontrak gate fee',
                 'III': 'Kontrak gate fee dan kerja sama regional dengan daerah tetangga',
                 'IV': 'Dana Desa melalui BUMDes, pendampingan teknis provinsi, KUR'}
    K = [f'Timbulan organik {f(r.timbulan_organik_ton_th)} ton per tahun dari {f(r.jumlah_desa)} desa; T1 {r.desa_t1}, T2 {r.desa_t2}, T3 {r.desa_t3}, T4 {r.desa_t4} [2024; model]',
         f'Pangsa belanja modal {f(r.pangsa_belanja_modal_2018 * 100, 1)} persen (2018) menjadi {f(r.pangsa_belanja_modal_2025 * 100, 1)} persen (2025); belanja modal 2025 Rp{f(r.cap_2025 / 1e9)} miliar [APBD; DJPK]',
         f'SiLPA dalam APBD 2025 Rp{f(r.silpa_2025 / 1e9)} miliar [APBD 2025; DJPK]',
         f'Skor pengelolaan lingkungan IDSD {f(r.env_mgmt, 2)} dan skor IDSD {f(r.idsd, 2)} [2025; BRIN]',
         f'Kepemilikan tabungan {f(r.tabungan * 100, 1)} persen, akses kredit {f(r.kredit_any * 100, 1)} persen [2024; Susenas]',
         f'Indeks kesiapan {f(r.readiness, 2)} dan potensi {f(r.potential, 2)}, kuadran {r.quadrant} [2026; model]',
         f'UMK Rp{f(r.umk_2025)} per bulan [2025; Kepgub Jabar]']
    phases = sorted(set(int(p) for p in cells.phase))
    A = [f'Anggarkan VGF Rp{f(r.vgf / 1e9, 1)} miliar selama lima tahun: APBD kabupaten/kota Rp{f(r.f_kab / 1e9, 1)} miliar, Dana Desa Rp{f(r.f_dd / 1e9, 1)} miliar, '
         f'bantuan keuangan provinsi Rp{f(r.f_bk / 1e9, 1)} miliar (skenario dasar)',
         f'Mobilisasi investasi swasta dan perbankan sekitar Rp{f((r.capex - r.vgf) / 1e9)} miliar melalui kontrak gate fee',
         f'Bentuk {f(r.hub_kecamatan)} hub biogas kecamatan untuk desa T1 dan modul komunitas untuk tipe lain']
    for _, c in cells.sort_values('phase').iterrows():
        A.append(f'{NAMA_TIPE[int(c.tipe)]}: {tahap_teks(int(c.phase))}, {f(c.thr_p50)} ton per tahun, VGF Rp{f(c.vgf_capital_p50 / 1e9, 1)} miliar, peluang swadana {f(c.p_selffin * 100)} persen')
    N = []
    if r.vgf_per_belanja_modal_5th > 0.08:
        N.append(f'Kebutuhan VGF setara {f(r.vgf_per_belanja_modal_5th * 100, 1)} persen belanja modal lima tahun; prioritaskan bantuan keuangan provinsi.')
    if r.f_dd > 0 and str(r.kode_kabupaten_kota) < '3270':
        N.append('Alokasi Dana Desa per kabupaten masih estimasi proporsional terhadap jumlah desa; konfirmasi dengan rincian DJPK sebelum penganggaran.')
    utama = (f'Jalankan {len(cells)} modul tipologi mulai {tahap_teks(min(phases))} dengan VGF Rp{f(r.vgf / 1e9, 1)} miliar '
             f'untuk menghindari {f(r.ghg / 1e3, 1)} ribu t CO₂e per tahun dan menciptakan {f(r.jobs)} pekerjaan.')
    return dict(rekomendasi_utama=utama, kondisi=K, aksi=A, aktor='Bappeda, DLH, BPKAD kabupaten/kota; pemerintah desa; DLH dan BPKAD Provinsi Jawa Barat',
                instrumen_utama=instr_map.get(q, ''), target=f'{f(r.thr)} ton organik per tahun, {f(r.ghg)} t CO₂e per tahun, {f(r.jobs)} pekerjaan',
                kekuatan_bukti='kuat untuk kebutuhan VGF; sedang untuk alokasi Dana Desa', catatan=N, tahun_data_rujukan='2018 sampai 2025', tahun_rekomendasi=2026)
