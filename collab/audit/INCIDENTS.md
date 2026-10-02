# インシデント記録（ABYSS）
## INC-001 [07:23Z] 共有ブランチ上のコミット消失（ミラー force-push）
- 症状: ABYSS の 3 commit（ca3ebd8/a3ac077/97a1e8e）が `origin`(=ai-yosou-1year) の genspark_ai_developer から消え `forced-update`。
- 原因: 共有 .git の origin が ai-yosou-1year を指していた一方、autosave3.sh の設計は Flat-trail を正・ai-yosou を `backup` ミラー（**force-push**）とする。他エージェントの mirror push がミラー側を Flat-trail の内容で上書きした。
- 対処: remote を origin=Flat-trail / backup=ai-yosou に付け替え、消えた3 commit を cherry-pick で Flat-trail 上に復元。
- 再発防止: backup へ直接 push 禁止を README に明記。roles.py sync は flock+指定パスのみ commit。
