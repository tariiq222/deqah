/**
 * Dashboard Stats API — Deqah Dashboard
 * Endpoint: GET /dashboard/stats
 */

import { api } from "@/lib/api"

export interface DashboardStats {
  todayBookings: number
  confirmedToday: number
  pendingToday: number
  pendingPayments: number
  cancelRequests: number
  todayRevenue: number
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return api.get<DashboardStats>("/dashboard/stats")
}

export interface TopPerformer {
  employeeId: string
  displayName: string
  avatarUrl: string | null
  bookingsCount: number
  revenue: number
}

export async function fetchTopPerformers(): Promise<TopPerformer[]> {
  return api.get<TopPerformer[]>("/dashboard/top-performers?period=month")
}
