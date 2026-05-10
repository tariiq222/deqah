import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { SetBusinessHoursDto } from './set-business-hours.dto';

export type SetBusinessHoursCommand = SetBusinessHoursDto;

@Injectable()
export class SetBusinessHoursHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: SetBusinessHoursCommand) {
    const organizationId = this.tenant.requireOrganizationId();
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, organizationId },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    for (const slot of dto.schedule) {
      if (slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
        throw new BadRequestException(`Invalid dayOfWeek: ${slot.dayOfWeek}`);
      }
    }

    await this.rlsTx.withTransaction((tx) =>
      Promise.all(dto.schedule.map((slot) =>
        tx.businessHour.upsert({
          where: { branchId_dayOfWeek: { branchId: dto.branchId, dayOfWeek: slot.dayOfWeek } },
          create: {
            organizationId,
            branchId: dto.branchId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isOpen: slot.isOpen,
          },
          update: {
            startTime: slot.startTime,
            endTime: slot.endTime,
            isOpen: slot.isOpen,
          },
        }),
      )),
    );

    return this.prisma.businessHour.findMany({
      where: { branchId: dto.branchId, organizationId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }
}
