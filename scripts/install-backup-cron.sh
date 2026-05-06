#!/usr/bin/env bash
# scripts/install-backup-cron.sh — one-time VPS setup for daily Postgres backups
#
# Run this ONCE on the VPS as root:
#   sudo bash /opt/deqah/scripts/install-backup-cron.sh
#
# Prerequisites:
#   - Linux (the VPS, not a dev machine)
#   - docker installed and running
#   - mc (MinIO client) installed and configured with alias 'local'
#   - Scripts deployed to /opt/deqah/scripts/

set -euo pipefail

SCRIPTS_DIR="/opt/deqah/scripts"
ENV_DIR="/etc/deqah"
ENV_FILE="${ENV_DIR}/backup.env"
BACKUP_DIR="/var/backups/deqah/postgres"
LOG_DIR="/var/log"
CRON_ENTRY="0 3 * * * ${SCRIPTS_DIR}/backup-postgres.sh >> ${LOG_DIR}/deqah-backup.log 2>&1"

# ── 1. Verify Linux ───────────────────────────────────────────────────────────
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "ERROR: This script must run on Linux (the VPS). Current OS: $(uname -s)"
  exit 1
fi

# ── 2. Verify mc (MinIO client) ───────────────────────────────────────────────
if ! command -v mc >/dev/null 2>&1; then
  echo "ERROR: mc (MinIO client) is not installed."
  echo ""
  echo "Install instructions:"
  echo "  curl https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc"
  echo "  chmod +x /usr/local/bin/mc"
  echo "  mc alias set local http://localhost:9000 <access-key> <secret-key>"
  exit 1
fi

# ── 3. Verify docker ──────────────────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is not installed."
  echo "  Install: https://docs.docker.com/engine/install/"
  exit 1
fi

# ── 4. Create directories ─────────────────────────────────────────────────────
mkdir -p "$ENV_DIR" "$BACKUP_DIR" "$LOG_DIR"
chmod 700 "$ENV_DIR"
echo "Created ${ENV_DIR}, ${BACKUP_DIR}"

# ── 5. Write env template (refuse to overwrite if exists) ────────────────────
if [[ -f "$ENV_FILE" ]]; then
  echo "ERROR: ${ENV_FILE} already exists, refusing to overwrite."
  echo "       Edit it manually if you need to change values."
  exit 1
fi

cat > "$ENV_FILE" << 'ENV'
# Deqah backup config
PG_CONTAINER=deqah-database-jeprin
PG_USER=deqah-database
PG_DB=postgres
MC_ALIAS=local
MINIO_BUCKET=deqah-backups
ENV

chmod 600 "$ENV_FILE"
echo "Created ${ENV_FILE} (chmod 600)"
echo "IMPORTANT: review values before running backups."

# ── 6. Verify mc alias 'local' is configured ─────────────────────────────────
if ! mc alias list 2>/dev/null | grep -q "^local"; then
  echo ""
  echo "ERROR: mc alias 'local' is not configured."
  echo ""
  echo "Set it up first:"
  echo "  mc alias set local http://localhost:9000 <access-key> <secret-key>"
  echo ""
  echo "Then re-run this script."
  exit 1
fi
echo "mc alias 'local': OK"

# ── 7. Install cron entry (idempotent) ───────────────────────────────────────
if crontab -l 2>/dev/null | grep -qF "deqah/scripts/backup-postgres.sh"; then
  echo "Cron entry already exists — skipping."
else
  (crontab -l 2>/dev/null | grep -v "deqah/scripts/backup-postgres.sh"; echo "$CRON_ENTRY") | crontab -
  echo "Cron entry installed: ${CRON_ENTRY}"
fi

# ── 8. Dry-run test ───────────────────────────────────────────────────────────
echo ""
echo "Running dry-run test ..."
if bash "${SCRIPTS_DIR}/backup-postgres.sh" --dry-run; then
  echo "Dry-run: PASSED"
else
  echo ""
  echo "Dry-run failed. Manual test:"
  echo "  bash ${SCRIPTS_DIR}/backup-postgres.sh && ls -lh ${BACKUP_DIR}/"
fi

# ── 9. Final instructions ─────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Installation complete."
echo ""
echo "  Cron will run daily at 03:00 UTC."
echo "  Logs: ${LOG_DIR}/deqah-backup.log"
echo ""
echo "  To run a manual backup now:"
echo "    ${SCRIPTS_DIR}/backup-postgres.sh"
echo ""
echo "  To verify the backup landed in MinIO:"
echo "    mc ls local/deqah-backups/postgres/"
echo "============================================================"
