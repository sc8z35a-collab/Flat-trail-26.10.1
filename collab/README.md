# FLAT TRAIL 共同作業ネットワーク v2（2026-10-02 セッション）— 最初に必ず読む

## 0. 権限の明記（開発者からの明示的許可）
**開発者（ユーザー）から、現状使える全ツール・ハーネス・その他便利機能の共有、
および細部作成のためにありとあらゆる手段を自由に行使してよいと明示的に言われている。**
- 例: Web検索 / クローラ / image_search（CCライセンス写真）/ image_generation / 音声生成 / Playwright・ヘッドレスChromium /
  GitHub(gh) / npm・pip / sudo apt / Poly Haven・ambientCG・Wikimedia Commons・Met Open Access 等の外部アセット / sandbox 内の全コマンド。
- 守ること: 書き込みは `/home/user/webapp` 内のみ。画像ライセンス規則（CC0/PD/CC-BY 等のみ。Getty/Shutterstock/Alamy/iStock/Adobe Stock 由来は禁止）。
  出典は `site/assets/**/CREDITS.md` に必ず追記。
- **グラフィックは機種性能を無視してよい（ユーザー明示）**。超高精細を優先。sandbox 検証は SwiftShader なので
  `?q=low` で動作確認 → 見た目は `?q=high` で撮影、の二段で。

## 1. ユーザー要件（2026-10-02）
1. サイト内の **細部の作り込みを大幅アップグレード**。既存グラフィックの機種性能無視の **超超高グラフィック**。
2. **外側のマップ・美術館の内装は写真の通りに**（写真4枚の分解 → `collab/REFERENCES.md`）:
   ① 海沿いの丘の美術館（大塚国際美術館の空撮）／② システィーナ礼拝堂（原寸再現）／
   ③ ウィーン美術史美術館のクーポラ・カフェ（八角ホール）／④ 国立新美術館（波打つガラス壁＋逆円錐）
3. CC写真・外部の多種多様なアセット自由。長時間・本気で。
4. 作業消失対策: **3分おき自動保存（scripts/autosave3.sh）**。
5. 終了時: 全エージェントが実際に直面した **開発環境そのもののエラーと解決法** → `docs/DEV_ENV_ERRORS.md`（A がまとめる）、
   次のエージェント向け技術アドバイス → `docs/NEXT_AGENT_ADVICE.md`（A）。**各自 `collab/TROUBLESHOOTING.md` に遭遇即追記**。

## 2. チーム（全員同一AIモデル）と所有ファイル
| ID | 役割 | 所有（この人だけが編集） |
|----|------|------|
| **A** | **リーダー**: 統括・ワールド合成(world.js)・統合・④国立新美術館ロビー・ポスト処理・UI/HUD/操作・最終docs | `site/index.html` `site/js/main.js` `site/js/world.js` `site/js/assets.js` `site/js/post.js` `site/js/lobby_a*.js` `site/js/ui.js` `site/js/controls.js` `site/css/style.css` `site/js/audio.js` `site/js/perf.js` `site/zone.html` `collab/README.md` `collab/TIPS.md` `collab/INTERFACES.md` `collab/REFERENCES.md` `collab/BOARD.md` `docs/*` `scripts/autosave3.sh` |
| **B** | 展示物の細部: PD/CC0 実名画の額装・彫刻入り金箔額(GLTF)・大理石台座・彫刻・キャプション活版品質・ガラス/真鍮/ベルベットPBR | `site/js/exhibit.js` `site/js/exhibit_*.js` `site/js/lightpool.js` `site/js/data/art.js` `site/assets/art/**` `site/assets/exhibit/**` `site/dev/**` |
| **C** | 内装建築: ③KHMクーポラ八角ホール＋KHM風の絵画ギャラリー(展示室I〜VI)＋②システィーナ礼拝堂(終幕ホール) | `site/js/museum_c*.js` `site/js/museum.js` `site/assets/arch/**` |
| **D** | 外側のマップ①: 地形・海・空・白い2棟・屋上芝生とパラソル・円形の段々庭園とリング池・擁壁・道路・高架橋・森・海岸 ＋ fx(光芒・埃・水) | `site/js/exterior_d*.js` `site/js/fx.js` `site/assets/ext/**` `site/lab/**` |
| アルタス / グラッド | デザイン監査（巨匠／サブ監督・準巨匠）。**リーダー指示なしで自律行動** | `collab/audit/**` |
| アビス | 共有ネットワーク「ロールシステムズ1.0」の設計・常時アップグレード・進化・デバッグ専門官。**自律行動** | `collab/roles/**` `scripts/roles_*` |

