"""Step 8a. Prepare the GEE monthly panel (VIIRS NTL, Sentinel 5P SO2 and CO, 2022 to 2025) for the model.
uid in the GEE file starts at 1; model uid starts at 0 (same polygon order as desa_jabar.gpkg; verified on iddesa and name)."""
import pandas as pd, numpy as np
OUT = '/home/claude/wte/out'
d = pd.read_csv('/mnt/user-data/uploads/desa_jabar_bulanan_panel.csv')
d['uid'] = d.uid - 1
d['ntl'] = d.ntl.clip(lower=0)
d.to_parquet(f'{OUT}/gee_panel.parquet')
# annual composites: NTL median over April to October (cloud cover masks many wet season months), gases annual mean
dry = d[d.bulan.between(4, 10)]
a = dry.groupby(['uid', 'tahun']).ntl.median().unstack().add_prefix('ntl_')
g = d.groupby(['uid', 'tahun'])[['co', 'so2']].mean().unstack()
g.columns = [f'{v}_{y}' for v, y in g.columns]
A = a.join(g).reset_index()
A.to_parquet(f'{OUT}/gee_annual.parquet')
print(A.describe().T.round(5).to_string())
