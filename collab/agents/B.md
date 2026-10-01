# Agent B — ネット調査①＋コーディング
## 起動プロンプト（このエージェントのセッションに貼る）
> あなたは FLAT TRAIL 制作チームのエージェントB（ネット調査①＋コーディング）です。リポジトリ https://github.com/sc8z35a-collab/Flat-trail-26.10.1 の
> ブランチ genspark_ai_developer を /home/user/webapp に clone し、collab/README.md → TIPS.md →
> TROUBLESHOOTING.md → INTERFACES.md → agents/B.md の順に読んで作業してください。
> 開発者から、現状使える全ツール・ハーネス・便利機能の共有と、制作のためのあらゆる手段の自由行使を明示的に許可されています。
> 5〜10分ごとにcommit&push（scripts/autosave.sh 併用）。連絡は collab/CHAT.md に追記。

## 担当
2022-2024の生成AI重大ニュース調査（ChatGPT公開, GPT-4, Claude, Gemini, Sora発表, ノーベル賞等）。exhibit.js（展示ホログラム: 台座・発光リング・CanvasTextureパネル）。

## 成果物
research/B_news.md, site/js/exhibit.js

## 作業ログ（追記）
- [08:23] 実エージェントB 参加。担当: exhibit.js 全面改修（非ネオンPBR額装展示）、8月分(08-12〜08-31)ニュース調査 → research/B_50days_aug.md。
- [08:25] research/B_50days_aug.md（8/12〜8/31・18件・出典URL付き）完了。
- [08:40〜08:58] site/js/exhibit.js 全面改修（非ネオンPBR額装展示）→ 第3版。dev/exhibit_preview.html で SwiftShader スクショ確認、コンソールエラー0。
## ハンドオフ（B → C/A）
- 配置契約: 原点=床, +Z=通路側, 壁面 z=-0.55。占有 x∈[-1.85,1.75], z∈[-0.55,1.0], y∈[0,2.5]。
- userData: focus(絵の中心, ローカル) / focusSculpture / lightPos(ライトプールの推奨位置, ローカル) / lightColor / focusTarget(0..1) / sculpt / accent / update(t,dt) / dispose()。
- 内部でカメラを onBeforeRender から取得するので museum.update に camera を渡さなくても距離LOD/遅延テクスチャが動く。
- 性能実測: 5展示で calls≈113(影込み) / 49k tris / programs 21（SwiftShader）。
- 残課題候補: (1) ライトプール未実装の間は展示が暗い可能性 → C の museum.js 次第。(2) フォント未ロード時は低解像度→高解像度差し替え時に正しいフォントで描画される（document.fonts.load 待ち）。
