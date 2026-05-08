---
"@deqah/admin": patch
---

Phase 6/8 of 2026-05-08 admin audit fixes — Page Anatomy compliance.

Adds 4 shared primitives under `apps/admin/components/` and wires them into the admin app per the "Page Anatomy — The Law" rule in `CLAUDE.md`:

- **Breadcrumbs** — route-trail config (30 routes), rendered above page header on every list + detail page
- **StatsGrid** — 4-card semantic grid (primary / success / warning / accent) with skeleton loading. Wired on organizations + users where backend `meta` exposes the stats; other pages have TODO comments pending BE meta extension
- **ErrorBanner** — replaces ad-hoc error divs across 9 list pages. Captures errors to GlitchTip with context tags. Retry button calls `query.refetch()`
- **OfflineBanner** — `navigator.onLine` listener mounted in `(admin)/layout.tsx`
- **Action buttons** — organizations + plans tables converted to icon-only (`size-9 rounded-sm`) + `Tooltip`. Verticals / billing-subscriptions / impersonation-sessions tables have TODO comments for Phase 6.7 follow-up

19 new primitive tests + 309 pre-existing all pass (328/328).

Closes audit finding **P1 #8** (Page Anatomy violations).

Plan: `docs/superpowers/plans/2026-05-08-admin-audit-fixes.md`.
