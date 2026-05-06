# Deqah — Docker Architecture

## Why We Don't Build on the VPS

The VPS (Hostinger KVM 2) has ~5GB RAM available after other systems take their share. A full monorepo build — especially 4 concurrent Next.js apps — needs 8–14GB. GitHub Actions runners have 14GB and are free for this workload. Building on VPS would either OOM-kill or take 30+ minutes.

**Rule:** Build on GitHub Actions. VPS only pulls and runs pre-built images.

---

## The 4-Stage Pattern

Every Dockerfile follows the same 4-stage pattern. The stages exist to:

1. **Maximize Docker layer caching** — the slow steps (dependency install, shared-build) are cached until their inputs change
2. **Compile shared packages before consuming apps** — fixes the root cause of the `TS2307: Cannot find module '@deqah/shared/constants/feature-keys'` failures
3. **Keep runner images small** — the runner stage starts fresh and only copies what's needed at runtime

### Stage 1: `deps`

**Purpose:** Install all workspace dependencies.

**What's copied in:**
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.npmrc` (root)
- Each app's `package.json` and each package's `package.json`

**What happens:** `pnpm install --frozen-lockfile`

**Why it's a separate stage:** This layer is large (~500MB of node_modules) but almost never changes. By making it its own stage, Docker caches it as long as no `package.json` or lockfile changes. On a typical commit, this stage is a cache hit and takes ~0 seconds.

**Why `--frozen-lockfile`:** Ensures the exact versions in `pnpm-lock.yaml` are installed. Fails loudly if the lockfile is out of date, which is the correct behaviour — it means someone forgot to commit an updated lockfile.

### Stage 2: `shared-build`

**Purpose:** Compile `packages/shared` into `dist/`.

**What's copied in:**
- `node_modules` from `deps`
- All of `packages/`

**What happens:** `pnpm --filter=@deqah/shared run build`

**Why this stage exists:** `packages/shared` exports to `dist/` paths (e.g., `./dist/constants/feature-keys.js`). Locally, `dist/` already exists from a previous build, so TypeScript can resolve the imports. In CI, the repo is a fresh checkout — no `dist/`. Without this stage, every consuming app's TypeScript compile fails with `TS2307: Cannot find module '@deqah/shared/constants/feature-keys'`.

**What about `@deqah/api-client` and `@deqah/ui`?** Neither has a build script. Both point their `main`/`exports` directly to `./src/index.ts`. They're consumed via `transpilePackages` in Next.js configs, which compiles them on-the-fly during the app build. No separate build step needed.

### Stage 3: `app-build`

**Purpose:** Compile the specific app.

**What's copied in:**
- `node_modules` from `deps`
- `packages/` with compiled `shared/dist/` from `shared-build`
- The specific app's source directory

**What happens (per app):**
- **backend:** `pnpm --filter=backend run prisma:generate` then `pnpm --filter=backend run build` (NestJS → `dist/`)
- **dashboard:** `pnpm --filter=dashboard run build` (Next.js → `.next/`)
- **admin:** `pnpm --filter=admin run build` (Next.js → `.next/`)
- **website:** `pnpm --filter=website run build` (Next.js → `.next/standalone/` — website uses `output: 'standalone'`)

### Stage 4: `runner`

**Purpose:** Minimal runtime image.

**Starts fresh from:** `node:20-bookworm-slim` — throws away all build tools, dev dependencies, TypeScript, and intermediate files.

**What's kept (per app):**

| App | Runtime payload |
|-----|----------------|
| backend | `node_modules/` (prod) + `packages/shared/` (with dist/) + `packages/api-client/src/` + `apps/backend/dist/` + `apps/backend/prisma/` |
| dashboard | `node_modules/` + `packages/` + `apps/dashboard/.next/` + `apps/dashboard/public/` |
| admin | `node_modules/` + `packages/` + `apps/admin/.next/` |
| website | `.next/standalone/` only (self-contained) + `.next/static/` |

**Why website is different:** Website uses `output: 'standalone'` with `outputFileTracingRoot` set to the monorepo root. Next.js traces all dependencies and bundles a minimal `server.js` + minimal `node_modules` into `.next/standalone/`. This produces the smallest possible runner (no need to copy `node_modules` separately).

**Why dashboard/admin don't use standalone:** Their `next.config.mjs` files don't have `output: 'standalone'`. Adding it would be a source code change (outside the scope of the Docker fix). The runner copies the full `.next/` build + `node_modules/` instead.

---

## The Workspace Symlink Problem (Backend)

The backend's `node_modules/@deqah/shared` and `@deqah/api-client` are pnpm workspace symlinks that point to `packages/shared` and `packages/api-client` respectively. In a standard Docker copy, these symlinks dereference and can point to nothing.

The runner stage handles this explicitly:
```dockerfile
RUN mkdir -p /app/node_modules/@deqah \
 && rm -rf /app/node_modules/@deqah/shared /app/node_modules/@deqah/api-client \
 && ln -sf /app/packages/shared     /app/node_modules/@deqah/shared \
 && ln -sf /app/packages/api-client /app/node_modules/@deqah/api-client
