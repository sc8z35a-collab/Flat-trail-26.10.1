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

## [F] Playwright の巡回で全展示を回るとタイムアウトする
- 原因: サンドボックスのヘッドレスは SwiftShader（CPUラスタ）で1フレーム数百ms。カメラ移動の完了待ちが長い。
- 解決: `site/selftest.html?dwell=200` は index.html?q=low を iframe で開き、"[SELFTEST]" 行を出す。capture_duration は最大30秒なので**1回で数ストップずつ**しか見られない。全件検証は実機で selftest.html を開いて DevTools コンソールを見る。

## [F] favicon.ico 404 がコンソールエラー扱いになる
- 解決: site/favicon.ico を追加（Fが生成、トラバーチン地に真鍮アーチ）。index.html に `<link rel="icon" href="favicon.ico">` を入れると確実（A所有）。

## [A] ヘッドレスChromiumでスクリーンショットを撮りたい（PlaywrightConsoleCaptureはログのみ）
- 手順: `pip install playwright` → `python3 -m playwright install --only-shell chromium`（約100MB, 12秒）
- 症状: 起動時 `exitCode=127` で即死。
- 原因: 共有ライブラリ不足（`ldd .../chrome-headless-shell | grep "not found"` で確認）→ libatk-1.0, libatk-bridge-2.0, libXcomposite, libXdamage, libatspi。
- 解決: `sudo apt-get install -y --no-install-recommends libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libxdamage1 libatspi2.0-0`（`playwright install-deps` は重いので避ける）
- WebGL: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` が必要（無いと "Automatic fallback to software WebGL has been deprecated"）。
- メモリ: 1GBでもブラウザ1つなら可（使用後 free 640MB）。**同時に2つ以上起動しない**。1枚目まで約80秒（SwiftShaderでシェーダコンパイルが遅い）。
- 共通ツール: `python3 scripts/shot.py 0 1 5`（stop番号）→ /tmp/shots/*.png。画像を見るには Read ツールで png を開く。
- 注意: SwiftShader では `renderer.info.render.calls` が composer の最終パスのみ(=1)になるので描画統計には ?debug を使う。
## [D] PlaywrightConsoleCapture ではスクショが撮れない／sandboxに playwright・chromium が無い
- 解決: `tools/snap_server.py`（D作）を使う。`site/` を配信しつつ、`?snap=名前&wait=秒&stops=1,3,5` 付きで開くと
  撮影スクリプトを注入→各stopへ goTo→待機→その場で再描画して canvas.toDataURL を POST → `tmp_snaps/名前_i.jpg` に保存（gitignore済）。
  起動: Bash の run_in_background:true で `cd /home/user/webapp && python3 tools/snap_server.py 8080`
  → GetServiceUrl(8080) のURLに `?autostart&snap=x&wait=6&stops=1,2` を付けて PlaywrightConsoleCapture(capture_duration=30)。Read ツールで jpg を目視。
  SwiftShader でロード約40秒。preserveDrawingBuffer 不要（撮影直前に post.render する）。
## [D] 別の http.server が 8080 を掴んでいて新サーバが黙って起動失敗
- KillBash 後も子プロセスが残ることがある。`ss -ltnp | grep 8080` → PIDを kill。
## [D] `pkill -f <name>` を含む Bash 呼び出しが exit -1 で即死
- 原因: pkill -f が「自分自身のbash（コマンド文字列に<name>を含む）」もマッチして殺す。
- 解決: `pgrep -f 'python3 tools/snap' | xargs -r kill` のように別呼び出しにするか、ss でPIDを特定して kill。

## [F] WebAudio の音を「聴いて」検証したい（サンドボックスにスピーカーが無い）
- 解決: Playwright で `window.AudioContext = () => new OfflineAudioContext(2, sr*12, sr)` に差し替えてから audio.js を import → `startRendering()` → WAV化 → UploadFileWrapper → analyze_media_content(gemini-3.1-pro) で試聴レビュー。peak/rms も同時に測れる。

---
# v2 セッション（2026-10-02）
## [A] sandbox が予告なく再起動し /tmp と常駐プロセスが消える（2回発生）
- 症状: `uptime` が 1 min、/tmp 内のログ・pid が消失、autosave が DEAD。2回目はツールが「DNS retry failed / port is not open」で応答不能。
- 原因: 共有 sandbox のメモリ枯渇（Playwright 2本同時起動 等）や基盤側のタイムアウト。
- 解決: 応答不能なら ResetSandbox ツール（ファイルは保持される）。作業は autosave3 が3分ごとに GitHub へ逃がしているので消えない。
  再起動後は `bash scripts/autosave3.sh status` → DEAD なら Bash run_in_background で `AGENT=X bash scripts/autosave3.sh loop`。
  **pid/ログを /tmp に置く設計は再起動で消えるのが前提**（autosave3 は pid 消失でも二重起動しない作り）。
## [A] Bash ツールでの単純な grep/ls が 120 秒タイムアウトした
- 原因: 直前に裏で起動した pip/playwright install が CPU/IO を占有、かつ sandbox がフリーズ寸前だった。
- 解決: 重いインストールは run_in_background で1本だけ。同時に重いコマンドを打たない。
## [A] 空リポジトリ（ai-yosou-1year）が作業ディレクトリの origin に設定されていた
- 解決: 実体のあるリポジトリ（Flat-trail-26.10.1）を origin に、空のほうを `backup` リモート（ミラー先）に付け替え。
## [A] 実行中の bash スクリプトを編集すると、走っているプロセスが壊れる
- 原因: bash はスクリプトを逐次読みするため、実行中に書き換えると途中から別の行を読む。
- 解決: 常駐スクリプト（autosave3.sh 等）を編集したら必ず stop → 再起動。
## [A] 予備リモートへの force-push が `push declined due to repository rule violations`
- 原因: リポジトリに ruleset「no force-push / no delete」が設定されていた（誰かが保護を追加）。
- 解決: ミラーは fast-forward push のみにした。保護ブランチには -f しない。
## [A] `pkill -f "autosave3.sh loop"` を含む Bash 呼び出しが exit -1（D 既出と同じ罠を再踏）
- 解決: `bash scripts/autosave3.sh stop`（pidファイル経由）か `pgrep -f '[a]utosave3.sh loop' | xargs -r kill`（[a] で自分自身にマッチしない）。
