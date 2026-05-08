---
"backend": patch
---

Fix the `20260508000000_fix_broken_plan_uuids` migration so it no longer fails on fresh databases. The original SQL updated child rows (Subscription, PlanVersion) before the parent Plan row, which triggered `current transaction is aborted` on any DB without the legacy seed bug — wedging both CI Smoke Suite and the production build pipeline. Simplified to three `UPDATE Plan` statements; the FK columns carry `ON UPDATE CASCADE` so children follow automatically.
