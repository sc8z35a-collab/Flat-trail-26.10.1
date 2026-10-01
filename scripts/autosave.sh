#!/usr/bin/env bash
# 自動保存: INTERVAL秒ごとに変更をcommit & push（作業消失対策）
# 起動: nohup bash scripts/autosave.sh >/dev/null 2>&1 &
cd /home/user/webapp || exit 1
INTERVAL=${INTERVAL:-120}
echo $$ > .autosave.pid
while true; do
  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -q -m "chore(autosave): $(date -u +%Y-%m-%dT%H:%M:%SZ)" --no-verify
    BR=$(git rev-parse --abbrev-ref HEAD)
    timeout 60 git push -q origin "$BR" 2>>/tmp/autosave_push.err || true
  fi
  sleep "$INTERVAL"
done
