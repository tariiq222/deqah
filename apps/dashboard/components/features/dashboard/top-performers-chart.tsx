"use client"

import Image from "next/image"
import { Skeleton } from "@deqah/ui"
import { useTopPerformers } from "@/hooks/use-top-performers"
import { useLocale } from "@/components/locale-provider"
import { formatPrice } from "@/lib/money"

export function TopPerformersChart() {
  const { data, isLoading } = useTopPerformers()
  const { t, locale } = useLocale()

  if (isLoading) return <Skeleton className="h-[300px] rounded-xl" />

  return (
    <div data-testid="top-performers" className="glass rounded-xl p-6">
      <h3 className="mb-4 text-lg font-semibold">
        {t("dashboard.topPerformers.title")}
      </h3>
      {!data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("dashboard.topPerformers.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((p, i) => {
            const max = data[0].revenue || 1
            const widthPct = Math.max(4, Math.round((p.revenue / max) * 100))
            return (
              <li key={p.employeeId} className="flex items-center gap-3">
                <span className="w-6 text-sm text-muted-foreground">
                  {i + 1}
                </span>
                {p.avatarUrl ? (
                  <Image
                    src={p.avatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="size-8 rounded-full bg-muted" />
                )}
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{p.displayName}</span>
                    <span className="text-sm tabular-nums">
                      {formatPrice(p.revenue, { locale })} {t("dashboard.currency")}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ inlineSize: `${widthPct}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("dashboard.topPerformers.bookingsCount").replace(
                      "{count}",
                      String(p.bookingsCount),
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
