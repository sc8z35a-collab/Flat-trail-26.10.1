#!/usr/bin/env bash
# A用 手動同期: commit → pull --rebase（追記型ファイルは両方残す、他人所有はリモート優先）→ push。最大5回
cd /home/user/webapp
MSG=${1:-"chore(A): sync"}
[ -n "$(git status --porcelain)" ] && git add -A && git commit -qm "$MSG"
for i in 1 2 3 4 5; do
  if ! git pull -q --rebase --autostash origin genspark_ai_developer 2>/dev/null; then
    while [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; do
      for f in $(git diff --name-only --diff-filter=U); do
        case "$f" in collab/CHAT.md|collab/TROUBLESHOOTING.md|collab/agents/*|collab/BOARD.md) sed -i '/^<<<<<<< /d;/^=======$/d;/^>>>>>>> /d' "$f";;
        *) git checkout --ours -- "$f";; esac; git add "$f"; done
      GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || break
    done
  fi
  git push -q origin genspark_ai_developer 2>/dev/null && { echo "pushed $(git log -1 --format=%h)"; exit 0; }
  sleep $((RANDOM%5+2))
done; echo "PUSH FAILED"
