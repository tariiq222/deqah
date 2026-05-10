import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { TenantContextService } from '../../../../common/tenant/tenant-context.service';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { MoyasarSubscriptionClient } from '../../../finance/moyasar-api/moyasar-subscription.client';
import { AddSavedCardDto } from '../dto/saved-card.dto';
import { SubscriptionCacheService } from '../subscription-cache.service';

const SAVED_CARD_VERIFICATION_AMOUNT_HALALAS = 100;

@Injectable()
export class AddSavedCardHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
    private readonly cache: SubscriptionCacheService,
    private readonly moyasar: MoyasarSubscriptionClient,
    private readonly config: ConfigService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: AddSavedCardDto) {
    const organizationId = this.tenant.requireOrganizationId();
    const token = await this.moyasar.getToken(cmd.moyasarTokenId);
    this.assertUsableToken(token.expiryMonth, token.expiryYear);

    const existing = await this.prisma.savedCard.findFirst({
      where: { organizationId, moyasarTokenId: cmd.moyasarTokenId },
      select: { id: true },
    });
    if (existing) throw new ConflictException('saved_card_already_exists');

    const idempotencyKey = cmd.idempotencyKey ?? randomUUID();
    const verification = await this.moyasar.chargeWithToken({
      token: cmd.moyasarTokenId,
      amount: SAVED_CARD_VERIFICATION_AMOUNT_HALALAS,
      currency: 'SAR',
      idempotencyKey,
      givenId: idempotencyKey,
      description: 'Deqah saved card verification',
      callbackUrl: this.billingCallbackUrl(),
    });

    if (verification.status.toLowerCase() !== 'paid') {
      throw new UnprocessableEntityException('saved_card_verification_requires_retry');
    }

    await this.moyasar.refundPayment({
      paymentId: verification.id,
      amountHalalas: SAVED_CARD_VERIFICATION_AMOUNT_HALALAS,
      idempotencyKey: `saved-card-refund:${verification.id}`,
    });

    const cards = await this.prisma.savedCard.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const shouldDefault = cmd.makeDefault === true || cards.length === 0;
    const subscription = shouldDefault
      ? await this.prisma.subscription.findFirst({
          where: { organizationId },
          select: { status: true },
        })
      : null;
    const shouldRearmDunning = subscription?.status === 'PAST_DUE';
    const rearmAt = new Date();

    const created = await this.rlsTx.withTransaction(async (tx) => {
      if (shouldDefault) {
        await tx.savedCard.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const card = await tx.savedCard.create({
        data: {
          organizationId,
          moyasarTokenId: token.id,
          last4: token.last4,
          brand: token.brand,
          expiryMonth: token.expiryMonth,
          expiryYear: token.expiryYear,
          holderName: token.holderName,
          isDefault: shouldDefault,
        },
      });

      if (shouldDefault) {
        await tx.subscription.update({
          where: { organizationId },
          data: {
            defaultSavedCardId: card.id,
            moyasarCardTokenRef: card.moyasarTokenId,
            ...(shouldRearmDunning
              ? {
                  dunningRetryCount: 0,
                  nextRetryAt: rearmAt,
                }
              : {}),
          },
        });
      }

      return card;
    });

    this.cache.invalidate(organizationId);
    return created;
  }

  private assertUsableToken(expiryMonth: number, expiryYear: number): void {
    const now = new Date();
    const expiresAt = new Date(expiryYear, expiryMonth, 1);
    if (!Number.isInteger(expiryMonth) || !Number.isInteger(expiryYear) || expiryMonth < 1 || expiryMonth > 12 || expiresAt <= now) {
      throw new UnprocessableEntityException('saved_card_expired');
    }
  }

  private billingCallbackUrl(): string {
    const base =
      this.config.get<string>('BACKEND_URL') ??
      this.config.get<string>('DASHBOARD_PUBLIC_URL', '');
    return `${base.replace(/\/+$/, '')}/api/v1/public/billing/webhooks/moyasar`;
  }
}
