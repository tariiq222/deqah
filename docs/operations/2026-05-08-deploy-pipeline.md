# Deploy pipeline — automated pre-deploy gates (2026-05-08)

**Owner:** @tariq
**PR:** feat/deploy-pipeline-pr1-pre-deploy-gates

## What changed

- Backend Dockerfile runner now runs as non-root `app` (uid 1001).
- CMD only starts `node` — migrations no longer race across replicas or rerun on every Swarm rollback.
- **Migrations are now automated via CI** — see `migrate-prod` job in `.github/workflows/build-images.yml`.
- **migrate-prod and backup-prod-db run on the self-hosted VPS runner** (`deqah-vps-prod`) — no external DB exposure, no SSH required.

## Automated migration (replaces manual Dokploy config)

Migrations run automatically as part of the build-images pipeline:

```
compute-matrix → backup-prod-db (if BACKUP_ENABLED=true) → migrate-prod → build (matrix) → Dokploy webhooks
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

## Required secrets

| Secret | Description |
|--------|-------------|
| `POSTGRES_PASSWORD` | The same DB password Dokploy injected into the backend container. Used to construct `DATABASE_URL` pointing to `deqah-database-jeprin:5432`. |
| `DOKPLOY_BACKEND_WEBHOOK` | Dokploy redeploy webhook for backend. |
| `DOKPLOY_DASHBOARD_WEBHOOK` | Dokploy redeploy webhook for dashboard. |
| `DOKPLOY_ADMIN_WEBHOOK` | Dokploy redeploy webhook for admin. |
| `DOKPLOY_MARKETING_WEBHOOK` | Dokploy redeploy webhook for marketing. |

**Removed secrets (no longer needed):**
- ~~`PROD_DATABASE_URL`~~ — replaced by `POSTGRES_PASSWORD` + in-Swarm DNS
- ~~`PROD_VPS_SSH_KEY`~~ — runner has Docker socket access, SSH not needed
- ~~`PROD_VPS_HOST`~~ — same reason

## Verification

- After a successful deploy: backend `/api/v1/health` returns 200 and `_prisma_migrations`
  reflects all applied migrations.
- If the `migrate-prod` job fails, check the job logs in GitHub Actions — the error includes
  the Prisma migration name that failed.
- The job log will show `Running on: deqah-vps-prod` confirming it ran on the self-hosted runner.
