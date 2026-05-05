# Dashboard Role-Based Home — Design Spec

**Date:** 2026-05-06
**Owner:** @tariq
**Status:** Approved — ready for implementation plan
**Scope:** `apps/dashboard` home page (`/`) + supporting backend slices

---

## 1. Problem

The dashboard home (`apps/dashboard/app/(dashboard)/page.tsx`) currently renders the same 7 widgets to every authenticated user regardless of their role or permissions. A `RECEPTIONIST` sees revenue charts they cannot use; an `EMPLOYEE` sees the entire clinic's schedule instead of their own; an `ACCOUNTANT` sees an empty timeline that doesn't help them. The page wastes screen real-estate on widgets that are either irrelevant or that the user lacks permission to act on.

## 2. Goal

Make the home page surface only the widgets that match each user's role and permissions, with sensible per-role data filtering (e.g. `EMPLOYEE` sees only their own bookings).

**Non-goal (deferred to a later phase):** user-level personalization (drag-to-reorder, hide widget). Architecture must allow it; MVP does not implement it.

## 3. Roles (from current backend)

Source: `apps/backend/prisma/schema/platform.prisma` (`MembershipRole` enum).

| Role | Description |
|---|---|
| `OWNER` | Founder / financial decision maker. Adds platform-billing control on top of ADMIN. |
| `ADMIN` | Day-to-day clinic operations lead. |
| `RECEPTIONIST` | Front-desk: bookings + clients + reads invoices/employees. |
| `ACCOUNTANT` | Finance-only: invoices + payments + reads bookings/reports. |
| `EMPLOYEE` | Therapist/doctor: reads/updates own bookings, reads clients. |

Permission matrix (from `apps/backend/src/modules/identity/casl/casl-ability.factory.ts`):

| Subject | OWNER | ADMIN | RECEPTIONIST | ACCOUNTANT | EMPLOYEE |
|---|---|---|---|---|---|
| Booking | manage | manage | manage | read | read + update |
| Client | manage | manage | manage | — | read |
| Employee | manage | manage | read | — | — |
| Invoice | manage | manage | read | manage | — |
| Payment | manage | manage | — | manage | — |
| Report | manage | manage | — | read | — |
| Setting | manage | manage | — | — | — |
| Branding | manage | manage | — | — | — |
| Billing/Plan/Subscription | manage | — | — | — | — |

## 4. Visibility Map

The single source of truth for who sees what.

| Widget | OWNER | ADMIN | RECEPTIONIST | ACCOUNTANT | EMPLOYEE | Permission gate |
|---|:-:|:-:|:-:|:-:|:-:|---|
| GreetingHeader | ✅ | ✅ | ✅ | ✅ | ✅ | always |
| Stat: Today bookings (count) | ✅ | ✅ | ✅ | ✅ | ✅ * | `Booking:read` |
| Stat: Total clients | ✅ | ✅ | ✅ | — | ✅ | `Client:read` |
| Stat: Today revenue | ✅ | ✅ | — | ✅ | — | `Payment:read` |
| Stat: Pending payments (count) | ✅ | ✅ | — | ✅ | — | `Payment:read` |
| AttentionAlerts: pending payments | ✅ | ✅ | — | ✅ | — | `Payment:read` |
| AttentionAlerts: cancel requests | ✅ | ✅ | ✅ | — | ✅ * | `Booking:update` |
| QuickActions section | ✅ | ✅ | ✅ | ✅ | — | any action visible |
| ↳ New booking | ✅ | ✅ | ✅ | — | — | `Booking:create` |
| ↳ New client | ✅ | ✅ | ✅ | — | — | `Client:create` |
| ↳ Record payment | ✅ | ✅ | — | ✅ | — | `Payment:create` |
| TodayTimeline | ✅ | ✅ | ✅ | ✅ | ✅ * | `Booking:read` |
| ActivityFeed | ✅ | ✅ | ✅ | ✅ | ✅ | always (own notifications) |
| RevenueChart | ✅ | ✅ | — | ✅ | — | `Report:read` |
| RecentPayments | ✅ | ✅ | — | ✅ | — | `Payment:read` |
| **TopPerformersChart (new)** | ✅ | ✅ | — | — | — | `Report:read` AND `membershipRole !== 'ACCOUNTANT'` |

`*` = `EMPLOYEE` sees only their own data (filtered server-side by `employeeId = lookup(userId)`).

**Section visibility rule:** if all widgets in a section (e.g. "Operations") are hidden for the current user, hide the `SectionHeader` too — never render an empty heading.

## 5. Architecture

### 5.1 Frontend

**New file: `apps/dashboard/lib/dashboard-widgets.ts`** (~100 LOC, hard cap 150)

Single function exporting the visibility decision. Pure, testable, no React.

