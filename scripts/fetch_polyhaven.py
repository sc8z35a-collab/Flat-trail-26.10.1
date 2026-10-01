#!/usr/bin/env python3
"""fetch_polyhaven.py — Poly Haven (CC0) から GLTF/テクスチャ/HDRI を site/assets/ に取得。
使い方: python3 scripts/fetch_polyhaven.py model NAME [res] | tex NAME [res] | hdri NAME [res]"""
import sys, json, os, urllib.request
op = urllib.request.build_opener(); op.addheaders = [('User-Agent', 'FlatTrail/1.0 (museum build)')]; urllib.request.install_opener(op)
kind, name = sys.argv[1], sys.argv[2]; res = sys.argv[3] if len(sys.argv) > 3 else '1k'
root = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets')
d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{name}'))
def get(url, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    urllib.request.urlretrieve(url, path); return os.path.getsize(path)
if kind == 'model':
    g = d['gltf'][res]['gltf']; out = os.path.join(root, 'models', name)
    tot = get(g['url'], os.path.join(out, f'{name}.gltf'))
    for rel, v in g['include'].items(): tot += get(v['url'], os.path.join(out, rel))
elif kind == 'tex':
    out = os.path.join(root, 'tex', name); tot = 0
    for m, key in [('diff', 'Diffuse'), ('nor', 'nor_gl'), ('rough', 'Rough'), ('arm', 'arm')]:
        if key in d and res in d[key]:
            fmt = 'jpg' if 'jpg' in d[key][res] else 'png'
            tot += get(d[key][res][fmt]['url'], os.path.join(out, f'{m}.{fmt}'))
elif kind == 'hdri':
    tot = get(d['hdri'][res]['hdr']['url'], os.path.join(root, 'hdri', f'{name}_{res}.hdr'))
print(kind, name, res, round(tot / 1e6, 2), 'MB')
