/*****************************************************************************************
 * Panel bulanan NTL (VIIRS), SO2 dan CO (Sentinel 5P) per desa Jawa Barat
 * Lapisan dinamis embrio digital twin WtE Jawa Barat.
 *
 * Input : aset desa_jabar_gee (unggah gee/desa_jabar_gee.zip; kolom uid 0 sampai 5985, iddesa)
 * Output: satu CSV panjang di Google Drive: uid, iddesa, tahun, bulan, ntl, so2, co
 *         ntl dalam nW per cm2 per sr; so2 dan co dalam mol per m2 (satuan asli Sentinel 5P).
 *         pipeline/gee_monthly_update.py mengubah satuan dan menggabungkannya ke dataset.
 *
 * Cara pakai
 *  1. Ganti ASSET dengan path aset Anda.
 *  2. Atur MULAI dan SELESAI (bulan terakhir yang ingin ditambahkan). VIIRS bulanan biasanya
 *     terbit dengan jeda satu sampai dua bulan; Sentinel 5P OFFL sekitar dua minggu.
 *  3. Run, lalu jalankan task di tab Tasks. Simpan CSV ke folder incoming/ di repositori.
 *****************************************************************************************/

var ASSET   = 'projects/YOUR_PROJECT/assets/desa_jabar_gee';   // <<< ganti
var MULAI   = '2026-01-01';                                     // bulan pertama (inklusif)
var SELESAI = '2026-07-01';                                     // bulan setelah bulan terakhir (eksklusif)
var FOLDER  = 'WtE_Jabar_Twin';

var desa = ee.FeatureCollection(ASSET).select(['uid', 'iddesa']);
var viirs = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG');
var so2c  = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_SO2').select('SO2_column_number_density');
var coc   = ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_CO').select('CO_column_number_density');

var start = ee.Date(MULAI), end = ee.Date(SELESAI);
var nMonths = end.difference(start, 'month').round();
var months = ee.List.sequence(0, nMonths.subtract(1)).map(function (i) { return start.advance(i, 'month'); });

// one image per month with three bands; empty months become masked bands so the row is still written
function monthImage(d) {
  d = ee.Date(d);
  var e = d.advance(1, 'month');
  var v = viirs.filterDate(d, e);
  var ntl = ee.Image(ee.Algorithms.If(v.size().gt(0),
    v.first().select('avg_rad').updateMask(v.first().select('cf_cvg').gte(1)).max(0),
    ee.Image.constant(0).updateMask(0))).rename('ntl');
  var s = so2c.filterDate(d, e), c = coc.filterDate(d, e);
  var so2 = ee.Image(ee.Algorithms.If(s.size().gt(0), s.mean(), ee.Image.constant(0).updateMask(0))).rename('so2');
  var co  = ee.Image(ee.Algorithms.If(c.size().gt(0), c.mean(), ee.Image.constant(0).updateMask(0))).rename('co');
  return ee.Image.cat([ntl, so2, co]).set({tahun: d.get('year'), bulan: d.get('month')});
}

var rows = ee.FeatureCollection(months.map(function (d) {
  var img = monthImage(d);
  var y = img.get('tahun'), m = img.get('bulan');
  // VIIRS at native 463.83 m, Sentinel 5P at 1113.2 m: reduce separately then join on uid
  var a = img.select('ntl').reduceRegions({collection: desa, reducer: ee.Reducer.mean().setOutputs(['ntl']), scale: 463.83, tileScale: 4});
  var b = img.select(['so2', 'co']).reduceRegions({collection: desa, reducer: ee.Reducer.mean(), scale: 1113.2, tileScale: 4});
  var joined = ee.Join.inner().apply(a, b, ee.Filter.equals({leftField: 'uid', rightField: 'uid'}));
  return joined.map(function (f) {
    var l = ee.Feature(f.get('primary')), r = ee.Feature(f.get('secondary'));
    return ee.Feature(null, {uid: l.get('uid'), iddesa: l.get('iddesa'), tahun: y, bulan: m,
                             ntl: l.get('ntl'), so2: r.get('so2'), co: r.get('co')});
  });
})).flatten();

Export.table.toDrive({
  collection: rows, description: 'desa_jabar_bulanan_' + MULAI.slice(0, 7) + '_' + SELESAI.slice(0, 7), folder: FOLDER,
  fileFormat: 'CSV', selectors: ['uid', 'iddesa', 'tahun', 'bulan', 'ntl', 'so2', 'co']
});
print('Bulan yang diekspor', months.map(function (d) { return ee.Date(d).format('YYYY-MM'); }));