```ts
export interface VisibleWidgets {
  stats: { bookings: boolean; clients: boolean; revenue: boolean; pendingPayments: boolean }
  attentionAlerts: { pendingPayments: boolean; cancelRequests: boolean }
  quickActions: QuickActionKey[]                  // empty array → hide section
  todayTimeline: boolean
  activityFeed: boolean
  revenueChart: boolean
  recentPayments: boolean
  topPerformers: boolean
}

export function getVisibleWidgets(
  membershipRole: MembershipRole | null,
  canDo: (module: string, action: string) => boolean,
): VisibleWidgets
```

**Modified: `app/(dashboard)/page.tsx`** (must stay ≤ 150 lines)

- Calls `useAuth()` → `{ user, canDo }`. `membershipRole` comes from `user?.membershipRole` (added to auth-provider state if not already exposed — JWT already carries the claim per `apps/backend/CLAUDE.md` "Role precedence" section).
- Calls `getVisibleWidgets(membershipRole, canDo)` once, memoized via `useMemo`.
- Wraps each widget in `visible.<x> && <Widget …/>`.
- Wraps each section header in a check: render header only if at least one widget in the section is visible.

**Modified: `components/features/dashboard/dashboard-stats.tsx`**

- Accepts `visibleStats: VisibleWidgets['stats']`.
- Filters its internal stat list and switches grid columns dynamically: 4 cards → `grid-cols-4`; 3 → `grid-cols-3`; 2 → `grid-cols-2`; 1 → `grid-cols-1`.

**Modified: `components/features/dashboard/quick-actions.tsx`**

- Accepts `actions: QuickActionKey[]`.
- Renders only listed actions. Parent already decides not to render the wrapper if `actions.length === 0`.

**Modified: `components/features/dashboard/attention-alerts.tsx`**

- Accepts `visible: { pendingPayments: boolean; cancelRequests: boolean }`.
- Returns `null` if both are `false`.

**Modified: `components/features/dashboard/today-timeline.tsx`**

- No structural change. Backend filters data per role; component renders whatever it receives. Adds an empty-state message keyed off whether the user is an `EMPLOYEE` (different copy).

**New: `components/features/dashboard/top-performers-chart.tsx`** (~150 LOC, hard cap 250)

- Top 5 employees by revenue this calendar month.
- Horizontal bar list: avatar + display name + bar + revenue amount (right-aligned, `formatCurrency`).
- Empty state: "لا توجد بيانات أداء لهذا الشهر بعد".
- Uses `useTopPerformers()` hook.

**New: `hooks/use-top-performers.ts`** (~40 LOC)

```ts
export function useTopPerformers() {
  return useQuery({
    queryKey: queryKeys.dashboard.topPerformers(),
    queryFn: fetchTopPerformers,
    staleTime: 5 * 60 * 1000,
  })
}
```

**Modified: `lib/api/dashboard.ts`** — add `fetchTopPerformers()`.
**Modified: `lib/query-keys.ts`** — add `dashboard.topPerformers`.
**Modified: `lib/translations/{ar,en}.dashboard.ts`** — add `topPerformers.*` keys.

### 5.2 Backend

**Modified: `modules/dashboard/get-dashboard-stats/`**

- Handler reads `membershipRole` and `userId` from the controller.
- If `membershipRole === 'EMPLOYEE'`:
  - Looks up `Employee.id where userId = currentUser.id`.
  - Filters `todayBookings`, `pendingCancelRequests`, etc. to that employee.
  - Skips queries the role lacks permission for (e.g. `pendingPayments` for EMPLOYEE) and omits the field from the response. The frontend already gates on `visible.*`, but the backend also enforces — defense in depth.

**Modified: `bookings/get-today-bookings/`** (or equivalent slice consumed by `useTodayBookings`)

- Same pattern: backend filters by employee for `EMPLOYEE` role based on JWT `membershipRole + userId`. No FE change needed.

**New slice: `modules/dashboard/get-top-performers/`**

```
get-top-performers/
├── get-top-performers.dto.ts          # ?period=month (default)
├── get-top-performers.handler.ts
└── get-top-performers.handler.spec.ts
```

- `execute({ organizationId, period })` returns `Array<{ employeeId, displayName, avatarUrl, bookingsCount, revenue }>` limited to top 5.
- Implementation: SQL aggregating `Payment` rows joined to `Booking → Employee → Membership` for the org, scoped to the calendar month, ordered by `SUM(amount) DESC`, limit 5.
- Uses `Membership.displayName ?? User.name` per backend convention.

**New controller method: `src/api/dashboard/dashboard.controller.ts`**

```ts
@Get('top-performers')
@CheckAbility({ action: 'read', subject: 'Report' })
@ApiOperation({ summary: 'Get top-performing employees by revenue (current month)' })
async topPerformers(@User() user: AuthUser, @Query() dto: GetTopPerformersDto) {
  if (user.membershipRole === 'ACCOUNTANT') {
    throw new ForbiddenException('Performance metrics are not available to accountants')
  }
  return this.getTopPerformers.execute({ organizationId: user.organizationId, period: dto.period })
}
```

