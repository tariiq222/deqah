# Deqah — Deployment Guide

## Architecture Overview

```
Developer Machine
       │
       │  git push origin develop
       ▼
  GitHub (develop branch)
  [full monorepo: tests, docs, CLAUDE.md, plans]
       │
       │  Manual: "Promote develop → main" workflow
       │          (gh workflow run promote-to-main.yml -f confirm=promote)
       ▼
  promote-to-main.yml
  (sanitizer strips: docs/, data/, CLAUDE.md, AGENTS.md,
   all *.test.ts, internal READMEs, .github/ except build-images.yml)
  → force-push to main
       │
       ├─ dispatches ──────────────────────────────────────────────────────────┐
       ▼                                                                       │
  GitHub (main branch)                                              build-images.yml
  [clean deploy source]                                       (parallel matrix: 4 apps)
                                                                               │
                                                                     push images to ghcr.io
                                                                               ▼
                                                               ghcr.io/tariiq222/
                                                               ├── deqah-backend:{latest,sha,date,vX.Y.Z}
                                                               ├── deqah-dashboard:{latest,sha,date,vX.Y.Z}
                                                               ├── deqah-admin:{latest,sha,date,vX.Y.Z}
                                                               └── deqah-website:{latest,sha,date,vX.Y.Z}
                                                                               │
                                                                  Manual click in Dokploy UI
                                                                               │
                                                                               ▼
                                                               Hostinger KVM 2 VPS — 72.61.89.152
                                                               (8GB RAM, 2 vCPU, Ubuntu 24.04)
                                                               ├── backend   → api.deqah.net    :5100
                                                               ├── dashboard → app.deqah.net    :3000
                                                               ├── admin     → admin.deqah.net  :3000
                                                               └── website   → deqah.net        :3000
                                                               Internal services (Dokploy-managed):
                                                               ├── postgres + pgvector
                                                               ├── redis
                                                               └── minio
```

### Key design decisions

- **Builds happen on GitHub Actions (14GB RAM). Never on the VPS.** KVM 2 has ~5GB available after
  Postgres/Redis/MinIO; a full 4-app monorepo build peaks at 3–4GB and would OOM-kill or take 30+
  minutes on VPS.
- **VPS only pulls pre-built images from ghcr.io.** Each image is 50–200MB pulled, not built.
- **`develop` is the daily working branch.** It contains everything: tests, CLAUDE.md, docs, plans.
  Push freely.
- **`main` is the deploy source.** It is a clean orphan branch auto-produced by the sanitizer on
  every promote. Never push to `main` directly.
- **Deploys are always manual.** There is no auto-deploy on image push. The deliberate gate prevents
  accidental production changes.

### Monorepo structure (what gets deployed)

```
deqah/ (tariiq222/deqah on GitHub)
├── apps/
│   ├── backend/     → deqah-backend image    (NestJS, port 5100)
│   ├── dashboard/   → deqah-dashboard image  (Next.js per-tenant clinic dashboard, port 3000)
│   ├── admin/       → deqah-admin image      (Next.js super-admin control plane, port 3000)
│   └── website/     → deqah-website image    (Next.js public marketing site, port 3000)
└── packages/
    ├── shared/      → compiled into images (types, enums, i18n tokens)
    ├── api-client/  → bundled into images  (typed fetch client)
    └── ui/          → bundled into images  (33 design-system primitives)
```

See [docker-architecture.md](./docker-architecture.md) for the 4-stage Dockerfile pattern.

---

## The Two Branches

### `develop` — your daily work

- The default branch. All feature development merges here.
- Contains everything: tests, `docs/`, `data/`, `CLAUDE.md`, `AGENTS.md`, plans, internal READMEs.
- CI runs on pushes to `develop` (lint, type-check, unit tests).
- Push freely. This is where you spend 95% of your time.

### `main` — the deploy source

- A clean orphan branch produced entirely by the sanitizer workflow.
- The sanitizer strips: `docs/`, `data/`, all `CLAUDE.md`, `AGENTS.md`, test files, internal
  READMEs, and `.github/` (except `build-images.yml`).
