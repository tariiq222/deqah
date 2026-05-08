# Deqah

**Multi-tenant SaaS clinic platform** — built by WebVue Technology Solutions.

One deployment serves many clinics (organizations). Each tenant gets isolated data, its own branding, vertical configuration, billing plan, and a dedicated mobile + dashboard experience. Operations are run from a separate super-admin control plane.

---

## Quick Start

```bash
pnpm install
cp .env.example .env     # fill in secrets
cd apps/backend && npx prisma migrate deploy && pnpm seed && cd ../..
pnpm dev:all
```

| Service | URL |
|---------|-----|
| Backend API | <http://localhost:5100> |
| Swagger Docs | <http://localhost:5100/api/docs> |
| Dashboard (per-tenant) | <http://localhost:5103> |
| Admin (super-admin) | <http://localhost:5104> |
| Website (public) | <http://localhost:5105> |
| Mobile (Expo) | <http://localhost:5102> |

> Ports 5000–5999 are reserved exclusively for Deqah environments.

---

## Apps & Packages

| App / Package | Tech | Role |
|---------------|------|------|
| `apps/backend/` | NestJS 11 + Prisma 7 + PostgreSQL + RLS | API, business logic, BullMQ jobs, all 14 vertical-slice clusters |
| `apps/dashboard/` | Next.js 15 + React 19 | Per-tenant clinic admin |
| `apps/admin/` | Next.js 15 | Super-admin SaaS control plane (tenants, plans, verticals, billing oversight, impersonation) |
| `apps/bespoke/sawa/website/` | Next.js 15 | Public marketing/info site (Sawa) |
| `apps/mobile/` | React Native 0.83 (Expo SDK 55) | Client + employee mobile app |
| `packages/api-client/` | TypeScript | `@deqah/api-client` — typed fetch shared by UIs |
| `packages/shared/` | TypeScript | `@deqah/shared` — types, enums, i18n tokens, vertical seeds |
| `packages/ui/` | TypeScript + Tailwind | `@deqah/ui` — 33 design-system primitives + 2 hooks |

---

## Key Capabilities

- **Multi-tenant** — `organizationId` scoping + Postgres RLS (strict by default); singletons per org for `BrandingConfig`, `OrganizationSettings`, `ChatbotConfig`, `OrganizationSmsConfig`
- **Verticals** — ship a clinic vertical (dental, mental-health, …) with its own terminology pack and default seeds
- **Billing & subscriptions** — plans CRUD, subscription state machine, feature gates, hybrid Moyasar (platform + per-tenant)
- **Booking system** — in-clinic, phone, and video (Zoom) consultations; recurring, waitlist, walk-in
- **Per-tenant SMS** — Unifonic / Taqnyat adapters with AES-GCM-encrypted credentials and DLR webhook
- **Payments** — Moyasar (Mada, Apple Pay, Visa/MC) + bank transfer with AI receipt verification
- **AI chatbot** — OpenRouter-powered RAG with pgvector, streams answers in Arabic & English
- **Branding** — per-tenant logo, colors, fonts, domain — consumed by dashboard, mobile, and website at runtime
- **Multi-branch** — each org can manage multiple physical locations
- **RTL-first** — Arabic is the primary UI language; English is fully supported

---

## Documentation

| You are... | Start with |
|-----------|------------|
| New developer | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Reviewing architecture | [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md) |
| Working on backend | [`apps/backend/CLAUDE.md`](apps/backend/CLAUDE.md) |
| Working on dashboard UI | [`apps/dashboard/CLAUDE.md`](apps/dashboard/CLAUDE.md) |
| Working on super-admin | [`apps/admin/CLAUDE.md`](apps/admin/CLAUDE.md) |
| Working on mobile | [`apps/mobile/CLAUDE.md`](apps/mobile/CLAUDE.md) |
| Looking up cluster ownership | [`docs/architecture/module-ownership.md`](docs/architecture/module-ownership.md) |
| Recent SaaS plans/specs | [`docs/superpowers/plans/`](docs/superpowers/plans/) |
| Checking who owns what | [`CODEOWNERS`](CODEOWNERS) |

---

## Tech Stack

**Backend:** NestJS 11 · Prisma 7 · PostgreSQL 16 (pgvector + RLS) · Redis 7 · BullMQ
**Web:** Next.js 15 · React 19 · TanStack Query · Tailwind CSS v4 · next-intl
**UI primitives:** `@deqah/ui` (33 components, extracted from shadcn lineage)
**Mobile:** React Native 0.83 · Expo SDK 55 · Expo Router · Redux Toolkit (auth) + TanStack Query
**AI:** OpenRouter · pgvector
**Payments:** Moyasar (platform + per-tenant)
**SMS:** Unifonic / Taqnyat (per-tenant)
**Storage:** MinIO (S3-compatible)
**Notifications:** Firebase FCM
**Video:** Zoom API
**OTP:** Authentica
**QA:** Kiwi TCMS (single source of truth) + Chrome DevTools MCP
**Deployment:** Docker Compose

---

## Critical Rules

1. **No file exceeds 350 lines** — split by responsibility
2. **Vertical slices** — never `Controller → Service → Repository`
3. **All DB changes via Prisma migrations** — never `prisma db push`, never manual SQL
4. **Semantic tokens only** — no hex colors, no `text-gray-*`; per-tenant branding depends on CSS custom properties
5. **RTL layout** — use `start`/`end`, `ps-`/`pe-` — never `left`/`right` hardcoded
6. **`TENANT_ENFORCEMENT=strict`** in production (validated at boot)
7. **i18n parity (AR/EN)** for any user-facing string
8. **Ports 5000–5999** reserved exclusively for Deqah environments

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full pre-PR checklist.

---

*Built with care by [WebVue Technology Solutions](https://webvue.sa)*
