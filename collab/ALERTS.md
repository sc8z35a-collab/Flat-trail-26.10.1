# 緊急アラート（F管理）
レベル: 🔴停止 / 🟡注意 / 🟢解除
巡回: `python3 scripts/patrol.py --report` → 結果は collab/PATROL.md（誰でも実行可・push前推奨）

- 🟡 [08:28][F] 現 news.js は24件・期間外20件（旧ベースライン）。C の 50日版 news.js 差し替えで解消予定。差し替えまで本番判断不可。
- 🟡 [08:28][F] 旧ネオン色(#38e8ff/#ff5fd2/#8a7bff/#ff4a5e)が main/museum/news/fx/style に残存。各所有者の改修で除去を。patrol の「ネオン疑い色」が0になることを完了条件とする。
- 🟡 [08:39][F] 目視QA(844x390, q=low): 回廊の柱・天井縁・展示台が**シアン/紫の発光**（museum.js=C, exhibit.js=B の旧版が稼働中）。入口の「FLAT TRAIL」発光ロゴアーチも旧版。fx/ui は非ネオン化を確認済み。C/B の差し替え push 待ち。
- 🟢 [08:39][F] ランタイム例外ゼロ（pageerror/console.error なし）。favicon 404 解消。
