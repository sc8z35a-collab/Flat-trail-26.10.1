#!/usr/bin/env python3
"""glad_lens.py — Owner: GLAD（サブ監督）。顕微鏡監査用の「任意カメラ」撮影ツール。
通常の stop 撮影ではなく、展示ローカル座標で任意の位置・注視点にカメラを置き、HUD を消して素材を接写する。

使い方（必ず flock 経由。ブラウザは全員で同時1本）:
  flock /tmp/browser.lock python3 tools/glad_lens.py <shots.json>
  shots.json = [{"name":"ex3_frame_corner", "ex":3, "pos":[0.9,1.9,0.6], "look":[0.6,1.7,0], "fov":35, "hud":false}, ...]
     ex   : 展示 index（pos/look はその展示グループのローカル座標。+Z=通路側, 原点=床）
     world: true なら pos/look はワールド座標
     stop : 先にその stop へ snap してから撮影（省略時は ex に対応する stop）
     eval : 撮影前に評価する JS 式（診断: 例 "__FT.fx && (__FT.scene.getObjectByName('fx').visible=false)"）
環境変数: FT_URL（既定 http://localhost:8080/?autostart&q=high）, OUT（既定 /tmp/glad）, SETTLE（ms, 既定 3500）
出力: $OUT/<name>.png と renderer 統計・コンソールエラー一覧（stdout）
"""
import sys, os, json, asyncio, time
from playwright.async_api import async_playwright

URL = os.environ.get('FT_URL', 'http://localhost:8080/?autostart&q=high')
OUT = os.environ.get('OUT', '/tmp/glad')
SETTLE = int(os.environ.get('SETTLE', '3500'))
shots = json.load(open(sys.argv[1]))
os.makedirs(OUT, exist_ok=True)
t0 = time.time()
def P(*a): print(f'[{time.time()-t0:6.1f}]', *a, flush=True)

JS_POSE = """(s) => {
  const F = window.__FT, T = F.camera;
  if (!F.__glad) { F.__glad = true; F.__origUpdate = F.controls.update; }
  F.controls.update = () => {};                       // 歩行カメラを止める
  const V = (a) => ({x:a[0], y:a[1], z:a[2]});
  let p = s.pos, l = s.look;
  if (!s.world) {
    const g = F.museum.exhibits[s.ex].mesh; g.updateMatrixWorld(true);
    const a = g.localToWorld(T.position.clone().set(...s.pos)); const b = g.localToWorld(T.position.clone().set(...s.look));
    p = [a.x,a.y,a.z]; l = [b.x,b.y,b.z];
  }
  T.position.set(...p); T.lookAt(...l);
  T.fov = s.fov || 50; T.updateProjectionMatrix();
  document.getElementById('hud').style.visibility = (s.hud ? 'visible' : 'hidden');
  if (F.renderer.shadowMap) F.renderer.shadowMap.needsUpdate = true;
  return {p, l};
}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
                                          '--disable-dev-shm-usage', '--no-sandbox', '--js-flags=--max-old-space-size=384'])
        pg = await b.new_page(viewport={'width': 844, 'height': 390}, device_scale_factor=1, has_touch=True, is_mobile=True)
        errs = []
        def oncons(m):
            if m.type in ('error', 'warning'):
                errs.append(f'{m.type}: {m.text[:240]}')
        pg.on('console', oncons)
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)[:300]))
        await pg.goto(URL, wait_until='load', timeout=120000); P('loaded')
        await pg.wait_for_function('window.__FT && window.__FT.controls', timeout=240000, polling=1000); P('ready')
        for s in shots:
            stop = s.get('stop')
            if stop is None and 'ex' in s:
                stop = await pg.evaluate(f"window.__FT.museum.stops.findIndex(x => x.kind==='exhibit' && x.index==={s['ex']})")
            if stop is not None and stop >= 0:
                if await pg.evaluate('!!window.__FT.__glad'):
                    await pg.evaluate('window.__FT.controls.update = window.__FT.__origUpdate')
                await pg.evaluate(f'(window.__FT.controls.snap||window.__FT.controls.goTo)({stop})')
                try: await pg.wait_for_function('!window.__FT.controls.moving', timeout=60000, polling=500)
                except Exception: P('still moving')
                await pg.wait_for_timeout(1500)   # 遅延テクスチャ生成/ライトプール割当を待つ
            if s.get('eval'): P('eval', await pg.evaluate(s['eval']))   # 診断用（オブジェクト非表示など）
            r = await pg.evaluate(JS_POSE, s)
            await pg.wait_for_timeout(s.get('settle', SETTLE))
            path = f"{OUT}/{s['name']}.png"
            await pg.screenshot(path=path, timeout=120000); P('saved', path, r)
        try:
            P('info', await pg.evaluate('JSON.stringify({tex:__FT.renderer.info.memory.textures,geo:__FT.renderer.info.memory.geometries,progs:__FT.renderer.info.programs.length})'))
        except Exception as e: P('info err', e)
        P('console errors/warnings:', len(errs))
        for e in errs[:25]: print('   ', e)
        await b.close()

asyncio.run(main())
