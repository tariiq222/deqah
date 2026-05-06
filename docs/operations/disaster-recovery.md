# Deqah — Disaster Recovery Runbook

This is an operational runbook. Each section covers a specific failure scenario with step-by-step recovery procedures. Keep it terse.


## Current Infrastructure State (2026-05-06)

- **VPS:** Hostinger KVM 2, IP 72.61.89.152, Ubuntu 24.04
- **Orchestration:** Dokploy
- **Services:** 4 apps (backend :5100, dashboard :3000, admin :3000, website :3000) + 3 internal (postgres+pgvector, redis, minio)
- **Domains (planned):** `deqah.net`, `app.deqah.net`, `admin.deqah.net`, `api.deqah.net`
- **Backups:** Daily 03:00 cron → `/var/backups/deqah/postgres/` (local 7 days) + MinIO `deqah-backups` bucket (30 days)
- **Known gap:** MinIO backups are on the same VPS. If VPS is lost, local backups go with it.
  Off-VPS replication (Backblaze B2 or Cloudflare R2) is **not yet configured** — add to infra backlog.
- **Images:** Survive VPS loss — always available at `ghcr.io/tariiq222/` as long as GitHub is up.
- **Dokploy config export:** Set up a cron to export Dokploy config (Settings → Export) to an
  encrypted location outside the VPS. Without this, service definitions and env vars must be
  re-entered from memory after a VPS rebuild.

---


## Scenario 1: VPS Gone (Hostinger Outage / Data Loss)

**Trigger:** VPS is unreachable, Hostinger support confirms data is gone or unrecoverable.

**Recovery steps:**

1. Provision a new VPS (Hostinger KVM 2 minimum, or KVM 4+ if available)
2. SSH in, update packages: `apt-get update && apt-get upgrade -y`
3. Install Docker: `curl -fsSL https://get.docker.com | sh`
4. Install Dokploy: follow https://dokploy.com/docs/get-started
5. Update DNS A records to point all 4 domains to the new VPS IP
   - `deqah.app` → new IP
   - `app.deqah.app` → new IP
   - `admin.deqah.app` → new IP
   - `api.deqah.app` → new IP
   - DNS TTL: allow up to 24h propagation (set TTL to 300 before next time)
6. In Dokploy, create 4 services pulling from ghcr.io:
   - `deqah-backend:latest`, `deqah-dashboard:latest`, `deqah-admin:latest`, `deqah-website:latest`
   - Re-enter all environment variables (retrieve from your secure vault / 1Password)
7. If you have a MinIO backup on a separate host, restore the database:
   ```bash
   sudo /opt/deqah/scripts/restore-postgres.sh postgres-YYYY-MM-DD-HHMM.dump --yes-i-am-sure
   ```
8. If no off-VPS backup exists, the database is gone. Notify affected tenants.
9. After restore, run: `curl https://api.deqah.app/health`
10. Verify core flows manually (login, booking creation, payment)

**Gap to close:** MinIO backups are currently on the same VPS. Add Backblaze B2 or Cloudflare R2 as a replication target.

---

## Scenario 2: Container Compromise

**Trigger:** Evidence of unauthorized access inside a running container (unusual process, outbound connections, file modifications in container filesystem).

**Immediate containment:**

1. In Dokploy, stop all 4 services immediately
2. SSH into VPS: `docker ps -a` — note container IDs
3. Capture evidence before destroying: `docker logs <container-id> > /tmp/compromised-logs.txt`
4. Kill compromised containers: `docker stop <id> && docker rm <id>`

**Assessment:**
- If only one container is compromised and others are healthy: the threat is likely limited to that service's scope
- If the host OS is compromised: escalate to full VPS rebuild (Scenario 1)
- Check: `docker inspect <id>` for mounted volumes, network settings that look unexpected

**Recovery:**

1. Pull fresh images (they are signed at build time by GitHub Actions):
   ```bash
   docker pull ghcr.io/tariiq222/deqah-backend:latest
   ```
