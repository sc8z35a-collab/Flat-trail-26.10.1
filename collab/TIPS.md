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
