# syntax=docker/dockerfile:1.6
# Deqah Backend — NestJS 11 + Prisma 7
# Build context MUST be the monorepo root.
#
# Stage 1 (deps):         install all workspace deps — cached layer keyed on lockfile
# Stage 2 (shared-build): compile packages/shared into dist/ — fixes TS2307 on @deqah/shared/* imports
# Stage 3 (app-build):    compile the NestJS app consuming the built shared dist
# Stage 4 (runner):       minimal runtime image
#
# Why shared-build re-runs pnpm install instead of copying node_modules from deps:
#   pnpm with hoisted linker skips devDependencies for workspace packages when
#   only stub package.json files are present (no source). typescript ends up missing.
#   The deps stage still provides a cached download layer; shared-build installs
#   with full source present so devDeps (typescript) are correctly resolved.

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# Copy only manifests — this layer is cached until any package.json/lockfile changes
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/backend/package.json             ./apps/backend/
COPY packages/shared/package.json          ./packages/shared/
COPY packages/api-client/package.json      ./packages/api-client/
COPY packages/ui/package.json              ./packages/ui/

RUN pnpm install --frozen-lockfile

# ── Stage 2: shared-build ────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS shared-build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

# Copy manifests + lockfile so pnpm install is a cache hit when nothing changed
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json          ./packages/shared/
COPY packages/api-client/package.json      ./packages/api-client/
COPY packages/ui/package.json              ./packages/ui/
# Backend package.json needed so pnpm workspace resolution is complete
COPY apps/backend/package.json             ./apps/backend/

# Install with full workspace context so devDeps (typescript) are included
RUN pnpm install --frozen-lockfile

# Now copy sources and build
COPY packages/ ./packages/
# packages/shared imports SubscriptionStatus from @prisma/client (generated types).
# Run prisma generate here so the generated client exists before tsc runs.
COPY apps/backend/prisma          ./apps/backend/prisma
COPY apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
RUN pnpm --filter=backend run prisma:generate
# pnpm resolves tsc via .pnpm store symlinks, but with hoisted linker typescript
# lands at node_modules/typescript/ (not .pnpm/). Invoke tsc directly.
RUN cd /app/packages/shared && node /app/node_modules/typescript/bin/tsc -p tsconfig.json && ls -la dist/ && test -f dist/constants/feature-keys.js

# Manually establish node_modules/@deqah/* → packages/* symlinks so consumers
# resolve via the package.json#exports map. pnpm's hoisted linker doesn't
# always create these reliably for workspace packages with empty stubs at
# install time. Force them to exist now that dist/ is built.
RUN mkdir -p /app/node_modules/@deqah \
 && rm -rf /app/node_modules/@deqah/shared /app/node_modules/@deqah/api-client /app/node_modules/@deqah/ui \
 && ln -sf /app/packages/shared     /app/node_modules/@deqah/shared \
 && ln -sf /app/packages/api-client /app/node_modules/@deqah/api-client \
 && ln -sf /app/packages/ui         /app/node_modules/@deqah/ui \
 && test -f /app/node_modules/@deqah/shared/dist/constants/feature-keys.js \
 && test -f /app/node_modules/@deqah/shared/dist/constants/feature-keys.d.ts

# ── Stage 3: app-build ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS app-build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY --from=shared-build /app/node_modules ./node_modules
COPY --from=shared-build /app/packages     ./packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/backend/ ./apps/backend/

# Verify shared dist survived the COPY (catch issues early with clear message)
RUN test -f /app/packages/shared/dist/constants/feature-keys.js \
  || (echo "❌ packages/shared/dist/ missing in app-build — COPY from shared-build failed" && exit 1)

# Run prisma generate via direct binary path (avoids pnpm's lifecycle re-install)
RUN cd /app/apps/backend && /app/node_modules/.bin/prisma generate --schema=prisma/schema

# Verify shared dist STILL there after prisma generate
RUN test -f /app/packages/shared/dist/constants/feature-keys.js \
  || (echo "❌ packages/shared/dist/ wiped by prisma generate" && exit 1)

