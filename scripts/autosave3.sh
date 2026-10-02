#!/usr/bin/env bash
# autosave3.sh — Owner: A（リーダー）  「何もしなくても3分おきに作業が PR に保存される」自動保存システム v3
#
# 設計（2層保存 = どちらかが失敗しても作業は消えない）
#  層1 SNAPSHOT : 変更を commit → `autosave/<AGENT>` ブランチへ **force-push**（衝突し得ない＝必ず成功）
#                 → そのブランチの Draft PR を初回に自動作成（以後 push するだけで PR が更新される）
#  層2 SHARE    : `genspark_ai_developer`（共有統合ブランチ, PR #1）へ pull --rebase → push
#                 衝突時: 追記型共有ファイル(CHAT/TROUBLESHOOTING/agents/ ...)は両方残す／他はリモート優先。
#                 失敗しても層1が残っているので作業は失われない（ログに記録し次周期で再試行）。
#  層3 MIRROR   : 予備リモート `backup`（ai-yosou-1year）があれば同じ内容を force-push（GitHub 側の二重化）。
#
# 使い方:
#   起動  : Bash ツールの run_in_background:true で  `cd /home/user/webapp && AGENT=A bash scripts/autosave3.sh`
#   確認  : bash scripts/autosave3.sh status        （生存・最終保存時刻・未push数）
#   即保存: bash scripts/autosave3.sh now           （ループを待たず1周期だけ実行）
#   停止  : bash scripts/autosave3.sh stop
#   生存保証: bash scripts/autosave3.sh ensure      （死んでいれば裏で再起動。各作業の冒頭に呼ぶ癖を付ける）
# 環境変数: AGENT(A/B/C/D 既定=A) INTERVAL(秒 既定180) SHARED(既定 genspark_ai_developer)
set -u
ROOT=/home/user/webapp
cd "$ROOT" || exit 1
AGENT=${AGENT:-$(cat .agent_id 2>/dev/null || echo A)}
echo "$AGENT" > .agent_id
INTERVAL=${INTERVAL:-180}
SHARED=${SHARED:-genspark_ai_developer}
SNAP="autosave/${AGENT}"
LOG=/tmp/autosave3.log
PIDF=/tmp/autosave3.pid
LOCK=/tmp/autosave3.lock
STAMP=/tmp/autosave3.last
log() { echo "[$(date -u +%FT%TZ)][$AGENT] $*" >> "$LOG"; }

in_git_op() { [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ] || [ -f .git/CHERRY_PICK_HEAD ]; }

