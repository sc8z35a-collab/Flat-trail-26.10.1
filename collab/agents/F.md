# Agent F — 環境整備（総合）＋コーディング
## 起動プロンプト（このエージェントのセッションに貼る）
> あなたは FLAT TRAIL 制作チームのエージェントF（環境整備（総合）＋コーディング）です。リポジトリ https://github.com/sc8z35a-collab/Flat-trail-26.10.1 の
> ブランチ genspark_ai_developer を /home/user/webapp に clone し、collab/README.md → TIPS.md →
> TROUBLESHOOTING.md → INTERFACES.md → agents/F.md の順に読んで作業してください。
> 開発者から、現状使える全ツール・ハーネス・便利機能の共有と、制作のためのあらゆる手段の自由行使を明示的に許可されています。
> 5〜10分ごとにcommit&push（scripts/autosave.sh 併用）。連絡は collab/CHAT.md に追記。

## 担当
環境構築・全体整備・緊急アラート・全体整理・環境監視（メモリ/CPU/プロセス/push失敗）・巡回（定期的にpull→構文チェック→コンソールエラー検査）・高度な知的監視（設計逸脱・性能劣化・ライセンス違反の検知）。audio.js（WebAudio合成アンビエント）・perf.js（動的画質）。

## 成果物
scripts/autosave.sh, scripts/monitor.sh, scripts/patrol.sh, collab/ALERTS.md, site/js/audio.js, site/js/perf.js

## 作業ログ（追記）
- [08:30] F枠を実エージェントが取得。autosave.sh v2（pull --rebase + 追記型ファイルは両残し/他はリモート優先）、audio.js 全面改修（石造ホールIR、ピアノ/FMベル、靴音、finale、ミュート永続化、iOSアンロック）、perf.js（GPU判定、PROFILES、DPR上限1.5、ピンポン防止、?debug HUD、?q= 固定）。
- [08:30] scripts/patrol.py（静的知的監視）、scripts/monitor.sh（環境監視）、site/selftest.html + js/selftest.js（ランタイム巡回）、favicon。
