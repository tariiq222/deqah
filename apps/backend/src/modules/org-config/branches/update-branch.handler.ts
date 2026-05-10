import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { BranchDeactivatedEvent } from '../events/branch-deactivated.event';
import { BranchReactivatedEvent } from '../events/branch-reactivated.event';
import { UpdateBranchDto } from './update-branch.dto';

export type UpdateBranchCommand = UpdateBranchDto & { branchId: string };

@Injectable()
export class UpdateBranchHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: UpdateBranchCommand) {
    const organizationId = this.tenant.requireOrganizationId();
    return this.rlsTx.withTransaction(
      async (tx) => {
        const branch = await tx.branch.findFirst({
          where: { id: dto.branchId, organizationId },
        });
        if (!branch) throw new NotFoundException('Branch not found');

        if (dto.isMain === true && !branch.isMain) {
          await tx.branch.updateMany({
            where: { isMain: true, organizationId, NOT: { id: dto.branchId } },
            data: { isMain: false },
          });
        }

        const wasActive = branch.isActive;
        const updated = await tx.branch.update({
          where: { id: dto.branchId },
          data: {
            nameAr: dto.nameAr,
            nameEn: dto.nameEn,
            phone: dto.phone,
            addressAr: dto.addressAr,
            addressEn: dto.addressEn,
            city: dto.city,
            country: dto.country,
            latitude: dto.latitude,
            longitude: dto.longitude,
            isActive: dto.isActive,
            isMain: dto.isMain,
            timezone: dto.timezone,
          },
        });

        if (dto.isActive !== undefined && dto.isActive !== wasActive) {
          const event = dto.isActive
            ? new BranchReactivatedEvent({ branchId: updated.id, organizationId })
            : new BranchDeactivatedEvent({ branchId: updated.id, organizationId });
          await this.eventBus.publish(event.eventName, event.toEnvelope()).catch(() => undefined);
        }

        return updated;
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
