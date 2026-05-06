#!/usr/bin/env bash
# scripts/backup-pre-deploy.sh — pre-deploy safety snapshot
#
# Run this manually or wire as Dokploy pre-deploy command per service.
# Creates a lightweight snapshot of the database before each deploy
# as an extra safety net.
#
# Configure in Dokploy:
#   Service → backend → Pre-deploy command:
#     /opt/deqah/scripts/backup-pre-deploy.sh
#
# Differences from backup-postgres.sh:
#   - File suffix: pre-deploy-<short-sha>-<timestamp>.dump
#   - No MinIO upload (local-only for speed)
#   - Local retention: 30 most recent files (not time-based)

set -euo pipefail

ENV_FILE="/etc/deqah/backup.env"
LOCAL_BACKUP_DIR="/var/backups/deqah/postgres"
RETENTION_COUNT=30

# ── Load environment ──────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "WARNING: ${ENV_FILE} not found. Skipping pre-deploy backup."
  echo "         Run scripts/install-backup-cron.sh on the VPS to set up backups."
  exit 0
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

: "${PG_CONTAINER:?PG_CONTAINER not set in $ENV_FILE}"
: "${PG_USER:?PG_USER not set in $ENV_FILE}"
: "${PG_DB:?PG_DB not set in $ENV_FILE}"

# ── Build filename ────────────────────────────────────────────────────────────
mkdir -p "$LOCAL_BACKUP_DIR"
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TIMESTAMP=$(date +%F-%H%M)
DUMP_FILE="${LOCAL_BACKUP_DIR}/pre-deploy-${SHORT_SHA}-${TIMESTAMP}.dump"

echo "[$(date)] Pre-deploy backup starting → ${DUMP_FILE}"

# ── Dump ─────────────────────────────────────────────────────────────────────
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -Fc "$PG_DB" \
  > "$DUMP_FILE"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "[$(date)] Dump complete (${DUMP_SIZE})"

# ── Local retention: keep only the RETENTION_COUNT most recent files ──────────
# List all pre-deploy dumps sorted by time (newest first), remove oldest beyond limit
mapfile -t ALL_DUMPS < <(ls -t "${LOCAL_BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null)
TOTAL=${#ALL_DUMPS[@]}
if [[ "$TOTAL" -gt "$RETENTION_COUNT" ]]; then
  TO_DELETE=$(( TOTAL - RETENTION_COUNT ))
  echo "[$(date)] Removing ${TO_DELETE} oldest pre-deploy dump(s) (keeping ${RETENTION_COUNT}) ..."
  for (( i=RETENTION_COUNT; i<TOTAL; i++ )); do
    rm -f "${ALL_DUMPS[$i]}"
    echo "[$(date)] Removed: ${ALL_DUMPS[$i]}"
  done
fi

echo "[$(date)] Pre-deploy backup complete. Proceeding with deploy."
