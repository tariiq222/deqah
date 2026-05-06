export type QuickActionKey = 'newBooking' | 'newClient' | 'recordPayment'

export interface VisibleWidgets {
  stats: {
    bookings: boolean
    clients: boolean
    revenue: boolean
    pendingPayments: boolean
  }
  attentionAlerts: {
    pendingPayments: boolean
    cancelRequests: boolean
  }
  quickActions: QuickActionKey[]
  todayTimeline: boolean
  activityFeed: boolean
  revenueChart: boolean
  recentPayments: boolean
  topPerformers: boolean
}

type CanDo = (module: string, action: string) => boolean

export function getVisibleWidgets(
  membershipRole: string | null,
  canDo: CanDo,
): VisibleWidgets {
  const role = membershipRole ?? ''
  // Subjects on the BE are singular PascalCase (Booking/Client/Payment/Report)
  // and are lowercased by `flattenPermissions` before serialization to the
  // `permissions` array. The dashboard's `canDo()` matches that flat string.
  const canBookingRead = canDo('booking', 'read')
  const canBookingCreate = canDo('booking', 'create')
  const canBookingUpdate = canDo('booking', 'update')
  const canClientRead = canDo('client', 'read')
  const canClientCreate = canDo('client', 'create')
  const canPaymentRead = canDo('payment', 'read')
  const canPaymentCreate = canDo('payment', 'create')
  const canReportRead = canDo('report', 'read')

  const quickActions: QuickActionKey[] = []
  if (role !== 'EMPLOYEE') {
    if (canBookingCreate) quickActions.push('newBooking')
    if (canClientCreate) quickActions.push('newClient')
    if (canPaymentCreate) quickActions.push('recordPayment')
  }

  return {
    stats: {
      bookings: canBookingRead,
      clients: canClientRead,
      revenue: canPaymentRead,
      pendingPayments: canPaymentRead,
    },
    attentionAlerts: {
      pendingPayments: canPaymentRead,
      cancelRequests: canBookingUpdate,
    },
    quickActions,
    todayTimeline: canBookingRead,
    activityFeed: true,
    revenueChart: canReportRead && canPaymentRead,
    recentPayments: canPaymentRead,
    topPerformers: canReportRead && role !== 'ACCOUNTANT' && role !== '',
  }
}