- **Never push to `main` directly.** Any direct push will be overwritten on the next promote.
- `main` exists solely so `build-images.yml` can run on a clean tree.

---

## Daily Workflow

A normal working day:

### 1. Start with `develop`

```bash
cd /Users/tariq/code/carekit
git checkout develop
git pull origin develop
```

### 2. Work and test locally

```bash
# Start infrastructure
npm run docker:up          # PostgreSQL + pgvector, Redis, MinIO

# Start the apps you need
npm run dev:backend        # NestJS on :5100
npm run dev:dashboard      # Next.js dashboard on :5103
npm run dev:admin          # Next.js admin on :5104
npm run dev:website        # Next.js website on :5105

# Or all at once (heavy on RAM)
npm run dev:all
```

Run tests before promoting:

```bash
npm run test               # all unit tests (turbo)
npm run lint               # all linting
```

### 3. Commit and push to develop

```bash
git add -p                 # stage selectively
git commit -m "feat(bookings): add walk-in flow"
git push origin develop
```

### 4. Promote when ready to deploy

When your work is ready for production:

```bash
# Option A: via GitHub CLI (recommended)
gh workflow run promote-to-main.yml -f confirm=promote

# Option B: via GitHub UI
# → Actions → "Promote develop → main (manual)" → Run workflow → type "promote" → confirm
```

The promote workflow takes 1–2 minutes. It sanitizes `develop` and force-pushes to `main`.

### 5. Wait for build-images to complete

After the promote, `build-images.yml` runs automatically on `main`. It builds all 4 apps in
parallel (matrix strategy). Typical time: **5–15 minutes** on warm cache.

Watch at: https://github.com/tariiq222/carekit/actions

All 4 apps must turn green before you deploy. A build failure means the image was not pushed —
do not click Deploy in Dokploy until the build passes.

### 6. Deploy in Dokploy

See the "Manual Deploy in Dokploy" section below.

---

## Releasing a Versioned Release

For semver-tagged milestones (e.g., public launch, major feature delivery):

```bash
# Make sure develop is up to date and tests pass
git checkout develop
git pull origin develop
npm run test

# Release version 0.1.0
./scripts/release.sh 0.1.0
```

`scripts/release.sh` will:
1. Validate you are on `develop` with a clean working tree
2. Bump `package.json` version to `0.1.0`
3. Append a row to `docs/operations/version-history.md`
4. Commit with message: `chore(release): v0.1.0`
5. Tag: `v0.1.0`
6. Push `develop` and the `v0.1.0` tag

