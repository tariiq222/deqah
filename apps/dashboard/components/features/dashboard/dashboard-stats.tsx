"use client"

import {
  Calendar03Icon,
  UserMultiple02Icon,
  Clock01Icon,
  MoneyReceiveSquareIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import { StatsGrid } from "@/components/features/stats-grid"
import { StatCard } from "@/components/features/stat-card"
import { useLocale } from "@/components/locale-provider"
import type { VisibleWidgets } from "@/lib/dashboard-widgets"

interface DashboardStatsApi {
  todayBookings: number
  confirmedToday: number
  pendingToday: number
  pendingPayments: number
  cancelRequests: number
  todayRevenue: number
}

interface DashboardStatsProps {
  stats: DashboardStatsApi | undefined
  visibleStats: VisibleWidgets["stats"]
}

type StatCardConfig = {
  key: "bookings" | "clients" | "pending" | "revenue"
  title: string
  value: number
  icon: IconSvgElement
  iconColor: "primary" | "success" | "warning" | "accent"
  description?: string
}

export function DashboardStats({ stats, visibleStats }: DashboardStatsProps) {
  const { t } = useLocale()

  const todayBookings = stats?.todayBookings ?? 0
  const confirmedToday = stats?.confirmedToday ?? 0
  const pendingToday = stats?.pendingToday ?? 0
  const todayRevenue = stats?.todayRevenue ?? 0

  const cards = [
    visibleStats.bookings && {
      key: "bookings" as const,
      title: t("dashboard.todayBookings"),
      value: todayBookings,
      icon: Calendar03Icon,
      iconColor: "primary" as const,
    },
    visibleStats.clients && {
      key: "clients" as const,
      title: t("dashboard.newClients"),
      value: confirmedToday,
      icon: UserMultiple02Icon,
      iconColor: "success" as const,
    },
    visibleStats.pendingPayments && {
      key: "pending" as const,
      title: t("dashboard.awaitingApproval"),
      value: pendingToday,
      icon: Clock01Icon,
      iconColor: "warning" as const,
    },
    visibleStats.revenue && {
      key: "revenue" as const,
      title: t("dashboard.todayRevenue"),
      value: todayRevenue,
      icon: MoneyReceiveSquareIcon,
      iconColor: "accent" as const,
      description: t("dashboard.currency"),
    },
  ].filter(Boolean) as StatCardConfig[]

  if (cards.length === 0) return null

  return (
    <div data-testid="dashboard-stats">
      <StatsGrid>
        {cards.map((card) => (
          <div key={card.key} data-testid={`stat-${card.key}`}>
            <StatCard
              title={card.title}
              value={card.value}
              icon={card.icon}
              iconColor={card.iconColor}
              description={card.description}
            />
          </div>
        ))}
      </StatsGrid>
    </div>
  )
}
