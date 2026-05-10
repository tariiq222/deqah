import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { SetEmployeeServiceOptionsDto } from './set-employee-service-options.dto';

export type SetEmployeeServiceOptionsCommand = SetEmployeeServiceOptionsDto & {
  employeeServiceId: string;
};

@Injectable()
export class SetEmployeeServiceOptionsHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: SetEmployeeServiceOptionsCommand) {
    const organizationId = this.tenant.requireOrganizationId();
    const optionIds = dto.options.map((o) => o.durationOptionId);
    const validOptions = await this.prisma.serviceDurationOption.findMany({
      where: { id: { in: optionIds } },
      select: { id: true },
    });
    const validIds = new Set(validOptions.map((o) => o.id));
    const invalid = optionIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new NotFoundException(`ServiceDurationOption(s) not found: ${invalid.join(', ')}`);
    }

    await this.rlsTx.withTransaction((tx) =>
      Promise.all(dto.options.map((opt) =>
        tx.employeeServiceOption.upsert({
          where: {
            employeeServiceId_durationOptionId: {
              employeeServiceId: dto.employeeServiceId,
              durationOptionId: opt.durationOptionId,
            },
          },
          create: {
            employeeServiceId: dto.employeeServiceId,
            organizationId,
            durationOptionId: opt.durationOptionId,
            priceOverride: opt.priceOverride ?? null,
            durationOverride: opt.durationOverride ?? null,
            isActive: opt.isActive ?? true,
          },
          update: {
            priceOverride: opt.priceOverride ?? null,
            durationOverride: opt.durationOverride ?? null,
            ...(opt.isActive !== undefined && { isActive: opt.isActive }),
          },
        }),
      )),
    );

    return this.prisma.employeeServiceOption.findMany({
      where: { employeeServiceId: dto.employeeServiceId },
      include: { durationOption: true },
    });
  }
}
