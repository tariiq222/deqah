#!/usr/bin/env bash
# scripts/sync-main-branch.sh
#
# Builds a sanitized main tree from the current working directory.
# Outputs to ./main-tree/ (relative to repo root).
#
# Usage (local dry-run):
#   bash scripts/sync-main-branch.sh
#
# Usage (CI):
#   CI=true bash scripts/sync-main-branch.sh
#
# The main tree contains ONLY runtime/deployment files.
# All docs, AI instructions, QA data, test code, and internal metadata
# are stripped — ensuring a compromised VPS cannot read internal architecture.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${REPO_ROOT}/main-tree"
IS_CI="${CI:-}"

log() {
  echo "[sync-main] $*"
}

error() {
  echo "[sync-main] ERROR: $*" >&2
  exit 1
}

# ─── Clean slate ──────────────────────────────────────────────────────────────
if [[ -d "${OUT_DIR}" ]]; then
  log "Removing existing main-tree..."
  rm -rf "${OUT_DIR}"
fi
mkdir -p "${OUT_DIR}"

log "Source: ${REPO_ROOT}"
log "Output: ${OUT_DIR}"

# ─── Step 1: rsync allowlisted top-level paths ───────────────────────────────
#
# We use rsync with --exclude to strip out everything unwanted at the root level,
# then do a second pass to strip nested sensitive files.
#
# NOTE on .github/: The entire .github/ directory is excluded by rsync.
# After stripping, we re-inject ONLY .github/workflows/build-images.yml so
# that the GitHub Actions build pipeline survives the sanitizer.
# GitHub requires the workflow definition to exist in the pushed branch (main),
# not develop — so this file must be present in the main output.
# Everything else under .github/ (CI tests, e2e, promote-to-main.yml, templates)
# stays stripped.

log "Running rsync (allowlist pass)..."

rsync -a \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='main-tree/' \
  --exclude='.githooks/' \
  --exclude='.claude/' \
  --exclude='.kilo/' \
  --exclude='.opencode/' \
  --exclude='.runtime/' \
  --exclude='.superpowers/' \
  --exclude='.playwright-mcp/' \
  --exclude='.turbo/' \
  --exclude='.worktrees/' \
  --exclude='.mcp.json' \
  --exclude='.DS_Store' \
  --exclude='node_modules/' \
  --exclude='docs/' \
  --exclude='data/' \
  --exclude='graphify-out/' \
  --exclude='test-results/' \
  --exclude='testsprite_tests/' \
  --exclude='AGENTS.md' \
  --exclude='CLAUDE.md' \
  --exclude='CONTRIBUTING.md' \
  --exclude='CODEOWNERS' \
  --exclude='IMPLEMENTATION_PLAN.md' \
  --exclude='.kilo' \
  --exclude='.opencode' \
  "${REPO_ROOT}/" "${OUT_DIR}/"

# ─── Step 2: Strip nested sensitive files recursively ────────────────────────
log "Stripping nested sensitive files..."

# Remove all CLAUDE.md files anywhere in the tree
find "${OUT_DIR}" -name "CLAUDE.md" -delete

# Remove all AGENTS.md files anywhere in the tree
find "${OUT_DIR}" -name "AGENTS.md" -delete

# Remove all .claude/ directories anywhere in the tree
find "${OUT_DIR}" -type d -name ".claude" -exec rm -rf {} + 2>/dev/null || true

# Remove all __mocks__/ directories
find "${OUT_DIR}" -type d -name "__mocks__" -exec rm -rf {} + 2>/dev/null || true

# Remove test directories under apps/ and packages/
find "${OUT_DIR}" -type d \( -name "__tests__" -o -name "e2e" -o -name "tests" -o -name "test" \) \
  -exec rm -rf {} + 2>/dev/null || true

# Remove test files (keep source, strip test code)
find "${OUT_DIR}" \( \
  -name "*.test.ts" \
  -o -name "*.test.tsx" \
  -o -name "*.spec.ts" \
  -o -name "*.spec.tsx" \
  -o -name "*.test.js" \
  -o -name "*.spec.js" \
\) -delete

# Remove .env variants that shouldn't be in main tree
# (only .env.example is allowed)
find "${OUT_DIR}" \( \
  -name ".env.local" \
  -o -name ".env.development" \
  -o -name ".env.test" \
\) -delete

# Remove *.md files inside apps/ and packages/ (internal architecture docs)
# Exception: keep root README.md and CHANGELOG.md files (the latter is the
# author-written change history that ships to production for traceability).
find "${OUT_DIR}/apps" -name "*.md" ! -name "CHANGELOG.md" -delete 2>/dev/null || true
find "${OUT_DIR}/packages" -name "*.md" ! -name "CHANGELOG.md" -delete 2>/dev/null || true

# Remove scripts/kiwi/ (QA-sync tooling, not needed in main)
rm -rf "${OUT_DIR}/scripts/kiwi" 2>/dev/null || true

# Remove any .DS_Store files that rsync may have copied
find "${OUT_DIR}" -name ".DS_Store" -delete

log "Nested-file stripping complete."

# ─── Step 2b: Re-inject .github/workflows/build-images.yml ──────────────────
# All of .github/ was excluded from rsync above (to prevent CI/test workflows,
# PR templates, and internal tooling from reaching main).
# We copy ONLY build-images.yml back in so GitHub Actions can run the Docker
# image build on push to main.
BUILD_IMAGES_SRC="${REPO_ROOT}/.github/workflows/build-images.yml"
BUILD_IMAGES_DST="${OUT_DIR}/.github/workflows/build-images.yml"
if [[ -f "${BUILD_IMAGES_SRC}" ]]; then
  mkdir -p "$(dirname "${BUILD_IMAGES_DST}")"
  cp "${BUILD_IMAGES_SRC}" "${BUILD_IMAGES_DST}"
  log "Re-injected .github/workflows/build-images.yml into main tree."
