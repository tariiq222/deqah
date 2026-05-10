import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { SubscriptionCacheService } from '../../platform/billing/subscription-cache.service';
import { assertLimitNotExceeded } from '../../platform/billing/assert-limit-not-exceeded';
import { EmployeeCreatedEvent } from '../events/employee-created.event';
import { CreateEmployeeDto } from './create-employee.dto';

export type CreateEmployeeCommand = CreateEmployeeDto;

@Injectable()
export class CreateEmployeeHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
    private readonly subscriptionCache: SubscriptionCacheService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: CreateEmployeeCommand) {
    const organizationId = this.tenant.requireOrganizationIdOrDefault();
    const subscription = await this.subscriptionCache.get(organizationId);

    if (dto.email) {
      const existing = await this.prisma.employee.findFirst({
        where: { email: dto.email },
      });
      if (existing) throw new ConflictException('Email already registered for this employee');
    }

    const employee = await this.rlsTx.withTransaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          gender: dto.gender,
          avatarUrl: dto.avatarUrl,
          bio: dto.bio,
          employmentType: dto.employmentType,
          userId: dto.userId,
          organizationId,
          branches: dto.branchIds?.length
            ? { create: dto.branchIds.map((branchId) => ({ branchId, organizationId })) }
            : undefined,
          services: dto.serviceIds?.length
            ? { create: dto.serviceIds.map((serviceId) => ({ serviceId, organizationId })) }
            : undefined,
        },
        include: { branches: true, services: true },
      });

      // Post-create plan-limit recheck — closes the TOCTOU race where two
      // concurrent requests at limit-1 both passed the pre-create guard.
      await assertLimitNotExceeded(
        tx,
        organizationId,
        'EMPLOYEES',
        subscription?.limits,
      );

      return created;
    });

    const event = new EmployeeCreatedEvent({ employeeId: employee.id, organizationId });
    this.eventBus.publish(event.eventName, event.toEnvelope()).catch(() => {});

    return employee;
  }
}
