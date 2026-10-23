# Kembaran Digital WtE Jawa Barat

Dashboard rekomendasi waste to energy (WtE) tingkat desa untuk Jawa Barat. Dashboard ini adalah embrio digital twin: memetakan *surface* timbulan sampah organik pada 5.986 desa dan kelurahan, menampilkan *series* bulanan cahaya malam, CO, dan SO₂ 2022 sampai 2025, lalu menulis rekomendasi yang selalu didahului kondisi data beserta tahun dan sumbernya.

Dasar ilmiah: Paramartha dan Apriliawan (2026), *Dari Komunitas Menjadi Energi: Tipologi Desentralisasi Waste to Energy*, WJES.

Situs ini statis, tanpa langkah build. Pustaka peta dan grafik serta huruf Plus Jakarta Sans disertakan di `assets/`, sehingga situs hanya bergantung pada ubin peta dasar Esri (tanpa API key).

## Isi dashboard

| Tab | Isi |
|---|---|
| Ringkasan | Hero, lima indikator utama dengan interval, enam temuan paper yang menautkan ke tempat angkanya di dashboard, peta SVG kabupaten/kota dengan empat metrik, alur paper sampai tindakan, empat tipe desa, dan studi peristiwa Lebaran. |
| Peta | Tujuh topik (Timbulan, Tipologi, Aktivitas, Dampak, Pembiayaan, Rencana, Skenario) dengan 29 lapisan. Legenda interaktif dengan jumlah desa per kelas (klik kelas untuk menyembunyikan), pemutar tahun untuk cahaya malam, CO, dan SO₂, saring kabupaten/kota, kecamatan, tipe, tahap, dan penanda, pencarian desa/kecamatan/kab (tombol `/`), peta dasar terang, gelap, citra, atau polos. Laci desa: ringkasan dengan peringkat dan perbandingan terhadap median tipe, kondisi data bertanda tahun dan sumber, rekomendasi, deret bulanan 48 bulan dengan Ramadan dan Lebaran diarsir, kalender timbulan; bandingkan sampai tiga desa. |
| Wilayah | Tabel 27 kabupaten/kota yang bisa diurutkan, profil provinsi atau satu wilayah: peta mini desa (tipe, organik, tahap), sumber VGF, rekomendasi, kuadran, kecamatan, desa teratas, empat sel tipologi, ruang fiskal APBD dan IDSD. |
| Rekomendasi | Gambaran empat modul dan kekuatan bukti, satu tab per tipe, daftar desa dengan saringan dan unduhan CSV, peta jalan 2026–2030, dan aturan penyusunan rekomendasi. |
| Skenario | Simulator 84 sel (amplop fiskal, tipping fee, harga karbon, tangkapan, biaya investasi, diskonto) dibanding program linear paper, kurva pasokan dengan garis amplop, kesenjangan per kabupaten/kota. Pengaturan tersimpan di tautan sehingga skenario bisa dibagikan. |
| Temuan Paper | Seluruh naskah dengan daftar isi, abstrak dua bahasa, temuan berlabel, penjelasan bahasa sehari-hari, gambar dan tabel, salin sitasi APA dan unduh BibTeX. |
| Data & Metode | Alur model dengan rumus, validasi, kamus data, unduhan, arsitektur kembaran digital, dan batasan. |
| Tanya data (`Ctrl K`) | Kotak pertanyaan luring: jumlah indikator per wilayah, lima desa tertinggi atau terendah, definisi istilah, dan pencarian. Setiap jawaban menyebut tahun dan sumber datanya. |

Tautan langsung: `#peta?t=<topik>&l=<lapisan>&y=<tahun>&k=<kode kab>&kc=<kode kec>&desa=<uid>`, `#wilayah?kab=<kode>`, `#rekomendasi?tab=daftar&t=<tipe>&pen=<penanda>`, `#skenario?a=0.03&s=0.1`, `#paper?s=<bagian>`, `#metode?tab=kamus`. Tautan lama (`#desa=<uid>`, `#kab=<kode>`, `#data`) tetap berlaku.

### Kinerja

