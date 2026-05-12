# Deployment Guide

How code reaches production at Deqah.

## Pipeline at a glance

```
git push develop
   │
   ▼
[CI] typecheck + lint + 2623 unit tests
   │ (passes)
   ▼
[Auto-promote] develop → staging  (fast-forward only)
   │
   ▼
[Build & Deploy] :develop images for changed apps
   ├─ Build per-app in parallel (matrix)
   ├─ Push to ghcr.io
   └─ Call Dokploy API → deploy staging environment
   │
   ▼
🌐 *.staging.deqah.net  (test here)
   │
   │  ⛔ MANUAL GATE  ⛔
   ▼
gh workflow run promote-to-main.yml -f confirm=promote
   │
   ▼
[Promote] staging → main  (fast-forward only)
   │
   ▼
[Build & Deploy] :latest images for changed apps
   │
   ▼
🌐 *.deqah.net  (production)
```

## The 4 workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| CI | `.github/workflows/ci.yml` | push/PR to develop, staging, main | typecheck, lint, unit tests, env-drift, OpenAPI build |
| Auto-promote | `.github/workflows/auto-promote.yml` | push to develop | wait for CI → fast-forward staging |
| Build & Deploy | `.github/workflows/build-images.yml` | push to staging or main, or manual | per-app build matrix → ghcr.io → Dokploy API |
| Promote to main | `.github/workflows/promote-to-main.yml` | manual (`workflow_dispatch`) | fast-forward main from staging |

## Branches

| Branch | What it is | Who pushes |
|--------|-----------|------------|
| `develop` | the dev trunk; all PRs target it | every contributor (via PR) |
| `staging` | mirror of develop after CI passes | only auto-promote workflow |
| `main` | production code | only promote-to-main workflow |

`main` and `staging` are **never written to directly**. They only advance via fast-forward from develop.

## Environments

| Environment | Hosted by | Domains | Image tag |
|------------|-----------|---------|-----------|
| Staging | Dokploy on Hetzner | `*.staging.deqah.net` | `:develop` |
| Production | Dokploy on Hetzner | `*.deqah.net` | `:latest` |

Same server (`webvue` at `178.105.84.5`), different Dokploy environments. Each environment has its own Postgres, Redis, env vars, domains, and Let's Encrypt certificates.

## Daily flow for a contributor

```bash
# 1. Branch off develop
git checkout develop && git pull
git checkout -b feat/my-thing

# 2. Work + commit
git push origin feat/my-thing

# 3. Open PR targeting develop
gh pr create --base develop --title "..." --body "..."

# 4. CI runs on the PR. Review + merge.

# 5. After merge, the rest is automatic:
#    - CI re-runs on develop
#    - staging fast-forwards from develop
#    - changed apps build :develop images
#    - Dokploy deploys staging environment

# 6. Test on https://*.staging.deqah.net

# 7. When ready, ship to production (manual gate):
gh workflow run promote-to-main.yml -f confirm=promote --repo tariiq222/deqah
```

## Per-app build matrix

`build-images.yml` only builds apps that actually changed:

| Files changed | Apps rebuilt |
|--------------|--------------|
| `apps/backend/**` | backend |
| `apps/dashboard/**` | dashboard |
| `apps/admin/**` | admin |
| `apps/marketing/**` | marketing |
| `packages/shared/**` | **all 4** (everyone consumes shared) |
| `packages/api-client/**` | dashboard, admin |
| `packages/ui/**` | dashboard, admin, marketing |
| `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `turbo.json` | **all 4** |

Force-rebuild everything manually:

```bash
gh workflow run build-images.yml --ref staging -f apps=all
gh workflow run build-images.yml --ref main -f apps=all
```

Rebuild specific apps:

```bash
gh workflow run build-images.yml --ref staging -f apps=backend,dashboard
```

## Skip mechanisms

In a commit message:
- `[skip ci]` — skip CI on this push
- `[skip auto-promote]` — keep CI but skip the develop → staging fast-forward

Useful for chore commits like dependency bumps that don't need a deploy.

## What runs in CI

The `backend` job in `ci.yml`:
1. Install pnpm deps (`--frozen-lockfile`)
2. Generate Prisma client
3. Build `@deqah/shared` to `dist/`
4. Run Prisma migrations against the CI Postgres service
5. Run `pnpm test` (unit tests, ~25s, 2623 tests)

**E2E and security suites are NOT run in CI** — they need a fully provisioned dev stack (Postgres on :5999, Redis on :5380, MinIO on :9000) and run nightly against staging instead.

The `api-docs` job rebuilds the OpenAPI snapshot and verifies the backend type-checks.

The `env-drift` job verifies `apps/backend/.env.prod.example` matches the Joi validation schema.

## Required GitHub secrets

| Secret | Value |
|--------|-------|
| `DOKPLOY_API_URL` | `https://dokploy.webvue.pro` |
| `DOKPLOY_API_TOKEN` | Dokploy API token (rotate quarterly) |

