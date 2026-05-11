# Deqah — Multi-Tenant SaaS Clinic Platform

## HIGHEST PRIORITY — No Uninstructed Features

**لا تضف أي ميزة جديدة أو تحسين جديد أو refactor لم يطلبه المستخدم صراحةً في أول رسالة في المحادثة.**

هذه القاعدة مطلقة:
- نفّذ فقط ما طُلب بالضبط — لا إضافات، لا "بما أننا هنا"، لا تحسينات جانبية
- إذا لاحظت شيئاً يستحق التحسين → اذكره للمستخدم فقط، لا تنفّذه
- الاستثناء الوحيد: إصلاح bug واضح يمنع الشيء المطلوب من العمل

Deqah is a **multi-tenant SaaS** for clinics. One deployment serves many clinics (organizations), each with its own branding, vertical configuration, billing plan, and data — isolated by `organizationId` scoping and Postgres RLS. A super-admin control plane (`apps/admin`) operates the platform; each tenant uses the per-tenant clinic dashboard (`apps/dashboard`) and the client/employee mobile app (`apps/mobile`).

## Orchestration

The active orchestration system is **Kilo-native**, defined in `AGENTS.md` (this repo) and `docs/ai/ADR-002-KILO-NATIVE-ORCHESTRATION.md`.

- Slash command: `/orchestrate "<task>"` — see `.kilo/command/orchestrate.md`.
- Agents live in `.kilo/agent/*.md` (planner, risk classifier, executor, validator, tests analyzer, PR author, rescue).
- Runtime state in `.kilo/orchestrator/` (gitignored).
- Token distribution target: Opus 10% / Sonnet 25% / MiniMax 65% (per `~/.config/kilo/AGENTS.md`).
- For superseded designs see `docs/ai/ADR-001-DEQAH-RUNTIME-CORE.md` (historical) — do not follow.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Backend**: NestJS 11, Prisma 7 (PostgreSQL + pgvector), BullMQ, Redis, MinIO
- **Per-tenant Dashboard**: Next.js 15 (App Router) + React 19, TanStack Query, Tailwind 4, next-intl (AR/EN)
- **Super-admin (`apps/admin`)**: Next.js 15 — SaaS control plane (tenants, plans, verticals, billing oversight, impersonation, metrics)
- **Public Website (`apps/bespoke/sawa/website`)**: Next.js 15 — marketing/info site
- **Marketing site (`apps/marketing`)**: Next.js 15 — Deqah's own marketing/landing site (Royal Blue + Lime brand), runs on port 5106 via `pnpm dev:marketing`.
- **Sawa tenant website**: paused from production pipeline as of 2026-05-08. Code remains at `apps/bespoke/sawa/website` and runs locally via `pnpm dev:website`. Mobile (`apps/mobile`) was never part of this pipeline.
- **Mobile**: React Native 0.83, Expo SDK 55, Expo Router, Redux Toolkit (auth slice only) + TanStack Query — **single-tenant per build** (see "Mobile Tenant Strategy" below)
- **Shared packages**:
  - `@deqah/api-client` — typed fetch client
  - `@deqah/shared` — types, enums, i18n tokens, vertical seeds
  - `@deqah/ui` — 33 design-system primitives + 2 hooks (extracted in Plan 05a)
- **Infra**: Docker Compose, Nginx, Sentry, Prometheus

## Multi-Tenancy

- **Tenant resolver middleware**: `apps/backend/src/common/tenant/tenant-resolver.middleware.ts` — extracts `organizationId` per request from JWT/host/header.
- **`TENANT_ENFORCEMENT='strict'`** is the default; production rejects any other value (`apps/backend/src/common/tenant/tenant.module.ts`).
- **Postgres RLS** policies are applied per cluster (9 SaaS-phase migrations). Use `RlsHelper` to bypass only inside admin/cron contexts.
- **Singleton-per-org models**: `BrandingConfig`, `OrganizationSettings`, `ChatbotConfig`, `OrganizationSmsConfig`.
- **Multi-org users**: `Membership` + `switch-organization` + `list-memberships` slices (`apps/backend/src/modules/identity/`).
- **Verticals**: each org is seeded from a `Vertical` (`apps/backend/src/modules/platform/verticals/`) with terminology packs consumed via `useTerminology()` (dashboard + mobile).