The tag push triggers `build-images.yml` on the tag ref. It produces images tagged:
- `v0.1.0` — permanent, pinned to this release
- `<sha>` — the commit SHA
- (not `latest` — tag builds don't update `latest`)

Then promote to get `latest` updated too:

```bash
gh workflow run promote-to-main.yml -f confirm=promote
```

After build completes, deploy in Dokploy.

---

## Manual Deploy in Dokploy (The Deliberate Gate)

Deploys are intentionally manual. The deliberate gate gives you a moment to:
- Confirm the build passed (green in GitHub Actions)
- Choose to deploy only the services that changed (e.g., just `backend`)
- Optionally pin to a specific tag instead of `latest` for a rollback

### Step-by-step

1. **Open Dokploy** — your Dokploy URL on 72.61.89.152
2. Navigate to **Services** (or your project's environment)
3. **For each service that changed** (backend first if schema changed):
   a. Click the service name (e.g., `backend`)
   b. Go to the **General** tab
   c. Confirm the image URL: `ghcr.io/tariiq222/deqah-backend:latest`
      - To pin a specific version: change `latest` to `sha-abc1234` or `v0.1.0`
   d. Click **Save** (top-right corner)
   e. Click **Deploy**
   f. Click **Logs** — watch the deployment output in real time
   g. Wait for: `✓ Deployment completed` or `[NestApplication] Nest application successfully started`
4. Repeat for `dashboard`, `admin`, `website` (order matters — backend first)

### Deploy order

Always deploy in this order when multiple services change:
1. `backend` — migrations run on startup; frontend apps depend on the API
2. `dashboard`
3. `admin`
4. `website`

If only the website changed (purely static), deploy only that.

### Pinning to a specific tag (rollback or canary)

Instead of `latest`, use a specific tag from the image list:

```bash
# List available tags for backend
./scripts/rollback-image.sh backend
```

Then set the tag in Dokploy → General → image tag before clicking Deploy.

---

## Verifying a Deployment

After deploying, run through this checklist:

### 1. Health endpoint

```bash
curl https://api.deqah.net/health
# Expected: {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}}}
```

### 2. Dokploy service status

- All 4 services show **Running** (green) in the Dokploy dashboard
- No containers in restart loops

### 3. GlitchTip error monitoring

- Open GlitchTip at `http://100.124.231.44:8000` (org: webvue)
- Check the `deqah-backend` project — no spike in errors after deploy
- Check `deqah-dashboard`, `deqah-admin`, `deqah-website` for JS errors

### 4. Browser smoke checks

- `https://deqah.net` — public website loads, no console errors
- `https://app.deqah.net` — dashboard login page loads
- `https://admin.deqah.net` — admin login page loads

### 5. Functional smoke test

Log in to the dashboard, create a test booking, confirm it resolves. For a full QA gate,
see `docs/superpowers/qa/` and the Playwright smoke suite:

```bash
cd apps/dashboard
npm run e2e:smoke
```

If anything looks wrong: roll back immediately, investigate after. See
[rollback-runbook.md](./rollback-runbook.md).

---

## Installing Backup Automation (One-Time VPS Setup)

Run this once on a fresh VPS to wire up the daily 03:00 backup cron.

```bash
# Copy scripts to VPS (run from your local machine in repo root)
scp -r scripts/ root@72.61.89.152:/opt/deqah/scripts/
ssh root@72.61.89.152 chmod +x /opt/deqah/scripts/*.sh

# On the VPS, install the cron
sudo bash /opt/deqah/scripts/install-backup-cron.sh

# Edit the backup env file with real credentials
sudo nano /etc/deqah/backup.env
# Set: POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD, MINIO_ALIAS, BACKUP_BUCKET

# Configure MinIO client alias (mc)
mc alias set deqah-minio http://localhost:9000 <access-key> <secret-key>
mc mb deqah-minio/deqah-backups

# Test a manual backup
sudo /opt/deqah/scripts/backup-postgres.sh

# Verify it appeared in MinIO
mc ls deqah-minio/deqah-backups/postgres/
```

The cron will then run daily at 03:00, keeping:
- Local: 7 days of dumps at `/var/backups/deqah/postgres/`
- MinIO: 30 days of dumps at `deqah-backups/postgres/`

### Pre-Deploy Safety Snapshot

In Dokploy, wire up the pre-deploy command so every deploy automatically snapshots the database:

- Service: `backend` → General → Pre-deploy command:
  ```
  /opt/deqah/scripts/backup-pre-deploy.sh
  ```

This stores a snapshot under `deqah-backups/postgres/pre-deploy/pre-deploy-YYYY-MM-DD-HHMM.dump`
before each deploy. Use it as the restore point if a migration goes wrong.

---

## Future: Staging Environment

**Today:** Single environment (production). All testing happens locally on `develop`.

**After upgrade to KVM 8:** Add a staging tier:

- Domain: `staging.deqah.net`, `app-staging.deqah.net`, `admin-staging.deqah.net`
- Images: `:staging-<sha>` prefix produced by a new `build-images-staging.yml` workflow
- A new `staging` branch between `develop` and `main` (separate sanitizer)
- Dokploy second project (or service group) on the same KVM 8 VPS
- Auto-deploy on push to `staging` (unlike production, which stays manual)

The `develop` → `main` flow doesn't change. Staging will be an intermediate step:
`develop` → `staging` (auto-deploy) → manual promote to `main` → manual deploy to prod.

Until then: test locally, promote directly to production.

---

## Cross-References

- Image build details: [docker-architecture.md](./docker-architecture.md)
- Rolling back a bad deploy: [rollback-runbook.md](./rollback-runbook.md)
- Version history: [version-history.md](./version-history.md)
- Disaster recovery: [disaster-recovery.md](./disaster-recovery.md)
