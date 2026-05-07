#!/bin/bash
# MongoDB Backup Script for Lancelot Platform
# Schedule with cron: 0 2 * * * /path/to/backup-mongodb.sh
#
# Features:
# - Full database dump with mongodump
# - Compressed with gzip
# - Retention policy (keeps last N backups)
# - Optional upload to S3/GCS
# - Notification on failure

set -euo pipefail

# ==================== CONFIGURATION ====================

# MongoDB connection
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DB="${MONGO_DB:-lancelot}"
MONGO_USER="${MONGO_USER:-}"
MONGO_PASS="${MONGO_PASS:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"

# Backup settings
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mongodb}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="lancelot_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# S3 settings (optional)
S3_BUCKET="${S3_BUCKET:-}"
S3_PATH="${S3_PATH:-backups/mongodb}"

# Notification (optional)
WEBHOOK_URL="${BACKUP_WEBHOOK_URL:-}"

# ==================== FUNCTIONS ====================

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

notify() {
  local message="$1"
  local status="$2"
  
  if [ -n "$WEBHOOK_URL" ]; then
    curl -s -X POST "$WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"[Lancelot Backup] ${status}: ${message}\"}" || true
  fi
}

cleanup_old_backups() {
  log "Cleaning up backups older than ${RETENTION_DAYS} days..."
  find "$BACKUP_DIR" -name "lancelot_*.gz" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
  find "$BACKUP_DIR" -name "lancelot_*" -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} + 2>/dev/null || true
  log "Cleanup complete"
}

# ==================== MAIN ====================

log "Starting MongoDB backup..."
log "Database: ${MONGO_DB} on ${MONGO_HOST}:${MONGO_PORT}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Build mongodump command
DUMP_CMD="mongodump --host=${MONGO_HOST} --port=${MONGO_PORT} --db=${MONGO_DB} --out=${BACKUP_PATH}"

if [ -n "$MONGO_USER" ]; then
  DUMP_CMD="${DUMP_CMD} --username=${MONGO_USER} --password=${MONGO_PASS} --authenticationDatabase=${MONGO_AUTH_DB}"
fi

# Run backup
if $DUMP_CMD; then
  log "Dump completed successfully"
else
  log "ERROR: mongodump failed!"
  notify "Backup failed for ${MONGO_DB}" "ERROR"
  exit 1
fi

# Compress
log "Compressing backup..."
tar -czf "${BACKUP_PATH}.tar.gz" -C "$BACKUP_DIR" "$BACKUP_NAME"
rm -rf "$BACKUP_PATH"

BACKUP_SIZE=$(du -h "${BACKUP_PATH}.tar.gz" | cut -f1)
log "Backup compressed: ${BACKUP_PATH}.tar.gz (${BACKUP_SIZE})"

# Upload to S3 (if configured)
if [ -n "$S3_BUCKET" ]; then
  log "Uploading to S3: s3://${S3_BUCKET}/${S3_PATH}/"
  if aws s3 cp "${BACKUP_PATH}.tar.gz" "s3://${S3_BUCKET}/${S3_PATH}/${BACKUP_NAME}.tar.gz"; then
    log "Upload to S3 successful"
  else
    log "WARNING: S3 upload failed"
    notify "S3 upload failed for ${BACKUP_NAME}" "WARNING"
  fi
fi

# Cleanup old backups
cleanup_old_backups

# Success notification
log "Backup completed successfully: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"
notify "Backup completed: ${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})" "SUCCESS"

exit 0