## Mobile Tenant Strategy — One App per Tenant

`apps/mobile/` is **single-tenant by design**. Backend, dashboard, and admin are multi-tenant; mobile is not. Every published mobile build is locked to exactly one organization at build time.

- **Current build:** `سواء للإرشاد الأسري` (Sawa) — bundle `sa.sawa.app`, vertical `family-consulting`. Config in `apps/mobile/app.config.ts`.
- **Lock mechanism:** mobile sends an `X-Org-Id` header (sourced from a hard-coded `TENANT_ID` constant) on every request via the Axios interceptor in `apps/mobile/services/api.ts`. The backend `TenantResolverMiddleware` honors this header on public routes only — JWT still wins on authenticated routes (see plan `docs/superpowers/plans/2026-04-25-mobile-tenant-lock-sawa.md`).
- **No runtime tenant switching on mobile.** Do not add tenant switchers, multi-org membership UI, or dynamic vertical hot-swap to `apps/mobile/`.
- **Adding a new tenant = a new build**, not a runtime mode: fork `apps/mobile/` → swap `app.config.ts` (name, slug, scheme, bundleIdentifier, package, icon) → drop new `assets/<slug>/` → update `TENANT_ID` → publish under a new bundle ID. Backend, dashboard, and admin do not change.

## Golden Rules

- **No `any` in TypeScript** — strict mode everywhere
- **Vertical Slices** — every backend module groups per-action handler folders (e.g., `bookings/create-booking/`, `bookings/cancel-booking/`); never service/repository layering
- **350-line max per file** — split immediately when approaching
- **Migrations are immutable** — never modify or consolidate existing ones
- **Commits**: one system only, ≤10 files or ≤500 lines, conventional format
- **Tests must pass** before any commit — fix first, ship after
- **No audit loops** — code correct on first delivery
- **Ports 5000–5999** reserved exclusively for Deqah tools/environments
- **All DB changes via Prisma migrations** — never commit `prisma db push` to scripts/CI/Dockerfiles (CI guards via `scripts/ci/check-no-db-push.sh`). Manual local `db push` for prototyping is fine; never `prisma db push` in committed code, and never manual SQL.
- **Tenant-isolation tests required** for any new scoped model
- **i18n parity (AR/EN)** required for any user-facing string in dashboard/mobile/admin/website
- **RTL-first layout** — use logical properties (`start`/`end`, `ps-`/`pe-`, `ms-`/`me-`); never hardcode `left`/`right`
- **Semantic tokens only** — no hex colors, no `text-gray-*`; always use CSS custom properties so per-tenant branding works

## Dependency Management

**pnpm overrides** in root `package.json` pin transitive deps to known-good versions:
```json
"pnpm": {
  "overrides": {
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "@types/react": "18.3.28",
    "@types/react-dom": "18.3.7"
  }
}
```

**React 19 vs @types/react 18.3 — known mismatch, safe to ignore**: `@types/react` ships its own PropTypes validators keyed to the exact React version. Since React 19 ships `PropTypes` validators that accept `string | number` for `size`, and `@types/react@18` types `size` as `number | null`, TypeScript reports errors in mobile (`apps/mobile`). This is a type-library lag, not a runtime bug — the actual prop values are compatible. The override pins `@types/react` to 18.x because 19.x types have not shipped yet (as of 2026-05-11). Track upstream: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/.

## Commands

> Note: the repo uses **pnpm workspaces**. `npm run <script>` works at the root because npm forwards to the same `package.json` scripts, but inside individual apps prefer `pnpm` (e.g. `pnpm --filter dashboard test`).

