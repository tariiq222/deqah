import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';

export interface GetEmployeeServiceTypesQuery {
  employeeId: string;
  serviceId: string;
}

/**
 * Resolves the bookable (type, duration-options) matrix for a specific
 * employee-service pair, consumed by the dashboard create-booking wizard.
 *
 * Source of truth:
 *   ServiceBookingConfig  — which booking types are active for this service.
 *   ServiceDurationOption — per-service duration variants, optionally
 *                           scoped to a booking type (bookingType IS NULL means
 *                           the option applies to every active type).
 *   EmployeeServiceOption — employee-level price/duration overrides on
 *                           ServiceDurationOption.
 */
@Injectable()
export class GetEmployeeServiceTypesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetEmployeeServiceTypesQuery) {
    const link = await this.prisma.employeeService.findFirst({
      where: { employeeId: query.employeeId, serviceId: query.serviceId },
    });
    if (!link) throw new NotFoundException('Employee-service link not found');

    const [configs, durationOptions, employeeOverrides] = await Promise.all([
      this.prisma.serviceBookingConfig.findMany({
        where: { serviceId: query.serviceId, isActive: true },
        orderBy: { bookingType: 'asc' },
      }),
      this.prisma.serviceDurationOption.findMany({
        where: { serviceId: query.serviceId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { durationMins: 'asc' }],
      }),
      this.prisma.employeeServiceOption.findMany({
        where: { employeeServiceId: link.id, isActive: true },
      }),
    ]);

    const overrideByDurationId = new Map(
      employeeOverrides.map((o) => [o.durationOptionId, o]),
    );

    return configs.map((cfg) => {
      const scoped = durationOptions.filter(
        (d) => d.bookingType === null || d.bookingType === cfg.bookingType,
      );

      return {
        id: `${link.id}:${cfg.bookingType}`,
        employeeServiceId: link.id,
        bookingType: cfg.bookingType.toLowerCase(),
        price: Number(cfg.price),
        duration: cfg.durationMins,
        useCustomOptions: scoped.length > 0,
        isActive: cfg.isActive,
        durationOptions: scoped.map((d) => {
          const ov = overrideByDurationId.get(d.id);
          return {
            id: d.id,
            employeeServiceTypeId: `${link.id}:${cfg.bookingType}`,
            label: d.label,
            labelAr: d.labelAr,
            durationMinutes: ov?.durationOverride ?? d.durationMins,
            price: Number(ov?.priceOverride ?? d.price),
            isDefault: d.isDefault,
            sortOrder: d.sortOrder,
            isActive: d.isActive,
          };
        }),
      };
    });
  }
}
