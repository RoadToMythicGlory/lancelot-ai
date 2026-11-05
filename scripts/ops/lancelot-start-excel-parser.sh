#!/usr/bin/env bash
# Idempotently start the Excel Parser as a long-running localhost-only
# Node process. Safe to invoke from cron (via lancelot-watchdog.sh) — if a
# healthy instance is already listening on $EXCEL_PARSER_PORT it exits 0.
set -u
PATH=/opt/alt/alt-nodejs22/root/usr/bin:/usr/local/bin:/usr/bin:/bin:$PATH

APP_ROOT=/home/lancjvis/lancelot-ai
SVC_ROOT=$APP_ROOT/services/excel-parser
LOG_DIR=$APP_ROOT/deploy-logs
LOG_FILE=$LOG_DIR/excel-parser.log
PID_FILE=$SVC_ROOT/tmp/excel-parser.pid
PORT=${EXCEL_PARSER_PORT:-4002}

mkdir -p "$LOG_DIR" "$SVC_ROOT/tmp"

# Fast path: already healthy.
if curl -sS --max-time 5 "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"status":"healthy"'; then
  exit 0
fi

# Kill stale PID if present.
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill -TERM "$OLD_PID" 2>/dev/null || true
    sleep 1
    kill -KILL "$OLD_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Kill any other lingering process on the port (best-effort, ignores errors
# because LVE often denies fuser/lsof in shared hosting).
pkill -f "dist/main.js" 2>/dev/null || true
sleep 1

cd "$SVC_ROOT"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting excel-parser on :$PORT" >> "$LOG_FILE"
PORT="$PORT" NODE_ENV=production nohup /opt/alt/alt-nodejs22/root/usr/bin/node dist/main.js \
  >> "$LOG_FILE" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"
sleep 2
if curl -sS --max-time 5 "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q '"status":"healthy"'; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] excel-parser up pid=$PID" >> "$LOG_FILE"
  exit 0
fi
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] excel-parser failed to come up" >> "$LOG_FILE"
exit 1