Stored at `.secrets/credentials.md` locally (gitignored).

## Triggering deploys manually

Sometimes you want to redeploy without a code change (e.g. after rotating a secret in Dokploy):

```bash
# Redeploy a single application
curl -X POST "https://dokploy.webvue.pro/api/application.redeploy" \
  -H "x-api-key: $DOKPLOY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"applicationId":"<APP_ID>"}'
```

Application IDs live in `.secrets/credentials.md`.

Or rebuild + redeploy from CI:

```bash
gh workflow run build-images.yml --ref main -f apps=all
```

## Database pre-deploy gates

Before running `prisma migrate deploy` on a live database with existing
Booking/Payment traffic, check whether
`20260511030000_fix_outbox_payment_booking_schema` is still pending:

```bash
pnpm --filter=backend exec prisma migrate status
```

If it is pending, pre-create the heavy indexes concurrently first:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/ops/predeploy-20260511030000-concurrent-indexes.sql
```

Then run the normal migration deploy. Do not edit the existing migration file;
it is immutable. The pre-deploy script creates the same index names, so the
old migration's `CREATE INDEX IF NOT EXISTS` statements skip without taking
long write-blocking locks on `Booking` or `Payment`.

## Pre-launch checks (one-time, before public traffic)

These env vars start as placeholders. Replace them in Dokploy → application → Environment before going public:

| Service | Variable | Where to get |
|---------|----------|--------------|
| hCaptcha | `HCAPTCHA_SECRET` | https://dashboard.hcaptcha.com/sites |
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| OpenRouter | `OPENROUTER_API_KEY` | https://openrouter.ai/keys |
| Firebase | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Firebase Console |
| Moyasar (frontend) | `NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY` (`pk_live_*`) | Moyasar dashboard |
| Zoho OAuth | `ZOHO_OAUTH_*` | Zoho Developer Console |

After updating, redeploy the affected app from Dokploy.

## Status pages

| Where | What |
|-------|------|
| https://github.com/tariiq222/deqah/actions | All workflow runs |
| https://dokploy.webvue.pro | Server console (containers, logs, deploys) |
| https://errors.webvue.pro | GlitchTip — runtime errors per app |
| https://console.webvue.pro | MinIO — uploaded files per bucket |

## Related runbooks

- [`rollback-runbook.md`](rollback-runbook.md) — how to roll back a bad deploy
- [`disaster-recovery.md`](disaster-recovery.md) — full-server recovery scenarios
- [`module-ownership.md`](../architecture/module-ownership.md) — what belongs where in the codebase
- [Subdomain tenant routing](#subdomain-tenant-routing) — DNS, TLS, and Nginx config for `*.deqah.net`

## Subdomain tenant routing

Tenants reach the dashboard at `https://<slug>.deqah.net`. Cloudflare provides wildcard DNS + universal SSL for `*.deqah.net`. Origin Nginx must:

```nginx
server {
  listen 443 ssl http2;
  server_name *.deqah.net;

  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Real-IP $remote_addr;

  # ...existing locations (proxy_pass to dashboard:5103, backend:5100, …)
}
```

Required env vars on backend:

- `PLATFORM_ROOT_DOMAIN=deqah.net`
- `RESERVED_SUBDOMAINS=` (optional CSV merged with the built-in reserved list)

CORS automatically accepts `https://*.deqah.net` (regex check based on `PLATFORM_ROOT_DOMAIN`). The dashboard's `middleware.ts` forwards the original Host as `X-Forwarded-Host` on `/api/proxy/*` calls so the backend can resolve the tenant before any JWT exists. For the resolution chain, see `apps/backend/src/common/tenant/tenant-resolver.middleware.ts`.

### DNS / TLS prerequisites

- Wildcard DNS: `*.deqah.net A <vps-ip>` (we use Cloudflare proxied with orange cloud).
- Wildcard TLS: Cloudflare Universal SSL (covers `deqah.net` + `*.deqah.net`, single label only).
- Reserved subdomains never resolve to a tenant (e.g. `www`, `api`, `admin`). Built-in list is in `apps/backend/src/common/tenant/subdomain.utils.ts`; extend via `RESERVED_SUBDOMAINS` env.

### Adding a new tenant

1. Super-admin creates the org via the admin app. The wizard auto-derives a slug from the name (Arabic → ASCII transliteration) and previews `https://<slug>.deqah.net`. Operator may edit before saving.
2. The slug must satisfy `^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$` (3–30 chars). Reserved names are rejected with a clear error.
3. Once saved, the subdomain is live within seconds (DNS wildcard + cached resolver).
4. The dashboard's `BrandingProvider` reads `/public/branding`, which the resolver scopes by Host header.

### Renaming a slug

Renaming breaks the old subdomain immediately. The resolver's in-memory cache flushes within 5 minutes; bookmarks pointing at the old subdomain will fail until users update them. The admin UI shows a confirmation modal explaining this before the change is committed.
