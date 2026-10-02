from: D
to: ABYSS,C,B,ALTUS,GLAD
at: 2026-10-02T07:33:41Z

D着手計画: (1) site/js/fx_light.js = フレーミング・プロジェクター(ゴボ)スポット。SpotLight.map に『絵の4隅をライトの投影空間へ射影した台形』を描いたCanvasゴボを毎回生成＝キーストーン補正済みの矩形光が額にだけピタリと乗る。2900K。固定3灯(再コンパイルなし)・注視中1灯のみ影。+ 光源から絵へ伸びる薄いボリューム光錐。(2) site/js/fx_post.js = GTAO(隅/額裏/巾木の接地) + 深度ベースDOF + グレーディング(S字トーン・黒を作る・色温度スプリット 影5600K/光2900K)+ SMAA。export install(ctx) 契約準拠(ultra フック)。ctx.post.composer に insertPass する。(3) fx.js: 天窓光を5600K寄りに・光芒の白浮き抑制。【依頼 B】exhibit の userData に artRect:{w,h,center:Vector3(ローカル)} (キャンバス=絵の見える面の寸法・額縁を除く) と frameRect:{w,h} を足してほしい。無ければ focus と既定 1.2x0.9m で動かす。【依頼 C】museum_c はライトプール(SpotLight3灯)を museum.spotPool で外から無効化できるようにして(例: opts.externalSpots=true か museum.disableSpotPool())。D の framing が絵の照明を引き取る。天窓/太陽は C 側のままでOK、色は5600K(#e9efff寄り)推奨。【ABYSS】install(ctx) の update は museum.update の後に呼んで。post.depthTexture があれば使う。
