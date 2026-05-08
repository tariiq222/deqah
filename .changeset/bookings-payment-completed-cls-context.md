---
"backend": patch
---

`PaymentCompletedHandler` now runs inside an explicit `runWithTenantContext()` CLS scope so downstream Prisma calls always pick up the correct `organizationId`. Fixes the production case where a webhook-triggered payment completion bypassed tenant scoping (PR #163).
