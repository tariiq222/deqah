import { describe, it, expect } from 'vitest'
import { getVisibleWidgets } from '@/lib/dashboard-widgets'

const allow = (perms: string[]) => (m: string, a: string) =>
  perms.includes(`${m}:${a}`) || perms.includes(`${m}:*`) || perms.includes('*')

// Subjects mirror what the BE emits via `flattenPermissions` (singular,
// lowercased). See apps/backend/src/modules/identity/casl/flatten-permissions.ts.
const OWNER = allow(['*'])
const ADMIN = allow([
  'booking:*', 'client:*', 'employee:*', 'invoice:*',
  'payment:*', 'report:*', 'setting:*', 'branding:*',
])
const RECEPTIONIST = allow(['booking:*', 'client:*', 'employee:read', 'invoice:read'])
const ACCOUNTANT = allow(['invoice:*', 'payment:*', 'booking:read', 'report:read'])
const EMPLOYEE = allow(['booking:read', 'booking:update', 'client:read'])

describe('getVisibleWidgets', () => {
  it('OWNER sees everything including topPerformers', () => {
    const v = getVisibleWidgets('OWNER', OWNER)
    expect(v.topPerformers).toBe(true)
    expect(v.revenueChart).toBe(true)
    expect(v.stats.revenue).toBe(true)
    expect(v.quickActions).toEqual(['newBooking', 'newClient', 'recordPayment'])
  })

  it('ADMIN sees topPerformers and revenue', () => {
    const v = getVisibleWidgets('ADMIN', ADMIN)
    expect(v.topPerformers).toBe(true)
    expect(v.revenueChart).toBe(true)
  })

  it('RECEPTIONIST hides revenue and topPerformers', () => {
    const v = getVisibleWidgets('RECEPTIONIST', RECEPTIONIST)
    expect(v.stats.revenue).toBe(false)
    expect(v.stats.pendingPayments).toBe(false)
    expect(v.revenueChart).toBe(false)
    expect(v.recentPayments).toBe(false)
    expect(v.topPerformers).toBe(false)
    expect(v.attentionAlerts.pendingPayments).toBe(false)
    expect(v.attentionAlerts.cancelRequests).toBe(true)
    expect(v.quickActions).toEqual(['newBooking', 'newClient'])
  })

  it('ACCOUNTANT sees revenue + recentPayments but NOT topPerformers', () => {
    const v = getVisibleWidgets('ACCOUNTANT', ACCOUNTANT)
    expect(v.revenueChart).toBe(true)
    expect(v.recentPayments).toBe(true)
    expect(v.topPerformers).toBe(false)
    expect(v.stats.clients).toBe(false)
    expect(v.quickActions).toEqual(['recordPayment'])
  })

  it('EMPLOYEE sees only personal info — no quickActions, no payments', () => {
    const v = getVisibleWidgets('EMPLOYEE', EMPLOYEE)
    expect(v.quickActions).toEqual([])
    expect(v.revenueChart).toBe(false)
    expect(v.recentPayments).toBe(false)
    expect(v.topPerformers).toBe(false)
    expect(v.stats.bookings).toBe(true)
    expect(v.stats.clients).toBe(true)
    expect(v.todayTimeline).toBe(true)
  })

  it('unknown role degrades to greeting + activity feed only', () => {
    const v = getVisibleWidgets(null, () => false)
    expect(v.todayTimeline).toBe(false)
    expect(v.quickActions).toEqual([])
    expect(v.activityFeed).toBe(true)
  })
})
