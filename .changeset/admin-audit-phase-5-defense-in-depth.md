---
"@deqah/backend": patch
"@deqah/admin": patch
---

Phase 5/8 of 2026-05-08 admin audit fixes — defense-in-depth.

- **IP allowlist CIDR validation** — new `IsCidrOrIpArray` class-validator decorator (using `ipaddr.js`) on `UpdateSecuritySettingsDto.ipAllowlist`. Frontend security page validates per-line on submit with inline errors.
- **OwnerOnlyGuard** — new common guard restricting the most sensitive admin endpoints to a small env-driven allowlist (`OWNER_EMAILS`, comma-separated). Applied to: entire `BillingSettingsController` (Moyasar credentials) and method-level on `AdminBillingController.refund/waive/grant/changePlan/forceCharge/cancelScheduled`. Reads user email from DB to avoid trusting stale JWT claims (one extra query per low-volume owner-only call). Fail-closed when `OWNER_EMAILS` is unset.
- **Rate limiting** — two `@nestjs/throttler` named limiters: `admin-mutation` (30/min) on most admin POST/PATCH/DELETE/PUT, `admin-mutation-slow` (5/min) on the destructive billing ops (refund/waive/grant/changePlan/forceCharge/cancelScheduled). Plugs into the existing Redis-backed `TenantAwareThrottlerGuard` global guard.
- **Dashboard verticals cleanup** — removed 6 dead mutation routes from `dashboard/verticals.controller.ts` (POST/PATCH/PUT/DELETE) that duplicated `/admin/verticals` endpoints. Verticals are platform-level config; tenants must never mutate them. Verified zero FE callers.
- **`INAPP` → `IN_APP` enum alignment** — replaced 4 callsites of the bad spelling so DTOs/types match Prisma's `DeliveryChannel.IN_APP` enum.
- **FE↔BE path drift** — verified false positive: `adminRequest()` auto-prefixes `/admin/`; all 44 FE callsites across 38 files align correctly with the 16 backend `@Controller('admin/...')` routes.

Closes audit findings P0 #6 (path drift — verified clean), P0 #7 (CIDR validation), P1 #11 (RBAC binary — now has owner-only tier), P1 #18 (dashboard mutation cleanup), notifications enum mismatch, rate-limit gap.

Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.
