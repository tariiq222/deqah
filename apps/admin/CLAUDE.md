# apps/admin — Deqah Super-admin Panel

Next.js 15 (App Router) + React 19 + TanStack Query, mounted at
`admin.deqah.app` in prod and `http://localhost:5104` in dev.

## Purpose

Platform control plane used only by Deqah staff. NOT a clinic-facing
dashboard — that lives in `apps/dashboard`. Super-admins:

- list / suspend / reinstate organizations
- search users across tenants + issue temp passwords
- manage Plans + Verticals (cross-tenant CRUD)
- view platform metrics
- read the super-admin audit log
- start + end impersonation sessions

## Hard rules

1. **Vertical Slices architecture.** Every user-facing action is one
   directory under `features/<cluster>/<action>/` containing its API
   call, its TanStack Query hook, and any UI components specific to it.
   Mirror the backend layout at `modules/platform/admin/<action>/` so
   you can follow a feature end-to-end without bouncing across layers.
   No cross-feature imports (feature A → feature B). Shared primitives
   go in `@deqah/ui` or `lib/`.
2. **No feature-specific components in `@deqah/ui`** — that package is
   shared with the tenant dashboard. Admin-only widgets live here in
   the owning feature slice.
3. **Arabic-first / RTL.** Default locale is `ar`, layout is RTL
   (`dir="rtl"`), typography uses the Cairo font family. Translations
   live in `messages/ar.json` (canonical) + `messages/en.json`
   (fallback for staff who prefer English). Use logical CSS
   properties (`start`/`end`, `ps-`/`pe-`, `ms-`/`me-`) — never
   hardcode `left`/`right`.
4. **No tenant context ever.** Admin code never sets
   `X-Organization-Id` — the backend resolves via `SuperAdminGuard` +
   `SuperAdminContextInterceptor` which unlocks `$allTenants`. If you
   find yourself needing an org slug in the URL, you're building the
   wrong thing — that's the dashboard.
5. **Every destructive action is written to `SuperAdminActionLog`.**
   No free-text reason is collected from the UI — the action type,
   actor, timestamp, and metadata form the audit trail. Tenant creation
   and all other actions are recorded the same way.
6. **Session storage is `localStorage.admin.accessToken` + cookie
   marker `admin.authenticated=1`.** Middleware uses the cookie to
   redirect unauthenticated users; the JWT in localStorage is what the
   fetch wrapper sends as `Authorization: Bearer …`.

## Layer rules

```
app/            ← Next pages — thin composition only (≤ ~80 lines each)
  (admin)/      ← authenticated shell; sidebar + main content
  login/        ← unauthenticated
features/       ← vertical slices — one directory per action
  <cluster>/
    types.ts                (cluster-shared response types)
    <action>/
      <action>.api.ts       (typed fetch call)
      use-<action>.ts       (TanStack hook for queries/mutations)
      <optional>.tsx        (UI components used by this action only)
shell/          ← layout-level UI (sidebar, logout button) — NOT feature UI
lib/
  api-client.ts ← raw fetch wrapper (adminRequest + publicRequest)
  types.ts      ← shared primitives (PageMeta)
```

Imports flow top-down only. Pages import features + shell; features
import lib; lib never imports features or shell.

To add a new action: create `features/<cluster>/<new-action>/` with the
three files above, then import its hook in a page. Do NOT add anything
to a shared API barrel — there isn't one.

## Routes (current)

- `/login` — sign-in form
- `/` — overview (platform metrics cards)
- `/organizations` — list + search + status filter
- `/organizations/[id]` — detail + suspend / reinstate / impersonate dialogs
- `/plans` — billing plan CRUD (cross-tenant)
- `/verticals` — vertical CRUD with terminology overrides
- `/billing` — subscription oversight (SaaS-05c): read state, waive,
  grant credit, change plan, refund (Moyasar live)
- `/users` — cross-tenant user search + temp-password reset
- `/metrics` — platform-wide stats with groupBy charts
- `/impersonation-sessions` — active + historic shadow sessions
- `/audit-log` — filtered read-only log

Delivered via PRs #40, #41, #45. Every feature lives in its own
`features/<cluster>/<action>/` slice (see `features/`: `audit-log`,
`auth`, `billing`, `impersonation`, `organizations`, `plans`,
`platform-metrics`, `users`, `verticals`).

## Billing oversight (`/billing`, SaaS-05c)

