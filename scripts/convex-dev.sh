#!/usr/bin/env bash
# Start a local (anonymous) Convex backend and keep pushing the functions in
# convex/ to it. Used by the Cloud Agent environment as a long-running terminal.
#
# The app's convex/auth.config.js references the HERCULES_OIDC_* variables, so a
# deploy fails until those exist on the deployment. Once the backend is
# listening we set them (defaulting to harmless dev placeholders) which lets the
# push complete. Provide real Hercules OIDC values via Secrets to enable the
# actual sign-in flow; they are picked up automatically here.
set -euo pipefail

export CONVEX_AGENT_MODE=anonymous

BACKEND_URL="http://127.0.0.1:3210"

ensure_auth_env() {
  for _ in $(seq 1 120); do
    if curl -sf "${BACKEND_URL}/version" >/dev/null 2>&1; then
      pnpm exec convex env set HERCULES_OIDC_AUTHORITY \
        "${HERCULES_OIDC_AUTHORITY:-https://auth.usehercules.com}" >/dev/null 2>&1 || true
      pnpm exec convex env set HERCULES_OIDC_CLIENT_ID \
        "${HERCULES_OIDC_CLIENT_ID:-dev-local-placeholder}" >/dev/null 2>&1 || true
      return 0
    fi
    sleep 1
  done
}

# Set the deployment env vars in the background once the backend is up, then run
# `convex dev` in the foreground so its logs stay visible and it re-pushes on
# every change.
ensure_auth_env &

exec pnpm exec convex dev --tail-logs disable
