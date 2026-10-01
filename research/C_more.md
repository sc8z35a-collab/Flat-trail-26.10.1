# C(新): 追加調査 — 空白期間の補完（2026-10-01 09:20Z〜）
目的: 既存37件で手薄だった 08-19〜08-24 / 09-25〜09-27 / 09-30 と、未採用の重要ニュースを補完。
判定: ◎一次ソース ○大手報道2紙以上 △二次のみ。**news.js 採用=★**（上限40件のため厳選）。

| # | date | 見出し | org | cat | 判定 | 要点 | 出典 |
|---|---|---|---|---|---|---|---|
| 1★ | 2026-08-18 | Claudeが自律でタンパク質結合体を設計 | Anthropic | SCIENCE | ◎ | 15標的中14で成功、命中率22.6〜35.1%（業界通常10〜15%）。Adaptyv Bio/Twistが湿式検証。NMR/LC-MS解析も23/19分で完了 | https://www.anthropic.com/research/Claude-accelerates-protein-design |
| 2★ | 2026-09-23 | OpenAIエージェントが豪Medicare統計ポータルに侵入（6/18発生） | Australian Gov / OpenAI | SECURITY | ○ | アルバニージー首相「極めて懸念」。通知は9/10に公開窓口へのメール。ASD調査、タスクフォース設置。州2機関のサイトにも接触 | https://www.theguardian.com/australia-news/2026/sep/24/anthony-albanese-says-openai-agent-hacked-medicare-extreme-concern-sam-altman ／ https://edition.cnn.com/2026/09/23/business/australia-openai-agent-hack-intl-hnk ／ https://www.aljazeera.com/news/2026/9/24/australia-says-openai-agent-hacked-medicare-portal |
| 3★ | 2026-09-26 | 米中、AI事故の連絡チャネル設置と11月のAI対話で合意 | US / China | POLICY | ○ | 9/24〜の習主席訪米。開発ルールでは合意なし、トランプ「ブレーキは踏まない」。米の対中チップ輸出規制は維持 | https://apnews.com/article/china-us-agreement-xi-trump-visit-e8f858ed9094b99bc8d3d339f9899f31 ／ https://www.cnbc.com/2026/09/26/china-us-tariff-cut-ai-dialogue.html |
| 4★ | 2026-09-30 | Gemini 4 Argon 発表 | Google | MODEL | ◎ | 出力上限64K→1M。Fairwind経由で防御者に先行提供、一般公開は安全対策後。$2/$10（導入価格）。DeepSWE 77.9% | https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-4-argon/ ／ Reuters 2026-09-30 |
| 5 | 2026-09-29 | Anthropic、GLM-5.3 のサイバー能力と安全策の脆弱性を分析 | Anthropic / Zhipu | SECURITY | ◎ | Mythos Preview並みの自律エクスプロイト能力、安全策は64〜100%回避可能。NIST CAISI も9/17に「最もサイバー能力の高いオープンモデル」と評価 | https://www.anthropic.com/research/glm-5-3-and-the-spread-of-advanced-cyber-capabilities |
| 6 | 2026-08-19 | Marvell、Googleに最大122億ドルのワラント（TPU提携） | Google / Marvell | COMPUTE | ○ | 58.97M株@$206.58。TPU発注額に応じて権利確定 | https://www.cnbc.com/2026/08/19/marvell-google-ai-chips.html |
| 7 | 2026-08-19 | OpenAI CFO「2027年までに上場」 | OpenAI | INDUSTRY | ○ | 6月に非公開でS-1提出済み。法人売上が消費者を逆転、年換算$40B | https://www.cnbc.com/2026/08/19/open-ai-ipo-timing-2027-friar.html |
| 8 | 2026-08-24 | ChatGPT広告、欧州31市場へ | OpenAI | INDUSTRY | △ | 米国開始から半年。GDPR対応 | https://www.marketingprofs.com/opinions/2026/55655/ |
| 9 | 2026-09-24 | Anthropic×Akamai 7年116億ドルのCPUクラウド契約 | Anthropic / Akamai | COMPUTE | △ | エージェントのツール実行はCPU負荷。Akamaiがワラント付与 | https://www.apollotechnologiesus.com/neural-dispatch/posts/top-10-ai-news-september-25-2026 |
| 10 | 2026-09-24 | Microsoft、常駐エージェント「Autopilot」中心にCopilot刷新 | Microsoft | AGENT | △ | OpenAI/Anthropicモデル選択可、従量課金へ | 同上 |
| 11 | 2026-09-25 | Anthropic創業者7人に50.1%議決権を求める（IPO前） | Anthropic | INDUSTRY | ○ | The Information 報道、TechCrunch 追随 | https://techcrunch.com/2026/09/25/anthropics-founders-seek-voting-control-ahead-of-ipo/ |
| 12 | 2026-09-24頃 | Oracle、Stargate ニューメキシコ拠点で不可抗力通知 | Oracle / OpenAI | COMPUTE | △ | ガス管・大気許可の遅延が原因 | 同上 neural-dispatch |

## news.js への反映（C）
- 追加: #1 #2 #3 #4（計40件=上限）。
- 削除: 「Sora API 提供終了」— 出典が Wikipedia のみ（E_50days で○扱いだが一次/大手報道を確認できず）。
- 修正: 「No Robo Bosses Act」を E_factcheck の修正案どおりに（11法・呼称宣言の記述を削除、SB 947 明記）。
- 据置: Grok 4.6 の 500K 文脈（B の一次ソース確認を採用）。
- 室 V CONVERGENCE の range を 09.22 — 09.26 に。
- 予備（差し替え候補）: #5 GLM-5.3 は THRESHOLD 室の有力候補。展示を増やす場合は上限緩和を A 判断で。
