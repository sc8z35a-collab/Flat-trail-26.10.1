# INTERFACES v2 — ゾーン契約（2026-10-02, A 策定）
全モジュールは ES Module。`import * as THREE from 'three'`。ビルドなし。

## 1. 全体構成: 「ゾーン」を数珠つなぎにした1本の巡回路
```
[D] exterior   海沿いの丘・白い2棟・円形庭園とリング池（写真①）  … 空撮→接近→入口
[A] lobby      国立新美術館風アトリウム（写真④）                 … 波打つガラス壁・逆円錐・木の床
[C] cupola     KHM 八角クーポラ・ホール（写真③）                 … 大理石柱・象嵌床・中央の円形開口＋赤い手すり
[C] gallery    展示室 I〜VI（KHM 風の絵画ギャラリー、B の展示40点を壁に掛ける）
[C] sistine    システィーナ礼拝堂（写真②）                       … 終幕（finale）
```
- 順序・合成は `site/js/world.js`（A）。各ゾーンは **自分のローカル座標**で作り、world がつなぐ。
- 単体確認: **`site/zone.html?zone=<id>&q=high`**（そのゾーンだけをロードし、自由カメラで見られる / `&stop=N` で停止点へ）。
  本番: `site/index.html`（全ゾーン）。どちらも `?autostart&q=low|mid|high&debug` が使える。

## 2. ゾーンモジュールの契約
ファイル（所有者）: `site/js/exterior_d.js`(D) / `site/js/lobby_a.js`(A) / `site/js/museum_c_cupola.js`(C) /
`site/js/museum_c_gallery.js`(C) / `site/js/museum_c_sistine.js`(C)。未作成・例外時は world がプレースホルダで代替（全体は止まらない）。

```js
export async function buildZone(ctx) { ... return zone; }   // async 可。重いロードは await してよい

// ctx（world が渡す）
ctx = {
  THREE, renderer, scene,           // scene には直接 add しない。zone.group に add する
  NEWS, WINGS, PERIOD,              // data/news.js
  assets,                           // assets.js: tex(url,{srgb,repeat,aniso}) / pbr(dir,{repeat}) / gltf(url) / hdr(url) / canvas(w,h,fn)  全てキャッシュ付き Promise
  makeExhibit,                      // exhibit.js(B) の makeExhibit(news, index, renderer, opts)
  quality, profile,                 // 'low'|'mid'|'high', perf.js の PROFILES[quality]
  rig,                              // 共有ライト（§4）。ゾーンは自分で Light を作らない（例外 §4）
  progress(p, label),               // 0..1 ロード進捗
  markShadow(n=2),                  // 影マップの再描画を要求
}

// zone（ゾーンが返す）— 座標はすべてゾーンのローカル（m）
zone = {
  id: 'exterior'|'lobby'|'cupola'|'gallery'|'sistine',
  group: THREE.Group,               // ゾーンの全メッシュ。world が位置・回転を付けて scene に add する
  entry: { pos: Vector3 },          // 入口（前ゾーンの exit と一致させる点。通常 (0,0,0)）
  exit:  { pos: Vector3, rotY: 0 }, // 出口。次ゾーンのローカル原点はここ（rotY で向きも回せる）。ローカル -Z が基本の進行方向
  waypoints: [                      // カメラ経路（順番どおりにスプライン化）。stop 付きの点が「停止点」
    { pos: Vector3, look?: Vector3, stop?: { kind: 'intro'|'view'|'exhibit'|'finale', index?: number, title?: string, sub?: string } },
  ],
  exhibits?: [{ mesh, anchor: Vector3, viewPos: Vector3, news, side: -1|1 }],  // gallery のみ。index は NEWS の index
  skylights?: [{ x, y, z, w, d }],  // fx 用（ローカル）
  env: {                            // このゾーンにいる間の環境（world が切替・補間する）
    background: 0xRRGGBB | THREE.Texture, fog: { color, density }, exposure: 1.0,
    envMap?: THREE.Texture (PMREM 済み), envIntensity?: 0.6, far?: 300, near?: 0.05,
  },
  update(t, dt, s) {},              // 毎フレーム（可視のときのみ）。s = { camera, camLocal: Vector3, active: bool, focusIndex, rig, quality }
  setQuality?(q, profile) {},
  dispose?() {},
}
```
### ルール
- **入口 (0,0,0)・床 y=0・進行方向 -Z**。exit の位置に次ゾーンの入口が来る。ゾーン同士は空間的に重なってよい（world が不可視化する）。
- 停止点: `intro`（最初の1つ, D）/ `view`（見どころ。title/sub が HUD に出る）/ `exhibit`（index 必須, C）/ `finale`（最後, C の sistine）。
- 経路は滑らかに: waypoint 間隔 2〜15m、急な折り返し禁止、壁・柱を貫通しない（扉・開口の手前後に中継点を置く）。カメラ高 1.6〜1.7m（外観の空撮は自由）。
- ゾーンの可視範囲: world は「カメラがいるゾーンと前後1つ」だけ visible にする。
- `update` 内で new しない（Vector3 等は使い回す）。GLTF/テクスチャは `ctx.assets` 経由（キャッシュ共有）。
- 性能は無視してよい（ユーザー明示）が、**SwiftShader で `?q=low` が 1fps 以上で動くこと**（検証のため）。重い要素は `q==='low'` で間引く。

