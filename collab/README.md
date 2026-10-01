# FLAT TRAIL 共同作業ネットワーク（必読・最初に読む）

## 0. 権限の明記（開発者からの明示的許可）
**開発者（ユーザー）から、現状使える全ツール・ハーネス・その他便利機能の共有、
および制作のためにありとあらゆる手段を自由に行使してよいと明示的に言われている。**
（Web検索・クローラ・画像検索/生成・音声生成・Playwright・GitHub・npm/pip・sandbox内の全コマンド等。
ただし `/home/user/webapp` 外への書き込みは禁止、画像ライセンス規則は遵守。）

## 1. チーム編成（全員が同一AIモデル / 全員コーディング担当）
| ID | 役職 | 主担当コード（所有ファイル） |
|----|------|------------------------------|
| A | **リーダー**（統括・設計・統合・レビュー） | `site/js/main.js`, `site/js/post.js`, `site/index.html` |
| B | ネット調査①（2022-2024 生成AI黎明〜普及期） | `site/js/data/news.js` 前半, `site/js/exhibit.js` |
| C | ネット調査②（2025-2026 エージェント/推論モデル期） | `site/js/data/news.js` 後半, `site/js/museum.js` |
| D | ネット調査③（政策・半導体・科学/ロボティクス） | `site/js/fx.js`（シェーダ・パーティクル） |
| E | 追加ネット調査（ファクトチェック・最新補完・ライセンス確認） | `site/js/ui.js`, `site/css/style.css`, `site/js/controls.js` |
| F | 環境整備（環境構築/全体整備/緊急アラート/全体整理/環境監視/巡回/高度な知的監視） | `scripts/*`, `site/js/audio.js`, `site/js/perf.js`, `collab/ALERTS.md` |

## 2. 共有ファイル（リモートリポジトリ上 = 唯一の真実）
| ファイル | 用途 |
|---|---|
| `collab/README.md` | 本書。ルール・割り当て |
| `collab/BOARD.md` | タスクボード（TODO/DOING/DONE）。着手時に自分のIDを書く |
| `collab/CHAT.md` | 連絡掲示板。**追記のみ**。形式: `[時刻UTC][ID→宛先] 内容` |
| `collab/TIPS.md` | リーダーによる制作のコツ（全員閲覧必須） |
| `collab/TROUBLESHOOTING.md` | 開発環境トラブルと解決策（遭遇したら即追記） |
| `collab/ALERTS.md` | 緊急アラート（F管理。🔴が出たら全員作業停止して確認） |
| `collab/INTERFACES.md` | モジュール間API契約（変更時はCHATで告知） |
| `collab/agents/<ID>.md` | 各エージェントの作業ログ・ハンドオフ |
| `research/*.md` | 調査結果（出典URL必須） |

## 3. 同期プロトコル
1. 作業開始前: `git pull --rebase origin genspark_ai_developer`
2. 自分の所有ファイル以外は編集しない（必要ならCHATで依頼）。衝突回避の最重要ルール。
3. **5〜10分ごと、または意味ある変更ごとにcommit & push**（環境が揮発する恐れあり）。
   自動保存: `setsid nohup bash scripts/autosave.sh >/dev/null 2>&1 < /dev/null &`（120秒毎）
4. push拒否時: `git pull --rebase` → 衝突はリモート優先で解決 → push
5. CHAT.md / TROUBLESHOOTING.md は追記型。衝突したら両方の行を残す。

## 4. 実行環境の制約
- メモリ約1GB / 2CPU / Swap 128MB。**ビルドツール(Vite/webpack)は使わない**。ES Modules + importmap で直接配信。
- 重いnpm install、ヘッドレスブラウザの多重起動、巨大ファイル生成は禁止。
- three.js r186 は `site/vendor/three/` にベンダリング済み（CDN障害に依存しない）。
