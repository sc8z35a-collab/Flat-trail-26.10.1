#!/usr/bin/env python3
"""altus_markup.py — Owner: ALTUS（アートディレクター）。レビュー用の赤ペン注釈ツール。

使い方:
  # 赤ペン注釈（矩形 x,y,w,h と番号付きコメント）
  python3 tools/altus_markup.py mark in.png out.jpg "x,y,w,h|1 光源が無い" "x,y,w,h|2 文字が重なる" ...
  # 比較（左右並べ。ラベル付き）
  python3 tools/altus_markup.py pair a.png b.png out.jpg "BEFORE" "AFTER"
  # コンタクトシート（N枚をグリッド）
  python3 tools/altus_markup.py sheet out.jpg cols img1 img2 ...
注釈は画像下部の帯に番号順で一覧化される（画面内の文字は番号のみ＝絵を隠さない）。
"""
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
RED = (230, 30, 40)


def font(sz):
    try:
        return ImageFont.truetype(FONT, sz, index=0)
    except Exception:
        return ImageFont.load_default()


def mark(src, dst, notes):
    im = Image.open(src).convert('RGB')
    W, H = im.size
    items = []
    for n in notes:
        box, _, text = n.partition('|')
        x, y, w, h = [int(float(v)) for v in box.split(',')]
        items.append((x, y, w, h, text))
    f = font(15)
    lh = 22
    band = 12 + lh * len(items)
    out = Image.new('RGB', (W, H + band), (24, 22, 20))
    out.paste(im, (0, 0))
    d = ImageDraw.Draw(out)
    for k, (x, y, w, h, text) in enumerate(items):
        d.rectangle([x, y, x + w, y + h], outline=RED, width=3)
        num = text.split(' ')[0]
        tw = d.textlength(num, font=f) + 10
        d.rectangle([x, max(0, y - 20), x + tw, max(0, y - 20) + 20], fill=RED)
        d.text((x + 5, max(0, y - 20) + 0), num, font=f, fill=(255, 255, 255))
        d.text((10, H + 6 + k * lh), text, font=f, fill=(255, 210, 200))
    out.save(dst, quality=85)
    print('saved', dst)


def pair(a, b, dst, la='BEFORE', lb='AFTER'):
    A = Image.open(a).convert('RGB')
    B = Image.open(b).convert('RGB').resize(A.size)
    W, H = A.size
    out = Image.new('RGB', (W * 2 + 6, H + 30), (24, 22, 20))
    out.paste(A, (0, 30)); out.paste(B, (W + 6, 30))
    d = ImageDraw.Draw(out); f = font(18)
    d.text((8, 4), la, font=f, fill=(255, 220, 200)); d.text((W + 14, 4), lb, font=f, fill=(255, 220, 200))
    out.save(dst, quality=85); print('saved', dst)


def sheet(dst, cols, imgs):
    ims = [Image.open(p).convert('RGB') for p in imgs]
    w, h = ims[0].size
    ims = [i.resize((w, h)) for i in ims]
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGB', (cols * w + (cols - 1) * 4, rows * h + (rows - 1) * 4), (24, 22, 20))
    for k, i in enumerate(ims):
        out.paste(i, ((k % cols) * (w + 4), (k // cols) * (h + 4)))
    out.save(dst, quality=82); print('saved', dst)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'mark':
        mark(sys.argv[2], sys.argv[3], sys.argv[4:])
    elif cmd == 'pair':
        pair(*sys.argv[2:7])
    elif cmd == 'sheet':
        sheet(sys.argv[2], int(sys.argv[3]), sys.argv[4:])