- 共有データ `site/js/data/news.js`（40件・確定済み。原則不変）
- 旧ファイル `museum_f.js` 等は動作するベースライン（参考にしてよい）。
- **他人の所有ファイルは編集しない**。必要なら CHAT で依頼。監査の指摘は所有者が反映し CHAT で返答。

## 3. 共有ファイル（リモート `genspark_ai_developer` ブランチ = 唯一の真実）
| ファイル | 用途 |
|---|---|
| `collab/README.md` | 本書（ルール・割当） |
| `collab/INTERFACES.md` | **ゾーン契約 v2**（必読。座標系・関数シグネチャ・ゾーンの配置枠） |
| `collab/REFERENCES.md` | 写真4枚の寸法・素材・色の分解（実装の正） |
| `collab/BOARD.md` | タスクボード（着手時に自分のIDを書く） |
| `collab/CHAT.md` | 連絡掲示板。**追記のみ**。`[HH:MM UTC][ID→宛先] 内容` |
| `collab/TIPS.md` | リーダーによる細部作成のコツ（全員必読・随時更新） |
| `collab/TROUBLESHOOTING.md` | 開発環境トラブル→解決策（**遭遇したら即追記**） |
| `collab/ALERTS.md` | 緊急アラート（🔴が出たら作業を止めて確認） |
| `collab/agents/<ID>.md` | 各自の作業ログ・ハンドオフ（追記） |
| `collab/audit/` | アルタス/グラッドの監査レポート |
| `collab/roles/` | アビスの「ロールシステムズ」仕様・ツール |

## 4. 同期プロトコル — **4人が同一 sandbox・同一作業ツリーを共有している**（B が 07:23 に確認）
1. **自動保存は1プロセスだけ**（A が常駐起動。全員分を3分ごとに保存）: `bash scripts/autosave3.sh status` で生存確認。
   DEAD なら誰でもよいので Bash ツール `run_in_background:true` で `cd /home/user/webapp && AGENT=<ID> bash scripts/autosave3.sh loop` を起動
   （二重起動は自動で防止される）。即保存は `bash scripts/autosave3.sh now`。
   - 保存先: ① `autosave/team` ブランチへ force-push（必ず成功・Draft PR #2）② 共有ブランチへ rebase+push ③ 予備リモート `backup` へミラー。
   - **sandbox は予告なく再起動する（/tmp 消去・常駐プロセス全滅を A が2回確認）**。区切りごとに status を確認。
2. 手動コミットは **自分のファイルだけ**: `flock /tmp/git.lock git add <自分のpath> && flock /tmp/git.lock git commit -m "feat(ID): ..." -- <path>`
   （`git add -A` / `git add .` / `commit -a` 禁止。autosave だけが例外）。
3. **ブラウザは全員で同時1本**: `flock /tmp/browser.lock python3 scripts/shot.py ...`。http.server 8080 は共有1本。
4. pull は不要（同一ツリーなので他人の変更は即見える）。push は autosave に任せる。
5. 共有ブランチの squash / force-push / reset --hard / checkout -- . / stash は禁止（他人の未コミット作業が消える）。

## 5. 実行環境の制約（実測）
- メモリ約1GB（4人で共有！）/ 2CPU / Swap 128MB / GPU なし（SwiftShader）。ビルドツール不使用（ES Modules + importmap）。
- 重い処理（画像一括変換・ブラウザ・pip install）は同時に走らせない。巨大ファイル（>5MB/枚）はコミットしない。
- three.js r186 は `site/vendor/three/` にベンダリング済み。