Halaman ringkasan hanya memuat `provinsi.json` dan `kabkota.json` (puluhan kilobita gzip) serta menggambar peta kabupaten/kota sebagai SVG; teks hero ada di HTML sehingga tampil seketika. Pustaka MapLibre, geometri desa (`desa_jabar_web.topojson`, disederhanakan dengan mapshaper), dan kolom desa dimuat saat peta dibuka atau saat peramban menganggur. Kolom desa dipecah per bundel (`data/desa/inti|timbulan|satelit|ekonomi|lokasi.json`) sehingga peta hanya mengambil kolom lapisan aktif. Chart.js dimuat hanya saat grafik pertama dibuka. Service worker (`sw.js`) menyimpan data dan pustaka agar kunjungan berikutnya terbuka seketika dan tetap bisa dibaca saat luring. Saat pembaca masih di halaman lain, peta dirakit diam-diam di luar layar sehingga tab Peta terbuka seketika (dilewati pada mode hemat data atau koneksi lambat). Workflow terbit menjalankan `pipeline/inline_css.py` untuk menyisipkan CSS ke `index.html`; di repositori CSS tetap berkas terpisah.

## Menerbitkan di GitHub Pages

1. Buat repositori baru di GitHub, lalu unggah seluruh isi folder ini (termasuk `.nojekyll` dan `.github/`).
   ```bash
   git init && git add -A && git commit -m "Kembaran digital WtE Jawa Barat"
   git branch -M main
   git remote add origin https://github.com/<akun>/<repo>.git
   git push -u origin main
   ```
2. Di GitHub: Settings, Pages, Build and deployment, Source: **GitHub Actions**.
3. Workflow `Terbitkan dashboard` berjalan otomatis. Alamatnya `https://<akun>.github.io/<repo>/`.

Menjalankan di komputer sendiri: `python -m http.server 8000` di folder ini, lalu buka `http://localhost:8000`. Membuka `index.html` langsung dari berkas tidak bisa karena peramban memblokir `fetch` lokal.

Ukuran repositori sekitar 60 MB (data web 21 MB, dataset 26 MB, aset GEE 10 MB), di bawah batas GitHub Pages.

## Struktur

```
index.html                     kerangka halaman
sw.js                          service worker (cache luring)
assets/css/style.css           sistem desain, tema terang dan gelap
assets/js/main.js              router, tema, pemuatan malas tampilan
assets/js/store.js             pemuat data dan bundel kolom desa
assets/js/views/*.js           ringkasan, peta, wilayah, rekomendasi, skenario, paper, metode
assets/js/tanya.js             Tanya data (Ctrl K)
assets/js/ui.js, scales.js, svgmap.js  komponen, skala warna, peta SVG dan kanvas
assets/js/sim.js, simstate.js  mesin skenario 84 sel (kab/kota x tipe) dan status bersama
assets/js/fmt.js               format angka Indonesia
assets/fonts/                  Plus Jakarta Sans (SIL OFL)
assets/vendor/                 MapLibre GL 4.7.1, topojson-client 3.1.0, Chart.js 4.4.4 (lisensi terlampir)
data/                          data web: desa.json (kolomnar, sumber bundel), desa/<bundel>.json, kabkota.json, sel.json,
                               provinsi.json, rekomendasi.json, paper.json dan paper/ (gambar), series/kab_<kode>.json
                               (deret bulanan, kalender musiman, rekomendasi per desa), geo/ (TopoJSON desa, GeoJSON kab/kota),
                               meta/kamus_data.json
dataset/                       dataset lengkap untuk analisis dan portal data (lihat di bawah)
pipeline/build_dataset.py      membangun dataset/ dan data/ dari keluaran model
pipeline/build_web.py          memecah kolom desa menjadi bundel web dan menulis rekomendasi.json
pipeline/paper_to_json.py      mengubah naskah .docx menjadi data/paper.json dan gambar webp
pipeline/inline_css.py         langkah terbit: menyisipkan CSS ke index.html
pipeline/rules_rekomendasi.py  mesin aturan rekomendasi desa dan kabupaten/kota
pipeline/kamus.py              kamus data
pipeline/twin_io.py            penulis lapisan dinamis (deret bulanan)
pipeline/gee_monthly_update.py menambah bulan GEE baru
pipeline/crosswalk_kemendagri.py mengisi kode Kemendagri dari Open Data Jabar
pipeline/model/                skrip model paper 01 sampai 11
gee/01_gee_ntl_so2_co_desa_jabar.js  ekstraksi tahunan dan validasi (paper)
gee/02_gee_bulanan_desa_jabar.js     ekstraksi bulanan untuk pembaruan twin
gee/desa_jabar_gee.zip         shapefile desa untuk diunggah sebagai aset GEE
incoming/                      tempat CSV GEE baru
```

## Dataset

Semua berkas memakai kunci `uid` (urutan poligon `desa_jabar.gpkg`, 0 sampai 5985) dan kolom wilayah gaya Satu Data Jabar.

