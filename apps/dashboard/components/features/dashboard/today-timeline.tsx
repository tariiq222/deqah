"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Card } from "@deqah/ui"
import { Button } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import { useBookingMutations } from "@/hooks/use-bookings"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { formatName } from "@/lib/utils"
import type { Booking } from "@/lib/types/booking"

const VISIBLE_LIMIT = 6

interface TodayTimelineProps {
  bookings: Booking[]
  membershipRole?: string | null
}

const statusColors: Record<string, string> = {
  pending: "bg-warning",
  confirmed: "bg-primary",
  completed: "bg-success",
  cancelled: "bg-error",
}

export function TodayTimeline({ bookings, membershipRole }: TodayTimelineProps) {
  const { t } = useLocale()
  const { confirmMut, adminCancelMut } = useBookingMutations()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  function handleConfirm(id: string) {
    setLoadingId(id)
    confirmMut.mutate(id, {
      onSettled: () => setLoadingId(null),
      onSuccess: () => toast.success(t("bookings.actions.toast.confirmed")),
      onError: () => toast.error(t("dashboard.timeline.error")),
    })
  }

  function handleCancel(id: string) {
    setLoadingId(id)
    adminCancelMut.mutate(
      { id, reason: "receptionist_cancel", refundType: "none" },
      {
        onSettled: () => setLoadingId(null),
        onSuccess: () => toast.success(t("bookings.actions.toast.cancelled")),
        onError: () => toast.error(t("dashboard.timeline.error")),
      },
    )
  }

  const visible = bookings.slice(0, VISIBLE_LIMIT)
  const remaining = bookings.length - VISIBLE_LIMIT

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">
          {t("dashboard.todaySchedule")}
        </h2>
        <Link href="/bookings" className="text-xs font-medium text-primary hover:underline">
          {t("dashboard.viewAll")}
          <span className="ms-1 inline-block rtl:rotate-180">→</span>
        </Link>
      </div>

      {bookings.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t(
            membershipRole === "EMPLOYEE"
              ? "dashboard.timeline.empty.employee"
              : "dashboard.noAppointments",
          )}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((b) => {
            const client = b.client ? formatName(b.client.firstName, b.client.lastName) : "—"
            const employee = b.employee?.user
              ? formatName(b.employee.user.firstName, b.employee.user.lastName, "")
              : ""
            const time = b.startTime?.slice(0, 5) ?? "—"
            const color = statusColors[b.status] ?? "bg-muted-foreground"

            return (
              <div
                key={b.id}
                className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="w-14 text-end text-sm font-bold tabular-nums text-foreground">
                    {time}
                  </span>
                  <div className={cn("h-8 w-1 rounded-full", color)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{client}</p>
                    {employee && (
                      <p className="truncate text-xs text-muted-foreground">{employee}</p>
                    )}
                  </div>
                </div>

                {b.status === "pending" && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={loadingId === b.id}
                      className="text-success hover:bg-success/10 hover:text-success"
                      title={t("dashboard.timeline.confirm")}
                      onClick={() => handleConfirm(b.id)}
                    >
                      <HugeiconsIcon icon={Tick02Icon} size={14} />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={loadingId === b.id}
                      className="text-muted-foreground hover:bg-error/10 hover:text-error"
                      title={t("dashboard.timeline.cancel")}
                      onClick={() => handleCancel(b.id)}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={14} />
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          {remaining > 0 && (
            <Link
              href="/bookings"
              className="mt-1 text-center text-xs font-medium text-primary hover:underline"
            >
              {t("dashboard.moreAppointments").replace("{n}", String(remaining))}
            </Link>
          )}
        </div>
      )}
    </Card>
  )
}
