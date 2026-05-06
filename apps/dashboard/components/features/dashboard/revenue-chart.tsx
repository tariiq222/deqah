"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Skeleton } from "@deqah/ui"
import { Card } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import { queryKeys } from "@/lib/query-keys"
import { fetchRevenueReport } from "@/lib/api/reports"
import { formatLocaleDate } from "@/lib/date"

function getWeekRange(): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const dateTo = now.toISOString().slice(0, 10)
  const from = new Date(now)
  from.setDate(now.getDate() - 6)
  const dateFrom = from.toISOString().slice(0, 10)
  return { dateFrom, dateTo }
}

function formatDayLabel(dateStr: string, locale: string): string {
  return formatLocaleDate(dateStr, locale, { weekday: "short" })
}

export function RevenueChart() {
  const { locale, t } = useLocale()
  const { dateFrom, dateTo } = getWeekRange()

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.reports.revenue({ dateFrom, dateTo }),
    queryFn: () => fetchRevenueReport({ dateFrom, dateTo }),
  })

  const days = data?.byDay ?? []
  const maxAmount = days.reduce((m, d) => Math.max(m, d.amount), 0)

  return (
    <Card className="p-6" data-testid="revenue-chart">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">
          {t("dashboard.weeklyRevenue")}
        </h2>
        <Link
          href="/reports"
          className="text-xs font-medium text-primary hover:underline"
        >
          {t("dashboard.fullReport")}
        </Link>
      </div>

      {isLoading ? (
        <div className="flex h-[180px] items-end gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <Skeleton
                className="mt-auto w-full rounded-t-md"
                style={{ height: `${40 + (i % 3) * 20}%` }}
              />
              <Skeleton className="h-3 w-8 rounded" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("dashboard.error.revenue")}
        </p>
      ) : days.length === 0 || maxAmount === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("dashboard.noRevenueData")}
        </p>
      ) : (
        <div className="flex h-[180px] items-end gap-3">
          {days.map((day, i) => {
            const heightPct = maxAmount > 0
              ? Math.max(4, Math.round((day.amount / maxAmount) * 100))
              : 4
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <div
                  title={`${day.amount} SAR`}
                  className="w-full cursor-default rounded-t-md bg-primary/75"
                  style={{ height: `${heightPct}%`, marginTop: "auto" }}
                />
                <span className="text-[11px] text-muted-foreground">
                  {formatDayLabel(day.date, locale)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
