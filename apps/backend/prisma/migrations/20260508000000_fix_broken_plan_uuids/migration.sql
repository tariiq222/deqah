-- Migration: fix_broken_plan_uuids
-- Bug: The original seed migration (20260422170201_saas_04_seed_plans) inserted
--      Plan rows with IDs containing a literal 'p' character (e.g.
--      '00000000-0000-0000-0000-0000000p1001'), which is not valid hexadecimal.
--      The backend DTO uses @IsUUID() validation, so any admin endpoint that
--      accepts a planId (e.g. create-tenant) returns 400 Bad Request in production.
-- Fix: Update the Plan.id primary keys to canonical valid UUIDs.
--      Subscription.planId and PlanVersion.planId carry ON UPDATE CASCADE,
--      so they follow the parent automatically — no need to touch them.
-- Safety on fresh DBs: each statement runs only when the legacy Plan row
--      actually exists, so this migration is a true no-op on any DB that
--      never had the bad seed (CI test DBs, fresh installs, dev DBs that
--      were reset after the bug was caught).

UPDATE "Plan"
  SET id = 'b1a51c00-0000-4000-8000-000000000001'
  WHERE id = '00000000-0000-0000-0000-0000000p1001';

UPDATE "Plan"
  SET id = 'b1a51c00-0000-4000-8000-000000000002'
  WHERE id = '00000000-0000-0000-0000-0000000p1002';

UPDATE "Plan"
  SET id = 'b1a51c00-0000-4000-8000-000000000003'
  WHERE id = '00000000-0000-0000-0000-0000000p1003';
