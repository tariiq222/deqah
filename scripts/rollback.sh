#!/usr/bin/env bash
# scripts/rollback.sh — Deqah backend rollback
# Usage: ./scripts/rollback.sh [IMAGE_TAG]
#   IMAGE_TAG: ghcr.io image tag to roll back to (default: prompts from last 5 tags)
#
# What it does:
#   1. Pulls the target image
#   2. Stops the current backend container
#   3. Starts the target image
#   4. Waits for /health/live to return 200
#   5. Reports success or failure
#
# Requires: docker, curl
# Run on: the production/staging server (NOT locally)

set -euo pipefail

OWNER="tariiq222"
IMAGE="ghcr.io/${OWNER}/deqah-backend"
CONTAINER_NAME="deqah-backend"
HEALTH_URL="http://localhost:5100/api/v1/health/live"
ENV_FILE="${ENV_FILE:-/opt/deqah/docker/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/deqah/docker/docker-compose.prod.yml}"
BASE_COMPOSE="${BASE_COMPOSE:-/opt/deqah/docker/docker-compose.yml}"
MAX_WAIT_SECS=60

TARGET_TAG="${1:-}"

# ── If no tag given, show last 5 and ask ──────────────────────────────────
if [[ -z "$TARGET_TAG" ]]; then
  echo ""
  echo "Recent ${IMAGE} tags:"
  docker images "${IMAGE}" --format "  {{.Tag}}\t{{.CreatedAt}}" | head -5 || true
  echo ""
  read -rp "Enter tag to roll back to: " TARGET_TAG
fi

if [[ -z "$TARGET_TAG" ]]; then
  echo "ERROR: no tag provided" >&2
  exit 1
fi

TARGET_IMAGE="${IMAGE}:${TARGET_TAG}"
echo ""
echo "Rolling back ${CONTAINER_NAME} → ${TARGET_IMAGE}"
echo ""

# ── Pre-rollback backup ───────────────────────────────────────────────────
echo "[1/4] Pre-rollback DB backup..."
docker exec "${CONTAINER_NAME}" sh -c 'echo "Backup skipped — run manually if needed"' 2>/dev/null || true

# ── Pull target image ─────────────────────────────────────────────────────
echo "[2/4] Pulling ${TARGET_IMAGE}..."
docker pull "${TARGET_IMAGE}"

# ── Replace running container ─────────────────────────────────────────────
echo "[3/4] Replacing container..."
IMAGE_TAG="${TARGET_TAG}" docker compose \
  -f "${BASE_COMPOSE}" \
  -f "${COMPOSE_FILE}" \
  --env-file "${ENV_FILE}" \
  up -d --no-deps --no-build backend

# ── Wait for health ───────────────────────────────────────────────────────
echo "[4/4] Waiting for health (max ${MAX_WAIT_SECS}s)..."
ELAPSED=0
until curl -sf "${HEALTH_URL}" >/dev/null 2>&1; do
  if [[ $ELAPSED -ge $MAX_WAIT_SECS ]]; then
    echo ""
    echo "ROLLBACK FAILED: health check did not pass within ${MAX_WAIT_SECS}s" >&2
    echo "Check: docker logs ${CONTAINER_NAME} --tail=50" >&2
    exit 1
  fi
  printf "."
  sleep 2
  ELAPSED=$((ELAPSED + 2))
done

echo ""
echo ""
echo "✅ Rollback complete → ${TARGET_IMAGE}"
echo "   Health: $(curl -s ${HEALTH_URL})"
