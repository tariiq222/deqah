"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  InvoiceIcon,
  CancelCircleIcon,
} from "@hugeicons/core-free-icons"
import { useLocale } from "@/components/locale-provider"
import type { VisibleWidgets } from "@/lib/dashboard-widgets"

interface AttentionAlertsProps {
  pendingPayments: number
  cancelRequests: number
  visible: VisibleWidgets["attentionAlerts"]
}

const severityStyles = {
  warning: {
    iconBg: "bg-warning/10",
    iconText: "text-warning",
    border: "border-s-warning",
  },
  error: {
    iconBg: "bg-error/10",
    iconText: "text-error",
    border: "border-s-error",
  },
  info: {
    iconBg: "bg-info/10",
    iconText: "text-info",
    border: "border-s-info",
  },
} as const

export function AttentionAlerts({
  pendingPayments,
  cancelRequests,
  visible,
}: AttentionAlertsProps) {
  const { t } = useLocale()

  const showPayments = visible.pendingPayments && pendingPayments > 0
  const showCancels = visible.cancelRequests && cancelRequests > 0

  if (!showPayments && !showCancels) return null

  return (
    <div
      data-testid="attention-alerts"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {showPayments && (
        <div data-testid="alert-pending-payments">
          <Link href="/payments">
            <div
              className={cn(
                "glass relative flex items-center gap-3.5 overflow-hidden rounded-xl border-s-[3px] p-4",
                severityStyles.warning.border
              )}
            >
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  severityStyles.warning.iconBg
                )}
              >
                <HugeiconsIcon
                  icon={InvoiceIcon}
                  size={20}
                  className={severityStyles.warning.iconText}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {pendingPayments > 0 && (
                    <span
                      className="tabular-nums"
                      style={{ display: "inline-block" }}
                    >
                      {pendingPayments}{" "}
                    </span>
                  )}
                  {t("alerts.pendingPayments")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t("alerts.pendingPaymentsDesc")}
                </p>
              </div>
            </div>
          </Link>
        </div>
      )}
      {showCancels && (
        <div data-testid="alert-cancel-requests">
          <Link href="/bookings">
            <div
              className={cn(
                "glass relative flex items-center gap-3.5 overflow-hidden rounded-xl border-s-[3px] p-4",
                severityStyles.error.border
              )}
            >
              <div
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full",
                  severityStyles.error.iconBg
                )}
              >
                <HugeiconsIcon
                  icon={CancelCircleIcon}
                  size={20}
                  className={severityStyles.error.iconText}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  {cancelRequests > 0 && (
                    <span
                      className="tabular-nums"
                      style={{ display: "inline-block" }}
                    >
                      {cancelRequests}{" "}
                    </span>
                  )}
                  {t("alerts.cancelRequests")}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t("alerts.cancelRequestsDesc")}
                </p>
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  )
}
