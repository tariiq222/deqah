#!/usr/bin/env bash
# ⚠️  DANGER ⚠️
# This script OVERWRITES the production database with a backup.
# All data created since the backup will be PERMANENTLY LOST.
# Required: pass --yes-i-am-sure as the 2nd argument to confirm.
set -euo pipefail

ENV_FILE="/etc/deqah/backup.env"

BACKUP_NAME="${1:-}"
CONFIRM="${2:-}"

# ── 1. Verify args ────────────────────────────────────────────────────────────
if [[ -z "$BACKUP_NAME" ]] || [[ "$CONFIRM" != "--yes-i-am-sure" ]]; then
  echo ""
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  echo "  ⚠️  DANGER: This script OVERWRITES ALL PRODUCTION DATA."
  echo "  All data created since the backup will be PERMANENTLY LOST."
  echo ""
  echo "  Usage: $0 <backup-filename> --yes-i-am-sure"
  echo ""
  echo "  Example:"
  echo "    $0 postgres-2026-05-06-0300.dump --yes-i-am-sure"
  echo ""
  echo "  To list available backups:"
  echo "    mc ls \${MC_ALIAS}/\${MINIO_BUCKET}/postgres/"
  echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
  exit 1
fi

# ── 2. Load environment ───────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

: "${PG_CONTAINER:?PG_CONTAINER not set in $ENV_FILE}"
: "${PG_USER:?PG_USER not set in $ENV_FILE}"
: "${PG_DB:?PG_DB not set in $ENV_FILE}"
: "${MC_ALIAS:?MC_ALIAS not set in $ENV_FILE}"
: "${MINIO_BUCKET:?MINIO_BUCKET not set in $ENV_FILE}"

LOCAL_BACKUP_PATH="/var/backups/deqah/postgres/${BACKUP_NAME}"

# ── 3. Download backup from MinIO if not local ───────────────────────────────
if [ ! -f "$LOCAL_BACKUP_PATH" ]; then
  echo "[$(date)] Downloading ${BACKUP_NAME} from MinIO ..."
  mc cp "${MC_ALIAS}/${MINIO_BUCKET}/postgres/${BACKUP_NAME}" \
    "$LOCAL_BACKUP_PATH"
  echo "[$(date)] Download complete"
fi

# ── 4. Show backup info ───────────────────────────────────────────────────────
echo ""
echo "Backup file: ${LOCAL_BACKUP_PATH}"
echo "Size:        $(du -sh "$LOCAL_BACKUP_PATH" | cut -f1)"
echo "Created:     $(stat -c '%y' "$LOCAL_BACKUP_PATH" 2>/dev/null || stat -f '%Sm' "$LOCAL_BACKUP_PATH")"
echo ""

# ── 5. 5-second countdown ─────────────────────────────────────────────────────
echo "⚠️  RESTORING IN 5 SECONDS — Press Ctrl+C to abort ⚠️"
for i in 5 4 3 2 1; do
  echo "  ${i}..."
  sleep 1
done
echo ""

# ── 6. Restore ────────────────────────────────────────────────────────────────
echo "[$(date)] Running pg_restore (--clean --if-exists) ..."
docker exec -i "$PG_CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists \
  < "$LOCAL_BACKUP_PATH"
echo "[$(date)] pg_restore complete"

# ── 7. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "✅ Restore complete."
echo ""
echo "⚠️  Remember to run any post-restore migrations:"
echo "   docker exec deqah-backend npx prisma migrate deploy"
echo ""
echo "Check application health:"
echo "   curl http://localhost:5100/health"
