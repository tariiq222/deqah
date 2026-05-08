---
"backend": patch
"admin": patch
---

Phase 2/8 of 2026-05-08 admin audit fixes — backend correctness.

- `admin-cancel-scheduled` writes (subscription update + audit log) now run inside `prisma.$allTenants.$transaction` for atomic rollback.
- `admin-force-charge` writes the audit log BEFORE invoking Moyasar dunning, so the super-admin's destructive intent is recorded even when the external call fails.
- `get-platform-metrics` excludes archived/inactive rows: organization total/newThisMonth use `status: { not: 'ARCHIVED' }`; user count filters `isActive: true`. Active org count tightened to `status: 'ACTIVE' AND suspendedAt: null`.
- `list-plans` and `list-verticals` admin endpoints are now paginated (`?page`, `?perPage`, defaults 1/20, capped at 100). Response shape changed to `{ items, meta: { page, perPage, total, totalPages } }`. Frontend callers updated to destructure `items`.
- `list-zoho-saas-invoices` `zohoMirrored` filter pushed from in-memory `.filter()` to the DB `where` clause via `id: { in: mirroredIds }` / `notIn`. `meta.total` now matches `items.length` when the filter is active; pagination no longer skips mirrored rows.
- Subscription cache invalidation on plan update is already wired via `CacheInvalidatorListener` (subscribes to `PLAN_UPDATED_EVENT`). The audit finding flagged this as missing but verification showed it's implemented; no code change needed.

Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.
