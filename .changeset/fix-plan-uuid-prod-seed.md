---
"backend": patch
---

Fix broken Plan UUIDs from the saas_04 seed migration. The original seed inserted Plan rows with IDs containing the literal letter `p` (not valid hex), so any admin endpoint accepting a `planId` (notably create-tenant) returned `400 planId must be a UUID` in production. New idempotent migration `20260508000000_fix_broken_plan_uuids` updates `Subscription.planId` and `PlanVersion.planId` FK rows then the `Plan.id` PK to the canonical UUIDs already used by the test seed helper.