```bash
# Root (Turborepo)
npm run dev:backend       # NestJS on :5100
npm run dev:dashboard     # Per-tenant dashboard on :5103
npm run dev:admin         # Super-admin on :5104
npm run dev:marketing     # Deqah marketing site on :5106
npm run dev:website       # Sawa tenant website on :5105 (paused from prod pipeline)
npm run dev:mobile        # Expo on :5102
npm run dev:all           # All apps in parallel
npm run build             # turbo run build
npm run lint              # turbo run lint
npm run test              # turbo run test
npm run docker:up         # PostgreSQL, Redis, MinIO
npm run docker:down

# Backend (cd apps/backend)
npm run dev               # Watch mode
npm run test              # Jest unit
npm run test:cov          # Coverage (40% branch, 50% fn/line)
npm run test:e2e          # E2E (includes tenant-isolation suites)
npm run prisma:migrate
npm run seed
npm run prisma:studio

# Dashboard / Admin / Website (cd apps/<app>)
npm run dev
npm run build
npm run typecheck
npm run lint
npm run test              # Vitest unit tests

# Dashboard e2e (Playwright — official e2e tool, restored 2026-05-04)
cd apps/dashboard
npm run e2e:smoke         # smoke suite — runs on every PR
npm run e2e:flows         # full flows — runs nightly
npm run e2e:ui            # interactive debug mode
# Chrome DevTools MCP is supplemental for ad-hoc debugging only

# Mobile (cd apps/mobile)
npm run dev               # Expo start
npm run ios / android
npm run test              # Jest + jest-expo

# Kiwi TCMS — single source of truth (Product = "Deqah" ONLY)
# URL https://localhost:6443 · admin / Deqah_2026 · never create a second product
npm run test:kiwi           # unit → Kiwi
npm run test:kiwi:e2e       # E2E → Kiwi
npm run test:kiwi:all
npm run kiwi:sync-manual data/kiwi/<domain>-<date>.json

# Single test (backend)
cd apps/backend && npx jest path/to/file.spec.ts
cd apps/backend && npx jest -t "describes partial name"

# OpenAPI sync (backend → dashboard typed client)
npm run openapi:sync

# Brand identity check
npm run brand:check
```

## Structure

```
deqah/
├── apps/
│   ├── backend/          # NestJS API — all business logic
│   │   ├── prisma/schema/    # 12 split schemas (one per cluster)
│   │   ├── src/common/       # tenant/, guards, filters, interceptors, decorators
│   │   ├── src/api/          # admin/, dashboard/, mobile/, public/ controllers
│   │   └── src/modules/      # 14 clusters (vertical-slice handlers within)
│   ├── dashboard/        # Per-tenant clinic admin (Next.js 15, port 5103)
│   ├── admin/            # Super-admin SaaS control plane (Next.js 15, port 5104)
│   ├── marketing/        # Deqah marketing/landing site (Next.js 15, port 5106)
│   ├── bespoke/
│   │   └── sawa/website/ # Sawa tenant marketing site (Next.js 15, port 5105 — paused)
│   ├── mobile/           # Expo — single-tenant, currently Sawa build
│   └── runtime/          # Launch-readiness + error-detection helpers (@deqah/runtime)
├── packages/
│   ├── api-client/       # @deqah/api-client — typed fetch client
│   ├── shared/           # @deqah/shared — types, enums, vertical seeds, i18n tokens
│   ├── ui/               # @deqah/ui — 33 primitives + 2 hooks
│   ├── orchestration/    # @deqah/orchestration — internal AI orchestration helpers
│   └── test-helpers-pw/  # Playwright e2e helpers shared across apps
├── docker/               # docker-compose.yml + Nginx
├── data/kiwi/            # Manual-QA plan JSONs synced to Kiwi
└── docs/
    ├── architecture/         # module-ownership.md (current SoT)
    ├── operations/           # rollback runbook
    ├── design/               # rtl-guidelines, accessibility
    ├── features/             # booking enums/erd/flows
    └── superpowers/          # plans/, specs/, qa/, runbooks/
```