```

This re-creates the symlinks pointing to the correct absolute paths inside the container.

---

## Layer Cache Strategy (GitHub Actions)

The workflow uses `type=gha` cache (GitHub Actions cache backend):

```yaml
cache-from: type=gha,scope=${{ matrix.app.name }}
cache-to: type=gha,scope=${{ matrix.app.name }},mode=max
```

Each app gets its own cache scope so their layer caches don't collide. The `mode=max` exports all intermediate layers (including `deps` and `shared-build`), making subsequent builds fast even when the app's source changes.

**Typical build times (after warm cache):**
- `deps` stage: cache hit → ~5s
- `shared-build` stage: cache hit (unless `packages/shared` changed) → ~5s
- `app-build` stage: only this stage rebuilds on source changes → 2–5 min
- `runner` stage: fast copy → ~30s

**Cold build (no cache):** 10–20 min per app.

---

## Image Naming Convention

```
ghcr.io/tariiq222/deqah-<app>:<tag>
```

Tags produced per build:
- `latest` — always points to the most recent main-branch build
- `<sha>` — short commit SHA (e.g., `abc1234`) — use for pinning rollbacks
- `YYYY-MM-DD` — date of the main-branch build (one per day)
- `v1.2.3` — semver tag (only when a `v*` git tag is pushed via `scripts/release.sh`)

---

## Adding a New Deployable App

If a new app is added to the monorepo:

1. Create `apps/<new-app>/Dockerfile` following the same 4-stage pattern
2. Add its `package.json` to the `deps` stage's COPY list
3. Add a matrix entry to `.github/workflows/build-images.yml`
4. Add the service to Dokploy pointing to `ghcr.io/tariiq222/deqah-<new-app>:latest`

---

## Common Pitfalls

These mistakes have been encountered and are documented here as institutional memory.

### 1. Running `pnpm install` after copying source — kills caching

**Wrong pattern:**
```dockerfile
COPY . .
RUN pnpm install --frozen-lockfile   # invalidated by every source change
```

**Correct pattern:** Copy only `package.json` + lockfile in the `deps` stage. Copy source only in
`app-build`. Keep the two operations strictly separated across stages.

When `pnpm install` is in the same layer as source files, every code change — even a one-line fix —
forces a full reinstall. On a cold cache this adds 4–8 minutes to every build.

### 2. Forgetting to copy a config file into `app-build`

Next.js, NestJS, and Prisma all require config files at build time:
- `tsconfig.json` (root + app-level)
- `apps/backend/prisma/schema/` directory (Prisma generate)
- `next.config.mjs` (Next.js apps)
- `postcss.config.mjs`, `tailwind.config.ts` (CSS processing)

Missing any of these causes a silent or confusing compile failure. The build may "succeed" but the
runtime crashes with a module-not-found error. If you add a new config file to the repo root or an
app, remember to add a `COPY` line in the `app-build` stage of its Dockerfile.

### 3. Using `pnpm install --no-frozen-lockfile` in CI

This silently installs different package versions than `pnpm-lock.yaml` specifies. It masks lockfile
drift until a version mismatch causes a production bug. Always use `--frozen-lockfile` in CI.

If the build fails because the lockfile is stale: fix it locally (`pnpm install`), commit the
updated `pnpm-lock.yaml`, push again. The fix is 30 seconds.

### 4. Expecting `prepare` scripts to run during `pnpm install` in Docker

pnpm `prepare` scripts (used to build packages on local `pnpm install`) do **not** reliably run
with `--frozen-lockfile` in Docker. This is exactly why `shared-build` is a dedicated stage rather
than relying on the `prepare` lifecycle hook.

If you add a new workspace package that produces a `dist/`, add an explicit build step in the
`shared-build` stage:
```dockerfile
RUN pnpm --filter=@deqah/new-package run build
```

Do not rely on `prepare` — it works locally, breaks in Docker.

### 5. Building on the VPS via Dokploy's built-in builder

Dokploy can build from a Dockerfile directly on the VPS. **Do not use this feature for Deqah.**
The VPS has ~5GB available RAM; a 4-app monorepo build OOM-kills under load. Always route builds
through GitHub Actions → push to ghcr.io → Dokploy pulls the pre-built image.

---

## Cross-References

- Deploying images: [deployment-guide.md](./deployment-guide.md)
- Rolling back to a specific image tag: [rollback-runbook.md](./rollback-runbook.md)
- Disaster recovery: [disaster-recovery.md](./disaster-recovery.md)
