#!/usr/bin/env bash
# Daily Postgres backup for Deqah production.
# Reads connection details from /etc/deqah/backup.env
# Uploads to MinIO bucket "deqah-backups/postgres/"
# Retains: local 7 days, MinIO 30 days
set -euo pipefail

ENV_FILE="/etc/deqah/backup.env"
LOCAL_BACKUP_DIR="/var/backups/deqah/postgres"

# ── Dry-run mode ─────────────────────────────────────────────────────────────
DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
  echo "[dry-run] Validating environment and connectivity (no files will be written)"
fi

# ── Load environment ──────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Run scripts/install-backup-cron.sh first."
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

# Required vars (brief-specified names)
: "${PG_CONTAINER:?PG_CONTAINER not set in $ENV_FILE}"
: "${PG_USER:?PG_USER not set in $ENV_FILE}"
: "${PG_DB:?PG_DB not set in $ENV_FILE}"
: "${MC_ALIAS:?MC_ALIAS not set in $ENV_FILE}"
: "${MINIO_BUCKET:?MINIO_BUCKET not set in $ENV_FILE}"

# ── Dry-run: connectivity checks only ────────────────────────────────────────
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] ENV_FILE: OK"
  echo "[dry-run] PG_CONTAINER: ${PG_CONTAINER}"
  echo "[dry-run] PG_USER: ${PG_USER}"
  echo "[dry-run] PG_DB: ${PG_DB}"
  echo "[dry-run] MC_ALIAS: ${MC_ALIAS}"
  echo "[dry-run] MINIO_BUCKET: ${MINIO_BUCKET}"
  docker inspect "$PG_CONTAINER" > /dev/null 2>&1 && \
    echo "[dry-run] Docker container '${PG_CONTAINER}': FOUND" || \
    echo "[dry-run] WARNING: Docker container '${PG_CONTAINER}' not found"
  mc alias list 2>/dev/null | grep -q "^${MC_ALIAS}" && \
    echo "[dry-run] mc alias '${MC_ALIAS}': OK" || \
    echo "[dry-run] WARNING: mc alias '${MC_ALIAS}' not configured"
  echo "[dry-run] Dry-run complete. No backup was created."
  exit 0
fi

# ── Prepare local backup dir ──────────────────────────────────────────────────
mkdir -p "$LOCAL_BACKUP_DIR"

TS=$(date +%F-%H%M)
DUMP_FILE="${LOCAL_BACKUP_DIR}/postgres-${TS}.dump"

echo "[$(date)] Starting Postgres backup → ${DUMP_FILE}"

# ── Dump ─────────────────────────────────────────────────────────────────────
docker exec "$PG_CONTAINER" pg_dump -U "$PG_USER" -Fc "$PG_DB" \
  > "${LOCAL_BACKUP_DIR}/postgres-${TS}.dump"

DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
echo "[$(date)] Dump complete (${DUMP_SIZE})"

# ── Upload to MinIO ───────────────────────────────────────────────────────────
echo "[$(date)] Uploading to ${MC_ALIAS}/${MINIO_BUCKET}/postgres/postgres-${TS}.dump ..."
mc cp "${LOCAL_BACKUP_DIR}/postgres-${TS}.dump" \
  "${MC_ALIAS}/${MINIO_BUCKET}/postgres/postgres-${TS}.dump"
echo "[$(date)] Upload complete"

# ── Local retention: delete files older than 7 days ──────────────────────────
echo "[$(date)] Removing local dumps older than 7 days ..."
find /var/backups/deqah/postgres -name "postgres-*.dump" -mtime +7 -delete
echo "[$(date)] Local cleanup done"

# ── MinIO retention: delete objects older than 30 days ───────────────────────
echo "[$(date)] Removing MinIO objects older than 30 days ..."
mc find "${MC_ALIAS}/${MINIO_BUCKET}/postgres" --older-than 30d --exec "mc rm {}"
echo "[$(date)] MinIO cleanup done"

# ── Done ──────────────────────────────────────────────────────────────────────
echo "[$(date)] Backup ok: postgres-${TS}.dump"
