#!/usr/bin/env bash
set -euo pipefail

start_session() {
  local name="$1"
  local command="$2"
  local log_file="$3"

  if tmux has-session -t "=${name}" 2>/dev/null; then
    echo "MechPro ${name} session is already running."
    return
  fi

  tmux new-session -d -s "${name}" \
    "${command} 2>&1 | tee ${log_file}"
  echo "Started MechPro ${name} session (log: ${log_file})."
}

start_session "mechpro-convex" "bash scripts/convex-dev.sh" "/tmp/mechpro-convex.log"
start_session "mechpro-vite" "pnpm dev -- --host 0.0.0.0" "/tmp/mechpro-vite.log"

sleep 1
tmux has-session -t "=mechpro-convex"
tmux has-session -t "=mechpro-vite"
