# Deploy pipeline — pre-deploy migration hook (2026-05-08)

**Owner:** @tariq
**Trigger:** P1-9 of pre-launch fixes — `prisma migrate deploy` removed from container CMD.

## What changed

- Backend Dockerfile runner now runs as non-root `app` (uid 1001).
- CMD only starts `node` — migrations no longer race across replicas or rerun on every Swarm rollback.

## Required Dokploy configuration

After this image rolls out, the Dokploy service for `apps/backend` must run migrations as a **separate one-shot step** before the new replicas start:

1. Dokploy → backend service → Pre-Deploy Command:

   ```
   docker run --rm \
     --env-file /etc/dokploy/secrets/backend.env \
     ghcr.io/<org>/deqah-backend:<tag> \
     sh /app/apps/backend/scripts/migrate.sh
   ```

2. **Failure here MUST abort the rollout** — do not let new replicas boot against an out-of-sync schema.

3. The new replicas no longer attempt `prisma migrate deploy` themselves. If you skip the pre-deploy step, the app starts but the schema may lag.

## Verification

- `docker run --rm --entrypoint sh ghcr.io/<org>/deqah-backend:<tag> -c 'id'` → `uid=1001(app) gid=1001(app)`
- `docker run --rm --entrypoint sh ghcr.io/<org>/deqah-backend:<tag> -c 'ls /app/apps/backend/scripts/migrate.sh'` → file exists, executable.
- After a successful deploy with the hook configured: backend `/api/v1/health` returns 200 and `_prisma_migrations` table reflects all migrations.