else
  log "WARNING: .github/workflows/build-images.yml not found in source — skipping re-injection."
fi

# ─── Step 3: Regenerate minimal .gitignore in main tree ───────────────────
log "Writing minimal .gitignore for main tree..."

cat > "${OUT_DIR}/.gitignore" << 'GITIGNORE'
node_modules/
.next/
dist/
build/
coverage/
*.log
.env
.env.local
.env.production
GITIGNORE

# ─── Step 4: Sanity checks ───────────────────────────────────────────────────
log "Running sanity checks..."

FAIL=0

if [[ ! -d "${OUT_DIR}/apps/backend" ]]; then
  echo "[sync-main] FAIL: main-tree/apps/backend/ does not exist" >&2
  FAIL=1
fi

if [[ ! -f "${OUT_DIR}/package.json" ]]; then
  echo "[sync-main] FAIL: main-tree/package.json does not exist" >&2
  FAIL=1
fi

if [[ -f "${OUT_DIR}/CLAUDE.md" ]]; then
  echo "[sync-main] FAIL: main-tree/CLAUDE.md still exists!" >&2
  FAIL=1
fi

LEAKED_CLAUDE=$(find "${OUT_DIR}" -name "CLAUDE.md" 2>/dev/null)
if [[ -n "${LEAKED_CLAUDE}" ]]; then
  echo "[sync-main] FAIL: CLAUDE.md found in main tree:" >&2
  echo "${LEAKED_CLAUDE}" >&2
  FAIL=1
fi

LEAKED_AGENTS=$(find "${OUT_DIR}" -name "AGENTS.md" 2>/dev/null)
if [[ -n "${LEAKED_AGENTS}" ]]; then
  echo "[sync-main] FAIL: AGENTS.md found in main tree:" >&2
  echo "${LEAKED_AGENTS}" >&2
  FAIL=1
fi

# Verify build-images.yml was re-injected (must be present in main
# or the Docker image build workflow won't run on push to main)
if [[ ! -f "${OUT_DIR}/.github/workflows/build-images.yml" ]]; then
  echo "[sync-main] FAIL: .github/workflows/build-images.yml missing from main tree!" >&2
  FAIL=1
fi

# Verify no other .github/ content leaked in (other than build-images.yml)
OTHER_GITHUB=$(find "${OUT_DIR}/.github" -type f \
  ! -path "${OUT_DIR}/.github/workflows/build-images.yml" 2>/dev/null)
if [[ -n "${OTHER_GITHUB}" ]]; then
  echo "[sync-main] FAIL: unexpected .github/ files in main tree:" >&2
  echo "${OTHER_GITHUB}" >&2
  FAIL=1
fi

# Verify per-app CHANGELOG.md files survived (the deployed tree should carry
# its own change history; if these are missing, the sanitizer over-stripped).
# Only apps that actually ship to production should be listed here.
# Sawa website (apps/bespoke/sawa/website) is intentionally excluded — paused
# from the production pipeline as of 2026-05-08; its CHANGELOG isn't required
# for promote to succeed. Re-add 'apps/bespoke/sawa/website' here once the
# Sawa site rejoins the build matrix.
for app_path in apps/backend apps/dashboard apps/admin apps/marketing; do
  if [[ ! -f "${OUT_DIR}/${app_path}/CHANGELOG.md" ]]; then
    echo "[sync-main] FAIL: ${app_path}/CHANGELOG.md missing from main tree!" >&2
    FAIL=1
  fi
done

if [[ ${FAIL} -ne 0 ]]; then
  error "Sanity checks failed — aborting. Main tree is NOT safe to deploy."
fi

log "All sanity checks passed."

# ─── Step 5: Local dry-run summary (suppressed in CI) ────────────────────────
if [[ -z "${IS_CI}" ]]; then
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Main Tree Summary"
  echo "═══════════════════════════════════════════════════════"

  FILE_COUNT=$(find "${OUT_DIR}" -type f | wc -l | tr -d ' ')
  TOTAL_SIZE=$(du -sh "${OUT_DIR}" 2>/dev/null | cut -f1)

  echo "  Files:       ${FILE_COUNT}"
  echo "  Total size:  ${TOTAL_SIZE}"
  echo ""
  echo "  Top 10 largest directories:"
  du -sh "${OUT_DIR}"/*/  2>/dev/null | sort -rh | head -10 | \
    sed "s|${OUT_DIR}/||g" | awk '{printf "    %-8s %s\n", $1, $2}'

  echo ""
  echo "  Sanity check results:"
  echo "    [PASS] apps/backend/ exists"
  echo "    [PASS] package.json exists"
  echo "    [PASS] No CLAUDE.md in tree"
  echo "    [PASS] No AGENTS.md in tree"
  echo "    [PASS] .github/workflows/build-images.yml present"
  echo "    [PASS] No other .github/ files leaked"

  echo ""
  echo "  CLAUDE.md search: $(find "${OUT_DIR}" -name "CLAUDE.md" | wc -l | tr -d ' ') found (expect 0)"
  echo "  AGENTS.md search: $(find "${OUT_DIR}" -name "AGENTS.md" | wc -l | tr -d ' ') found (expect 0)"
  echo "  build-images.yml: $(test -f "${OUT_DIR}/.github/workflows/build-images.yml" && echo present || echo MISSING) (expect present)"
  echo "═══════════════════════════════════════════════════════"
  echo ""
fi

log "Done. Main tree ready at: ${OUT_DIR}"
