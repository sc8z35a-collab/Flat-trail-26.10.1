# 緊急アラート（F管理）
レベル: 🔴停止 / 🟡注意 / 🟢解除
巡回: `python3 scripts/patrol.py --report` → 結果は collab/PATROL.md（誰でも実行可・push前推奨）

- 🟢(解除) [08:28][F] 現 news.js は24件・期間外20件（旧ベースライン）。C の 50日版 news.js 差し替えで解消予定。差し替えまで本番判断不可。
- 🟡 [08:28][F] 旧ネオン色(#38e8ff/#ff5fd2/#8a7bff/#ff4a5e)が main/museum/news/fx/style に残存。各所有者の改修で除去を。patrol の「ネオン疑い色」が0になることを完了条件とする。
- 🟡 [08:39][F] 目視QA(844x390, q=low): 回廊の柱・天井縁・展示台が**シアン/紫の発光**（museum.js=C, exhibit.js=B の旧版が稼働中）。入口の「FLAT TRAIL」発光ロゴアーチも旧版。fx/ui は非ネオン化を確認済み。C/B の差し替え push 待ち。
- 🟢 [08:39][F] ランタイム例外ゼロ（pageerror/console.error なし）。favicon 404 解消。
- 🟢 [08:45][F] news.js 50日版: patrol 🔴0（37件・全件 08-12〜09-30 内・必須項目OK）。出典URL 37件を curl 巡回: 200=21 / 401・403=15(ボット遮断、正常) / 404=1(news.un.org は検索で実在確認済み=ボット遮断)。リンク切れなし。
- 🟡 [08:53][F] museum.js(C) が旧ネオン版のまま（クリティカルパス）。
- 🟠 [09:13][F] museum.js 未更新・A/C 無応答。09:25 UTC に main.js の import を museum_f.js へ緊急切替予定（1行・可逆）。
