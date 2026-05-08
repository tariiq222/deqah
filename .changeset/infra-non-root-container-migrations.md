---
"backend": patch
---

The backend container now runs as a non-root user and Prisma migrations have been moved out of the container CMD into an explicit `migrate.sh` step invoked by Dokploy, so a crashing migration no longer takes down rollback-able replicas (PR #157).
