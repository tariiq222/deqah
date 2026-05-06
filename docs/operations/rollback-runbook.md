# Deqah — Rollback Runbook

Use this document when a deployment causes problems and needs to be reversed quickly. The rule is:
**roll back first, investigate after.**

---

## When to Roll Back

Roll back immediately if you observe any of these symptoms **after a deploy**:

### Hard rollback triggers (do not wait)
- Service not responding — `curl https://api.deqah.net/health` returns 5xx or times out for > 2 minutes
- New errors flooding GlitchTip (`http://100.124.231.44:8000`) immediately after deploy
- Login completely broken — OTP sent but JWT not issued, or refresh loop
- Payment processing broken — Moyasar webhooks failing, charges not recording
- Booking flow broken — create/cancel/confirm returning errors
- Container restart loop — Dokploy shows service cycling repeatedly
- Next.js app white screen or module-not-found on first load
- Database migration errors in backend startup logs

### Performance rollback triggers
- p95 API latency > 3× baseline (check GlitchTip performance data)
- Memory leak visible in Dokploy metrics within 10 minutes of deploy

### Do NOT roll back for
- Errors that pre-date the deploy (check git log / GlitchTip — confirm they're new)
- Minor UI glitches that don't block core flows (can fix-forward)
- A feature working differently than expected (functional, not broken)
- Test/staging issues (we have one environment; verify locally first)

---

## Rolling Back a Single Service

### Step 1: Identify the last good image tag

```bash
# From your local machine
./scripts/rollback-image.sh backend
# (accepts: backend | dashboard | admin | website)
```

Output shows recent ghcr.io tags with timestamps. Pick the tag from before the bad deploy.
Common choices:
- `sha-abc1234` — SHA of a specific commit (most precise)
- `2026-05-05` — yesterday's date tag
- `v0.9.0` — the last semver release

If you do not have the script locally, query the GitHub API:

```bash
gh api /users/tariiq222/packages/container/deqah-backend/versions \
  --jq '.[].metadata.container.tags'
```

### Step 2: Roll back in Dokploy

1. Open Dokploy → Services → click the failing service (e.g., `backend`)
2. **General** tab → Image Tag field
3. Replace `latest` with your chosen tag: `sha-abc1234`
4. Click **Save** (top-right)
5. Click **Deploy**
6. Watch **Logs** in real time — wait for clean startup:
   - Backend: `[NestApplication] Nest application successfully started`
   - Next.js: `Ready in Xms`

### Step 3: Verify recovery

```bash
# Backend health
curl https://api.deqah.net/health

# Test an authenticated endpoint (use a valid token)
curl -H "Authorization: Bearer <token>" https://api.deqah.net/api/v1/dashboard/stats

# Check GlitchTip — errors should stop arriving
# http://100.124.231.44:8000 → deqah-backend project
```

### Step 4: Pin until fixed

After rollback, `latest` in ghcr.io still points to the broken image. Leave the service pinned to
the specific good tag until the bug is fixed in `develop` and a new deploy is promoted.

Do not switch back to `latest` until the root cause is resolved.

### Step 5: Fix forward

1. Fix the bug on `develop`
2. Test locally
3. Promote: `gh workflow run promote-to-main.yml -f confirm=promote`
4. Wait for build to complete
5. Deploy the fixed image in Dokploy (now you can set the tag back to `latest`)

---

## Rolling Back a Database Migration

If the bad deploy included a Prisma migration, this is harder than an image rollback.

**Golden rule:** Migrations are immutable. You cannot edit or delete a migration file.
See: [migration-rollback-runbook.md](./migration-rollback-runbook.md)

### Approach A: Compensating migration (preferred, no data loss)

Write a new forward migration that reverses the problematic schema change. Deploy it.
Use this when:
- The migration ran successfully but the new schema causes bugs
- No data loss from the bad migration
- The old schema is safe to restore structurally

### Approach B: Restore from backup (data loss risk)

Use this only when:
- The migration corrupted data irreversibly
- There is no other way to recover integrity
- You have a clean backup from before the migration ran

Steps:
1. **Stop all services in Dokploy** (backend + any cron containers)
2. Identify the pre-deploy backup:
   ```bash
   ssh root@72.61.89.152
   mc ls deqah-minio/deqah-backups/postgres/pre-deploy/
   # pick the snapshot timestamped just before the bad deploy
   ```
3. Restore:
   ```bash
   sudo /opt/deqah/scripts/restore-postgres.sh pre-deploy-2026-05-06-1430.dump --yes-i-am-sure
   ```
4. Roll back the backend image to the version that matches the restored schema:
   - The restored DB has the schema from before the migration
   - Running new code against the old schema will fail
   - Roll back the backend image to the pre-migration SHA (see "Rolling Back a Single Service")
5. Restart services in Dokploy
6. Verify: `curl https://api.deqah.net/health`
7. Write a corrective migration on `develop`, test it, then re-deploy

---

## Restoring from Backup

Use this when rolling back the image is not enough — data was corrupted or lost.

### List available backups

```bash
ssh root@72.61.89.152

# Daily automated backups (local)
ls /var/backups/deqah/postgres/

# Daily automated backups (MinIO — 30-day retention)
mc ls deqah-minio/deqah-backups/postgres/

# Pre-deploy snapshots (taken before each deploy)
mc ls deqah-minio/deqah-backups/postgres/pre-deploy/
```

Backup filename formats:
- Daily: `postgres-YYYY-MM-DD-HHMM.dump`
- Pre-deploy: `pre-deploy-YYYY-MM-DD-HHMM.dump`

Pick the most recent backup from **before the incident**.

### Run the restore

```bash
# On VPS
sudo /opt/deqah/scripts/restore-postgres.sh postgres-2026-05-06-0300.dump --yes-i-am-sure
```

The script will:
1. Download the specified backup from MinIO (if not already on local disk)
2. Stop the backend container via Docker
3. Drop the `deqah` database
4. Recreate the `deqah` database
5. Run `pg_restore` to load the dump
6. Restart the backend container

After restore:

```bash
# Verify health
curl https://api.deqah.net/health

# Verify migration state
docker exec deqah-database-jeprin psql -U deqah-database -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 10;"
```

**Important:** If the backup pre-dates some migrations that were already in production, NestJS will
attempt to re-run them on startup via `prisma migrate deploy`. This is expected and safe — Prisma
only runs migrations not yet recorded in `_prisma_migrations`.

---

## Total Disaster Recovery

For the scenario where the VPS itself is lost (not just a bad deploy). See
[disaster-recovery.md](./disaster-recovery.md) for full detail.

Quick summary:

1. Provision a new VPS — Hostinger KVM 2 or equivalent
2. Install Docker + Dokploy
3. Restore Postgres from the latest off-VPS backup (if you set up Backblaze B2 replication)
4. Recreate all 4 services in Dokploy with image tags from the last known-good deploy
5. Re-enter all environment variables (from your secure vault)
6. Update DNS A records to the new IP
7. Verify and smoke test

The main risk: MinIO backups are on the same VPS. If the VPS is gone, local MinIO backups go with
it. **Mitigation (not yet set up):** replicate the `deqah-backups` bucket to Backblaze B2 or
Cloudflare R2. Add this to the infrastructure backlog.

---

## Rollback Decision Tree

```
Deploy just happened → something is broken
        │
        ▼
Is it a 5xx / crash / auth failure?
        │
        YES → roll back image immediately (< 5 min)
        NO  → is it a performance regression?
                  │
                  YES, p95 > 3× → roll back image
                  NO → investigate, fix forward
        │
        ▼
After image rollback: did it fix the issue?
        │
        YES → root cause investigation, fix on develop, re-deploy
        NO  → was there a migration?
                  │
                  YES → restore from pre-deploy backup + roll back image
                  NO  → escalate, check infra (Postgres, Redis, MinIO health)
```

---

## Cross-References

- Deploying: [deployment-guide.md](./deployment-guide.md)
- Migration rollbacks: [migration-rollback-runbook.md](./migration-rollback-runbook.md)
- Full VPS loss: [disaster-recovery.md](./disaster-recovery.md)
- Version history: [version-history.md](./version-history.md)
