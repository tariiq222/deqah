/**
 * Booking Types — Deqah Dashboard
 *
 * Matches the backend Prisma schema + API response shapes.
 */

/**
 * Source of truth: shared/enums/booking.ts (TypeScript enums, UPPER_CASE)
 * Dashboard uses string union types (snake_case) for direct JSON compatibility.
 * Keep these in sync with the Prisma schema and shared/enums/booking.ts.
 */

/* ─── Enums ─── */

export type BookingType =
  | "in_person"
  | "online"
  | "walk_in"
  | "group"

export type BookingStatus =
  | "pending"
  | "pending_group_fill"
  | "awaiting_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | "expired"
  | "cancel_requested"

export type RefundType = "full" | "partial" | "none"

export type CancelledBy = "client" | "employee" | "admin" | "system"

/* ─── Entities ─── */

export interface BookingClient {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
}

export interface BookingEmployee {
  id: string
  userId: string
  user: { firstName: string; lastName: string }
  specialty: string
  specialtyAr: string
}

export interface BookingService {
  id: string
  nameAr: string
  nameEn: string
  price: number
  duration: number
}

export interface BookingPayment {
  id: string
  amount: number
  method: "moyasar" | "bank_transfer" | "cash"
  status: "pending" | "awaiting" | "paid" | "failed" | "refunded" | "rejected"
  totalAmount: number
}

export interface RescheduledFrom {
  id: string
  date: string
  startTime: string
}

/* ─── Main Booking ─── */

export interface Booking {
  id: string
  bookingNumber: number
  clientId: string | null
  employeeId: string
  serviceId: string
  employeeServiceId: string
  type: BookingType
  date: string
  startTime: string
  endTime: string
  status: BookingStatus
  checkedInAt: string | null
  notes: string | null
  zoomJoinUrl: string | null
  zoomHostUrl: string | null
  zoomMeetingStatus: "PENDING" | "CREATED" | "FAILED" | "CANCELLED" | null
  zoomMeetingError: string | null
  cancellationReason: string | null
  cancelledBy: CancelledBy | null
  suggestedRefundType: RefundType | null
  adminNotes: string | null
  cancelledAt: string | null
  confirmedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  client: BookingClient | null
  employee: BookingEmployee
  service: BookingService
  employeeService: { id: string } | null
  rescheduledFrom: RescheduledFrom | null
  payment: BookingPayment | null
  intakeFormId: string | null
  intakeFormAlreadySubmitted: boolean
}

/* ─── Query / Request DTOs ─── */

export interface BookingListQuery {
  page?: number
  perPage?: number
  status?: BookingStatus
  type?: BookingType
  employeeId?: string
  clientId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  isGuest?: boolean
}

export interface CreateBookingPayload {
  clientId?: string
  employeeId: string
  serviceId: string
  type: BookingType
  durationOptionId?: string
  date: string
  startTime: string
  notes?: string
  payAtClinic?: boolean
  branchId?: string
  couponCode?: string
}

export interface ReschedulePayload {
  date?: string
  startTime?: string
}

export interface CancelApprovePayload {
  refundType: RefundType
  refundAmount?: number
  adminNotes?: string
}

export interface CancelRejectPayload {
  adminNotes?: string
}

export interface AdminCancelPayload {
  reason: string
  refundType: RefundType
  refundAmount?: number
  adminNotes?: string
}

export interface EmployeeCancelPayload {
  reason: string
}

export interface CancelRequestPayload {
  reason?: string
}

export interface CreateRecurringPayload {
  employeeId: string
  serviceId: string
  type: BookingType
  date: string
  startTime: string
  notes?: string
  repeatEvery: "weekly" | "biweekly"
  repeatCount: number
}

export interface ClientReschedulePayload {
  date?: string
  startTime?: string
}

/* ─── Stats ─── */

export interface BookingStats {
  total: number
  confirmed: number
  pending: number
  completed: number
  cancelled: number
  cancelRequested: number
  noShow: number
  expired: number
}
