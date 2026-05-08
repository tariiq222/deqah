---
---

ci: add pre-deploy gates to build-images pipeline

- Automated `prisma migrate deploy` job runs before Dokploy webhooks fire;
  migration failure blocks all deployments.
- Optional SSH pre-deploy DB backup (gated behind `BACKUP_ENABLED` variable).
- GHCR package visibility auto-check sets new packages to public after push.
- Changeset-aware build matrix reads `.deploy-manifest.json` written by
  promote-to-main before sanitization, building only affected apps.
- `workflow_dispatch.force_build_all` input forces a full 4-app rebuild.
- `scripts/ci/check-env-drift.mjs` detects drift between Joi schema and
  `docker/.env.prod.example`; wired into CI as a new `env-drift` job.
- `docker/.env.prod.example` fully updated to match all 28 Joi required keys.
