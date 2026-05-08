# Deploy pipeline — automated pre-deploy gates (2026-05-08)

**Owner:** @tariq
**PR:** feat/deploy-pipeline-pr1-pre-deploy-gates

## What changed

- Backend Dockerfile runner now runs as non-root `app` (uid 1001).
- CMD only starts `node` — migrations no longer race across replicas or rerun on every Swarm rollback.
- **Migrations are now automated via CI** — see `migrate-prod` job in `.github/workflows/build-images.yml`.
- **migrate-prod and backup-prod-db run on the self-hosted VPS runner** (`deqah-vps-prod`) — no external DB exposure, no SSH required.
- **PR #2**: `notify-dokploy` (fire-and-forget webhook) replaced by `deploy-and-verify` — full API-triggered deploy, health checks, and auto-rollback.

## Automated migration (replaces manual Dokploy config)

Migrations run automatically as part of the build-images pipeline:

```
compute-matrix → backup-prod-db (if BACKUP_ENABLED=true) → migrate-prod → build (matrix) → deploy-and-verify (matrix)
```

The `migrate-prod` job:
1. Runs on the `[self-hosted, deqah-prod]` runner (inside `dokploy-network` Docker overlay).
2. Constructs `DATABASE_URL=postgresql://deqah:<POSTGRES_PASSWORD>@deqah-database-jeprin:5432/deqah`.
3. Runs `docker run --rm --network dokploy-network -e DATABASE_URL=... <image> npx prisma migrate deploy --schema=prisma/schema`.
4. Times out at 5 minutes.
5. **If it fails, Dokploy webhooks for ALL services are blocked** — no partial deploys.

**No manual Dokploy pre-deploy command is needed.** The previous instruction to configure
a Pre-Deploy Command in Dokploy is superseded by this CI job.

## Self-hosted runner architecture

The `deqah-vps-prod` runner is a Docker container on the production VPS:

- **Image:** `myoung34/github-runner` (auto-restart policy)
- **Network:** attached to `dokploy-network` (Docker Swarm overlay)
- **Docker socket:** mounted — can issue `docker exec` / `docker run` against the host daemon
- **Labels:** `self-hosted`, `linux`, `x64`, `deqah-prod`
- **DNS resolution:** resolves all `deqah-*` Swarm service names directly (e.g. `deqah-database-jeprin`, `deqah-back-axbgpd`)

This means prod-network jobs (migrate, backup) never touch the public internet for DB access.

## Runner health check

To verify the runner is alive, SSH to the VPS and run:

```bash
docker logs deqah-gh-runner --tail 50
```

Healthy output looks like: `Listening for Jobs` near the bottom.

To check runner status in GitHub UI: **Settings → Actions → Runners** — `deqah-vps-prod` should show **Idle** or **Active**.

If the runner shows **Offline**, restart it on the VPS:

```bash
docker restart deqah-gh-runner
```

## Required secrets and variables

| Name | Kind | Description |
|------|------|-------------|
| `POSTGRES_PASSWORD` | Secret | DB password used to construct `DATABASE_URL` for `migrate-prod`. Points to `deqah-database-jeprin:5432`. |
| `DOKPLOY_API_URL` | Secret | Base URL of the Dokploy instance (e.g. `https://admin.tomooh.cloud`). Used by `deploy-and-verify` to trigger deploys via REST API. |
| `DOKPLOY_API_TOKEN` | Secret | Dokploy API token (Settings → API Tokens). If missing/invalid, falls back to webhook (Plan B). |
| `DOKPLOY_BACKEND_WEBHOOK` | Secret | Dokploy redeploy webhook for backend (Plan B fallback). |
| `DOKPLOY_DASHBOARD_WEBHOOK` | Secret | Dokploy redeploy webhook for dashboard (Plan B fallback). |
| `DOKPLOY_ADMIN_WEBHOOK` | Secret | Dokploy redeploy webhook for admin (Plan B fallback). |
| `DOKPLOY_MARKETING_WEBHOOK` | Secret | Dokploy redeploy webhook for marketing (Plan B fallback). |
| `GHCR_VISIBILITY_PAT` | Secret (optional) | Classic PAT with `write:packages` scope. Auto-sets new GHCR packages to public. |
| `BACKUP_ENABLED` | Variable | Set to `"true"` to enable pre-deploy DB backup before migrations run. |
| `DEPLOY_ROLLBACK_DISABLED` | Variable | Set to `"true"` to skip auto-rollback (kill switch — see below). |

**Removed secrets (no longer needed):**
- ~~`PROD_DATABASE_URL`~~ — replaced by `POSTGRES_PASSWORD` + in-Swarm DNS
- ~~`PROD_VPS_SSH_KEY`~~ — runner has Docker socket access, SSH not needed
- ~~`PROD_VPS_HOST`~~ — same reason

## Auto-rollback flow (PR #2)

The `deploy-and-verify` job replaces the old fire-and-forget webhook step. Each app gets its own matrix job (one app's rollback does not block another's).

