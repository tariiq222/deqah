# backend

## 2.1.9

### Patch Changes

- [`2252982`](https://github.com/tariiq222/deqah/commit/22529828cf60f3b7f0cb24cb0fd2bc3debaf53b3) - Force rebuild backend image — earlier promote skipped backend build due to a
  false-positive in the version-existence filter, leaving production on the
  pre-pagination shape of `GET /admin/plans` while the admin frontend was
  already updated to expect `{ items, meta }`. Filter is removed in the same
  PR; this bump forces v2.1.9 to actually build and deploy.

## 2.1.8

### Patch Changes

- [`5a56f1e`](https://github.com/tariiq222/deqah/commit/5a56f1e8f7e7ec4f8b72a70ae7571077fd56c302) - Closes the audit-log gap on platform settings writes (Phase 1/8 of 2026-05-08 admin audit fixes).

  A new `LogPlatformSettingUpdateHandler` is shared across the four settings controllers (branding, security, billing, notifications-config). Every mutating settings write now produces a `SuperAdminActionLog` row with the `PLATFORM_SETTING_UPDATED` action type, recording previous + next value (or `'***'` for Moyasar/FCM secrets), settingKey, ipAddress, and userAgent. No-op updates (previous === next) are detected and skipped.

  Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.

- [`91e70c1`](https://github.com/tariiq222/deqah/commit/91e70c1afe428c2311294c7551dcd9777a110a07) - Phase 2/8 of 2026-05-08 admin audit fixes — backend correctness.
  - `admin-cancel-scheduled` writes (subscription update + audit log) now run inside `prisma.$allTenants.$transaction` for atomic rollback.
  - `admin-force-charge` writes the audit log BEFORE invoking Moyasar dunning, so the super-admin's destructive intent is recorded even when the external call fails.
  - `get-platform-metrics` excludes archived/inactive rows: organization total/newThisMonth use `status: { not: 'ARCHIVED' }`; user count filters `isActive: true`. Active org count tightened to `status: 'ACTIVE' AND suspendedAt: null`.
  - `list-plans` and `list-verticals` admin endpoints are now paginated (`?page`, `?perPage`, defaults 1/20, capped at 100). Response shape changed to `{ items, meta: { page, perPage, total, totalPages } }`. Frontend callers updated to destructure `items`.
  - `list-zoho-saas-invoices` `zohoMirrored` filter pushed from in-memory `.filter()` to the DB `where` clause via `id: { in: mirroredIds }` / `notIn`. `meta.total` now matches `items.length` when the filter is active; pagination no longer skips mirrored rows.
  - Subscription cache invalidation on plan update is already wired via `CacheInvalidatorListener` (subscribes to `PLAN_UPDATED_EVENT`). The audit finding flagged this as missing but verification showed it's implemented; no code change needed.

  Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.

- [`13588fa`](https://github.com/tariiq222/deqah/commit/13588fa30d2308daf5b64b61c9d346182eb55c98) - Phase 3/8 of 2026-05-08 admin audit fixes — real system-health probes.

  Replaces env-only "health" checks (which reported `'ok'` if env vars existed) with real round-trip probes for every subsystem:
  - **Postgres**: `SELECT 1`
  - **Redis**: `getClient().ping()` against the shared ioredis client
  - **BullMQ**: `getQueue('platform-mail').client.ping()` (probes the BullMQ-specific ioredis connection)
  - **MinIO**: `bucketExists(MINIO_BUCKET)` — added a small `bucketExists` method to `MinioService`
  - **Moyasar**: `GET https://api.moyasar.com/v1/payments?per_page=1` with the platform secret key
  - **Resend**: `GET https://api.resend.com/api-keys` with `RESEND_API_KEY`

  All probes wrapped in a 5-second timeout via `Promise.race`. Failures surface as `{ status: 'down', detail }`. Auth failures (401) and 5xx surface as `'degraded'`. `latencyMs` recorded for every probe even on failure.

  Frontend `apps/admin/app/(admin)/settings/health/page.tsx` already renders `latencyMs` + `detail` + `status` correctly — no FE change needed.

  Closes audit finding **P0 #3** (health checks were fake env-checks).

  Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.

- [`cbfc315`](https://github.com/tariiq222/deqah/commit/cbfc3153032e99ac2c11d66ba8b0230cfe00b19b) - Phase 5/8 of 2026-05-08 admin audit fixes — defense-in-depth.
  - **IP allowlist CIDR validation** — new `IsCidrOrIpArray` class-validator decorator (using `ipaddr.js`) on `UpdateSecuritySettingsDto.ipAllowlist`. Frontend security page validates per-line on submit with inline errors.
  - **OwnerOnlyGuard** — new common guard restricting the most sensitive admin endpoints to a small env-driven allowlist (`OWNER_EMAILS`, comma-separated). Applied to: entire `BillingSettingsController` (Moyasar credentials) and method-level on `AdminBillingController.refund/waive/grant/changePlan/forceCharge/cancelScheduled`. Reads user email from DB to avoid trusting stale JWT claims (one extra query per low-volume owner-only call). Fail-closed when `OWNER_EMAILS` is unset.
  - **Rate limiting** — two `@nestjs/throttler` named limiters: `admin-mutation` (30/min) on most admin POST/PATCH/DELETE/PUT, `admin-mutation-slow` (5/min) on the destructive billing ops (refund/waive/grant/changePlan/forceCharge/cancelScheduled). Plugs into the existing Redis-backed `TenantAwareThrottlerGuard` global guard.
  - **Dashboard verticals cleanup** — removed 6 dead mutation routes from `dashboard/verticals.controller.ts` (POST/PATCH/PUT/DELETE) that duplicated `/admin/verticals` endpoints. Verticals are platform-level config; tenants must never mutate them. Verified zero FE callers.
  - **`INAPP` → `IN_APP` enum alignment** — replaced 4 callsites of the bad spelling so DTOs/types match Prisma's `DeliveryChannel.IN_APP` enum.
  - **FE↔BE path drift** — verified false positive: `adminRequest()` auto-prefixes `/admin/`; all 44 FE callsites across 38 files align correctly with the 16 backend `@Controller('admin/...')` routes.

  Closes audit findings P0 #6 (path drift — verified clean), P0 #7 (CIDR validation), P1 #11 (RBAC binary — now has owner-only tier), P1 #18 (dashboard mutation cleanup), notifications enum mismatch, rate-limit gap.

  Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - `ChargeDueSubscriptionsCron` now consumes available `BillingCredit` rows in FIFO order before invoking Moyasar to charge the saved card. Tenants with platform-granted credit are no longer double-charged (PR #155).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - Cancelling a paid booking now emits `BookingCancelledEvent` which is handled by `OnBookingCancelledHandler` in the finance module to issue an automatic refund through Moyasar. Closes the gap where clients had to chase clinics manually after cancellation (PR #168).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - Wraps the group-booking capacity check in `create-booking.handler` with a Postgres advisory lock keyed on the slot id, eliminating the race where two concurrent requests could both pass the capacity check and overbook a group session (PR #160).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - `PaymentCompletedHandler` now runs inside an explicit `runWithTenantContext()` CLS scope so downstream Prisma calls always pick up the correct `organizationId`. Fixes the production case where a webhook-triggered payment completion bypassed tenant scoping (PR #163).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - `env.validation` now rejects `CAPTCHA_PROVIDER=noop` when `NODE_ENV=production`, and `captcha.verifier` defaults to fail-closed instead of fail-open. Prevents shipping a tenant build with CAPTCHA silently disabled (PR #156).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - Adds an `Idempotency-Key` header to `MoyasarApiClient.createRefund` so retries (CI redrives, BullMQ retries, manual replays) cannot double-refund the same payment. The key is derived from `paymentId + refundId` and propagated through `refund-payment.handler` and `approve-refund.handler` (PR #166).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - `MoyasarWebhookHandler` now validates the incoming webhook's `amount` and `currency` against the original `Payment` row before marking it completed. Stops a forged or replayed webhook from completing a payment for the wrong amount (PR #152).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - `refund-payment.handler` now calls Moyasar's refund API BEFORE writing the local `Refund` row, so a Moyasar failure no longer leaves the database recording a refund that never happened (PR #153).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - All user mutation handlers (`assign-role`, `remove-role`, `deactivate-user`, `delete-user`) now verify the caller has an active `Membership` in the target user's organization before acting. Blocks a cross-tenant privilege-escalation path where a user with admin role in org A could mutate users in org B (PR #165).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - The backend container now runs as a non-root user and Prisma migrations have been moved out of the container CMD into an explicit `migrate.sh` step invoked by Dokploy, so a crashing migration no longer takes down rollback-able replicas (PR #157).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - Adds Postgres RLS policies for scoped tables introduced after the original RLS migration cluster (`20260508062116_rls_for_recent_scoped_tables`). Closes the gap where new tenant-scoped models were created without enabling row-level security (PR #159).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - Tightens `env.validation` for production secrets (rejects placeholder/short values), masks secrets out of `.dockerignore`-bound build context, and logs masked-secret startup banner from `main.ts`. Pairs with the new rotation runbook (PR #154).

- [`f811b60`](https://github.com/tariiq222/deqah/commit/f811b602e5d9a589626daea51444ac18cd1b1bef) - `HttpExceptionFilter` now attaches `tenant`, `user`, and `requestId` to every Sentry/GlitchTip scope before capturing exceptions, so production errors are no longer reported without the org/user context required to triage them (PR #158).

## 2.1.7

### Patch Changes

- [`a3be071`](https://github.com/tariiq222/deqah/commit/a3be071115e5e6d38cbbf41154981d1ebf2e16a4) - Fix the `20260508000000_fix_broken_plan_uuids` migration so it no longer fails on fresh databases. The original SQL updated child rows (Subscription, PlanVersion) before the parent Plan row, which triggered `current transaction is aborted` on any DB without the legacy seed bug — wedging both CI Smoke Suite and the production build pipeline. Simplified to three `UPDATE Plan` statements; the FK columns carry `ON UPDATE CASCADE` so children follow automatically.

## 2.1.6

### Patch Changes

- [#161](https://github.com/tariiq222/deqah/pull/161) [`a7e3719`](https://github.com/tariiq222/deqah/commit/a7e3719aacc37c9a237ac1fbfe0156ddd2e4d8d8) Thanks [@tariiq222](https://github.com/tariiq222)! - Fix broken Plan UUIDs from the saas_04 seed migration. The original seed inserted Plan rows with IDs containing the literal letter `p` (not valid hex), so any admin endpoint accepting a `planId` (notably create-tenant) returned `400 planId must be a UUID` in production. New idempotent migration `20260508000000_fix_broken_plan_uuids` updates `Subscription.planId` and `PlanVersion.planId` FK rows then the `Plan.id` PK to the canonical UUIDs already used by the test seed helper.

## 2.1.5

### Patch Changes

- [`029f16a`](https://github.com/tariiq222/deqah/commit/029f16ae67f68c3e35acad05ebf48bc6b703083e) - Fix three production-blocking bugs that surfaced after v2.1.4 deploy under `TENANT_ENFORCEMENT=strict`:
  1. **Login response membership lookup** — `auth.controller.ts:loginEndpoint()` did a second `prisma.membership.findFirst()` (after `LoginHandler.execute()`) without tenant context. Wrapped in `cls.run` + `SUPER_ADMIN_CONTEXT_CLS_KEY` + `$allTenants`, mirroring the pattern from `LoginHandler.execute()` and `refreshEndpoint()`.
  2. **Password reset captcha** — admin's forgot-password form doesn't render a captcha widget, so requests arrived without `hCaptchaToken` and `request-password-reset` rejected them with `CAPTCHA_FAILED`. Dropped the `captcha.verify()` call (consistent with the platform-wide captcha pause until Cloudflare Turnstile lands).
  3. **`SubscriptionCacheService.get()`** — read `Subscription` (a SCOPED model) directly without `$allTenants`. Called from cross-tenant code paths (cron jobs, `SendEmailHandler` during password-reset email), where no CLS tenant context exists. Now wraps in `cls.run` + `SUPER_ADMIN_CONTEXT_CLS_KEY` + `$allTenants`. The existing `organizationId` filter still scopes correctly.

## 2.1.4

### Patch Changes

- [`6b30ffb`](https://github.com/tariiq222/deqah/commit/6b30ffb677248b01c398d9eb954daeec4d744923) - Make `hCaptchaToken` optional in 6 auth/OTP DTOs (`LoginDto`, `ClientLoginDto`, `RegisterDto`, `ResetPasswordDto`, `RequestOtpDto`, `VerifyOtpDto`). The captcha verifier was already a no-op in v2.1.3, but DTO-level `@IsNotEmpty()` was still rejecting requests when frontends sent expired or empty hCaptcha tokens. Frontends remain unchanged — they continue sending the field, which the backend now accepts and ignores. Per-account lockout (5 attempts → 15-minute lock) remains the brute-force defense until Cloudflare Turnstile lands.

## 2.1.3

### Patch Changes

- [`0e32005`](https://github.com/tariiq222/deqah/commit/0e32005f889c760ba4d7bc1caf145f030437db31) - Drop the production-only requirement for `CAPTCHA_PROVIDER` so `noop` is a valid value in any environment. Per-account lockout (5 attempts → 15-minute lock) remains the primary brute-force defense until Cloudflare Turnstile lands. Adds a `TurnstileCaptchaVerifier` stub + `TURNSTILE_SECRET` env slot so flipping `CAPTCHA_PROVIDER=turnstile` later is a config change, not a code change.

## 2.1.2

### Patch Changes

- [`6201701`](https://github.com/tariiq222/deqah/commit/6201701616d404a75a6a4ef829a74664ba106241) - Unblock production login + ops crons under `TENANT_ENFORCEMENT=strict` (#151). `LoginHandler.membership.findMany` and 6 ops cron tasks (booking-expiry legacy, booking-noshow, booking-autocomplete, group-session-automation, appointment-reminders, refresh-token-cleanup) now wrap their scoped queries in `cls.run` + `SUPER_ADMIN_CONTEXT_CLS_KEY` and switch to `prisma.$allTenants` — the canonical bypass for entry-points without a resolved tenant context. Also lazy-init `ZohoCredentialsService` so a missing `ZOHO_PROVIDER_ENCRYPTION_KEY` no longer blocks NestJS DI / app boot, and add a `RELAX_PROD_VALIDATION` escape hatch for `API_PUBLIC_URL` (mirrors the existing Zoho fields).

## 2.1.1

### Patch Changes

- [`c4b7714`](https://github.com/tariiq222/deqah/commit/c4b771422f67c9e29af611958b82755f78024957) - Add `RELAX_PROD_VALIDATION` env flag — temporary escape hatch that downgrades Zoho + hCaptcha env validation to optional in production, so the platform can boot before real credentials are populated. All other prod safety (JWT, Moyasar tenant key, encryption keys, placeholder rejection) remains strict. Remove once real keys land in Dokploy.

## 2.1.0

### Minor Changes

- [`0fb6711`](https://github.com/tariiq222/deqah/commit/0fb67119b7c1cc72be098e63783cbd9d0f77e96f) - Bootstrap the Changesets-based per-app versioning pipeline + ship Zoho Invoice integration.

  **Zoho Invoice integration (backend, dashboard, admin)**
  - Backend: tenant→client + SaaS→tenant invoice generation, encrypted per-tenant
    Zoho credentials, scheduled-job runner, audit log, reconnect banner, per-tenant
    throttling, `API_PUBLIC_URL` for outbound webhook URLs, class-level `UseGuards`
    on Zoho controllers.
  - Dashboard: Zoho UI + per-client filter + per-tenant schedule view.
  - Admin: Zoho sidebar link + super-admin oversight surfaces.
  - E2E coverage: Playwright specs in `apps/dashboard/e2e/` for the full flow.
  - Tenant resolver bypass for auth-bootstrap routes (so Zoho OAuth callback
    works without an active tenant context).

  **Changesets pipeline (all 4 apps)**
  - Per-app independent semver in `apps/<app>/package.json`.
  - Author-written CHANGELOGs via `@changesets/cli`; one `.changeset/*.md` per
    meaningful change.
  - Promote workflow now: `verify-changesets.mjs` blocks if missing → `changeset
version` bumps + writes CHANGELOGs → single rebase+commit+push to develop →
    appends per-deploy row to `docs/operations/version-history.md` → sanitize +
    promote → dispatch build-images.
  - `build-images.yml` reads `apps/<app>/package.json` version as the primary
    Docker tag (`v<semver>`); skip-builds when the v<semver> tag already exists
    in GHCR (so single-app changes don't rebuild all 4).
  - Husky pre-push warns on missing changesets; CI gate hard-blocks the promote.
  - `scripts/release.sh` deprecated (FORCE_LEGACY=1 escape hatch).
  - Operator guide at `docs/operations/changeset-workflow.md`.

  This is the first changeset under the new system — covers everything between
  the previous main snapshot and develop.

All notable changes to the Deqah Backend (NestJS API) are documented here.
This file is generated and maintained by [Changesets](https://github.com/changesets/changesets).

For pre-Changesets history (anything before 2026-05-07), see
[`docs/operations/version-history.md`](../../docs/operations/version-history.md).
