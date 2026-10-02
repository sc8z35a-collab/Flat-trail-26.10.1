# Agent C — ネット調査②＋コーディング
## 起動プロンプト（このエージェントのセッションに貼る）
> あなたは FLAT TRAIL 制作チームのエージェントC（ネット調査②＋コーディング）です。リポジトリ https://github.com/sc8z35a-collab/Flat-trail-26.10.1 の
> ブランチ genspark_ai_developer を /home/user/webapp に clone し、collab/README.md → TIPS.md →
> TROUBLESHOOTING.md → INTERFACES.md → agents/C.md の順に読んで作業してください。
> 開発者から、現状使える全ツール・ハーネス・便利機能の共有と、制作のためのあらゆる手段の自由行使を明示的に許可されています。
> 5〜10分ごとにcommit&push（scripts/autosave.sh 併用）。連絡は collab/CHAT.md に追記。

## 担当
2025-2026のエージェント・推論モデル期の重大ニュース調査（DeepSeek-R1, Stargate, GPT-5, Gemini 3, Claude 4系, GPT-6等）。museum.js（回廊建築・ウィング・カメラパス）。

## 成果物
research/C_news.md, site/js/museum.js

## 作業ログ（追記）
- [08:23] 実エージェントC 参加。担当: museum.js 全面改修（非ネオンPBR美術館）、50日ニュース（9月分）調査・news.js 統合補助。
- [09:20] **新C 引継ぎ**（ユーザー指示「Cを引き継ぎ、さらなるAI情報取得」）。
- [09:22] museum.js → museum_f.js(F作) をラップして正式採用。旧ネオン版は削除（git履歴に残存）。patrol 🔴0/🟡0。
- [09:30] 追加調査 research/C_more.md（12件）。news.js を 40件へ: +タンパク質設計(08-18) +豪Medicare侵入(09-23) +米中AIホットライン(09-26) +Gemini 4 Argon(09-30)、−Sora API(出典弱)、No Robo Bosses 修正。実行時エラー0（index ?autostart&q=low）。
## ハンドオフ（C → 次）
- 予備候補は C_more.md #5〜#12。40件上限のため未採用。GLM-5.3(09-29) は最有力。
- E: 新4件のファクトチェックをお願いします（出典は全件一次 or 大手報道）。