## Backend Module Map (14 clusters)

Each cluster lives at `apps/backend/src/modules/<cluster>/` and contains vertical-slice handler folders.

| Cluster | Notable Slices | Dashboard Route(s) |
|---------|----------------|---------------------|
| `identity/` | client-auth, otp, switch-organization, list-memberships, casl, roles, users | `users/`, `settings/` |
| `people/` | clients, employees, specialties | `clients/`, `employees/` |
| `bookings/` | create/cancel/confirm/check-in/reschedule, recurring, waitlist, walk-in, create-zoom-meeting | `bookings/` |
| `finance/` | payments, moyasar-api, moyasar-webhook, refunds, coupons, bank-transfer-upload | `payments/`, `invoices/`, `coupons/` |
| `comms/` | notifications, fcm-tokens, email-templates, send-email, send-sms, org-sms-config, sms-dlr, contact-messages | `notifications/`, `contact-messages/` |
| `ai/` | chatbot RAG (streaming), knowledge-base, pgvector embeddings | `chatbot/` |
| `media/` | uploads, MinIO integration | (used across) |
| `ops/` | health-check, cron-tasks (BullMQ), generate-report, log-activity | `activity-log/`, `reports/` |
| `content/` | site-settings | `content/` |
| `org-config/` | branches, categories, departments, business-hours | `branches/`, `categories/`, `departments/` |
| `org-experience/` | branding, intake-forms, ratings, services, org-settings | `branding/`, `intake-forms/`, `ratings/`, `services/`, `settings/` |
| `integrations/` | zoom (encrypted creds, get/upsert/test), public branding | `settings/` |
| `platform/` | **admin**, **billing**, **verticals**, **feature-flags**, problem-reports, integrations | (super-admin only) |
| `dashboard/` | get-dashboard-stats | `/` (home) |

See `apps/backend/CLAUDE.md` for cluster-by-cluster detail and `docs/architecture/module-ownership.md` for the live owned-models map.

## SaaS Control Plane — `apps/admin`

The super-admin app operates the platform. Routes under `app/(admin)/`:

- `organizations/` — tenant CRUD, suspend, reinstate, impersonate
- `plans/` — billing plan CRUD
- `verticals/` — vertical CRUD (terminology packs, default seeds)
- `billing/` — subscription oversight, waive, grant credit, change plan, refund (Moyasar live)
- `audit-log/` — `SuperAdminActionLog`
- `impersonation-sessions/` — active/historic
- `metrics/` — platform-wide stats
- `users/` — cross-tenant user search

## Security Sensitivity Tiers

- **Owner-only** (`@tariq`): payments, identity/auth, migrations, schema, tenant infra (`common/tenant/`), `platform/admin`, `platform/billing`, `platform/verticals`, super-admin app, CODEOWNERS
- **Standard review**: all other clusters

## Kiwi TCMS — single source of truth

All automated + manual QA results land in the local Kiwi TCMS at `https://localhost:6443` (admin / `Deqah_2026`).

**Hard rules:**

- **One Product only: `Deqah`** (id=1). Never create "Deqah Dashboard", "Deqah Mobile", etc. Domains use **Category** (Bookings, Clients, Employees, …) and **Plan type** (Unit, E2E, Manual QA), never a new Product.
- **Version `main`** is canonical. Reuse it for every run unless tagging a release.
- **Builds name the session**: `local-dev`, `manual-qa-2026-04-17`, `bookings-qa-fixes` — created with `Build.create` on `main`.
- **One TestPlan per (domain, type)**. Reuse on re-runs.
- **Test cases idempotent** — lookup `TestCase.filter({ summary, category })` before creating.

