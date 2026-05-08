-- Migration: fix_broken_plan_uuids
-- Bug: The original seed migration (20260422170201_saas_04_seed_plans) inserted
--      Plan rows with IDs containing a literal 'p' character (e.g.
--      '00000000-0000-0000-0000-0000000p1001'), which is not valid hexadecimal.
--      The backend DTO uses @IsUUID() validation, so any admin endpoint that
--      accepts a planId (e.g. create-tenant) returns 400 Bad Request in production.
-- Fix: Update the Plan.id primary keys to canonical valid UUIDs (already used by
--      the test seed helper at test/setup/seed-plans.helper.ts).  FK rows in
--      Subscription and PlanVersion must be updated first (while the old PK still
--      exists), then the PK itself is updated.
-- Idempotency: Every UPDATE uses WHERE id = '<old>' so re-running on a DB that
--      has already been migrated is a safe no-op.

BEGIN;

-- ── BASIC (p1001 → b1a51c00-0000-4000-8000-000000000001) ─────────────────────

UPDATE "Subscription"
  SET "planId" = 'b1a51c00-0000-4000-8000-000000000001'
  WHERE "planId" = '00000000-0000-0000-0000-0000000p1001';

UPDATE "PlanVersion"
  SET "planId" = 'b1a51c00-0000-4000-8000-000000000001'
  WHERE "planId" = '00000000-0000-0000-0000-0000000p1001';

UPDATE "Plan"
  SET id = 'b1a51c00-0000-4000-8000-000000000001'
  WHERE id = '00000000-0000-0000-0000-0000000p1001';

-- ── PRO (p1002 → b1a51c00-0000-4000-8000-000000000002) ───────────────────────

UPDATE "Subscription"
  SET "planId" = 'b1a51c00-0000-4000-8000-000000000002'
  WHERE "planId" = '00000000-0000-0000-0000-0000000p1002';

UPDATE "PlanVersion"
  SET "planId" = 'b1a51c00-0000-4000-8000-000000000002'
  WHERE "planId" = '00000000-0000-0000-0000-0000000p1002';

UPDATE "Plan"
  SET id = 'b1a51c00-0000-4000-8000-000000000002'
  WHERE id = '00000000-0000-0000-0000-0000000p1002';

-- ── ENTERPRISE (p1003 → b1a51c00-0000-4000-8000-000000000003) ────────────────

UPDATE "Subscription"
  SET "planId" = 'b1a51c00-0000-4000-8000-000000000003'
  WHERE "planId" = '00000000-0000-0000-0000-0000000p1003';

UPDATE "PlanVersion"
  SET "planId" = 'b1a51c00-0000-4000-8000-000000000003'
  WHERE "planId" = '00000000-0000-0000-0000-0000000p1003';

UPDATE "Plan"
  SET id = 'b1a51c00-0000-4000-8000-000000000003'
  WHERE id = '00000000-0000-0000-0000-0000000p1003';

COMMIT;
