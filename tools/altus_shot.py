#!/usr/bin/env python3
"""altus_shot.py — Owner: ALTUS。査読用の撮影（入館画面も撮れる / flock /tmp/browser.lock 内で実行すること）。
使い方:
  flock /tmp/browser.lock python3 tools/altus_shot.py <name> [intro] [stop ...] [--q=low] [--url=...] [--wait=2.5] [--w=844 --h=390]
  例: flock /tmp/browser.lock python3 tools/altus_shot.py r1 intro 1 8
出力: /tmp/altus/<name>_intro.png, /tmp/altus/<name>_stopXX.png（+ 到着前=移動中の _stopXX_mid.png）
"""
import sys, os, asyncio
from playwright.async_api import async_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = dict(a[2:].split('=', 1) for a in sys.argv[1:] if a.startswith('--') and '=' in a)
name = args[0] if args else 'shot'
targets = args[1:] or ['1']
Q = opt.get('q', 'low'); WAIT = float(opt.get('wait', '2.5')); W = int(opt.get('w', 844)); H = int(opt.get('h', 390))
BASE = opt.get('url', 'http://localhost:8080/')
MID = 'mid' in opt
os.makedirs('/tmp/altus', exist_ok=True)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                                          '--disable-dev-shm-usage', '--no-sandbox', '--js-flags=--max-old-space-size=256'])
        pg = await b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1, has_touch=True, is_mobile=True)
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        sep = '&' if '?' in BASE else '?'
        if 'intro' in targets:
            await pg.goto(f'{BASE}{sep}q={Q}', wait_until='load', timeout=120000)
            await pg.wait_for_timeout(3500)
            await pg.screenshot(path=f'/tmp/altus/{name}_intro_loading.png'); print('saved intro_loading')
            await pg.wait_for_function('document.body.classList.contains("is-ready")', timeout=240000)
            await pg.wait_for_timeout(3000)
            await pg.screenshot(path=f'/tmp/altus/{name}_intro.png'); print('saved intro')
            stops = [t for t in targets if t != 'intro']
            if stops:
                await pg.evaluate('document.getElementById("btn-start").click()')
                await pg.wait_for_timeout(900)
                await pg.screenshot(path=f'/tmp/altus/{name}_enter.png'); print('saved enter')
        else:
            await pg.goto(f'{BASE}{sep}autostart&q={Q}', wait_until='load', timeout=120000)
            stops = targets
        await pg.wait_for_function('window.__FT && window.__FT.controls', timeout=240000)
        for s in stops:
            s = int(s)
            if MID:
                await pg.evaluate(f'window.__FT.controls.goTo({s})')
                await pg.wait_for_timeout(1500)
                await pg.screenshot(path=f'/tmp/altus/{name}_stop{s:02d}_mid.png'); print('saved mid', s)
                try: await pg.wait_for_function('!window.__FT.controls.moving', timeout=150000)
                except Exception: pass
            else:
                await pg.evaluate(f'(window.__FT.controls.snap||window.__FT.controls.goTo)({s})')
            await pg.wait_for_timeout(int(WAIT * 1000))
            await pg.screenshot(path=f'/tmp/altus/{name}_stop{s:02d}.png'); print('saved', s)
        print('errors:', errs[:12])
        await b.close()

asyncio.run(main())
