#!/usr/bin/env bash
# monitor.sh — Owner: F  環境監視（メモリ/Swap/負荷/プロセス/push失敗/httpサーバ）
# 単発: bash scripts/monitor.sh   常駐: INTERVAL=300 bash scripts/monitor.sh --loop  (run_in_background 推奨)
cd /home/user/webapp || exit 1
check() {
  local T=$(date -u +%H:%M) msg=""
  local avail=$(free -m | awk '/Mem:/{print $7}') swapu=$(free -m | awk '/Swap:/{print $3}')
  local load=$(cut -d' ' -f1 /proc/loadavg)
  [ "$avail" -lt 150 ] && msg+="🔴 空きメモリ ${avail}MB（chromium/node の多重起動を停止せよ）; "
  [ "$swapu" -gt 100 ] && msg+="🟡 Swap ${swapu}MB 使用; "
  awk -v l="$load" 'BEGIN{exit !(l>3.5)}' && msg+="🟡 loadavg $load; "
  local nchrome=$(pgrep -fc 'chrom(e|ium)' || true)
  [ "${nchrome:-0}" -gt 12 ] && msg+="🟡 chromiumプロセス ${nchrome}個; "
  [ -s /tmp/autosave.log ] && grep -q "push failed" /tmp/autosave.log && msg+="🟡 autosave push失敗あり(/tmp/autosave.log); "
  if [ -f .autosave.pid ] && ! kill -0 "$(cat .autosave.pid)" 2>/dev/null; then msg+="🟡 autosave停止中; "; fi
  curl -s -o /dev/null -m 3 localhost:8080/ || msg+="🟡 http:8080 応答なし; "
  echo "[$T] mem_avail=${avail}MB swap=${swapu}MB load=$load chrome=${nchrome:-0} ${msg:-OK}"
}
if [ "$1" = "--loop" ]; then while true; do check >> /tmp/monitor.log; sleep "${INTERVAL:-300}"; done; else check; fi
