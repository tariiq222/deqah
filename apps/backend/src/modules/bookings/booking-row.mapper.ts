import type { Booking, Client, Employee, Service } from '@prisma/client';

export interface BookingRelations {
  clientsById: Map<string, Client>;
  employeesById: Map<string, Employee>;
  servicesById: Map<string, Service>;
}

/**
 * Normalize a Prisma Booking row + its eagerly-loaded (by id) relations into
 * the shape the dashboard expects:
 *   - lowercase `type` (enum snake_case)
 *   - `date` + `startTime` + `endTime` derived from scheduledAt / endsAt (UTC)
 *   - nested `client / employee.user / service / payment`
 *
 * Booking lives in its own bounded context; `client / employee / service` are
 * loaded separately and passed in via `relations` — there is no Prisma relation.
 */
export function mapBookingRow(b: Booking, relations: BookingRelations) {
  const client = relations.clientsById.get(b.clientId) ?? null;
  const employee = relations.employeesById.get(b.employeeId) ?? null;
  const service = relations.servicesById.get(b.serviceId) ?? null;

  const scheduled = b.scheduledAt;
  const ends = b.endsAt;

  const date = `${scheduled.getUTCFullYear()}-${pad(scheduled.getUTCMonth() + 1)}-${pad(scheduled.getUTCDate())}`;
  const startTime = `${pad(scheduled.getUTCHours())}:${pad(scheduled.getUTCMinutes())}`;
  const endTime = `${pad(ends.getUTCHours())}:${pad(ends.getUTCMinutes())}`;

  const clientNames = splitName(client?.name ?? null, client?.firstName ?? null, client?.lastName ?? null);
  const employeeNames = splitName(employee?.name ?? null, null, null);

  const price = Number(b.price);
  // Dashboard's FormattedCurrency expects amount in halalat (1 SAR = 100 halalat).
  const priceInHalalat = Math.round(price * 100);

  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    clientId: b.clientId,
    employeeId: b.employeeId,
    serviceId: b.serviceId,
    employeeServiceId: '',
    type: mapTypeForUi(b.bookingType),
    date,
    startTime,
    endTime,
    status: mapStatusForUi(b.status),
    checkedInAt: b.checkedInAt?.toISOString() ?? null,
    notes: b.notes ?? null,
    zoomJoinUrl: b.zoomJoinUrl ?? null,
    zoomHostUrl: b.zoomHostUrl ?? null,
    zoomStartUrl: b.zoomStartUrl ?? null,
    zoomMeetingStatus: b.zoomMeetingStatus ?? null,
    zoomMeetingError: b.zoomMeetingError ?? null,
    cancellationReason: b.cancelReason ?? null,
    cancelledBy: null,
    suggestedRefundType: null,
    adminNotes: null,
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
    confirmedAt: b.confirmedAt?.toISOString() ?? null,
    completedAt: b.completedAt?.toISOString() ?? null,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    client: client
      ? {
          id: client.id,
          firstName: clientNames.first,
          lastName: clientNames.last,
          email: client.email ?? '',
          phone: client.phone ?? null,
        }
      : null,
    employee: employee
      ? {
          id: employee.id,
          userId: employee.userId ?? '',
          user: { firstName: employeeNames.first, lastName: employeeNames.last },
          specialty: employee.specialty ?? '',
          specialtyAr: employee.specialtyAr ?? '',
        }
      : null,
    service: service
      ? {
          id: service.id,
          nameAr: service.nameAr,
          nameEn: service.nameEn ?? '',
          price: Number(service.price),
          duration: service.durationMins,
        }
      : null,
    employeeService: null,
    rescheduledFrom: null,
    payment: {
      id: b.id,
      amount: priceInHalalat,
      method: 'cash' as const,
      status: 'pending' as const,
      totalAmount: priceInHalalat,
    },
    intakeFormId: null,
    intakeFormAlreadySubmitted: false,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** DB BookingType → dashboard snake_case alias. INDIVIDUAL → in_person. */
function mapTypeForUi(t: string): string {
  const lower = t.toLowerCase();
  if (lower === 'individual') return 'in_person';
  return lower;
}

/** DB enum → dashboard BookingStatus union.
 * awaiting_payment and pending_group_fill are treated as `pending` for UX simplicity.
 */
function mapStatusForUi(s: string): string {
  const lower = s.toLowerCase();
  if (lower === 'awaiting_payment' || lower === 'pending_group_fill') return 'pending';
  return lower;
}

function splitName(full: string | null, first: string | null, last: string | null) {
  if (first || last) return { first: first ?? '', last: last ?? '' };
  if (!full) return { first: '', last: '' };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}
