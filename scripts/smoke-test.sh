#!/usr/bin/env bash
# scripts/smoke-test.sh — Deqah backend smoke test
# Usage: ./scripts/smoke-test.sh [BASE_URL]
#   BASE_URL: backend base URL (default: http://localhost:5100)
#
# Checks:
#   1. /health/live → 200
#   2. /health/ready → 200 with status=ready
#   3. /api/v1/public/health → responds (legacy compat)
#
# Exit code: 0 = all pass, 1 = any failure

set -euo pipefail

BASE_URL="${1:-http://localhost:5100}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local expected_body="${4:-}"

  local http_status body
  body=$(curl -sf -o /tmp/smoke_body -w "%{http_code}" --max-time 10 "${url}" 2>/dev/null || echo "000")
  local actual_body
  actual_body=$(cat /tmp/smoke_body 2>/dev/null || echo "")

  if [[ "$body" == "$expected_status" ]]; then
    if [[ -n "$expected_body" && "$actual_body" != *"$expected_body"* ]]; then
      echo "  ❌ ${name}: HTTP ${body} but body missing '${expected_body}'"
      echo "     Got: ${actual_body:0:120}"
      FAIL=$((FAIL + 1))
    else
      echo "  ✅ ${name}: HTTP ${body}"
      PASS=$((PASS + 1))
    fi
  else
    echo "  ❌ ${name}: expected HTTP ${expected_status}, got ${body}"
    [[ -n "$actual_body" ]] && echo "     Body: ${actual_body:0:120}"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "Smoke test → ${BASE_URL}"
echo "────────────────────────────"

check "liveness"  "${BASE_URL}/api/v1/health/live"  "200" "ok"
check "readiness" "${BASE_URL}/api/v1/health/ready" "200" "ready"
check "legacy health" "${BASE_URL}/api/v1/health"   "200"

echo "────────────────────────────"
echo "Results: ${PASS} passed · ${FAIL} failed"
echo ""

[[ $FAIL -eq 0 ]]
