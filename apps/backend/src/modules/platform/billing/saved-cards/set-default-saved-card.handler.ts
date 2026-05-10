import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../../../../common/tenant/tenant-context.service';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { SubscriptionCacheService } from '../subscription-cache.service';

@Injectable()
export class SetDefaultSavedCardHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly cache: SubscriptionCacheService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cardId: string) {
    const organizationId = this.tenant.requireOrganizationId();
    const card = await this.prisma.savedCard.findFirst({
      where: { id: cardId, organizationId },
      select: { id: true, moyasarTokenId: true },
    });
    if (!card) throw new NotFoundException('saved_card_not_found');

    const updated = await this.rlsTx.withTransaction(async (tx) => {
      await tx.savedCard.updateMany({
        where: { organizationId, isDefault: true },
        data: { isDefault: false },
      });
      const result = await tx.savedCard.update({
        where: { id: card.id },
        data: { isDefault: true },
      });
      await tx.subscription.update({
        where: { organizationId },
        data: {
          defaultSavedCardId: card.id,
          moyasarCardTokenRef: card.moyasarTokenId,
        },
      });
      return result;
    });

    this.cache.invalidate(organizationId);
    return updated;
  }
}
