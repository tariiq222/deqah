# syntax=docker/dockerfile:1.6
# Deqah Dashboard — Next.js 15 production build (App Router).
# Build context MUST be the monorepo root.
#
# Stage 1 (deps):         install all workspace deps — cached layer
# Stage 2 (shared-build): compile packages/shared into dist/ — fixes TS2307
# Stage 3 (app-build):    compile the Next.js app (adds arch-native CSS binaries here)
# Stage 4 (runner):       minimal standalone runtime image

# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.10.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/dashboard/package.json       ./apps/dashboard/
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
COPY apps/dashboard/package.json       ./apps/dashboard/
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
COPY apps/dashboard/ ./apps/dashboard/

# Add arch-native Tailwind/lightningcss binaries needed by next build
RUN ARCH=$(uname -m | sed 's/aarch64/arm64/;s/x86_64/x64/') \
 && pnpm add -w --ignore-scripts=false \
      lightningcss-linux-${ARCH}-gnu \
      @tailwindcss/oxide-linux-${ARCH}-gnu

# Next.js bakes NEXT_PUBLIC_* into the JS bundle at build time.
# These ARGs are passed via --build-arg from the GitHub Actions workflow.
# WARNING: defaults are localhost/test placeholders — always pass real values in CI.
ARG NEXT_PUBLIC_API_URL=http://localhost:5100/api/v1
ARG NEXT_PUBLIC_HCAPTCHA_SITE_KEY=8c765c14-831e-4a76-a1c0-0e3eac06c7f6
ARG NEXT_PUBLIC_MOYASAR_PLATFORM_PUBLISHABLE_KEY=pk_test_replace_me
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_HCAPTCHA_SITE_KEY=$NEXT_PUBLIC_HCAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_MOYASAR_PLATFORM_PUBLISHABLE_KEY=$NEXT_PUBLIC_MOYASAR_PLATFORM_PUBLISHABLE_KEY

RUN if echo "$NEXT_PUBLIC_API_URL" | grep -q "localhost"; then \
      echo "❌ NEXT_PUBLIC_API_URL is localhost — pass --build-arg NEXT_PUBLIC_API_URL=https://api.deqah.net/api/v1" && exit 1; \
    fi && \
    if [ "$NEXT_PUBLIC_MOYASAR_PLATFORM_PUBLISHABLE_KEY" = "pk_test_replace_me" ]; then \
      echo "❌ NEXT_PUBLIC_MOYASAR_PLATFORM_PUBLISHABLE_KEY is placeholder — pass a real key" && exit 1; \
    fi

RUN pnpm --filter=dashboard run build

# ── Stage 4: runner ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5103
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=app-build /app/apps/dashboard/.next/standalone    ./
COPY --from=app-build /app/apps/dashboard/.next/static        ./apps/dashboard/.next/static
COPY --from=app-build /app/apps/dashboard/public              ./apps/dashboard/public

WORKDIR /app
EXPOSE 5103

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5103',r=>process.exit(r.statusCode<400?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/dashboard/server.js"]
