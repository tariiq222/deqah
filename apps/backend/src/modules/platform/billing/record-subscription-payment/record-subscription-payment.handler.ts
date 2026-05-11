import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { SubscriptionCacheService } from '../subscription-cache.service';
import { SubscriptionStateMachine } from '../subscription-state-machine';
import { PlatformMailerService } from '../../../../infrastructure/mail';
import { IssueInvoiceHandler } from '../issue-invoice/issue-invoice.handler';
import { advanceBillingPeriodEnd } from '../billing-period.util';

export interface RecordSubscriptionPaymentCommand {
  invoiceId: string;
  moyasarPaymentId: string;
}

@Injectable()
export class RecordSubscriptionPaymentHandler {
  private readonly logger = new Logger(RecordSubscriptionPaymentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SubscriptionCacheService,
    private readonly stateMachine: SubscriptionStateMachine,
    private readonly mailer: PlatformMailerService,
    private readonly config: ConfigService,
    private readonly issueInvoice: IssueInvoiceHandler,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: RecordSubscriptionPaymentCommand) {
    const invoice = await this.prisma.subscriptionInvoice.findFirst({
      where: { id: cmd.invoiceId },
      include: { subscription: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const sub = invoice.subscription;
    const newStatus = this.stateMachine.transition(sub.status, { type: 'chargeSuccess' });
    const now = new Date();
    // Bug B2 fix — advance the billing period off the current period end
    // (or off `now` if the period already lapsed) so the due-charge cron
    // does not re-select the same subscription on its next tick and
    // double-bill the tenant.
    const nextPeriodEnd = advanceBillingPeriodEnd(
      sub.currentPeriodEnd,
      sub.billingCycle,
      now,
    );
    const nextPeriodStart =
      sub.currentPeriodEnd.getTime() < now.getTime() ? now : sub.currentPeriodEnd;

    await this.rlsTx.withBypassTransaction(async (tx) => {
      // bypassRls: Moyasar webhook — cross-org platform billing, no tenant CLS context
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAt: now, moyasarPaymentId: cmd.moyasarPaymentId },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          organizationId: sub.organizationId, // explicit — Lesson 8
          status: newStatus,
          currentPeriodStart: nextPeriodStart,
          currentPeriodEnd: nextPeriodEnd,
          pastDueSince: null,
          lastPaymentAt: now,
          retryCount: 0,
          dunningRetryCount: 0,
          nextRetryAt: null,
          lastFailureReason: null,
        },
      });
      // S2: Write the outbox event inside the transaction so Zoho mirror
      // delivery is guaranteed-atomic with the payment state change.
      // OutboxPublisherCron picks this up within 5 s and forwards to EventBusService.
      await tx.outboxEvent.create({
        data: {
          aggregateId: invoice.id,
          eventType: 'platform.subscription_invoice.paid',
          payload: {
            organizationId: sub.organizationId,
            subscriptionId: sub.id,
            invoiceId: invoice.id,
            moyasarPaymentId: cmd.moyasarPaymentId,
            amount: invoice.amount.toString(),
            currency: invoice.currency,
            paidAt: now.toISOString(),
          },
        },
      });
    });

    this.cache.invalidate(sub.organizationId);

    // Phase 7 — auto-issue the invoice (number + hash chain) on first
    // successful payment. Idempotent — re-running leaves the invoice
    // unchanged. Status stays PAID; only issuedAt + invoiceNumber + hash
    // become non-null.
    if (!invoice.issuedAt || !invoice.invoiceNumber) {
      await this.issueInvoice.execute(invoice.id);
    }

    const owner = await this.prisma.$allTenants.membership.findFirst({
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
      await this.mailer.sendSubscriptionPaymentSucceeded(owner.user.email, {
        ownerName: owner.displayName ?? owner.user.name ?? '',
        orgName: owner.organization.nameAr,
        amountSar: Number(invoice.amount).toFixed(2),
        invoiceId: invoice.id,
        receiptUrl: `${baseUrl}/billing/${invoice.id}`,
      });
    }

    return { ok: true };
  }
}
