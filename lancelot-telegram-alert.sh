#!/usr/bin/env bash
# ============================================================================
#  lancelot-telegram-alert.sh
#
#  Tiny notifier used by the watchdog (and anything else that wants to ping
#  the operator). Reads bot token + chat id from a chmod-600 file:
#
#      ~/.config/lancelot/telegram-alert.env
#
#  Format of that file:
#
#      TELEGRAM_BOT_TOKEN=123456789:AAxxxx...
#      TELEGRAM_CHAT_ID=987654321
#      # optional, used by anti-flood:
#      TELEGRAM_MIN_INTERVAL_SECONDS=300
#
#  Usage:
#      lancelot-telegram-alert.sh "subject" "body"
#      echo "body" | lancelot-telegram-alert.sh "subject"
#      lancelot-telegram-alert.sh --test
#
#  Returns 0 on success, 1 if not configured (env file missing), 2 on
#  delivery failure (the watchdog should NOT consider this fatal).
# ============================================================================
set -u
LANG=C

CFG="${LANCELOT_TELEGRAM_CFG:-$HOME/.config/lancelot/telegram-alert.env}"
STATE_DIR="$HOME/.local/state/lancelot"
LAST_SENT_FILE="$STATE_DIR/telegram-last-sent"
mkdir -p "$STATE_DIR" 2>/dev/null || true

if [ ! -f "$CFG" ]; then
  printf 'lancelot-telegram-alert: not configured (no %s)\n' "$CFG" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$CFG"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  printf 'lancelot-telegram-alert: missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID in %s\n' "$CFG" >&2
  exit 1
fi

MIN_INTERVAL=${TELEGRAM_MIN_INTERVAL_SECONDS:-300}

case "${1:-}" in
  --test)
    SUBJECT="Lancelot Telegram alert test"
    BODY="If you can read this, the watchdog can reach you. Sent from $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ)."
    NO_RATE_LIMIT=1
    ;;
  *)
    SUBJECT="${1:-Lancelot alert}"
    if [ $# -ge 2 ]; then
      BODY="$2"
    else
      BODY="$(cat)"
    fi
    NO_RATE_LIMIT=0
    ;;
esac

# Anti-flood: skip if we sent something less than $MIN_INTERVAL seconds ago,
# UNLESS this is a test message. The watchdog calls us once per IOC sweep
# that found something; an ongoing infection that re-trips every minute
# would otherwise spam the chat.
NOW=$(date +%s)
if [ "$NO_RATE_LIMIT" = 0 ] && [ -f "$LAST_SENT_FILE" ]; then
  LAST=$(cat "$LAST_SENT_FILE" 2>/dev/null || echo 0)
  AGE=$(( NOW - LAST ))
  if [ "$AGE" -lt "$MIN_INTERVAL" ]; then
    printf 'lancelot-telegram-alert: rate-limited (last sent %ds ago, min %ds)\n' \
      "$AGE" "$MIN_INTERVAL" >&2
    exit 0
  fi
fi

# Telegram caps a single message at 4096 chars. Truncate safely.
MAX=3800
TEXT=$(printf '%s\n\n%s' "$SUBJECT" "$BODY")
if [ "${#TEXT}" -gt "$MAX" ]; then
  TEXT="${TEXT:0:$MAX}

… (truncated)"
fi

# Use curl --data-urlencode so we don't have to escape the body ourselves.
HTTP_CODE=$(curl -sS --max-time 15 -o /tmp/tg-alert-resp.$$ -w '%{http_code}' \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${TEXT}" \
  --data-urlencode "disable_web_page_preview=true" 2>/tmp/tg-alert-err.$$)
RC=$?
RESP=$(cat /tmp/tg-alert-resp.$$ 2>/dev/null || true)
rm -f /tmp/tg-alert-resp.$$ /tmp/tg-alert-err.$$ 2>/dev/null || true

if [ "$RC" -ne 0 ] || [ "$HTTP_CODE" != '200' ]; then
  printf 'lancelot-telegram-alert: send failed (rc=%s http=%s)\n%s\n' \
    "$RC" "$HTTP_CODE" "$RESP" >&2
  exit 2
fi

printf '%s' "$NOW" > "$LAST_SENT_FILE"
exit 0
