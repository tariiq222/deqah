---
"@deqah/admin": patch
---

Phase 7/8 of 2026-05-08 admin audit fixes — mutation observability, currency centralization, LTR enforcement, per-route error boundaries.

- **`withSentryMutation` helper** (`apps/admin/lib/sentry-mutation.ts`) wraps all 21 admin mutation hooks. Each `useMutation` now reports failures to GlitchTip with a unique per-mutation `context` tag (e.g. `admin:billing:refund-invoice`, `admin:organization:suspend`). User-supplied `onError` (toast.error) still runs.
- **`formatSar` / `formatCurrency`** (`apps/admin/lib/currency.ts`) replace 6 ad-hoc `Number(x).toLocaleString() + ' SAR'` callsites across `billing-metrics-grid`, `metrics-grid`, `plans-table`, and `organizations/[id]` page. Non-currency `toLocaleString` calls (counts, dates) are correctly skipped.
- **LTR enforcement** — `apps/admin/app/layout.tsx` hard-codes `<html lang="en" dir="ltr">` per CLAUDE.md hard rule (admin is staff-only English-first). `DirectionProvider` always receives `dir="ltr"`.
- **11 per-route `error.tsx` boundaries** — `(admin)/`, `organizations/`, `plans/`, `verticals/`, `billing/`, `audit-log/`, `impersonation-sessions/`, `users/`, `notifications/`, `metrics/`, `settings/`. Each renders `<ErrorBanner>` (introduced in Phase 6) with a `reset` callback.

10 new tests (3 sentry-mutation + 7 currency). 338/338 admin tests pass.

Closes audit findings **P1 #9** (RTL conditional), **P1 #15** (no mutation Sentry capture).

Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.
