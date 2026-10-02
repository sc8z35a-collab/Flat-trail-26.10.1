#!/usr/bin/env python3
"""fetch_art.py — Owner: B. パブリックドメインの名画（Wikimedia Commons）を取得し、モバイル向けにリサイズして site/assets/art/ に保存。
ライセンスは Commons API の LicenseShortName を検査し、Public domain / CC0 以外は拒否する。出典は site/assets/art/CREDITS.md に自動記録。
使い方: python3 scripts/fetch_art.py"""
import json, os, sys, io, time, subprocess, urllib.parse, urllib.request
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'assets', 'art')
UA = {'User-Agent': 'FlatTrailMuseum/1.0 (educational WebGL museum; github.com/sc8z35a-collab)'}
# key: (Commons file title, 出力最大幅, 最大高さ, 作品名, 作者)
ART = {
  'g1_light':   ('File:Michelangelo, Separation of Light from Darkness 00.jpg', 1024, 1024, 'Separation of Light from Darkness', 'Michelangelo, 1508–12'),
  'g2_sun':     ('File:Michelangelo - Creation of Sun Moon and Planets post restoration crop.jpg', 1400, 1024, 'Creation of the Sun, Moon and Plants', 'Michelangelo, 1508–12'),
  'g3_waters':  ('File:Michelangelo, Separation of the Earth from the Waters 00.jpg', 1024, 1024, 'Separation of the Earth from the Waters', 'Michelangelo, 1508–12'),
  'g4_adam':    ('File:Michelangelo - Creation of Adam (cropped).jpg', 1600, 1024, 'The Creation of Adam', 'Michelangelo, 1508–12'),
  'g5_eve':     ('File:Michelangelo, Creation of Eve 00.jpg', 1024, 1024, 'The Creation of Eve', 'Michelangelo, 1508–12'),
  'g6_fall':    ('File:Michelangelo, Fall and Expulsion from Garden of Eden 00.jpg', 1600, 1024, 'The Fall and Expulsion', 'Michelangelo, 1508–12'),
  'g7_noah':    ('File:Michelangelo, Sacrifice of Noah 00.jpg', 1024, 1024, 'The Sacrifice of Noah', 'Michelangelo, 1508–12'),
  'g8_deluge':  ('File:Deluge, Michelangelo.png', 1400, 1024, 'The Deluge', 'Michelangelo, 1508–12'),
  'g9_drunk':   ('File:Michelangelo, Drunkenness of Noah 00.jpg', 1024, 1024, 'The Drunkenness of Noah', 'Michelangelo, 1508–12'),
  'p_delphic':  ('File:Michelangelo - Delphic Sibyl.jpg', 640, 900, 'Delphic Sibyl', 'Michelangelo'),
  'p_isaiah':   ('File:Jesaja (Michelangelo).jpg', 640, 900, 'Isaiah', 'Michelangelo'),
  'p_daniel':   ('File:Daniel (Michelangelo).jpg', 640, 900, 'Daniel', 'Michelangelo'),
  'p_erythraean': ('File:Erithraiesche Sibylle (Michelangelo).jpg', 640, 900, 'Erythraean Sibyl', 'Michelangelo'),
  'p_ezekiel':  ('File:Ezekiel by Michelangelo, restored - large.jpg', 640, 900, 'Ezekiel', 'Michelangelo'),
  'p_joel':     ('File:Joel (Michelangelo).jpg', 640, 900, 'Joel', 'Michelangelo'),
  'p_libyan':   ('File:LibyanSibyl SistineChapel.jpg', 640, 900, 'Libyan Sibyl', 'Michelangelo'),
  'p_cumaean':  ('File:CumaeanSibylByMichelangelo.jpg', 640, 900, 'Cumaean Sibyl', 'Michelangelo'),
  'p_persian':  ('File:Perzsa.jpg', 640, 900, 'Persian Sibyl', 'Michelangelo'),
  'p_zechariah': ('File:Michelangelo, profeti, Zechariah 02.jpg', 640, 900, 'Zechariah', 'Michelangelo'),
  'p_jonah':    ('File:Michelangelo, profeti, Jonah 02.jpg', 640, 900, 'Jonah', 'Michelangelo'),
  'p_jeremiah': ('File:Michelangelo, profeti, Jeremiah 01.jpg', 640, 900, 'Jeremiah', 'Michelangelo'),
  'w_judgement': ('File:Last Judgement (Michelangelo).jpg', 1900, 2048, 'The Last Judgement', 'Michelangelo, 1536–41'),
  'w_athens':   ('File:"The School of Athens" by Raffaello Sanzio da Urbino.jpg', 2048, 1600, 'The School of Athens', 'Raphael, 1509–11'),
  'w_parnassus': ('File:Raphael - The Parnassus.jpg', 2048, 1600, 'The Parnassus', 'Raphael, 1509–11'),
}
OK_LIC = ('public domain', 'cc0', 'pd')
def get(url, timeout=120):
    for attempt in range(8):
        try:
            r = subprocess.run(['curl', '-sfL', '--max-time', str(timeout), '-A', UA['User-Agent'], url], capture_output=True)
            if r.returncode == 0 and r.stdout: return r.stdout
            raise RuntimeError('curl rc=%d' % r.returncode)
        except Exception as e: print('  retry', attempt, e); time.sleep(6 + attempt * 8)
    raise RuntimeError('failed ' + url)
def api(title, width):
    q = urllib.parse.urlencode({'action': 'query', 'titles': title, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size', 'iiurlwidth': width, 'format': 'json'})
    return list(json.loads(get('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values())[0]['imageinfo'][0]
def main(keys):
    os.makedirs(OUT, exist_ok=True); credits = []
    for k, (title, mw, mh, name, artist) in ART.items():
        if keys and k not in keys: continue
        ii = api(title, mw * 2)
        lic = ii['extmetadata'].get('LicenseShortName', {}).get('value', '')
        if not any(s in lic.lower() for s in OK_LIC): print('SKIP license', k, lic); continue
        url = ii.get('thumburl') or ii['url']
        if os.path.exists(os.path.join(OUT, k + '.jpg')) and not keys:
            credits.append(f'| {k}.jpg | {name} | {artist} | {lic} | {ii["descriptionurl"]} |'); print(k, 'cached'); time.sleep(1); continue
        try: data = get(url)
        except Exception as e: print('FAIL', k, e); continue
        im = Image.open(io.BytesIO(data)).convert('RGB'); im.thumbnail((mw, mh), Image.LANCZOS)
        p = os.path.join(OUT, k + '.jpg'); im.save(p, quality=82, optimize=True, progressive=True)
        print(k, im.size, os.path.getsize(p) // 1024, 'KB', lic)
        credits.append(f'| {k}.jpg | {name} | {artist} | {lic} | {ii["descriptionurl"]} |')
        time.sleep(3)
    if not keys:
        with open(os.path.join(OUT, 'CREDITS.md'), 'w') as f:
            f.write('# 名画テクスチャの出典（すべて Public domain / CC0, Wikimedia Commons）\n\n| file | 作品 | 作者 | ライセンス | 出典 |\n|---|---|---|---|---|\n' + '\n'.join(credits) + '\n')
if __name__ == '__main__': main(sys.argv[1:])
