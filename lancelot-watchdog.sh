#!/usr/bin/env bash
# ============================================================================
#  Lancelot service watchdog (v2)
#
#  Runs every minute via cron. Performs in order:
#
#   1. Self-heal Passenger nodevenv  — CloudLinux periodically prunes the
#      ~/nodevenv/<app>/22/bin/{activate,node} symlinks after package
#      updates or LVE OOM events. When that happens Passenger can no
#      longer spawn workers and every request 404s. The script detects the
#      missing symlinks and recreates them via destroy + create.
#
#   2. Self-heal docroot .htaccess  — cloudlinux-selector destroy clears
#      the docroot's Passenger directives. The script re-stamps them
#      from a template so LiteSpeed routes traffic into Node again.
#
#   3. HTTP probes  — hit /health, /graphql, /socket.io. If any of them
#      return non-200, trigger a Passenger restart.
#
#   4. excel-parser  — standalone Node service on :4002. Re-spawned via
#      the existing start helper if its /health is unreachable.
#
#   5. Log rotation  — truncate watchdog.log if > 1 MiB (last 1000 lines).
#
#  Single-instance protected by a dir-based lockfile so overlapping cron
#  ticks don't trample each other.
# ============================================================================
set -u
PATH=/usr/sbin:/opt/alt/alt-nodejs22/root/usr/bin:/opt/alt/alt-nodejs20/root/usr/bin:/usr/local/bin:/usr/bin:/bin:$PATH

USER_NAME=lancjvis
USER_HOME=/home/$USER_NAME
APP_ROOT=$USER_HOME/lancelot-ai
WEB_ROOT=$APP_ROOT/apps/web
API_ROOT=$APP_ROOT/services/api-gateway
LOG_DIR=$APP_ROOT/deploy-logs
LOCK_DIR=/tmp/lancelot-watchdog.lock
LOG_FILE=$LOG_DIR/watchdog.log
CLOUDLINUX_SELECTOR=/usr/sbin/cloudlinux-selector
NODE_VERSION=22.22.2

mkdir -p "$LOG_DIR" "$WEB_ROOT/tmp" "$API_ROOT/tmp"

# Single-instance: cron tick that overlaps a running heal must exit cleanly.
if ! mkdir "$LOCK_DIR" 2>/dev/null; then exit 0; fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

log() {
  printf '[%s] %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG_FILE"
}

