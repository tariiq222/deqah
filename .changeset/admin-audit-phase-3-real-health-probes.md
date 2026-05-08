---
"backend": patch
---

Phase 3/8 of 2026-05-08 admin audit fixes — real system-health probes.

Replaces env-only "health" checks (which reported `'ok'` if env vars existed) with real round-trip probes for every subsystem:

- **Postgres**: `SELECT 1`
- **Redis**: `getClient().ping()` against the shared ioredis client
- **BullMQ**: `getQueue('platform-mail').client.ping()` (probes the BullMQ-specific ioredis connection)
- **MinIO**: `bucketExists(MINIO_BUCKET)` — added a small `bucketExists` method to `MinioService`
- **Moyasar**: `GET https://api.moyasar.com/v1/payments?per_page=1` with the platform secret key
- **Resend**: `GET https://api.resend.com/api-keys` with `RESEND_API_KEY`

All probes wrapped in a 5-second timeout via `Promise.race`. Failures surface as `{ status: 'down', detail }`. Auth failures (401) and 5xx surface as `'degraded'`. `latencyMs` recorded for every probe even on failure.

Frontend `apps/admin/app/(admin)/settings/health/page.tsx` already renders `latencyMs` + `detail` + `status` correctly — no FE change needed.

Closes audit finding **P0 #3** (health checks were fake env-checks).

Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.
