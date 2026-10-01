# 開発環境トラブル & 解決策（遭遇したら即追記・全員閲覧）
形式: `## [ID] 症状` → 原因 → 解決

## [A] Bash の cwd が毎回 /home/user に戻る
- 解決: 全コマンドを `cd /home/user/webapp && ...` で始める。

## [A] `nohup cmd &` を含むBash呼び出しが120秒タイムアウトする
- 原因: バックグラウンドプロセスがツールの stdout/stderr を握ったまま。
- 解決: `setsid nohup bash scripts/autosave.sh >/dev/null 2>&1 < /dev/null &` と全FDを切る、またはツールの run_in_background を使う。プロセス自体は生存していた。

## [A] git push 時に `remote: This repository moved` 表示
- 原因: GitHub側でリポジトリ名が変更された（-261001 → Flat-trail-26.10.1）。
- 解決: `git remote set-url origin https://github.com/sc8z35a-collab/Flat-trail-26.10.1.git`。

## [A] 空リポジトリ（No commits yet）で `git fetch` しても何も出ない／ブランチなし
- 解決: 初回コミットを main に push してから作業ブランチを切る。

## [F] `(cd site && setsid nohup python3 -m http.server ... &)` でもBashツールが120秒ハング
- 症状: サーバは起動している（curl 200）が、ツール呼び出し自体はタイムアウト扱い(exit 1)。
- 原因: ツールハーネスが子孫プロセス終了を待つ仕様と推定。setsid/FD切断でも回避不可だった。
- 解決: **常駐プロセスは Bash ツールの `run_in_background: true` で起動**する。タイムアウトしても実害はないが、1回2分の時間を失う。
