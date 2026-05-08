# P0 — RLS Cutover Runbook (2026-05-09 audit)

> **Owner-only.** Read end-to-end before touching production.

## Why

Migration `20260509000000_rls_app_role_and_strict_policies` switched RLS policies
to fail-closed (`OR app_rls_bypassed()` instead of the legacy `OR ... IS NULL`)
and created a NOBYPASSRLS role `deqah_app`. Until the runtime is flipped to use
`deqah_app` AND `RLS_GUC_INTERCEPTOR_ENABLED=true`, the production database has
no enforced tenant boundary — every query runs as OWNER which bypasses RLS.

## Pre-flight (before touching prod)

- [ ] Tag a release of `develop` so you have a known-good rollback target.
- [ ] Confirm `develop` is green on CI (typecheck + 2623 unit tests).
- [ ] Take a fresh `pg_dump` of production. Store it OUTSIDE the VPS.
- [ ] Verify `apps/backend/src/common/interceptors/tenant-guc.interceptor.ts` is
      registered in `main.ts` and does NOT throw on staging smoke.
- [ ] Confirm staging has had a full smoke run with `RLS_GUC_INTERCEPTOR_ENABLED=true`
      and `DATABASE_URL` pointed at `deqah_app` for at least 1 hour with traffic.

## Cutover steps (production)

### 1. Set the password for `deqah_app` (one-time)

The migration created the role with placeholder password `CHANGE_ME_AT_DEPLOY`.
Set the real password BEFORE pointing the app at it.

```sh
# On the VPS, exec into the postgres container:
docker exec -it deqah-postgres psql -U deqah -d deqah -c \
  "ALTER ROLE deqah_app WITH PASSWORD '<NEW_STRONG_PASSWORD_AT_LEAST_32_CHARS>';"
```

Generate the password locally first:

```sh
openssl rand -base64 32
```

### 2. Update `.env.prod` on Dokploy

In Dokploy → backend service → Environment, change:

```diff
- DATABASE_URL=postgresql://deqah:<old-password>@deqah-database-jeprin:5432/deqah
+ DATABASE_URL=postgresql://deqah_app:<NEW_STRONG_PASSWORD>@deqah-database-jeprin:5432/deqah
+ APP_DB_USER=deqah_app
+ APP_DB_PASSWORD=<NEW_STRONG_PASSWORD>
- RLS_GUC_INTERCEPTOR_ENABLED=false
+ RLS_GUC_INTERCEPTOR_ENABLED=true
```

Keep `POSTGRES_USER=deqah` / `POSTGRES_PASSWORD=<old>` unchanged — the migrate
container still uses OWNER credentials.

### 3. Redeploy the backend

Dokploy → backend service → Redeploy. The boot will now Joi-fail-fast if either
guard is wrong, so a misconfiguration is loud.

### 4. Smoke test (mandatory)

Hit these endpoints with a real tenant JWT and verify they return data (not 0
rows / not 500):

- `GET /api/v1/dashboard/bookings` (list bookings)
- `GET /api/v1/dashboard/clients` (list clients)
- `GET /api/v1/dashboard/services` (list services)
- `GET /api/v1/mobile/client/bookings/me` (mobile client view)
- `POST /api/v1/dashboard/bookings` (create — exercises a write path)

Any endpoint that returns 0 rows now but did before the flip = a query path that
runs outside the GUC interceptor's transaction wrapper. Log the path; fix it
under P1 task 1.1.

### 5. Verify the bypass actually works for super-admin paths

- Login as super-admin in `apps/admin`.
- Open Organizations list → must show all orgs.
- If 0 orgs → super-admin context is not setting `app.bypass_rls=on`. Investigate
  `RlsHelper.runWithoutTenant` usages.

## Rollback

If anything is wrong:

1. Dokploy → backend service → Environment, revert the 4 changed lines.
2. Redeploy. Boot must succeed with the OWNER role and interceptor disabled.
3. File the failure mode and re-attempt after fixing.

## Verification queries (psql)

```sql
-- Confirm deqah_app does NOT have BYPASSRLS:
SELECT rolname, rolbypassrls, rolsuper
FROM pg_roles
WHERE rolname IN ('deqah', 'deqah_app');
-- Expected:
--   deqah     | t | f   (OWNER, no super)
--   deqah_app | f | f   (NOBYPASSRLS, no super)

-- Confirm RLS is FORCED on a sample table:
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('Booking', 'Client', 'Payment')
  AND relkind = 'r';
-- All three columns 2 + 3 must be true.

-- Confirm policy uses the new predicate:
SELECT polname, pg_get_expr(polqual, polrelid)
FROM pg_policy
WHERE polrelid = 'public."Booking"'::regclass;
-- Expected: includes both `app_current_org_id()` and `app_rls_bypassed()`.
```

## Post-cutover (within 24h)

- P1 task 1.1: rewrite `TenantGucInterceptor` to be reliable across pool connections.
- P1 task 1.4: add tenant-isolation E2E suite that detects regressions.