**Sync scripts (extend, don't rewrite):**

- Automated: `/c/pro/kiwi-tcms/run-and-sync.sh` + Python helpers — `npm run test:kiwi{,:e2e,:all}`.
- Manual QA: `scripts/kiwi/kiwi-sync-manual-qa.mjs` reads `data/kiwi/<domain>-<date>.json` — `npm run kiwi:sync-manual <path>`.

**Manual QA workflow:**

1. Run the QA gate in Chrome DevTools MCP against the feature.
2. Write findings to `docs/superpowers/qa/<feature>-report-<date>.md` (report + screenshots).
3. Author plan JSON at `data/kiwi/<domain>-<date>.json` with `{ domain, version, build, planName, planSummary, runSummary, cases: [{ summary, text, result }] }`.
4. `npm run kiwi:sync-manual data/kiwi/<domain>-<date>.json` — idempotent.
5. Link Kiwi URLs (`/plan/<id>/`, `/runs/<id>/`) from the report.

DB inspection: `docker exec kiwi_web bash -c 'cd /Kiwi && python manage.py shell < /tmp/<script>.py'` — never spin up a parallel product.

## Design Context

### Users

**Primary**: clinic receptionists (daily, all-day use) and clinic admins/owners (oversight + configuration). Context: busy clinic — phone ringing, clients waiting, multiple tabs. Speed and clarity are survival requirements.

**Job to be done**: complete operational tasks fast, without friction. The UI gets out of the way.

### Brand Personality

**Three words**: Modern. Elegant. Efficient. Should feel like an Apple environment, not a hospital IT department.

**Emotional priorities**: confidence/control → speed/efficiency → elegance/professionalism → ease/simplicity.

### Aesthetic Direction

**Reference**: Apple Health / iOS — clean hierarchy, generous whitespace, restrained glassmorphism, signal surfaced just-in-time.

**Deqah's own brand colors** (used for the marketing site + admin): Royal Blue `#354FD8` + Lime Green `#82CC17`. **Per-tenant dashboard/mobile must use semantic tokens only** (`--primary`, `--accent`, …) — each tenant's `BrandingConfig` overrides them at runtime via `PublicBranding`.

**Visual signature**: frosted glass surfaces, animated gradient blobs, IBM Plex Sans Arabic, 8px grid, iOS-grade radii, whisper-soft shadows.

**Anti-references**: legacy clinic/HIS, ERP/SAP, generic Bootstrap, rigid Material Design.

### Design Principles

1. **Surface the signal, hide the noise**
2. **Arabic-first** — RTL is not an afterthought
3. **Glass, not plastic** — semi-transparent layered surfaces
4. **Speed is a feature** — optimistic updates, skeletons not spinners
5. **Accessible by default** — WCAG 2.1 AAA target
6. **Tokens, not colors** — the per-tenant branding system depends on it

### Page Anatomy — The Law (Dashboard List Pages)

Every list page follows this exact structure. No exceptions.

```text
Breadcrumbs
PageHeader: Title + Description | [Export outline] [+ Add primary]
ErrorBanner (only if error)
StatsGrid: 4× StatCard (Total/primary · Active/success · Inactive/warning · New/accent)
FilterBar (glass): [Search] [Status ▼] [Other filters ▼] [Reset]
DataTable (no Card wrapper, no background)
Pagination (only if meta.totalPages > 1)
Dialogs / Sheets (at bottom)
```

**Key rules:**

- Search input lives in **FilterBar**, not PageHeader
- Export button → `variant="outline"` in PageHeader, left of Add
- DataTable has **no Card wrapper** — sits bare in the page flow
- Table action buttons → **icon-only** (`size-9`, `rounded-sm`) + Tooltip
- Skeleton loading: 4× `h-[100px]` for StatsGrid, 5× `h-12` for table rows
- Dates → `toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })`
- Status badges → `bg-success/10 text-success border-success/30` (active) / `bg-muted text-muted-foreground` (inactive)

UI primitives come from `@deqah/ui` (do not modify in-place); features compose them in `apps/<app>/components/features/`.