Read-only-by-default surface for the platform's own SaaS billing —
mirrors backend `modules/platform/admin/billing/`. Capabilities:

- Read: subscription state, plan, status, current period, usage,
  payment history, outstanding invoices.
- **Waive invoice** — mark a tenant invoice paid without charge;
  requires `reason` ≥ 10 chars; written to `SuperAdminActionLog`.
- **Grant credit** — apply a credit balance to the tenant's next
  invoice; reason required.
- **Change plan** — move a tenant between Plans (proration handled
  backend-side); reason required.
- **Refund** — issues a live Moyasar refund against the original
  platform-side payment (NOT the tenant's own Moyasar). Reason
  required, audit log entry written, Moyasar refund id stored.

This is the platform's own Moyasar account (the "platform" half of the
two-Moyasar architecture). Tenant-customer refunds happen in the
clinic dashboard against the tenant's own Moyasar — never here.

## Development

```bash
# backend must be running on :5100 (docker or dev mode)
npm run dev:admin   # → http://localhost:5104

# create a super-admin to sign in with
SUPER_ADMIN_EMAIL='you@deqah' SUPER_ADMIN_PASSWORD='changeme' \
  npm run seed --workspace=backend
```

Set `ADMIN_HOSTS=admin.localhost:5104,localhost:5104` in the backend
`.env.local` — otherwise `AdminHostGuard` will reject every request
from the dev admin app.

## Security posture

Mirrors the backend-only rollout:
- `AdminHostGuard` rejects any host not in `ADMIN_HOSTS`.
- `SuperAdminGuard` re-verifies `User.isSuperAdmin=true` from the DB.
- `SuperAdminContextInterceptor` unlocks `$allTenants` via a CLS flag.
- Impersonation shadow JWTs omit `isSuperAdmin` and carry
  `scope='impersonation'` — they cannot be replayed against admin
  endpoints.

Full reference: `docs/superpowers/plans/2026-04-21-saas-05b-super-admin-app.md`.

## Settings Hub Routes

Each `/settings/*` page in the super-admin app maps to a backend slice:

| Route | Backend endpoint(s) | Powers |
|-------|---------------------|--------|
| `/settings` | — | Hub landing page; links to sub-pages |
| `/settings/email` | `GET/PATCH /admin/settings/email` | Resend API key (encrypted), from address, platform SMTP fallback toggle |
| `/settings/email/templates` | `GET/PATCH /admin/settings/email/templates` | Per-key bilingual email templates; locked keys highlighted |
| `/settings/email/logs` | `GET /admin/settings/email/logs` | `PlatformEmailLog` with delivery status, actor, provider |
| `/settings/notifications` | `GET/PATCH /admin/settings/notifications` | Default notification channels, quiet-hours window |
| `/settings/billing` | `GET/PATCH /admin/settings/billing` | Moyasar platform key (encrypted), trial days, overage model |
| `/settings/branding` | `GET/PATCH /admin/settings/branding` | Admin logo + primary color; served to shell at runtime |
| `/settings/system` | `GET /admin/settings/system/health`, `POST .../health/run`, `POST .../cache/clear` | Postgres/Redis/MinIO health, backend version, top fallback consumers, external links |
| `/settings/security` | `GET/PATCH /admin/settings/security`, 2FA endpoints, `GET .../failed-logins` | Session TTL, TOTP 2FA enrollment, IP allowlist, failed-login log |

## Accountability surfaces

All write actions on settings pages produce a `SuperAdminActionLog` row with `actionType: 'PLATFORM_SETTING_UPDATED'`.

| Surface | Who sees it | Data source |
|---------|-------------|-------------|
| Super-admin audit log (`/audit-log`) | Platform team | `SuperAdminActionLog` |
| Email delivery log (`/settings/email/logs`) | Platform team | `PlatformEmailLog` |
| Tenant delivery log (`/settings/email-delivery-log` in dashboard) | Clinic admin | `NotificationDeliveryLog` + `SmsDelivery` union |
| Failed-login log (`/settings/security`) | Platform team | `FailedLoginAttempt` |
| `senderActor` field on every `NotificationDeliveryLog` row | Platform team + clinic admin | `NotificationSenderActor` enum: PLATFORM / TENANT / PLATFORM_FALLBACK |
| System health page (`/settings/system`) | Platform team | Live Postgres/Redis/MinIO probes + `UsageCounter` aggregate |
