#!/usr/bin/env python3
"""fetch_ambientcg.py — Owner: B。ambientCG (CC0 1.0) の PBR マテリアルを site/assets/tex/acg/<id>/ に取得。
使い方: python3 scripts/fetch_ambientcg.py Metal048C Marble021 ... [--res 1K]
出力: diff.jpg / nor.jpg(OpenGL) / rough.jpg / metal.jpg / ao.jpg / disp.jpg（存在するもののみ）"""
import sys, os, io, zipfile, urllib.request
res = '1K'
ids = [a for a in sys.argv[1:] if not a.startswith('--')]
if '--res' in sys.argv: res = sys.argv[sys.argv.index('--res') + 1]; ids.remove(res)
root = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets', 'tex', 'acg')
MAP = {'Color': 'diff', 'NormalGL': 'nor', 'Roughness': 'rough', 'Metalness': 'metal', 'AmbientOcclusion': 'ao', 'Displacement': 'disp'}
for aid in ids:
    url = f'https://ambientcg.com/get?file={aid}_{res}-JPG.zip'
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'FlatTrail/1.0'}), timeout=120).read()
    out = os.path.join(root, aid); os.makedirs(out, exist_ok=True); n = 0
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for name in z.namelist():
            for k, v in MAP.items():
                if name.endswith(f'_{k}.jpg'):
                    open(os.path.join(out, v + '.jpg'), 'wb').write(z.read(name)); n += 1
    print(aid, res, n, 'maps', round(len(data) / 1e6, 2), 'MB(zip)')
