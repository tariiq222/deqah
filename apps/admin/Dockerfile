# syntax=docker/dockerfile:1.6
# Deqah Super-Admin — Next.js 15 production build (App Router).
# Build context MUST be the monorepo root.
#
# Stage 1 (deps):         install all workspace deps — cached layer
# Stage 2 (shared-build): compile packages/shared into dist/ — fixes TS2307
# Stage 3 (app-build):    compile the Next.js app (adds arch-native CSS binaries here)
# Stage 4 (runner):       minimal runtime image
#
# Note: Admin does NOT have output:'standalone' in next.config.mjs,
# so the runner copies the full .next + node_modules.

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/admin/package.json           ./apps/admin/
COPY packages/shared/package.json      ./packages/shared/
COPY packages/api-client/package.json  ./packages/api-client/
COPY packages/ui/package.json          ./packages/ui/

RUN pnpm install --frozen-lockfile

# ── Stage 2: shared-build ────────────────────────────────────────────────────
# Compiles packages/shared → dist/ so consuming apps can resolve its exports.
# Does NOT install arch-native CSS binaries — those are only needed by next build.
FROM node:20-bookworm-slim AS shared-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json      ./packages/shared/
COPY packages/api-client/package.json  ./packages/api-client/
COPY packages/ui/package.json          ./packages/ui/
COPY apps/admin/package.json           ./apps/admin/
COPY apps/backend/package.json         ./apps/backend/

# Full install so devDeps (typescript) and prisma CLI are available
RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
# packages/shared imports SubscriptionStatus from @prisma/client (generated types).
# Run prisma generate so the generated client exists before tsc compiles shared.
COPY apps/backend/prisma           ./apps/backend/prisma
COPY apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
RUN pnpm --filter=backend run prisma:generate
# Invoke tsc directly — hoisted linker puts typescript at node_modules/typescript/,
# not in the .pnpm store that pnpm's script runner expects.
RUN cd /app/packages/shared && node /app/node_modules/typescript/bin/tsc -p tsconfig.json && test -f dist/constants/feature-keys.js

# Establish node_modules/@deqah/* symlinks pointing to packages/* (see backend note)
RUN mkdir -p /app/node_modules/@deqah \
 && rm -rf /app/node_modules/@deqah/shared /app/node_modules/@deqah/api-client /app/node_modules/@deqah/ui \
 && ln -sf /app/packages/shared     /app/node_modules/@deqah/shared \
 && ln -sf /app/packages/api-client /app/node_modules/@deqah/api-client \
 && ln -sf /app/packages/ui         /app/node_modules/@deqah/ui \
 && test -f /app/node_modules/@deqah/shared/dist/constants/feature-keys.js

# ── Stage 3: app-build ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS app-build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY --from=shared-build /app/node_modules ./node_modules
COPY --from=shared-build /app/packages     ./packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/admin/ ./apps/admin/

# Add arch-native Tailwind/lightningcss binaries needed by next build
RUN ARCH=$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/') \
 && pnpm add -w --ignore-scripts=false \
      lightningcss-linux-${ARCH}-gnu \
      @tailwindcss/oxide-linux-${ARCH}-gnu

RUN pnpm --filter=admin run build

# ── Stage 4: runner ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5104
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=app-build /app/node_modules                  ./node_modules
COPY --from=app-build /app/package.json                  ./package.json
COPY --from=app-build /app/packages                      ./packages
COPY --from=app-build /app/apps/admin/package.json       ./apps/admin/package.json
COPY --from=app-build /app/apps/admin/next.config.mjs    ./apps/admin/next.config.mjs
COPY --from=app-build /app/apps/admin/.next              ./apps/admin/.next

WORKDIR /app/apps/admin
EXPOSE 5104

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:5104 || exit 1

CMD ["npx", "next", "start", "-p", "5104", "-H", "0.0.0.0"]
