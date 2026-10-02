# 制作のコツ（リーダーA記）

## グラフィックス
- three.js r186 / WebGL2。`renderer.outputColorSpace = SRGBColorSpace`、`toneMapping = ACESFilmicToneMapping`。
- 「超高グラフィックス」はポリゴン数ではなく **光・ポスト処理・動き** で作る：
  UnrealBloom + 自作の最終合成パス（色収差・ビネット・フィルムグレイン・スキャンライン）。
- 環境反射は `RoomEnvironment` + `PMREMGenerator` で生成（HDR画像ダウンロード不要＝軽量）。
- 床は `Reflector` ではなく **MeshPhysicalMaterial(roughness低) + envMap** で疑似反射（Reflectorは描画2倍で重い）。
- パーティクルは `Points` + 自作ShaderMaterial（GPUで動かす。CPUで位置更新しない）。
- テキストは CanvasTexture（日本語フォントをDL不要）。解像度は1024x512程度、`anisotropy`を設定。
- ドローコール削減: 繰り返し要素（柱・ライトストリップ）は `InstancedMesh`。

## モバイル横画面
- `devicePixelRatio` を最大1.5〜2にクランプ。perf.js が FPS を見て自動で画質段階を落とす。
- 縦画面時は「横にしてください」オーバーレイ。開始ボタンで `requestFullscreen()` + `screen.orientation.lock('landscape')`（失敗は握りつぶす）。
- iOS Safariは fullscreen API 非対応 → `100dvh` と `viewport-fit=cover` で疑似全画面、safe-area inset を考慮。
- 操作: スワイプ/左右ボタンで次/前の展示へカメラがスプライン移動。ドラッグで見回し。タップで詳細パネル。
- AudioContext はユーザー操作（開始タップ）後に生成。

## コード
- ビルドなし。`<script type="importmap">` で `three` と `three/addons/` を解決。
- 1ファイル1責務、所有者以外編集禁止。契約は INTERFACES.md。
- `requestAnimationFrame` 内でオブジェクト生成しない（GC スパイク）。Vector3 は使い回す。
- `visibilitychange` で非表示時はループ停止。

## 検証
- `python3 -m http.server` で配信 → Playwright（PlaywrightConsoleCapture）でコンソールエラー0を確認。
- サンドボックスのヘッドレスはGPUなし（SwiftShader）なので FPS は参考外。エラー検出に使う。

## 改訂: 非ネオン・現代美術館アートディレクション（A）
- 素材: 床=磨きトラバーチン(MeshPhysical roughness0.25前後, clearcoat0.3)、壁=白漆喰(roughness0.9)、フレーム/手すり=真鍮(metalness1, roughness0.3, color#c9a46a)。
- 光: 主光源=天窓からの冷たい昼光(DirectionalLight 影あり1灯) + 展示ごとの暖色SpotLight(2700K≒#ffd6a0, 影は注視中の1灯のみ castShadow を切替)。
- 発光は「白〜暖色の低彩度」まで。加算合成の高彩度パーティクルは使わない。ブルームは threshold 高め(0.9)・strength 0.3〜0.5。
- 空気感: FogExp2 を暖灰色(#d9d4cc系)で薄く、光芒は低不透明度。トーンマッピングは AgX か ACES、露出控えめ。
- 文字: キャプションは美術館の白プレート+墨文字（CanvasTexture）。ネオンの発光文字はやめる。
- 影の更新コスト削減: renderer.shadowMap.autoUpdate=false にし、カメラ到着時/ライト切替時のみ needsUpdate=true。

---
# v2 細部作成のコツ（リーダーA, 2026-10-02 — 写真再現・超高精細版）
## A. 「写真の通り」にする手順
1. `collab/REFERENCES.md` の寸法を **定数として先頭に書く**（W/H/ベイ数/段数）。目分量でなく数値で作る。
2. まず **グレーボックス（形と比率だけ）→ 撮影して写真と並べて比較** → 素材 → 光 → 細部、の順。形が違うと後の細部は無駄になる。
3. 撮影は写真と **同じ画角** で（空撮は高度80m・俯角40°・FOV45、室内はカメラ高1.6m・FOV60）。`zone.html?zone=X&cam=x,y,z,lx,ly,lz` で固定できる。
4. understand_images に「自分のスクショ」と「写真」を2枚並べて渡し、**差分を列挙させる**のが速い（UploadFileWrapper でURL化）。

## B. 超高精細の作り方（性能無視OK、でも賢く）
- **形の細部 > テクスチャ解像度**。モールディング（コーニス・巾木・額縁）は `ExtrudeGeometry`/`LatheGeometry` に
  断面プロファイル（Shape）を与えて作る。直方体を並べない。角は必ず面取り（bevel / RoundedBoxGeometry）。
- 繰り返し要素（柱・窓・ルーバー・パラソル・木・手すり子）は **InstancedMesh**。数千本でも1ドローコール。
- PBR は Poly Haven / ambientCG（CC0）の 1k〜2k（diff/nor/arm）。`assets.pbr('assets/arch/marble_01', {repeat:[4,4]})`。
  ライセンスと出典を CREDITS.md に。albedo は sRGB、normal/arm は Linear（assets.js が自動で設定）。
- 象嵌床・フレスコ・看板などは **Canvas で生成（2048〜4096px）** してよい。幾何学模様はベクタで描けば無限に精細。
- 金・大理石の映り込みは環境マップが命: ゾーンごとに **CubeCamera でそのゾーン自身を一度撮って PMREM** すると
  本当に周囲が映る（world がゾーン完成後に `zone.env.envMap` 未指定なら自動生成する予定）。
- 影: 静的なものは `castShadow` + `renderer.shadowMap.autoUpdate=false`（ctx.markShadow で更新要求）。接地感は
  「接地影デカール（放射グラデ）」と「AO を焼き込んだ頂点カラー」で足す。
- 植栽（森・生垣）: 球やアイコスフィアを頂点ノイズで変形 → InstancedMesh で数千本。色は2〜3トーンをインスタンスカラーで散らす。
- 水: `three/addons/objects/Water2.js` か自作シェーダ（法線マップ2枚スクロール + フレネル + 空の反射）。

## C. やってはいけない
- update() 内で new / ライトの追加削除（再コンパイル地獄）/ 毎フレームの CanvasTexture 再生成。
- 4096 テクスチャを数十枚（sandbox の 1GB が死ぬ）。巨大JPEGはリサイズしてからコミット（≦2048, 品質85）。
- 他人のファイル編集・`git add -A`（autosave 以外）・ブラウザ2本同時起動。
