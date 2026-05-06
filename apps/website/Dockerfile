# syntax=docker/dockerfile:1.6
# Deqah Public Website — Next.js 15 standalone build.
# Build context MUST be the monorepo root.
#
# Stage 1 (deps):         install all workspace deps — cached layer
# Stage 2 (shared-build): compile packages/shared into dist/ — fixes TS2307
# Stage 3 (app-build):    compile the Next.js app (standalone output)
# Stage 4 (runner):       minimal runtime — only standalone/ + static assets

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/website/package.json         ./apps/website/
COPY packages/shared/package.json      ./packages/shared/
COPY packages/api-client/package.json  ./packages/api-client/

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
COPY apps/website/package.json         ./apps/website/
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
RUN node /app/node_modules/typescript/bin/tsc -p /app/packages/shared/tsconfig.json

# ── Stage 3: app-build ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS app-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY --from=shared-build /app/node_modules ./node_modules
COPY --from=shared-build /app/packages     ./packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/website/ ./apps/website/

# Add arch-native Tailwind/lightningcss binaries needed by next build
RUN ARCH=$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/') \
 && pnpm add -w --ignore-scripts=false \
      lightningcss-linux-${ARCH}-gnu \
      @tailwindcss/oxide-linux-${ARCH}-gnu

RUN pnpm --filter=website run build

# ── Stage 4: runner ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5105
ENV HOSTNAME=0.0.0.0

# Website uses output:'standalone' with outputFileTracingRoot=monorepo root,
# so the standalone dir mirrors the monorepo layout. We copy it to /app.
COPY --from=app-build /app/apps/website/.next/standalone ./
COPY --from=app-build /app/apps/website/.next/static     ./apps/website/.next/static

EXPOSE 5105

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:5105 || exit 1

CMD ["node", "apps/website/server.js"]