| Berkas | Baris | Isi |
|---|---|---|
| `desa_indikator_wide.csv` | 5.986 | 96 kolom: identitas wilayah, penduduk, timbulan (p05, p50, p95), tipologi, jarak, titik minat, NTL, CO, SO₂ per tahun, dampak, ekonomi, pembiayaan, tahap, hub kecamatan, skor keyakinan, rekomendasi utama |
| `desa_indikator_long.csv.gz` | 410.616 | format panjang `uid, indikator, nilai, satuan, tahun, sumber`, siap diunggah ke portal |
| `desa_bulanan_gee.csv.gz` | 287.328 | panel bulanan NTL, SO₂, CO per desa (bertambah tiap pembaruan) |
| `desa_musiman_model_2025.csv` | 71.832 | kalender timbulan organik bulanan per desa |
| `rekomendasi_desa.csv` | 5.986 | kondisi data `[tahun; sumber]`, rekomendasi, aksi, aktor, instrumen, target, tahap, kekuatan bukti, catatan |
| `kabkota_tahunan_long.csv` | 2.931 | APBD 2018 sampai 2025, IDSD 2022 sampai 2025, Susenas 2021 sampai 2024, NTL 2022 sampai 2025 |
| `kabkota_rencana.csv`, `rekomendasi_kabkota.csv` | 27 | kesiapan, kuadran, VGF dan sumbernya, rekomendasi |
| `sel_ekonomi_kabkota_tipe.csv` | 84 | persentil Monte Carlo dan koefisien rerata per sel |
| `dim_wilayah_desa.csv` | 5.986 | dimensi wilayah, koordinat titik, kolom Kemendagri |
| `template_realisasi_bulanan.csv` | | templat pelaporan realisasi untuk lapisan pemantauan |
| `kamus_data.csv` | 83 | definisi, satuan, tahun data, sumber, metode, kekuatan bukti setiap kolom |
| `ringkasan_provinsi.json` | | indikator provinsi, validasi, skenario, kurva pasokan, tahap |

### Koherensi dengan Satu Data Jabar

Kolom identitas mengikuti konvensi dataset Open Data Jabar: `kode_provinsi`, `nama_provinsi`, `kode_kabupaten_kota`, `nama_kabupaten_kota`, `bps_kode_kecamatan`, `bps_nama_kecamatan`, `bps_kode_desa_kelurahan`, `bps_nama_desa_kelurahan`, `kemendagri_kode_kecamatan`, `kemendagri_nama_kecamatan`, `kemendagri_kode_desa_kelurahan`, `kemendagri_nama_desa_kelurahan`, `satuan`, `tahun`. Format panjang memisahkan `nilai`, `satuan`, dan `tahun` seperti dataset portal.

Kode Kemendagri belum terisi karena batas desa bersumber dari BPS. Unduh dataset kode wilayah desa dan kelurahan dari Open Data Jabar, lalu:

```bash
python pipeline/crosswalk_kemendagri.py kode_wilayah_desa_kelurahan.csv
```

Skrip mencocokkan kode BPS lebih dulu, lalu kemiripan nama dalam kecamatan, dan menulis laporan `dataset/crosswalk_kemendagri_laporan.csv` untuk diperiksa.

## Cara rekomendasi ditulis

Setiap rekomendasi desa dibangun oleh `pipeline/rules_rekomendasi.py` dengan urutan tetap:

1. **Kondisi data**, setiap butir diberi `[tahun; sumber]`: penduduk dan kepadatan, timbulan organik dengan interval 90 persen, pangsa nonrumah tangga dan bulan puncak, jarak TPA, cahaya malam dan perubahannya, tipe desa dan probabilitas posteriornya.
2. **Rekomendasi utama** sesuai tipe: T1 menyalurkan organik ke hub kecamatan; T2 digester komunal dan pengomposan yang ditambatkan pada bank sampah, pesantren, atau pasar; T3 unit AD modular di pasar atau destinasi dengan cadangan kapasitas musiman; T4 biodigester rumah tangga, kompos, dan BSF melalui BUMDes.
3. **Waktu** dari kurva pasokan VGF: Tahap 1 (2026 sampai 2027), Tahap 2 (2028 sampai 2029), Tahap 3 (2030).
4. **Aktor, instrumen, target**, serta sumber pembiayaan dari program linear skenario dasar.
5. **Kekuatan bukti** mengikuti skor keyakinan (lebar interval, bukti OSM, cahaya malam, posterior LPA): tinggi menjadi kuat, sedang menjadi sedang, rendah menjadi indikatif. Bunyi tindakan mengikuti bukti: kuat langsung dijalankan; sedang didahului uji coba terukur enam bulan; indikatif didahului penimbangan lapangan 30 hari.
6. **Catatan** otomatis: lonjakan Lebaran untuk T3 dan T4, cadangan kapasitas 10 persen bila cahaya malam naik 40 persen atau lebih, penanda CO tinggi jauh dari TPA, desa perbatasan tipe, dan anjuran penimbangan lapangan bila keyakinan rendah.

