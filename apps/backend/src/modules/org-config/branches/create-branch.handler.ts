import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { TenantContextService } from '../../../common/tenant';
import { EventBusService } from '../../../infrastructure/events';
import { SubscriptionCacheService } from '../../platform/billing/subscription-cache.service';
import { assertLimitNotExceeded } from '../../platform/billing/assert-limit-not-exceeded';
import { BranchCreatedEvent } from '../events/branch-created.event';
import { CreateBranchDto } from './create-branch.dto';

export type CreateBranchCommand = CreateBranchDto;

@Injectable()
export class CreateBranchHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly eventBus: EventBusService,
    private readonly subscriptionCache: SubscriptionCacheService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: CreateBranchCommand) {
    const organizationId = this.tenant.requireOrganizationId();
    const subscription = await this.subscriptionCache.get(organizationId);
    const branch = await this.rlsTx.withTransaction(
      async (tx) => {
        const existing = await tx.branch.findFirst({
          where: { nameAr: dto.nameAr, organizationId },
        });
        if (existing) throw new ConflictException('Branch with this Arabic name already exists');

        if (dto.isMain === true) {
          await tx.branch.updateMany({
            where: { isMain: true, organizationId },
            data: { isMain: false },
          });
        }

        const created = await tx.branch.create({
          data: {
            organizationId,
            nameAr: dto.nameAr,
            nameEn: dto.nameEn,
            phone: dto.phone,
            addressAr: dto.addressAr,
            addressEn: dto.addressEn,
            city: dto.city,
            country: dto.country ?? 'SA',
            latitude: dto.latitude,
            longitude: dto.longitude,
            isActive: dto.isActive,
            isMain: dto.isMain,
            timezone: dto.timezone,
          },
        });

        // Post-create plan-limit recheck — closes the TOCTOU race where two
        // concurrent requests at limit-1 both passed the pre-create guard.
        // Throws ForbiddenException → tx rolls back the insert above.
        await assertLimitNotExceeded(
          tx,
          organizationId,
          'BRANCHES',
          subscription?.limits,
        );

        return created;
      },
      { isolationLevel: 'Serializable' },
    );

    const event = new BranchCreatedEvent({ branchId: branch.id, organizationId });
    this.eventBus.publish(event.eventName, event.toEnvelope()).catch(() => {});

    return branch;
  }
}