## 3. exhibit.js（B）契約（v1 互換＋拡張）
```js
makeExhibit(news, index, renderer, opts?) -> THREE.Group
//   原点=床面, ローカル +Z=来館者側, 壁面 z=-0.55。占有 x∈[-1.9,1.9], z∈[-0.55,1.0], y∈[0,3.4]
//   opts: { style?: 'khm'|'modern', wallColor?, assets? }   // C の壁色に合わせて額・マットを選べる
//   userData: { news, index, focus(ローカル), focusSculpture, lightPos(ローカル), lightColor, focusTarget(0..1), sculpt, accent, update(t,dt), dispose() }
```
async が必要なら `makeExhibitAsync(news, index, renderer, opts) -> Promise<Group>` を追加 export（C はあれば使う）。

## 4. 共有ライト rig（world 所有・ゾーンは active のときだけ値を設定）
ライト数が変わると全シェーダが再コンパイルされるため **ライトは world が固定数だけ作る**:
```js
rig = {
  sun: DirectionalLight (castShadow, shadow camera はゾーンが設定してよい), hemi: HemisphereLight, ambient: AmbientLight,
  spots: SpotLight[4] (影なし), points: PointLight[4] (影なし),
  reset(),     // 全部 intensity 0 / 既定色に戻す（world がゾーン切替時に呼ぶ）
}
```
- active なゾーンが `update` 内で `s.rig` の位置・色・強度を設定する（座標はワールド: `zone.group.localToWorld(v)` で変換）。
- 例外: 見た目上の光（窓の発光・シャンデリアの発光体）は MeshBasic/emissive で作る。どうしても固定ライトが必要なら CHAT で A に相談。

## 5. fx.js（D）
`createFX(scene, renderer, { skylights(world座標), hall, zones })` → `{ update(t,dt,camera,zoneId), burst(pos,color), setDensity(q), finale(on), sun }`。
旧API互換を維持すること（main.js が使う）。

## 6. main.js / world.js（A）
```js
buildWorld(ctx) -> { zones, stops:[{kind,index?,t,pos,look,zone,title?,sub?}], path(CatmullRomCurve3, 弧長 t), exhibits(global), skylights(world),
                     update(t,dt,focusIndex,camera), zoneAt(u), setQuality(q,prof) }
```
`window.__FT = { renderer, scene, camera, controls, world, museum(=world), perf, fx, post }`（selftest/shot.py 互換）。
