# Deploy pipeline — automated pre-deploy gates (2026-05-08)

**Owner:** @tariq
**PR:** feat/deploy-pipeline-pr1-pre-deploy-gates

## What changed

- Backend Dockerfile runner now runs as non-root `app` (uid 1001).
- CMD only starts `node` — migrations no longer race across replicas or rerun on every Swarm rollback.
- **Migrations are now automated via CI** — see `migrate-prod` job in `.github/workflows/build-images.yml`.

## Automated migration (replaces manual Dokploy config)

Migrations run automatically as part of the build-images pipeline:

```
compute-matrix → backup-prod-db (if BACKUP_ENABLED) → migrate-prod → build (matrix) → Dokploy webhooks
```

The `migrate-prod` job:
1. Pulls `ghcr.io/tariiq222/deqah-backend:latest` (just pushed by the build job — or current latest for the migration pre-check).
2. Runs `docker run --rm -e DATABASE_URL="..." <image> npx prisma migrate deploy --schema=prisma/schema`.
3. Times out at 5 minutes.
4. **If it fails, Dokploy webhooks for ALL services are blocked** — no partial deploys.

**No manual Dokploy pre-deploy command is needed.** The previous instruction to configure
a Pre-Deploy Command in Dokploy is superseded by this CI job.

## Required secret

Add `PROD_DATABASE_URL` to GitHub → Settings → Secrets → Actions:

```
postgresql://deqah:<password>@deqah-database-jeprin:5432/deqah
```

## Verification

- After a successful deploy: backend `/api/v1/health` returns 200 and `_prisma_migrations`
  reflects all applied migrations.
- If the `migrate-prod` job fails, check the job logs in GitHub Actions — the error includes
  the Prisma migration name that failed.
