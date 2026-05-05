"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import type { IconSvgElement } from "@hugeicons/react"
import {
  Calendar03Icon,
  UserAdd01Icon,
  MoneyBag02Icon,
} from "@hugeicons/core-free-icons"
import { Card } from "@deqah/ui"
import { useLocale } from "@/components/locale-provider"
import type { QuickActionKey } from "@/lib/dashboard-widgets"

type ActionConfig = {
  titleKey: string
  icon: IconSvgElement
  href: string
  color: "primary" | "success" | "warning" | "info"
}

const ACTION_CONFIG: Record<QuickActionKey, ActionConfig> = {
  newBooking: {
    titleKey: "actions.newBooking",
    icon: Calendar03Icon,
    href: "/bookings?new=1",
    color: "primary",
  },
  newClient: {
    titleKey: "actions.addClient",
    icon: UserAdd01Icon,
    href: "/clients?new=1",
    color: "success",
  },
  recordPayment: {
    titleKey: "actions.recordPayment",
    icon: MoneyBag02Icon,
    href: "/payments?new=1",
    color: "info",
  },
}

const colorMap = {
  primary: "bg-primary/8 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
} as const

interface Props {
  actions: QuickActionKey[]
}

export function QuickActions({ actions }: Props) {
  const { t } = useLocale()

  if (actions.length === 0) return null

  return (
    <div
      data-testid="quick-actions"
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {actions.map((key) => {
        const cfg = ACTION_CONFIG[key]
        return (
          <Link key={key} href={cfg.href} data-testid={`quick-action-${key}`}>
            <Card className="card-lift group flex items-center gap-3 px-5 py-3">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full",
                  colorMap[cfg.color]
                )}
              >
                <HugeiconsIcon icon={cfg.icon} size={18} />
              </div>
              <span className="text-sm font-medium text-foreground">
                {t(cfg.titleKey)}
              </span>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
