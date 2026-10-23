"""Step 1. Desa level spatial features for West Java WtE typology.
Inputs: desa_jabar.gpkg, Landuse_jabar.gpkg, poi_jabar.gpkg, waterways_jabar.gpkg
Outputs: out/desa_features.parquet, out/grid_*.tif (200 m rasters)
"""
import geopandas as gpd, pandas as pd, numpy as np, rasterio
from rasterio import features
from rasterio.transform import from_origin
from scipy.ndimage import gaussian_filter
import os
U = '/root/.claude/uploads/8575afab-4bf0-5ac1-ac64-ec19a70d5fc5'
OUT = '/home/claude/wte/out'; os.makedirs(OUT, exist_ok=True)
CRS = 'EPSG:32748'  # UTM 48S
RES = 200.0

desa = gpd.read_file('/mnt/user-data/uploads/desa_jabar.gpkg').to_crs(CRS)
desa['iddesa'] = desa['iddesa'].astype(str)
desa['uid'] = np.arange(len(desa))
desa['nonsettle'] = desa['kddesa'].astype(str).eq('999').astype(int)
desa['area_km2'] = desa.area / 1e6
lu = gpd.read_file('/mnt/user-data/uploads/Landuse_jabar.gpkg').to_crs(CRS)
poi = gpd.read_file(f'{U}/1bd4a8b0-poi_jabar.gpkg').to_crs(CRS)
ww = gpd.read_file(f'{U}/2e66726b-waterways_jabar.gpkg').to_crs(CRS)
print('desa', len(desa))

# ---------- land use classes ----------
LUCLS = {
    'res': ['residential'],
    'com': ['commercial', 'retail'],
    'ind': ['industrial'],
    'agr': ['farmland', 'farmyard', 'orchard', 'allotments', 'vineyard', 'meadow'],
    'veg': ['forest', 'scrub', 'heath', 'grass', 'park', 'recreation_ground'],
    'oth': ['cemetery', 'military', 'quarry', 'landfill'],
}
inv = {v: k for k, vs in LUCLS.items() for v in vs}
lu['cls'] = lu.fclass.map(inv)
code = {'res': 1, 'com': 2, 'ind': 3, 'agr': 4, 'veg': 5, 'oth': 6}
# priority order when polygons overlap: res > com > ind > oth > agr > veg
prio = ['veg', 'agr', 'oth', 'ind', 'com', 'res']
minx, miny, maxx, maxy = desa.total_bounds
W = int(np.ceil((maxx - minx) / RES)); H = int(np.ceil((maxy - miny) / RES))
tr = from_origin(minx, maxy, RES, RES)
lu_r = np.zeros((H, W), np.uint8)
for c in prio:
    sub = lu[lu.cls == c]
    if len(sub):
        r = features.rasterize(((g, 1) for g in sub.geometry), out_shape=(H, W), transform=tr, fill=0, all_touched=False)
        lu_r[r == 1] = code[c]
desa['rid'] = np.arange(1, len(desa) + 1)
desa_r = features.rasterize(((g, i) for g, i in zip(desa.geometry, desa.rid)), out_shape=(H, W), transform=tr, fill=0, dtype='int32')
print('grid', H, W)