# ---------------------------------------------------------------------------
# ensure_venv  $app_rel  $startup  $passenger_log
#
# Verify the Passenger virtualenv symlinks exist for the given app, and if
# either is missing, recreate them via cloudlinux-selector. node_modules is
# moved aside so the rebuild doesn't trigger a fresh npm ci that the LVE
# would OOM-kill.
# ---------------------------------------------------------------------------
ensure_venv() {
  local app_rel="$1"
  local startup="$2"
  local logfile="$3"

  local venv_dir="$USER_HOME/nodevenv/$app_rel/22/bin"
  local activate="$venv_dir/activate"
  local node_bin="$venv_dir/node"
  local app_dir="$USER_HOME/$app_rel"

  if [ -e "$activate" ] && [ -e "$node_bin" ]; then
    return 0
  fi

  log "VENV-HEAL start app=$app_rel  activate=$([ -e "$activate" ] && echo OK || echo MISSING)  node=$([ -e "$node_bin" ] && echo OK || echo MISSING)"

  # Park node_modules to survive the destroy/create.
  if [ -d "$app_dir/node_modules" ]; then
    mv "$app_dir/node_modules" "$app_dir/node_modules.heal-preserve" 2>/dev/null || true
  fi

  "$CLOUDLINUX_SELECTOR" --json destroy --interpreter nodejs \
    --user "$USER_NAME" --app-root "$app_rel" >> "$LOG_FILE" 2>&1 || true

  # CloudLinux's CLI requires a non-empty --app-uri for create; we then patch
  # it back to "" via `set --new-app-uri ''` to match the original layout.
  "$CLOUDLINUX_SELECTOR" --json create --interpreter nodejs --version "$NODE_VERSION" \
    --user "$USER_NAME" --app-root "$app_rel" \
    --app-uri '/' --app-mode production \
    --startup-file "$startup" \
    --passenger-log-file "$logfile" >> "$LOG_FILE" 2>&1 || true
  "$CLOUDLINUX_SELECTOR" --json set --interpreter nodejs \
    --user "$USER_NAME" --app-root "$app_rel" \
    --new-app-uri '' >> "$LOG_FILE" 2>&1 || true

  # Restore node_modules.
  if [ -d "$app_dir/node_modules.heal-preserve" ]; then
    rm -rf "$app_dir/node_modules" 2>/dev/null || true
    mv "$app_dir/node_modules.heal-preserve" "$app_dir/node_modules"
  fi

  if [ -e "$activate" ] && [ -e "$node_bin" ]; then
    log "VENV-HEAL ok    app=$app_rel"
    return 0
  else
    log "VENV-HEAL FAIL  app=$app_rel"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# ensure_htaccess  $htaccess_path  $app_dir  $startup  $node_bin  $logfile
#
# If the docroot .htaccess is missing the Passenger directives (or is
# empty), rewrite it from the canonical template.
# ---------------------------------------------------------------------------
ensure_htaccess() {
  local htaccess="$1"
  local app_dir="$2"
  local startup="$3"
  local node_bin="$4"
  local logfile="$5"

  if [ -s "$htaccess" ] && grep -q 'PassengerAppRoot' "$htaccess" 2>/dev/null; then
    return 0
  fi

  log "HTACCESS-HEAL rewriting $htaccess (app=$app_dir startup=$startup)"
  mkdir -p "$(dirname "$htaccess")"
  cat > "$htaccess" <<HTACCESS
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN
PassengerAppRoot "$app_dir"
PassengerBaseURI "/"
PassengerNodejs "$node_bin"
PassengerAppType node
PassengerStartupFile $startup
PassengerAppLogFile "$logfile"
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END
# DO NOT REMOVE OR MODIFY. CLOUDLINUX ENV VARS CONFIGURATION BEGIN
<IfModule Litespeed>
</IfModule>
# DO NOT REMOVE OR MODIFY. CLOUDLINUX ENV VARS CONFIGURATION END
HTACCESS
}

restart_node_app() {
  local app_rel="$1"
  log "Restarting Passenger app: $app_rel"
  "$CLOUDLINUX_SELECTOR" --json restart --interpreter nodejs \
    --user "$USER_NAME" --app-root "$app_rel" >> "$LOG_FILE" 2>&1 || true
  mkdir -p "$USER_HOME/$app_rel/tmp"
  touch "$USER_HOME/$app_rel/tmp/restart.txt" 2>/dev/null || true
}

http_code() {
  curl -k -sS --max-time 20 -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || printf '000'
}

graphql_code() {
  curl -k -sS --max-time 25 -o /dev/null -w '%{http_code}' \
    'http://api.lanceloterp.io/graphql' \
    -H 'Content-Type: application/json' \
    --data-binary '{"query":"query { __typename }"}' 2>/dev/null || printf '000'
}

socket_code() {
  curl -k -sS --max-time 25 -o /dev/null -w '%{http_code}' \
    'https://app.lanceloterp.io/socket.io/?EIO=4&transport=polling' 2>/dev/null || printf '000'
}

# ===========================================================================
# Phase 1 — pre-flight self-heal (venv + .htaccess) BEFORE we probe anything
# ===========================================================================
ensure_venv 'lancelot-ai/services/api-gateway' 'dist/index.js' \
  "$LOG_DIR/api-passenger.log"
ensure_htaccess "$USER_HOME/public_html/api/.htaccess" \
  "$API_ROOT" 'dist/index.js' \
  "$USER_HOME/nodevenv/lancelot-ai/services/api-gateway/22/bin/node" \
  "$LOG_DIR/api-passenger.log"

ensure_venv 'lancelot-ai/apps/web' 'server.js' \
  "$LOG_DIR/web-passenger.log"
ensure_htaccess "$USER_HOME/public_html/channel1/.htaccess" \
  "$WEB_ROOT" 'server.js' \
  "$USER_HOME/nodevenv/lancelot-ai/apps/web/22/bin/node" \
  "$LOG_DIR/web-passenger.log"

# ===========================================================================
# Phase 2 — HTTP probes & targeted restarts
# ===========================================================================
api_code=$(http_code 'http://api.lanceloterp.io/health')
gql_code=$(graphql_code)
if [ "$api_code" != '200' ] || [ "$gql_code" != '200' ]; then
  log "API degraded: /health=$api_code /graphql=$gql_code"
  restart_node_app 'lancelot-ai/services/api-gateway'
  sleep 12
  api_after=$(http_code 'http://api.lanceloterp.io/health')
  gql_after=$(graphql_code)
  log "API after restart: /health=$api_after /graphql=$gql_after"
fi

web_code=$(http_code 'https://app.lanceloterp.io/health')
sio_code=$(socket_code)
if [ "$web_code" != '200' ] || [ "$sio_code" != '200' ]; then
  log "Web degraded: /health=$web_code /socket.io=$sio_code"
  restart_node_app 'lancelot-ai/apps/web'
  sleep 12
  web_after=$(http_code 'https://app.lanceloterp.io/health')
  sio_after=$(socket_code)
  log "Web after restart: /health=$web_after /socket.io=$sio_after"
fi

# ===========================================================================
# Phase 3 — excel-parser (standalone, not Passenger)
# ===========================================================================
excel_code=$(http_code "http://127.0.0.1:4002/health")
if [ "$excel_code" != '200' ]; then
  log "Excel parser degraded: /health=$excel_code; (re)starting"
  "$APP_ROOT/lancelot-start-excel-parser.sh" >> "$LOG_FILE" 2>&1 || true
  sleep 4
  excel_after=$(http_code "http://127.0.0.1:4002/health")
  log "Excel parser after restart: /health=$excel_after"
fi

# ===========================================================================
# Phase 4 — log rotation (cheap, keeps last 1000 lines if > 1 MiB)
# ===========================================================================
if [ -f "$LOG_FILE" ]; then
  python3 - "$LOG_FILE" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
if p.stat().st_size > 1048576:
    lines = p.read_text(errors='replace').splitlines()[-1000:]
    p.write_text('\n'.join(lines) + '\n')
PY
fi
