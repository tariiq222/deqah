# syntax=docker/dockerfile:1.6
# Deqah Marketing Site — Next.js 15 standalone build.
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
COPY apps/marketing/package.json       ./apps/marketing/
COPY packages/shared/package.json      ./packages/shared/
COPY packages/api-client/package.json  ./packages/api-client/
COPY packages/ui/package.json          ./packages/ui/

RUN pnpm install --frozen-lockfile

# ── Stage 2: shared-build ────────────────────────────────────────────────────
# Compiles packages/shared → dist/ so consuming apps can resolve its exports.
FROM node:20-bookworm-slim AS shared-build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/shared/package.json      ./packages/shared/
COPY packages/api-client/package.json  ./packages/api-client/
COPY packages/ui/package.json          ./packages/ui/
COPY apps/marketing/package.json       ./apps/marketing/
COPY apps/backend/package.json         ./apps/backend/

# Full install so devDeps (typescript) and prisma CLI are available
RUN pnpm install --frozen-lockfile

COPY packages/ ./packages/
# packages/shared imports SubscriptionStatus from @prisma/client (generated types).
# Run prisma generate so the generated client exists before tsc compiles shared.
COPY apps/backend/prisma           ./apps/backend/prisma
COPY apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts
RUN pnpm --filter=backend run prisma:generate
RUN cd /app/packages/shared && node /app/node_modules/typescript/bin/tsc -p tsconfig.json && test -f dist/constants/feature-keys.js

# Establish node_modules/@deqah/* symlinks
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
COPY apps/marketing/ ./apps/marketing/

# Add arch-native Tailwind/lightningcss binaries needed by next build
RUN ARCH=$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/') \
 && pnpm add -w --ignore-scripts=false \
      lightningcss-linux-${ARCH}-gnu \
      @tailwindcss/oxide-linux-${ARCH}-gnu

RUN pnpm --filter=@deqah/marketing run build

# ── Stage 4: runner ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5106
ENV HOSTNAME=0.0.0.0

COPY --from=app-build /app/apps/marketing/.next/standalone ./
COPY --from=app-build /app/apps/marketing/.next/static     ./apps/marketing/.next/static

EXPOSE 5106

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5106',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/marketing/server.js"]
