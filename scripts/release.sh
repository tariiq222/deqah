#!/usr/bin/env bash
# scripts/release.sh — semver release flow for Deqah
#
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 1.0.0
#
# What this does:
#   1. Validates semver format
#   2. Validates we're on develop with a clean tree
#   3. Updates root package.json version
#   4. Appends a row to docs/operations/version-history.md
#   5. Commits the bump
#   6. Tags the commit
#   7. Prints next steps (does NOT push)

set -euo pipefail

# ─── DEPRECATED ──────────────────────────────────────────────────────────────
# This script is superseded by @changesets/cli. Use:
#   pnpm changeset                              # author a changelog entry
#   gh workflow run promote-to-main.yml -f confirm=promote  # ship it
#
# This script remains for emergency single-tag manual releases only.
# To run it anyway, set FORCE_LEGACY=1 in the environment.
if [[ "${FORCE_LEGACY:-}" != "1" ]]; then
  echo "❌ scripts/release.sh is DEPRECATED."
  echo ""
  echo "Use the Changesets flow instead:"
  echo "  pnpm changeset"
  echo "  git add .changeset/ && git commit -m 'chore(changeset): describe change'"
  echo "  git push origin develop"
  echo "  gh workflow run promote-to-main.yml -f confirm=promote"
  echo ""
  echo "If you really need the old single-tag flow (emergency only):"
  echo "  FORCE_LEGACY=1 ./scripts/release.sh <version>"
  exit 1
fi
echo "⚠️  Running DEPRECATED scripts/release.sh with FORCE_LEGACY=1"
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"

# ── 1. Validate argument ──────────────────────────────────────────────────────
if [[ -z "$VERSION" ]]; then
  echo "ERROR: No version supplied."
  echo "Usage: $0 <semver>  e.g.  $0 1.0.0"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "ERROR: '$VERSION' is not a valid semver (expected X.Y.Z)."
  exit 1
fi

# ── 2. Validate branch ────────────────────────────────────────────────────────
cd "$REPO_ROOT"

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "develop" ]]; then
  echo "ERROR: Must be on 'develop' branch (currently on '$CURRENT_BRANCH')."
  exit 1
fi

# ── 3. Validate clean working tree ───────────────────────────────────────────
# Check staged changes
if ! git diff --staged --quiet; then
  echo "❌ Staged changes present"
  exit 1
fi

# Check unstaged changes — excluding the two known unstaged dashboard files
if ! git diff --quiet -- \
  ':!apps/dashboard/components/features/bookings/booking-detail-sheet.tsx' \
  ':!apps/dashboard/components/features/bookings/booking-details-body.tsx'; then
  echo "❌ Working tree has uncommitted changes (other than known dashboard files)"
  exit 1
fi

# ── 4. Confirm tag doesn't already exist ─────────────────────────────────────
if [[ -n "$(git tag -l "v${VERSION}")" ]]; then
  echo "ERROR: Tag v${VERSION} already exists. Choose a different version."
  exit 1
fi

echo "Preparing release v${VERSION} from develop..."

# ── 5. Update root package.json version ──────────────────────────────────────
node -e "const f='${REPO_ROOT}/package.json';const p=require('fs').readFileSync(f,'utf8');require('fs').writeFileSync(f,p.replace(/\"version\": \"[^\"]+\"/,'\"version\": \"${VERSION}\"'))"
echo "Updated package.json to v${VERSION}"

# ── 6. Append to version-history.md ─────────────────────────────────────────
VERSION_HISTORY="${REPO_ROOT}/docs/operations/version-history.md"
RELEASE_DATE=$(date +%F)

if [[ ! -f "$VERSION_HISTORY" ]]; then
  mkdir -p "$(dirname "$VERSION_HISTORY")"
  cat > "$VERSION_HISTORY" << 'HEADER'
# Version History

| Version | Date | Notes |
|---------|------|-------|
HEADER
  echo "Created version-history.md with header"
fi

printf "| v%s | %s | Release v%s |\n" "$VERSION" "$RELEASE_DATE" "$VERSION" >> "$VERSION_HISTORY"
echo "Appended v${VERSION} row to version-history.md"

# ── 7. Commit ────────────────────────────────────────────────────────────────
git add "${REPO_ROOT}/package.json" "$VERSION_HISTORY"
git commit -m "chore(release): v${VERSION}"
echo "Committed version bump"

# ── 8. Tag ───────────────────────────────────────────────────────────────────
git tag -a "v${VERSION}" -m "Release v${VERSION}"
echo "Tagged v${VERSION}"

# ── 9. Print next steps (do NOT auto-push) ───────────────────────────────────
echo ""
echo "✅ Local commit + tag created."
echo ""
echo "To publish:"
echo "  git push origin develop"
echo "  git push origin v${VERSION}"
echo ""
echo "Then trigger production promotion:"
echo "  gh workflow run promote-to-main.yml -f confirm=promote"