Mengubah aturan: sunting `rules_rekomendasi.py`, lalu jalankan `python pipeline/build_dataset.py --src <folder keluaran model> --raw <folder data mentah>` dan `python pipeline/build_web.py`.

## Lapisan digital twin dan pembaruan

| Lapisan | Isi | Pembaruan |
|---|---|---|
| Dasar statis | batas desa, penduduk dasymetric, timbulan, tipologi, ekonomi sel | jalankan ulang `pipeline/model` saat ada sensus, Susenas, atau batas baru |
| Dinamis | panel bulanan VIIRS dan Sentinel 5P | bulanan, lihat langkah di bawah |
| Skenario | simulator 84 sel di peramban | langsung oleh pengguna |
| Pemantauan | realisasi bulanan per desa | isi `template_realisasi_bulanan.csv` dari laporan DLH atau BUMDes |

Pembaruan bulanan:

1. Di Google Earth Engine, unggah `gee/desa_jabar_gee.zip` sebagai aset (sekali saja).
2. Jalankan `gee/02_gee_bulanan_desa_jabar.js` dengan rentang bulan baru, unduh CSV dari Google Drive.
3. Commit CSV ke `incoming/`. Workflow `Perbarui data GEE` menggabungkannya, memperbarui deret desa, median tipe, dan kolom peta tahunan (tahun baru muncul setelah ada lima bulan kemarau), lalu menerbitkan ulang situs.

Manual: `python pipeline/gee_monthly_update.py incoming/<berkas>.csv`, lalu `python pipeline/build_web.py`.

Pembaruan bulanan tidak mengubah teks rekomendasi; teks dibangun ulang hanya lewat `build_dataset.py`, supaya rekomendasi tetap merujuk tahun data yang tertulis di dalamnya.

## Mesin skenario

`assets/js/sim.js` menghitung kesenjangan kelayakan tahunan per sel:

```
ann   = capex x CRF + upah + O&M x capex - pendapatan
avoid = organik x pangsa terkumpul x (tipping fee + 2 x jarak x biaya angkut)
gap   = ann - emisi dihindari x harga karbon - avoid
VGF   = max(gap, 0) / CRF            CRF dengan diskonto r dan umur 15 tahun
```

Koefisien rerata per sel dikalibrasi ke median Monte Carlo. Alokasi rakus berdasarkan VGF per t CO₂e (Dana Desa untuk T2 dan T4 di kabupaten, lalu APBD kabupaten/kota, lalu bantuan keuangan provinsi) mereproduksi program linear paper dengan selisih kurang dari satu poin persen: konservatif 60,4 persen (LP 59,6), dasar dan ambisius 100 persen.

## Batasan

- Nilai ekonomi dihitung pada sel kabupaten/kota kali tipe, lalu dibagi ke desa menurut porsi organik yang dialihkan. Angka desa adalah porsi, bukan studi kelayakan.
- Dana Desa per kabupaten adalah estimasi proporsional terhadap jumlah desa dari total Jawa Barat 2024 (Rp6,19 triliun).
- Kolom SO₂ satelit dekat batas deteksi; resolusi Sentinel 5P sekitar 7 km. Gunakan sebagai penanda, bukan ukuran konsentrasi permukaan.
- Timbulan 2024 belum divalidasi dengan timbangan lapangan di tingkat desa; validasi tersedia pada tingkat kabupaten/kota (SIPSN, r 0,986 pada 5 kabupaten/kota yang datanya tersedia).
- Ubin peta dasar dari Esri (Light Gray Canvas) dengan data OpenStreetMap dan mitra Esri; patuhi ketentuan atribusinya.

## Lisensi

Kode: MIT. Data turunan di `data/` dan `dataset/`: CC BY 4.0, cantumkan Paramartha dan Apriliawan (2026). Data sumber tetap mengikuti lisensi pemiliknya (BPS, DJPK, BRIN, OpenStreetMap ODbL, NOAA, Copernicus).
