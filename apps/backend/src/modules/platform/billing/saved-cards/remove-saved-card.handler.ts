import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { TenantContextService } from '../../../../common/tenant/tenant-context.service';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { MoyasarSubscriptionClient } from '../../../finance/moyasar-api/moyasar-subscription.client';
import { SubscriptionCacheService } from '../subscription-cache.service';

const BILLABLE_STATUSES: readonly SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
];

@Injectable()
export class RemoveSavedCardHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly cache: SubscriptionCacheService,
    private readonly moyasar: MoyasarSubscriptionClient,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cardId: string) {
    const organizationId = this.tenant.requireOrganizationId();
    const card = await this.prisma.savedCard.findFirst({
      where: { id: cardId, organizationId },
      select: { id: true, moyasarTokenId: true, isDefault: true },
    });
    if (!card) throw new NotFoundException('saved_card_not_found');

    const [cardCount, subscription] = await Promise.all([
      this.prisma.savedCard.count({ where: { organizationId } }),
      this.prisma.subscription.findFirst({
        where: { organizationId },
        select: { id: true, status: true },
      }),
    ]);

    if (
      cardCount <= 1 &&
      subscription &&
      BILLABLE_STATUSES.includes(subscription.status)
    ) {
      throw new UnprocessableEntityException('last_saved_card_required');
    }

    await this.rlsTx.withTransaction(async (tx) => {
      await tx.savedCard.delete({ where: { id: card.id } });

      if (!card.isDefault) return;

      const [replacement] = await tx.savedCard.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, moyasarTokenId: true },
      });

      if (replacement) {
        await tx.savedCard.update({
          where: { id: replacement.id },
          data: { isDefault: true },
        });
        await tx.subscription.update({
          where: { organizationId },
          data: {
            defaultSavedCardId: replacement.id,
            moyasarCardTokenRef: replacement.moyasarTokenId,
          },
        });
        return;
      }

      await tx.subscription.update({
        where: { organizationId },
        data: { defaultSavedCardId: null, moyasarCardTokenRef: null },
      });
    });

    await this.moyasar.deleteToken(card.moyasarTokenId);
    this.cache.invalidate(organizationId);
    return { ok: true };
  }
}