The `ACCOUNTANT` exclusion is explicit (not encoded in CASL) because `Report:read` is a legitimate accountant permission for *financial* reports — performance metrics are a separate concern.

## 6. Data Flow

```
Login → JWT carries { membershipRole, permissions[], userId, organizationId }
  ↓
useAuth() exposes { user, canDo(module, action), permissions[] }
  (membershipRole sourced from user.membershipRole — exposed on AuthUser if missing)
  ↓
page.tsx: visible = getVisibleWidgets(membershipRole, hasPermission)
  ↓
Per-widget render gate
  ↓
For data-fetching widgets, backend re-filters based on JWT (defense in depth)
```

## 7. Testing

**Vitest unit — `lib/dashboard-widgets.test.ts`:**
- 5 cases (one per role) × assert the full `VisibleWidgets` object.
- Plus 1 case: custom-role user with arbitrary permissions → derived correctly.

**Vitest component — `dashboard-stats.test.tsx`:**
- Renders correct number of cards for each `visibleStats` shape.
- Grid `data-cols` attribute matches count.

**Playwright smoke — `e2e/smoke/dashboard-by-role.spec.ts`:**
- 3 logins (seed users for OWNER, RECEPTIONIST, EMPLOYEE).
- Assert OWNER sees `[data-testid=top-performers]`.
- Assert RECEPTIONIST does NOT see `[data-testid=revenue-chart]`.
- Assert EMPLOYEE does NOT see `[data-testid=quick-actions]`.

**Backend Jest:**
- `get-top-performers.handler.spec.ts` — happy path + empty month + tenant isolation.
- Extend `get-dashboard-stats.handler.spec.ts` — EMPLOYEE filter narrows results to `employeeId`.
- Controller-level: `ACCOUNTANT` hits `/top-performers` → 403.

## 8. i18n

New keys (AR + EN, gated by `npm run i18n:verify`):

```
dashboard.topPerformers.title              → "أفضل المعالجين هذا الشهر" / "Top performers this month"
dashboard.topPerformers.empty              → "لا توجد بيانات أداء لهذا الشهر بعد" / …
dashboard.topPerformers.bookingsCount      → "{count} حجز" / "{count} bookings"
dashboard.timeline.empty.employee          → "لا توجد حجوزات لك اليوم" / "You have no bookings today"
dashboard.timeline.empty.general           → existing key reused
```

Vertical-aware label: "المعالجين" passes through `useTerminology()` so the title reads correctly per vertical (e.g., "أفضل الأطباء", "أفضل المدربين").

## 9. Out of Scope (future)

- User personalization (reorder/hide).
- Date-range picker for RevenueChart / TopPerformersChart.
- Per-role custom dashboards beyond widget visibility (e.g., distinct layouts).
- Caching `getVisibleWidgets` decision in localStorage for first-paint optimization.

## 10. Risks

- **Backend filtering for EMPLOYEE depends on `Employee.userId` link.** If a user with role `EMPLOYEE` has no matching `Employee` row, queries will return empty. Mitigation: handler explicitly checks and returns empty + a typed warning field; FE shows the empty state.
- **`canDo` semantics on the FE use a flat `module:action` string list while CASL on the BE uses subject objects.** They can drift. Mitigation: the FE gate is UX-only; the BE re-validates every fetch via `CaslGuard`. A FE bypass cannot reveal data the user lacks permission to read. The `lib/dashboard-widgets.ts` test suite locks the expected mapping for the 5 built-in roles so a CASL change without a FE update will fail tests.
- **Adding a new role** later (e.g., `MANAGER`) requires updating `getVisibleWidgets` — the test suite has 5 fixed cases. Mitigation: include a "fallback role" branch (unknown role → minimum widgets: GreetingHeader + ActivityFeed only) so a missed update degrades safely.

## 11. File Touchpoints

**New (5 files):**
- `apps/dashboard/lib/dashboard-widgets.ts`
- `apps/dashboard/lib/dashboard-widgets.test.ts`
- `apps/dashboard/components/features/dashboard/top-performers-chart.tsx`
- `apps/dashboard/hooks/use-top-performers.ts`
- `apps/backend/src/modules/dashboard/get-top-performers/` (3 files)

**Modified (≈10 files):**
- `apps/dashboard/app/(dashboard)/page.tsx`
- `apps/dashboard/components/features/dashboard/{dashboard-stats,quick-actions,attention-alerts,today-timeline}.tsx`
- `apps/dashboard/lib/api/dashboard.ts`
- `apps/dashboard/lib/query-keys.ts`
- `apps/dashboard/lib/translations/{ar,en}.dashboard.ts`
- `apps/backend/src/modules/dashboard/get-dashboard-stats/get-dashboard-stats.handler.ts`
- `apps/backend/src/api/dashboard/dashboard.controller.ts`
- `apps/backend/openapi.json` (regen)

**E2E (1 file):**
- `apps/dashboard/e2e/smoke/dashboard-by-role.spec.ts`
