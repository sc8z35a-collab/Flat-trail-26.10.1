#!/usr/bin/env python3
"""d_fetch_ext.py — Owner: D. 外観(exterior_d)用の CC0 素材を Poly Haven から site/assets/ext/ に取得。
使い方: python3 tools/d_fetch_ext.py tex NAME [res]  |  hdri NAME [res]  |  jpg NAME (HDRI の tonemapped JPG)
テクスチャは site/assets/ext/<NAME>/{diff,nor,arm}.jpg に保存（assets.pbr() 形式）。"""
import sys, json, os, urllib.request
op = urllib.request.build_opener(); op.addheaders = [('User-Agent', 'FlatTrail/1.0 (museum build, agent D)')]; urllib.request.install_opener(op)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'assets', 'ext')
kind, name = sys.argv[1], sys.argv[2]; res = sys.argv[3] if len(sys.argv) > 3 else '1k'
d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{name}'))
def get(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True); urllib.request.urlretrieve(url, path); return os.path.getsize(path)
tot = 0
if kind == 'tex':
    for m, key in [('diff', 'Diffuse'), ('nor', 'nor_gl'), ('arm', 'arm')]:
        if key in d and res in d[key]: tot += get(d[key][res]['jpg']['url'], os.path.join(ROOT, name, f'{m}.jpg'))
elif kind == 'hdri':
    tot = get(d['hdri'][res]['hdr']['url'], os.path.join(ROOT, f'{name}_{res}.hdr'))
print(kind, name, res, round(tot / 1e6, 2), 'MB')