resolve_conflicts() {
  for f in $(git diff --name-only --diff-filter=U 2>/dev/null); do
    case "$f" in
      collab/CHAT.md|collab/TROUBLESHOOTING.md|collab/BOARD.md|collab/agents/*|collab/audit/*|collab/roles/*|docs/DEV_ENV_ERRORS.md)
        sed -i '/^<<<<<<< /d;/^=======$/d;/^>>>>>>> /d' "$f" ;;      # 追記型: 両方残す
      *) git checkout --ours -- "$f" 2>/dev/null || true ;;          # rebase 中の ours = リモート側（リモート優先）
    esac
    git add "$f" 2>/dev/null
  done
}

ensure_pr() {
  [ -f "/tmp/autosave3.pr.$AGENT" ] && return 0
  command -v gh >/dev/null || return 0
  local repo; repo=$(git remote get-url origin | sed -E 's#.*github.com/##;s#\.git$##')
  if timeout 30 gh pr list -R "$repo" --head "$SNAP" --state open --json number --jq '.[0].number' 2>/dev/null | grep -q .; then
    touch "/tmp/autosave3.pr.$AGENT"; return 0
  fi
  timeout 40 gh pr create -R "$repo" --draft --base "$SHARED" --head "$SNAP" \
    --title "WIP(autosave): agent ${AGENT} snapshot" \
    --body "autosave3.sh が3分ごとに agent ${AGENT} の作業スナップショットを force-push する保存用 Draft PR です。統合は ${SHARED} (PR #1) で行います。マージ不要。" >>"$LOG" 2>&1 \
    && touch "/tmp/autosave3.pr.$AGENT"
}

cycle() {
  exec 9>"$LOCK"; flock -n 9 || { log "skip: another cycle running"; return 0; }
  if in_git_op; then log "skip: rebase/merge in progress (manual op)"; return 0; fi
  local br; br=$(git rev-parse --abbrev-ref HEAD)
  # 1) commit
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -q --no-verify -m "wip(autosave:${AGENT}): $(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$LOG" 2>&1
  fi
  # 2) SNAPSHOT（必ず成功させる層）
  if timeout 90 git push -q -f origin "HEAD:refs/heads/${SNAP}" >>"$LOG" 2>&1; then
    date -u +%FT%TZ > "$STAMP"; ensure_pr
  else log "snapshot push failed"; fi
  # 3) SHARE（統合ブランチ）
  if [ "$br" = "$SHARED" ]; then
    timeout 60 git fetch -q origin "$SHARED" >>"$LOG" 2>&1
    if [ -n "$(git log "origin/$SHARED..HEAD" --oneline 2>/dev/null)" ] || [ -n "$(git log "HEAD..origin/$SHARED" --oneline 2>/dev/null)" ]; then
      for try in 1 2 3; do
        if ! timeout 90 git rebase -q --autostash "origin/$SHARED" >>"$LOG" 2>&1; then
          local n=0
          while in_git_op && [ $n -lt 30 ]; do resolve_conflicts; GIT_EDITOR=true git rebase --continue >>"$LOG" 2>&1 || true; n=$((n+1)); done
          in_git_op && { git rebase --abort >>"$LOG" 2>&1; log "rebase aborted"; }
        fi
        if timeout 90 git push -q origin "HEAD:$SHARED" >>"$LOG" 2>&1; then log "shared push ok $(git log -1 --format=%h)"; break; fi
        sleep $((try * 7)); timeout 60 git fetch -q origin "$SHARED" >>"$LOG" 2>&1
      done
    fi
  fi
  # 4) MIRROR（予備リモート）
  if git remote | grep -qx backup; then timeout 90 git push -q -f backup "HEAD:refs/heads/${SHARED}" >>"$LOG" 2>&1 || log "mirror push failed"; fi
  flock -u 9
}

case "${1:-loop}" in
  now)    cycle; tail -3 "$LOG" ;;
  status) if [ -f "$PIDF" ] && kill -0 "$(cat $PIDF)" 2>/dev/null; then echo "ALIVE pid=$(cat $PIDF)"; else echo "DEAD"; fi
          echo "last snapshot: $(cat $STAMP 2>/dev/null || echo never)"; git log origin/"$SHARED"..HEAD --oneline 2>/dev/null | wc -l | xargs echo "unpushed-to-shared:"; tail -3 "$LOG" 2>/dev/null ;;
  stop)   [ -f "$PIDF" ] && kill "$(cat $PIDF)" 2>/dev/null; rm -f "$PIDF"; echo stopped ;;
  ensure) if [ -f "$PIDF" ] && kill -0 "$(cat $PIDF)" 2>/dev/null; then echo "alive"; else
            AGENT=$AGENT setsid nohup bash "$0" loop >/dev/null 2>&1 < /dev/null & disown; sleep 1; echo "restarted"; fi ;;
  loop)   if [ -f "$PIDF" ] && kill -0 "$(cat $PIDF)" 2>/dev/null && [ "$(cat $PIDF)" != "$$" ]; then echo "already running"; exit 0; fi
          echo $$ > "$PIDF"; log "autosave3 start interval=${INTERVAL}s snap=${SNAP} shared=${SHARED}"
          while true; do cycle; sleep "$INTERVAL"; done ;;
esac