# Diagnose @deqah/shared resolution from backend's perspective
RUN echo "=== node_modules/@deqah/shared ===" \
 && ls -la /app/node_modules/@deqah/ 2>&1 || true \
 && echo "=== resolved path ===" \
 && readlink -f /app/node_modules/@deqah/shared 2>&1 || true \
 && echo "=== exists check ===" \
 && ls /app/node_modules/@deqah/shared/dist/constants/feature-keys.d.ts 2>&1 || true

# Force-recreate symlink to packages/shared to ensure dist is reachable
RUN mkdir -p /app/node_modules/@deqah \
 && rm -rf /app/node_modules/@deqah/shared /app/node_modules/@deqah/api-client \
 && ln -sf /app/packages/shared     /app/node_modules/@deqah/shared \
 && ln -sf /app/packages/api-client /app/node_modules/@deqah/api-client \
 && test -f /app/node_modules/@deqah/shared/dist/constants/feature-keys.d.ts \
  || (echo "❌ symlink fix failed — d.ts not reachable" && exit 1)

# Re-run pnpm install in app-build to ensure all types are properly hoisted
# now that source is present. Uses --frozen-lockfile + --prefer-offline to be
# fast (cache hit on the deps from earlier stages).
RUN pnpm install --frozen-lockfile --prefer-offline

# Verify shared dist still survives + symlink it back if pnpm wiped it
RUN test -f /app/packages/shared/dist/constants/feature-keys.js \
  || (echo "❌ packages/shared/dist/ wiped by pnpm install" && exit 1) \
 && mkdir -p /app/node_modules/@deqah \
 && rm -rf /app/node_modules/@deqah/shared /app/node_modules/@deqah/api-client \
 && ln -sf /app/packages/shared     /app/node_modules/@deqah/shared \
 && ln -sf /app/packages/api-client /app/node_modules/@deqah/api-client \
 && test -f /app/node_modules/@deqah/shared/dist/constants/feature-keys.d.ts \
  || (echo "❌ symlink fix failed" && exit 1) \
 && test -f /app/node_modules/@types/uuid/index.d.ts \
  || (echo "❌ @types/uuid still missing after pnpm install" && exit 1)

RUN cd /app/apps/backend && /app/node_modules/.bin/nest build

# ── Stage 4: runner ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5100

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates wget curl \
 && rm -rf /var/lib/apt/lists/*

# Workspace layout the runner needs:
#   /app/node_modules/             — prod deps
#   /app/packages/shared/dist/    — compiled shared (symlinked via @deqah/shared)
#   /app/packages/api-client/src/ — api-client (no build step; consumed directly)
#   /app/apps/backend/dist/        — compiled NestJS
#   /app/apps/backend/prisma/      — schema + migrations
COPY --from=app-build /app/node_modules                       ./node_modules
COPY --from=app-build /app/package.json                       ./package.json
COPY --from=app-build /app/pnpm-workspace.yaml                ./pnpm-workspace.yaml
COPY --from=app-build /app/packages                           ./packages
COPY --from=app-build /app/apps/backend/package.json          ./apps/backend/package.json
COPY --from=app-build /app/apps/backend/prisma.config.ts      ./apps/backend/prisma.config.ts
COPY --from=app-build /app/apps/backend/prisma                ./apps/backend/prisma
COPY --from=app-build /app/apps/backend/dist                  ./apps/backend/dist

# Ensure pnpm workspace symlinks resolve at runtime
RUN mkdir -p /app/node_modules/@deqah \
 && rm -rf /app/node_modules/@deqah/shared /app/node_modules/@deqah/api-client \
 && ln -sf /app/packages/shared     /app/node_modules/@deqah/shared \
 && ln -sf /app/packages/api-client /app/node_modules/@deqah/api-client

WORKDIR /app/apps/backend
EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5100/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node --import tsx dist/main.js"]