2. Rotate all secrets immediately:
   - JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_OTP_SECRET`, `JWT_CLIENT_ACCESS_SECRET`)
   - Moyasar API keys (platform and per-tenant)
   - SMS provider encryption key (`SMS_PROVIDER_ENCRYPTION_KEY`)
   - Zoom encryption key (`ZOOM_PROVIDER_ENCRYPTION_KEY`)
   - Resend API key
   - MinIO credentials
3. Update environment variables in Dokploy with new secrets
4. Redeploy all services
5. Invalidate all active JWT sessions by changing JWT secrets (all users will be logged out)
6. Audit `SuperAdminActionLog` for suspicious actions
7. Audit `FailedLoginAttempt` at `/settings/security` in the admin panel

---

## Scenario 3: Database Corruption

**Trigger:** Postgres errors in backend logs (`ERROR: invalid page`, `could not read block`, `index corrupted`), or data queries returning inconsistent results.

**Immediate:**

1. Take a backup of the corrupted state (for forensics — do not overwrite your clean backup):
   ```bash
   docker exec deqah-database-jeprin pg_dump -U deqah-database -Fc postgres > /tmp/corrupted-$(date +%F).dump
   ```
2. Stop the backend to prevent further writes: stop via Dokploy
3. Identify the most recent clean backup:
   ```bash
   mc ls deqah-minio/deqah-backups/postgres/
   ```

**Recovery:**

```bash
sudo /opt/deqah/scripts/restore-postgres.sh postgres-YYYY-MM-DD-HHMM.dump --yes-i-am-sure
```

After restore:
- Restart backend via Dokploy
- Run: `curl https://api.deqah.app/health`
- Check Prisma migration state: the backend's startup runs `prisma migrate deploy` automatically
- If migrations are missing (restore was from an older backup), they will be re-applied on startup

**Data loss assessment:** Identify the time gap between the clean backup and the corruption event. Notify tenants of any transactions that were lost.

---

## Scenario 4: ghcr.io Outage

**Trigger:** GitHub Container Registry is down. `docker pull` fails. Dokploy cannot pull new images.

**Severity:** Existing running containers continue to work fine. Only new deploys or container restarts that require a fresh pull are affected.

**Response:**

1. Do not restart any services (running containers use cached images)
2. Monitor https://www.githubstatus.com/ for restoration
3. If you need to deploy urgently during an outage:
   - Build locally: `docker build -f apps/backend/Dockerfile -t deqah-backend:emergency --target runner .`
   - Copy to VPS: `docker save deqah-backend:emergency | ssh user@vps docker load`
   - Retag and run on VPS: `docker tag deqah-backend:emergency ghcr.io/tariiq222/deqah-backend:latest`
   - Restart via Dokploy pointing to local image
4. Once ghcr.io recovers, resume normal promote → build → deploy flow

---

## Scenario 5: GitHub Down

**Trigger:** github.com is unreachable. Cannot push code, cannot trigger workflows.

**Severity:** No new deploys can happen through the normal pipeline. Existing production services continue running.

**Response:**

1. Do not attempt to deploy during the outage — running services are unaffected
2. Continue working locally on `develop`
3. Monitor https://www.githubstatus.com/
4. Once GitHub recovers, `git push origin develop` as normal and promote

**If emergency deploy is needed during GitHub outage:**
- Build images locally and copy to VPS directly (same as ghcr.io outage scenario above)
- This should be rare — plan accordingly

---

## Environment Variables Reference

All environment variables must be stored in a secure vault (1Password, Bitwarden, or similar) independent of the VPS. If the VPS is gone, you need these to redeploy.

**Backend required vars:**
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_OTP_SECRET`, `JWT_CLIENT_ACCESS_SECRET`
- `SMS_PROVIDER_ENCRYPTION_KEY`, `ZOOM_PROVIDER_ENCRYPTION_KEY`
- `CORS_ORIGINS`
- `REDIS_URL`
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
- `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO`
- `OPENROUTER_API_KEY`
- `MOYASAR_SECRET_KEY` (platform account)
- `ADMIN_HOSTS`
- `PLATFORM_DASHBOARD_URL`

**Next.js apps:**
- `NEXT_PUBLIC_API_URL`
- `SENTRY_AUTH_TOKEN` (build-time only, not runtime)

**Backup script (`/etc/deqah/backup.env`):**
- `POSTGRES_USER`, `POSTGRES_DB`

---

## Cross-References

- Deployment pipeline: [deployment-guide.md](./deployment-guide.md)
- Rolling back a bad deploy: [rollback-runbook.md](./rollback-runbook.md)
- Rolling back a migration: [migration-rollback-runbook.md](./migration-rollback-runbook.md)
- Docker image architecture: [docker-architecture.md](./docker-architecture.md)
- Version history: [version-history.md](./version-history.md)

## Estimated Recovery Times

| Scenario | Severity | Typical RTO |
|----------|----------|-------------|
| Single container restart loop | Low | 5 min (rollback image) |
| Bad deploy, no migration | Low | 10 min (rollback + verify) |
| Bad deploy with migration | Medium | 30–60 min (DB restore + image rollback) |
| VPS gone, off-VPS backup exists | High | 1–2 hours |
| VPS gone, no off-VPS backup | Critical | 1–2 hours + data loss |
| DB corruption | High | 30–60 min + data loss window |
| ghcr.io outage | Low | No action needed (running services unaffected) |
| GitHub outage | Low | No action needed (running services unaffected) |

DNS propagation (up to 24h) is not included in RTO estimates. Set DNS TTL to 300 before any
planned VPS migration to minimize propagation delay.