```
push to main
    │
    ▼
compute-matrix ──► backup-prod-db ──► migrate-prod ──► build (matrix, ubuntu-latest)
                                                            │
                                                            ▼
                                               deploy-and-verify (matrix, self-hosted)
                                                    │
                                            ┌───────▼───────┐
                                            │ 1. Capture     │
                                            │ previous_image │
                                            └───────┬───────┘
                                                    │
                                            ┌───────▼───────┐
                                            │ 2. Trigger     │
                                            │ Dokploy API    │◄── fallback: webhook
                                            └───────┬───────┘
                                                    │
                                            ┌───────▼───────┐
                                            │ 3. Poll status │
                                            │ (max 5 min)    │
                                            └───────┬───────┘
                                                    │
                                            ┌───────▼───────┐
                                            │ 4. Health check│
                                            │ 5×30s ceiling  │
                                            └──┬────────┬───┘
                                            OK │        │ FAIL
                                               │        ▼
                                               │   ┌────────────────────────┐
                                               │   │ 5a. Swarm rollback      │
                                               │   │ docker service --rollback│
                                               │   │ wait 30s → health check │
                                               │   └────┬───────────┬────────┘
                                               │     OK │           │ FAIL
                                               │        │           ▼
                                               │        │   ┌───────────────────┐
                                               │        │   │ 5b. Image redeploy │
                                               │        │   │ --image prev_image │
                                               │        │   │ wait 60s → health  │
                                               │        │   └────┬──────────┬────┘
                                               │        │     OK │          │ FAIL
                                               │        │        │          ▼
                                               │        │        │   ┌──────────────┐
                                               │        │        │   │ CATASTROPHIC  │
                                               │        │        │   │ Open GH Issue │
                                               │        │        │   │ exit 1        │
                                               │        │        │   └──────────────┘
                                               ▼        ▼        ▼
                                        ┌─────────────────────────────┐
                                        │ 7. Update .deploy-state.json│
                                        │    (last-known-good on dev) │
                                        └─────────────────────────────┘
```

GitHub Issues open automatically on any failure (deploy / health / rollback / catastrophic).
Issues are idempotent — re-runs on the same SHA add a comment rather than opening a duplicate.
Assignee: `@tariiq222`. Labels: `incident`, `deploy-failure`, `<app-name>`.

## Disabling auto-rollback (kill switch)

To skip rollback steps while keeping health-check visibility and issue creation:

1. Go to **GitHub → Settings → Variables → Actions → New repository variable**
2. Name: `DEPLOY_ROLLBACK_DISABLED`, Value: `true`
3. Save

This causes `deploy-and-verify` to:
- Still run health checks (so you can see the failure)
- Skip all `docker service update` rollback commands
- Still open GitHub Issues on health failure

To re-enable auto-rollback, delete the variable or set its value to anything other than `true`.

## `.deploy-state.json` — last-known-good tracking

- Lives on the **develop** branch only. The sanitizer (`scripts/sync-main-branch.sh`) does NOT re-inject it to main.
- Format when populated:
  ```json
  {
    "lastKnownGood": {
      "backend": { "image": "ghcr.io/tariiq222/deqah-backend:v2.1.10", "deployedAt": "2026-05-08T10:00:00.000Z", "sha": "abcd1234" }
    }
  }
  ```
- On successful deploy: `deploy-and-verify` updates it via `gh api repos/.../contents/.deploy-state.json` (commit on develop with `[skip ci]`).
- On rollback: if `docker service inspect` cannot find the previous image, the job reads `lastKnownGood` from this file as a fallback.
- If the file is missing or unparseable, rollback uses the `previous_image` captured at step 1.

## Dokploy API endpoints (verify on first run)

The `dokploy-client.mjs` helper uses these endpoints (derived from Dokploy's open-source codebase). Enable `DOKPLOY_DEBUG=1` on the first run to validate them:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/application.all` | GET | List all applications |
| `/api/application.one?applicationId=<id>` | GET | Get application details |
| `/api/application.deploy` | POST | Trigger redeploy (body: `{ applicationId }`) |
| `/api/deployment.one?deploymentId=<id>` | GET | Get deployment status |

**TODO: verify Dokploy app names match** (`deqah-backend`, `deqah-dashboard`, `deqah-admin`, `deqah-marketing`). If the names differ, update the `appNames` map in `.github/actions/deploy-app/action.yml`. Run `DOKPLOY_API_URL=... DOKPLOY_API_TOKEN=... node scripts/ci/dokploy-client.mjs list` to see all known app names.

## Verification

- After a successful deploy: backend `/api/v1/health` returns 200 and `_prisma_migrations`
  reflects all applied migrations.
- If the `migrate-prod` job fails, check the job logs in GitHub Actions — the error includes
  the Prisma migration name that failed.
- The job log will show `Running on: deqah-vps-prod` confirming it ran on the self-hosted runner.
- After a successful `deploy-and-verify`: `.deploy-state.json` on develop is updated with the new image tag.
