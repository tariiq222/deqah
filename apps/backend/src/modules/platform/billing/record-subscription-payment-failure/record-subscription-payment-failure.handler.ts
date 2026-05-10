import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { SubscriptionCacheService } from '../subscription-cache.service';
import { SubscriptionStateMachine } from '../subscription-state-machine';
import { PlatformMailerService } from '../../../../infrastructure/mail';

export interface RecordSubscriptionPaymentFailureCommand {
  invoiceId: string;
  moyasarPaymentId: string;
  reason: string;
}

const FIRST_DUNNING_RETRY_DELAY_MS = 3 * 60 * 60 * 1000;

@Injectable()
export class RecordSubscriptionPaymentFailureHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SubscriptionCacheService,
    private readonly stateMachine: SubscriptionStateMachine,
    private readonly mailer: PlatformMailerService,
    private readonly config: ConfigService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: RecordSubscriptionPaymentFailureCommand) {
    const invoice = await this.prisma.subscriptionInvoice.findFirst({
      where: { id: cmd.invoiceId },
      include: { subscription: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const sub = invoice.subscription;
    const newStatus =
      sub.status === 'PAST_DUE'
        ? 'PAST_DUE'
        : this.stateMachine.transition(sub.status, { type: 'chargeFailure' });
    const now = new Date();
    const firstRetryAt = new Date(now.getTime() + FIRST_DUNNING_RETRY_DELAY_MS);

    await this.rlsTx.withBypassTransaction(async (tx) => {
      // bypassRls: Moyasar webhook — cross-org platform billing, no tenant CLS context
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          status: 'FAILED',
          failureReason: cmd.reason,
          attemptCount: { increment: 1 },
          moyasarPaymentId: cmd.moyasarPaymentId,
        },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          organizationId: sub.organizationId, // explicit — Lesson 8
          status: newStatus,
          pastDueSince:
            newStatus === 'PAST_DUE' && !sub.pastDueSince ? now : sub.pastDueSince,
          lastFailureReason: cmd.reason,
          retryCount: { increment: 1 },
          dunningRetryCount: 0,
          nextRetryAt: sub.nextRetryAt ?? firstRetryAt,
        },
      });
      await tx.dunningLog.create({
        data: {
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          invoiceId: invoice.id,
          attemptNumber: 0,
          status: 'FAILED',
          moyasarPaymentId: cmd.moyasarPaymentId,
          failureReason: cmd.reason,
          scheduledFor: now,
          executedAt: now,
        },
      });
    });

    this.cache.invalidate(sub.organizationId);

    const owner = await this.prisma.membership.findFirst({
      where: { organizationId: sub.organizationId, role: 'OWNER', isActive: true },
      select: {
        displayName: true,
        user: { select: { email: true, name: true } },
        organization: { select: { nameAr: true } },
      },
    });
    if (owner?.user) {
      const baseUrl = this.config.get<string>(
        'PLATFORM_DASHBOARD_URL',
        'https://app.webvue.pro/dashboard',
      );
      await this.mailer.sendSubscriptionPaymentFailed(owner.user.email, {
        ownerName: owner.displayName ?? owner.user.name ?? '',
        orgName: owner.organization.nameAr,
        amountSar: Number(invoice.amount).toFixed(2),
        reason: cmd.reason,
        billingUrl: `${baseUrl}/billing`,
      });
    }

    return { ok: true };
  }
}
