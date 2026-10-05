#!/usr/bin/env bash
set -euo pipefail

TMUX=(tmux)
if [[ -f /exec-daemon/tmux.portal.conf ]]; then
  TMUX=(tmux -f /exec-daemon/tmux.portal.conf)
fi

start_session() {
  local name="$1"
  local command="$2"
  local log_file="$3"

  if "${TMUX[@]}" has-session -t "=${name}" 2>/dev/null; then
    echo "MechPro ${name} session is already running."
    return
  fi

  "${TMUX[@]}" new-session -d -s "${name}" \
    "${command} 2>&1 | tee ${log_file}"
  echo "Started MechPro ${name} session (log: ${log_file})."
}

start_session "mechpro-convex" "bash scripts/convex-dev.sh" "/tmp/mechpro-convex.log"
start_session "mechpro-vite" "pnpm dev -- --host 0.0.0.0" "/tmp/mechpro-vite.log"

sleep 1
"${TMUX[@]}" has-session -t "=mechpro-convex"
"${TMUX[@]}" has-session -t "=mechpro-vite"
