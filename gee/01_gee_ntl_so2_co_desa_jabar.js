/*****************************************************************************************
 * Ekstraksi NTL (VIIRS), SO2, CO, NO2 (Sentinel 5P TROPOMI), populasi (WorldPop, HRSL Meta)
 * dan luas terbangun (GHSL) pada level desa dan kelurahan Jawa Barat.
 *
 * Paper : Dari Komunitas Menjadi Energi (WJES 2026), Paramartha dan Apriliawan
 * Input : aset FeatureCollection hasil unggah desa_jabar_gee.zip (5.986 poligon, kolom uid, iddesa)
 * Output: CSV di Google Drive, folder WJES_WtE, satu baris per poligon desa (kunci uid)
 *
 * Cara pakai
 *  1. Code Editor > Assets > NEW > Shape files > pilih semua isi desa_jabar_gee.zip > Asset ID:
 *     desa_jabar_gee. Tunggu status ingest selesai.
 *  2. Ganti ASSET di bawah dengan path aset Anda, klik Run, lalu jalankan setiap task di tab Tasks.
 *  3. Unggah CSV hasil ke percakapan; skrip 07_merge_gee.py memadukannya ke model.
 *****************************************************************************************/

var ASSET = 'projects/YOUR_PROJECT/assets/desa_jabar_gee';   // <<< ganti
var desa  = ee.FeatureCollection(ASSET);
var YEARS = [2022, 2023, 2024];
var FOLDER = 'WJES_WtE';
Map.centerObject(desa, 8);
Map.addLayer(desa.style({color: '555555', fillColor: '00000000', width: 0.3}), {}, 'Desa Jawa Barat');

// ---------------------------------------------------------------------------------------
// 1. VIIRS DNB monthly (stray light corrected), annual median of avg_rad with cf_cvg >= 1
// ---------------------------------------------------------------------------------------
var viirsM = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG');
function ntlYear(y) {
  var col = viirsM.filterDate(y + '-01-01', (y + 1) + '-01-01')
    .map(function (img) {
      var m = img.select('cf_cvg').gte(1);
      return img.select('avg_rad').updateMask(m).max(0);   // radiance cannot be negative
    });
  return col.median().rename('ntl_' + y);
}
var ntl = ee.Image.cat(YEARS.map(ntlYear));
// optional annual V2.2 product (masked background and outliers), used when available
var viirsA = ee.ImageCollection('NOAA/VIIRS/DNB/ANNUAL_V22')
  .filterDate('2022-01-01', '2025-01-01').select('average_masked');
var ntlAnnual = ee.Image(ee.Algorithms.If(viirsA.size().gt(0),
  viirsA.sort('system:time_start', false).first().rename('ntlv22_last'),
  ee.Image.constant(0).rename('ntlv22_last').updateMask(ee.Image.constant(0))));
Map.addLayer(ntl.select('ntl_2024'), {min: 0, max: 40, palette: ['000000', '3b0f70', 'de4968', 'fcfdbf']}, 'NTL 2024');

// ---------------------------------------------------------------------------------------
// 2. Sentinel 5P OFFL L3: SO2, CO, NO2, annual mean (mol per m2)
// ---------------------------------------------------------------------------------------
function s5pYear(id, band, name, y) {
  return ee.ImageCollection(id).select(band)
    .filterDate(y + '-01-01', (y + 1) + '-01-01').mean().rename(name + '_' + y);
}
var so2 = ee.Image.cat(YEARS.map(function (y) { return s5pYear('COPERNICUS/S5P/OFFL/L3_SO2', 'SO2_column_number_density', 'so2', y); }));
var co  = ee.Image.cat(YEARS.map(function (y) { return s5pYear('COPERNICUS/S5P/OFFL/L3_CO',  'CO_column_number_density',  'co',  y); }));
var no2 = ee.Image.cat(YEARS.map(function (y) { return s5pYear('COPERNICUS/S5P/OFFL/L3_NO2', 'tropospheric_NO2_column_number_density', 'no2', y); }));
// monthly CO and SO2 in 2024 (seasonality: Ramadan March, Lebaran April, school holiday June to July)
function s5pMonth(id, band, name, y, m) {
  var s = ee.Date.fromYMD(y, m, 1);
  return ee.ImageCollection(id).select(band).filterDate(s, s.advance(1, 'month')).mean()
    .rename(name + '_' + y + '_' + (m < 10 ? '0' + m : m));
}
var months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
var coM  = ee.Image.cat(months.map(function (m) { return s5pMonth('COPERNICUS/S5P/OFFL/L3_CO',  'CO_column_number_density',  'co',  2024, m); }));
var so2M = ee.Image.cat(months.map(function (m) { return s5pMonth('COPERNICUS/S5P/OFFL/L3_SO2', 'SO2_column_number_density', 'so2', 2024, m); }));
Map.addLayer(co.select('co_2024'), {min: 0.03, max: 0.045, palette: ['2c7bb6', 'ffffbf', 'd7191c']}, 'CO 2024', false);

// ---------------------------------------------------------------------------------------
// 3. Population and built up surfaces for validating the dasymetric model
// ---------------------------------------------------------------------------------------
var wpop = ee.ImageCollection('WorldPop/GP/100m/pop')
  .filter(ee.Filter.eq('country', 'IDN')).filter(ee.Filter.eq('year', 2020)).mosaic().rename('worldpop_2020');
// HRSL Meta (community catalog). Hapus baris ini bila aset tidak tersedia di akun Anda.
var hrsl = ee.ImageCollection('projects/sat-io/open-datasets/hrsl/hrslpop').mosaic().rename('hrsl_pop');
var ghsl = ee.Image('JRC/GHSL/P2023A/GHS_BUILT_S/2020').select('built_surface').rename('built_m2_2020');

// ---------------------------------------------------------------------------------------
// 4. Zonal statistics per desa. mean is area weighted; sum gives total radiance or people.
// ---------------------------------------------------------------------------------------
var meanSum = ee.Reducer.mean().combine({reducer2: ee.Reducer.sum(), sharedInputs: true});
var fc = ntl.addBands(ntlAnnual).reduceRegions({collection: desa, reducer: meanSum, scale: 463.83, tileScale: 4});
fc = so2.addBands(co).addBands(no2).reduceRegions({collection: fc, reducer: ee.Reducer.mean(), scale: 1113.2, tileScale: 4});
fc = wpop.addBands(ghsl).reduceRegions({collection: fc, reducer: ee.Reducer.sum(), scale: 100, tileScale: 8});
fc = hrsl.reduceRegions({collection: fc, reducer: ee.Reducer.sum().setOutputs(['hrsl_pop']), scale: 30, tileScale: 8});
// reduceRegions names outputs after bands when the image has several bands; area in km2 for densities
fc = fc.map(function (f) { return f.set('area_km2', f.geometry().area(10).divide(1e6)).setGeometry(null); });

Export.table.toDrive({collection: fc, description: 'desa_jabar_ntl_s5p_pop', folder: FOLDER,
  fileNamePrefix: 'desa_jabar_ntl_s5p_pop', fileFormat: 'CSV'});

var fcM = coM.addBands(so2M).reduceRegions({collection: desa, reducer: ee.Reducer.mean(), scale: 1113.2, tileScale: 4})
  .map(function (f) { return f.setGeometry(null); });
Export.table.toDrive({collection: fcM, description: 'desa_jabar_s5p_monthly_2024', folder: FOLDER,
  fileNamePrefix: 'desa_jabar_s5p_monthly_2024', fileFormat: 'CSV'});

print('Jumlah poligon desa', desa.size());
print('Contoh hasil', fc.limit(3));
