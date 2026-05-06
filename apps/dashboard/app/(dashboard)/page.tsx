"use client"

import { Suspense, useMemo } from "react"
import { format } from "date-fns"
import { ar } from "date-fns/locale"
import { FlashIcon, Analytics01Icon } from "@hugeicons/core-free-icons"

import { GreetingHeader } from "@/components/features/dashboard/greeting-header"
import { DashboardStats } from "@/components/features/dashboard/dashboard-stats"
import { AttentionAlerts } from "@/components/features/dashboard/attention-alerts"
import { QuickActions } from "@/components/features/dashboard/quick-actions"
import { TodayTimeline } from "@/components/features/dashboard/today-timeline"
import { ActivityFeed } from "@/components/features/dashboard/activity-feed"
import { RevenueChart } from "@/components/features/dashboard/revenue-chart"
import { RecentPayments } from "@/components/features/dashboard/recent-payments"
import { TopPerformersChart } from "@/components/features/dashboard/top-performers-chart"
import { ErrorBanner } from "@/components/features/error-banner"
import { SectionHeader } from "@/components/features/section-header"
import { Skeleton } from "@deqah/ui"
import { useTodayBookings } from "@/hooks/use-bookings"
import { useDashboardNotifications } from "@/hooks/use-notifications"
import { useDashboardStats } from "@/hooks/use-dashboard-stats"
import { useAuth } from "@/components/providers/auth-provider"
import { useLocale } from "@/components/locale-provider"
import { getVisibleWidgets } from "@/lib/dashboard-widgets"

export default function DashboardPage() {
  const today = format(new Date(), "yyyy-MM-dd")
  const { user, canDo } = useAuth()
  const { locale, t } = useLocale()

  // Login response doesn't include activeMembership (only /auth/me does); fall
  // back to the legacy User.role string until the membership hydrates.
  const membershipRole = user?.activeMembership?.role ?? user?.role ?? null
  const visible = useMemo(
    () => getVisibleWidgets(membershipRole, canDo),
    [membershipRole, canDo],
  )

  const dateLabel = format(
    new Date(),
    locale === "ar" ? "EEEE، d MMMM yyyy" : "EEEE, MMMM d, yyyy",
    locale === "ar" ? { locale: ar } : undefined,
  )

  const {
    data: todayBookings,
    isLoading: bookingsLoading,
    error: bookingsError,
    refetch: refetchBookings,
  } = useTodayBookings(today)

  const {
    data: notifData,
    isLoading: notifLoading,
    error: notifError,
    refetch: refetchNotifs,
  } = useDashboardNotifications()

  const { data: dashboardStats } = useDashboardStats()

  const userName =
    user?.activeMembership?.displayName || user?.name || user?.email || "—"

  const operationalSectionVisible =
    visible.todayTimeline ||
    visible.activityFeed ||
    visible.revenueChart ||
    visible.recentPayments ||
    visible.topPerformers

  return (
    <div className="flex flex-col gap-12">
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <section className="flex flex-col gap-6">
          <GreetingHeader userName={userName} dateLabel={dateLabel} bookingsCount={0} />
          <DashboardStats stats={dashboardStats} visibleStats={visible.stats} />
          <AttentionAlerts
            pendingPayments={dashboardStats?.pendingPayments ?? 0}
            cancelRequests={dashboardStats?.cancelRequests ?? 0}
            visible={visible.attentionAlerts}
          />
        </section>
      </Suspense>

      {visible.quickActions.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader icon={FlashIcon} title={t("dashboard.quickActions")} />
          <QuickActions actions={visible.quickActions} />
        </section>
      )}

      {operationalSectionVisible && (
        <section className="flex flex-col gap-5">
          <SectionHeader icon={Analytics01Icon} title={t("dashboard.operations")} variant="accent" />

          {(visible.todayTimeline || visible.activityFeed) && (
            <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
              {visible.todayTimeline &&
                (bookingsLoading ? (
                  <Skeleton className="h-[400px] rounded-xl" />
                ) : bookingsError ? (
                  <ErrorBanner
                    message={t("dashboard.error.schedule")}
                    onRetry={() => refetchBookings()}
                  />
                ) : (
                  <TodayTimeline
                    bookings={todayBookings?.items ?? []}
                    membershipRole={membershipRole}
                  />
                ))}
              {visible.activityFeed &&
                (notifLoading ? (
                  <Skeleton className="h-[400px] rounded-xl" />
                ) : notifError ? (
                  <ErrorBanner
                    message={t("dashboard.error.activity")}
                    onRetry={() => refetchNotifs()}
                  />
                ) : (
                  <ActivityFeed notifications={notifData?.items ?? []} />
                ))}
            </div>
          )}

          {(visible.revenueChart || visible.recentPayments) && (
            <div className="grid gap-5 lg:grid-cols-2">
              {visible.revenueChart && <RevenueChart />}
              {visible.recentPayments && <RecentPayments />}
            </div>
          )}

          {visible.topPerformers && <TopPerformersChart />}
        </section>
      )}
    </div>
  )
}
