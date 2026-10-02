#!/usr/bin/env bash
# autosave.sh — Owner: F
# INTERVAL秒ごとに変更を commit → pull --rebase(autostash) → push（作業消失対策 + 6人並行のpush競合対策）
# 起動: setsid nohup bash scripts/autosave.sh >/dev/null 2>&1 < /dev/null &
# 停止: kill $(cat .autosave.pid)
cd /home/user/webapp || exit 1
INTERVAL=${INTERVAL:-120}
LOG=/tmp/autosave.log
echo $$ > .autosave.pid
BR=$(git rev-parse --abbrev-ref HEAD)

sync_push() {
  for try in 1 2 3; do
    if timeout 60 git pull -q --rebase --autostash origin "$BR" >>"$LOG" 2>&1; then
      timeout 60 git push -q origin "$BR" >>"$LOG" 2>&1 && return 0
    else
      # 衝突: 追記型共有ファイルは両方残す / それ以外はリモート優先
      for f in $(git diff --name-only --diff-filter=U 2>/dev/null); do
        case "$f" in
          collab/CHAT.md|collab/TROUBLESHOOTING.md|collab/agents/*)
            sed -i '/^<<<<<<< /d;/^=======$/d;/^>>>>>>> /d' "$f" ;;
          *) git checkout --ours -- "$f" 2>/dev/null ;;  # rebase中の ours = リモート側
        esac
        git add "$f"
      done
      GIT_EDITOR=true git rebase --continue >>"$LOG" 2>&1 || git rebase --abort >>"$LOG" 2>&1
    fi
    sleep $((try * 5))
  done
  echo "[$(date -u +%FT%TZ)] push failed 3x" >>"$LOG"; return 1
}

while true; do
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -q -m "chore(autosave): $(date -u +%Y-%m-%dT%H:%M:%SZ)" --no-verify
  fi
  # 未pushのコミットがあれば同期
  if [ -n "$(git log origin/$BR..HEAD --oneline 2>/dev/null)" ]; then sync_push; fi
  sleep "$INTERVAL"
done
