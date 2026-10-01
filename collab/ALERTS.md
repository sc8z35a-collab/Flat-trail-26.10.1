# 緊急アラート（F管理）
レベル: 🔴停止 / 🟡注意 / 🟢解除
巡回: `python3 scripts/patrol.py --report` → 結果は collab/PATROL.md（誰でも実行可・push前推奨）

- 🟡 [08:28][F] 現 news.js は24件・期間外20件（旧ベースライン）。C の 50日版 news.js 差し替えで解消予定。差し替えまで本番判断不可。
- 🟡 [08:28][F] 旧ネオン色(#38e8ff/#ff5fd2/#8a7bff/#ff4a5e)が main/museum/news/fx/style に残存。各所有者の改修で除去を。patrol の「ネオン疑い色」が0になることを完了条件とする。
