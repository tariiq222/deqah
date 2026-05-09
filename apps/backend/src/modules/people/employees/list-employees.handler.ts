import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { toListResponse } from '../../../common/dto';
import { ListEmployeesDto, type EmployeeSortField } from './list-employees.dto';
import { mapEmployeeRow } from './employee-row.mapper';

export type ListEmployeesQuery = ListEmployeesDto & {
  page: number;
  limit: number;
};

function buildOrderBy(
  sortBy: EmployeeSortField | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
): Prisma.EmployeeOrderByWithRelationInput {
  const direction: 'asc' | 'desc' = sortOrder ?? 'asc';
  switch (sortBy) {
    case 'name': return { name: direction };
    case 'experience': return { experience: direction };
    case 'isActive': return { isActive: direction };
    case 'createdAt': return { createdAt: direction };
    default: return { createdAt: 'desc' };
  }
}

@Injectable()
export class ListEmployeesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListEmployeesQuery) {
    const where = {
      isActive: query.isActive,
      gender: query.gender,
      employmentType: query.employmentType,
      onboardingStatus: query.onboardingStatus,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(query.branchId ? { branches: { some: { branchId: query.branchId } } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        include: {
          branches: true,
          services: true,
          availability: { where: { isActive: true }, orderBy: { dayOfWeek: 'asc' } },
        },
      }),
      this.prisma.employee.count({ where }),
    ]);

    const ids = items.map((e) => e.id);
    const [ratings, bookings] = items.length
      ? await Promise.all([
          this.prisma.rating.groupBy({
            by: ['employeeId'],
            where: { employeeId: { in: ids } },
            _avg: { score: true },
            _count: { _all: true },
          }),
          this.prisma.booking.groupBy({
            by: ['employeeId'],
            where: { employeeId: { in: ids } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const ratingsByEmployee = new Map(
      ratings.map((r) => [r.employeeId, { avg: r._avg.score, count: r._count._all }]),
    );
    const bookingsByEmployee = new Map(bookings.map((b) => [b.employeeId, b._count._all]));

    return toListResponse(
      items.map((e) => mapEmployeeRow(e, ratingsByEmployee.get(e.id), bookingsByEmployee.get(e.id))),
      total,
      query.page,
      query.limit,
    );
  }
}
