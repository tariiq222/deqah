import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { toListResponse } from '../../../common/dto';
import { ListBookingsDto } from './list-bookings.dto';
import { mapBookingRow, type BookingRelations } from '../booking-row.mapper';

export type ListBookingsQuery = Omit<ListBookingsDto, 'page' | 'limit' | 'fromDate' | 'toDate'> & {
  page: number;
  limit: number;
  fromDate?: Date;
  toDate?: Date;
  membershipRole?: string | null;
  userId?: string;
};

@Injectable()
export class ListBookingsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(query: ListBookingsQuery) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();

    let employeeWhere: { employeeId?: string } = {};
    if (query.membershipRole === 'EMPLOYEE' && query.userId) {
      const emp = await this.prisma.employee.findFirst({
        where: { organizationId, userId: query.userId },
        select: { id: true },
      });
      if (!emp) {
        return toListResponse([], 0, query.page, query.limit);
      }
      employeeWhere = { employeeId: emp.id };
    }

    const searchTerm = query.search?.trim();
    const where: Record<string, unknown> = {
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...employeeWhere,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.bookingType ? { bookingType: query.bookingType } : {}),
      ...(query.fromDate || query.toDate
        ? { scheduledAt: { gte: query.fromDate, lte: query.toDate } }
        : {}),
      ...(searchTerm
        ? { id: { contains: searchTerm, mode: 'insensitive' as const } }
        : {}),
      ...(query.isGuest !== undefined
        ? { client: { source: query.isGuest ? 'ONLINE' : { not: 'ONLINE' } } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { scheduledAt: 'asc' },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const relations = await loadRelations(this.prisma, items);

    return toListResponse(
      items.map((row) => mapBookingRow(row, relations)),
      total,
      query.page,
      query.limit,
    );
  }
}

async function loadRelations(
  prisma: PrismaService,
  rows: { clientId: string; employeeId: string; serviceId: string }[],
): Promise<BookingRelations> {
  const clientIds = [...new Set(rows.map((r) => r.clientId))];
  const employeeIds = [...new Set(rows.map((r) => r.employeeId))];
  const serviceIds = [...new Set(rows.map((r) => r.serviceId))];

  const [clients, employees, services] = await Promise.all([
    clientIds.length
      ? prisma.client.findMany({ where: { id: { in: clientIds } } })
      : Promise.resolve([]),
    employeeIds.length
      ? prisma.employee.findMany({ where: { id: { in: employeeIds } } })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.service.findMany({ where: { id: { in: serviceIds } } })
      : Promise.resolve([]),
  ]);

  return {
    clientsById: new Map(clients.map((c) => [c.id, c])),
    employeesById: new Map(employees.map((e) => [e.id, e])),
    servicesById: new Map(services.map((s) => [s.id, s])),
  };
}
