#!/usr/bin/env bash
# scripts/rollback-image.sh — list recent ghcr.io image versions for a Deqah app
#                              and emit Dokploy rollback instructions.
#
# Usage: ./scripts/rollback-image.sh <app>
#   app: backend | dashboard | admin | website
#
# Requires: gh (GitHub CLI) authenticated with read:packages scope.
# Informational only — does NOT mutate Dokploy or any service.

set -euo pipefail

APP="${1:-}"
OWNER="tariiq222"
VALID_APPS=("backend" "dashboard" "admin" "website")

if [[ -z "$APP" ]]; then
  echo "Usage: $0 <app>"
  echo "       app: backend | dashboard | admin | website"
  exit 1
fi

VALID=0
for a in "${VALID_APPS[@]}"; do
  [[ "$a" == "$APP" ]] && VALID=1
done
if [[ "$VALID" -eq 0 ]]; then
  echo "ERROR: '$APP' is not a valid app. Choose: backend | dashboard | admin | website"
  exit 1
fi

PACKAGE="deqah-${APP}"
IMAGE="ghcr.io/${OWNER}/${PACKAGE}"

echo ""
echo "Fetching recent versions for ${IMAGE} ..."
echo ""

gh api "/users/${OWNER}/packages/container/${PACKAGE}/versions" \
  --jq '.[] | {sha: .name[:7], tags: .metadata.container.tags, created: .created_at}' \
  | head -50 || {
  echo "ERROR: Could not fetch versions. Make sure:"
  echo "  1. gh is authenticated: gh auth login"
  echo "  2. The package exists and is accessible at ghcr.io"
  exit 1
}

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "To roll back, in Dokploy UI:"
echo "  1. Open service '${APP}'"
echo "  2. Provider → Docker"
echo "  3. Image: ${IMAGE}:<chosen-tag>"
echo "  4. Click Save"
echo "  5. Click Deploy"
echo ""
echo "To roll back the database too (if the version change requires it):"
echo "  See: docs/operations/rollback-runbook.md"
echo "─────────────────────────────────────────────────────────────"
