import { PrismaService } from '../../../infrastructure/database';
import { PaymentStatus, BookingStatus } from '@prisma/client';

export interface RevenueReportParams {
  from: Date;
  to: Date;
  branchId?: string;
  employeeId?: string;
}

export interface RevenueReportResult {
  period: { from: string; to: string };
  summary: {
    totalRevenue: number;
    totalPayments: number;
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    averageBookingValue: number;
  };
  byBranch: Array<{ branchId: string; revenue: number; count: number }>;
  byEmployee: Array<{ employeeId: string; revenue: number; count: number }>;
  byDay: Array<{ date: string; revenue: number; count: number }>;
}

export async function buildRevenueReport(
  prisma: PrismaService,
  params: RevenueReportParams,
): Promise<RevenueReportResult> {
  const { from, to, branchId, employeeId } = params;

  const bookingWhere = {
    scheduledAt: { gte: from, lte: to },
    ...(branchId ? { branchId } : {}),
    ...(employeeId ? { employeeId } : {}),
  };

  const [bookings, payments] = await Promise.all([
    prisma.booking.findMany({
      where: bookingWhere,
      select: {
        id: true,
        status: true,
        price: true,
        branchId: true,
        employeeId: true,
        scheduledAt: true,
      },
    }),
    prisma.payment.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        status: PaymentStatus.COMPLETED,
      },
      select: {
        amount: true,
        createdAt: true,
        invoice: {
          select: {
            bookingId: true,
          },
        },
      },
    }),
  ]);

  const completedBookings = bookings.filter((b) => b.status === BookingStatus.COMPLETED);
  const cancelledBookings = bookings.filter((b) => b.status === BookingStatus.CANCELLED);
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  const completedBookingIds = new Set(completedBookings.map((b) => b.id));

  // By branch — use actual payment amount linked to booking, not booking.price
  const branchMap = new Map<string, { revenue: number; count: number }>();
  for (const p of payments) {
    const bookingId = p.invoice?.bookingId;
    if (!bookingId || !completedBookingIds.has(bookingId)) continue;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) continue;
    if (branchId && booking.branchId !== branchId) continue;
    const existing = branchMap.get(booking.branchId) ?? { revenue: 0, count: 0 };
    branchMap.set(booking.branchId, {
      revenue: existing.revenue + Number(p.amount),
      count: existing.count + 1,
    });
  }

  // By employee — use actual payment amount linked to booking
  const employeeMap = new Map<string, { revenue: number; count: number }>();
  for (const p of payments) {
    const bookingId = p.invoice?.bookingId;
    if (!bookingId || !completedBookingIds.has(bookingId)) continue;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) continue;
    if (employeeId && booking.employeeId !== employeeId) continue;
    const existing = employeeMap.get(booking.employeeId) ?? { revenue: 0, count: 0 };
    employeeMap.set(booking.employeeId, {
      revenue: existing.revenue + Number(p.amount),
      count: existing.count + 1,
    });
  }

  // By day
  const dayMap = new Map<string, { revenue: number; count: number }>();
  for (const p of payments) {
    const day = p.createdAt.toISOString().slice(0, 10);
    const existing = dayMap.get(day) ?? { revenue: 0, count: 0 };
    dayMap.set(day, {
      revenue: existing.revenue + Number(p.amount),
      count: existing.count + 1,
    });
  }

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      totalRevenue,
      totalPayments: payments.length,
      totalBookings: bookings.length,
      completedBookings: completedBookings.length,
      cancelledBookings: cancelledBookings.length,
      averageBookingValue:
        completedBookings.length > 0 ? totalRevenue / completedBookings.length : 0,
    },
    byBranch: [...branchMap.entries()].map(([branchId, v]) => ({ branchId, ...v })),
    byEmployee: [...employeeMap.entries()].map(([employeeId, v]) => ({ employeeId, ...v })),
    byDay: [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
  };
}