# ---------- POI groups ----------
G = {
    'food': ['restaurant', 'cafe', 'fast_food', 'food_court', 'bakery', 'greengrocer', 'butcher', 'beverages', 'bar', 'pub'],
    'retail': ['convenience', 'supermarket', 'marketplace', 'mall', 'department_store', 'kiosk', 'general', 'clothes'],
    'event': ['attraction', 'viewpoint', 'park', 'camp_site', 'picnic_site', 'theme_park', 'zoo', 'museum', 'stadium',
              'sports_centre', 'community_centre', 'town_hall', 'tourist_info', 'monument', 'memorial', 'castle', 'ruins',
              'arts_centre', 'theatre', 'cinema', 'swimming_pool', 'pitch', 'playground'],
    'lodging': ['hotel', 'guesthouse', 'motel', 'hostel', 'chalet', 'camp_site', 'alpine_hut'],
    'school': ['school', 'kindergarten', 'university', 'college', 'library'],
    'health': ['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'nursing_home'],
    'finance': ['bank', 'atm'],
    'waste': ['recycling', 'recycling_glass', 'waste_basket', 'wastewater_plant'],
}
nm = poi.name.fillna('').str.lower()
poi['pesantren'] = nm.str.contains('pesantren|pondok|ponpes').astype(int)
poi['pasar'] = (nm.str.contains(r'\bpasar\b') | poi.fclass.eq('marketplace')).astype(int)
poi['banksampah'] = nm.str.contains('bank sampah').astype(int)
j = gpd.sjoin(poi, desa[['uid', 'geometry']], predicate='within', how='inner')
cnt = pd.DataFrame(index=desa.uid)
for k, v in G.items():
    cnt['poi_' + k] = j[j.fclass.isin(v)].groupby('uid').size()
for k in ['pesantren', 'pasar', 'banksampah']:
    cnt['poi_' + k] = j[j[k] == 1].groupby('uid').size()
cnt['poi_all'] = j.groupby('uid').size()
cnt = cnt.fillna(0).reset_index()

# POI kernel density (Gaussian, sigma = 1 km) on 200 m grid, per km2
def kde(pts, sigma_m=1000):
    a = np.zeros((H, W), np.float32)
    col = ((pts.geometry.x - minx) / RES).astype(int).clip(0, W - 1)
    row = ((maxy - pts.geometry.y) / RES).astype(int).clip(0, H - 1)
    np.add.at(a, (row.values, col.values), 1)
    return gaussian_filter(a, sigma_m / RES) / (RES * RES / 1e6)
kde_all = kde(poi)
kde_evt = kde(poi[poi.fclass.isin(G['food'] + G['retail'] + G['event'] + G['lodging']) | poi.pasar.eq(1)])

# ---------- zonal stats ----------
ids = desa_r.ravel(); m = ids > 0
def zsum(arr):
    return np.bincount(ids[m], weights=arr.ravel()[m].astype(float), minlength=len(desa) + 1)[1:]
ncell = np.bincount(ids[m], minlength=len(desa) + 1)[1:]
z = pd.DataFrame({'uid': desa.uid, 'ncell': ncell})
for c, k in code.items():
    z[f'lu_{c}_km2'] = zsum(lu_r == k) * RES * RES / 1e6
z['lu_none_km2'] = zsum(lu_r == 0) * RES * RES / 1e6
z['kde_poi'] = zsum(kde_all) / np.maximum(ncell, 1)
z['kde_evt'] = zsum(kde_evt) / np.maximum(ncell, 1)

# distance from desa centroid to nearest river/canal (siting and flood constraint)
riv = ww[ww.fclass.isin(['river', 'canal'])]
cent = desa[['uid']].copy(); cent['geometry'] = desa.representative_point(); cent = gpd.GeoDataFrame(cent, crs=CRS)
nn = gpd.sjoin_nearest(cent, riv[['geometry']], distance_col='dist_river_m')
nn = nn.groupby('uid').dist_river_m.min().reset_index()
# waterway length density
wl = gpd.overlay(ww[['fclass', 'geometry']], desa[['uid', 'geometry']], how='intersection', keep_geom_type=True)
wl['len_km'] = wl.length / 1000
wlen = wl.groupby('uid').len_km.sum().rename('waterway_km').reset_index()
# distance from centroid to kabkota main urban centre proxy: nearest kelurahan centroid
# landfill (TPA) distance
tpa = lu[lu.fclass.eq('landfill')].copy(); tpa['geometry'] = tpa.representative_point()
d2t = gpd.sjoin_nearest(cent, tpa[['geometry']], distance_col='dist_tpa_m').groupby('uid').dist_tpa_m.min().reset_index()

F = desa.drop(columns='geometry').merge(z, on='uid').merge(cnt, on='uid').merge(nn, on='uid', how='left') \
    .merge(wlen, on='uid', how='left').merge(d2t, on='uid', how='left')
F['waterway_km'] = F.waterway_km.fillna(0)
cx = desa.to_crs(4326).representative_point()
F['lon'] = cx.x.values; F['lat'] = cx.y.values
F.to_parquet(f'{OUT}/desa_features.parquet')
desa[['uid', 'iddesa', 'rid', 'geometry']].to_file(f'{OUT}/desa_utm.gpkg')
prof = dict(driver='GTiff', height=H, width=W, count=1, crs=CRS, transform=tr, compress='deflate')
for name, arr, dt in [('landuse', lu_r, 'uint8'), ('desa_id', desa_r, 'int32'), ('kde_poi', kde_all, 'float32'), ('kde_evt', kde_evt, 'float32')]:
    with rasterio.open(f'{OUT}/grid_{name}.tif', 'w', dtype=dt, **prof) as d:
        d.write(arr.astype(dt), 1)
print(F.describe().T.to_string())
