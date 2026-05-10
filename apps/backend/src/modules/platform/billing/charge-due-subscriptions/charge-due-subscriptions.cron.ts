import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { withCronLeader } from '../../../../common/helpers/cron-leader.helper';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SUPER_ADMIN_CONTEXT_CLS_KEY } from '../../../../common/tenant/tenant.constants';
import { MoyasarSubscriptionClient } from '../../../finance/moyasar-api/moyasar-subscription.client';
import { RecordSubscriptionPaymentHandler } from '../record-subscription-payment/record-subscription-payment.handler';
import { RecordSubscriptionPaymentFailureHandler } from '../record-subscription-payment-failure/record-subscription-payment-failure.handler';
import { LaunchFlags } from '../feature-flags/launch-flags';
import { ComputeOverageCron } from '../compute-overage/compute-overage.cron';

const PLATFORM_VAT_RATE = new Prisma.Decimal('0.15');

interface PriceSource {
  priceMonthly: unknown;
  priceAnnual: unknown;
}

interface PlanLimitsSource {
  limits: unknown; // JSON column from Prisma — Record<string, number | boolean> at runtime
}

interface SubWithPlan {
  id: string;
  organizationId: string;
  billingCycle: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  moyasarCardTokenRef: string | null;
  plan: PriceSource & PlanLimitsSource;
  planVersion: (PriceSource & PlanLimitsSource) | null;
}

@Injectable()
export class ChargeDueSubscriptionsCron {
  private readonly logger = new Logger(ChargeDueSubscriptionsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cls: ClsService,
    private readonly moyasar: MoyasarSubscriptionClient,
    private readonly recordPayment: RecordSubscriptionPaymentHandler,
    private readonly recordFailure: RecordSubscriptionPaymentFailureHandler,
    private readonly flags: LaunchFlags,
    private readonly overage: ComputeOverageCron,
  ) {}

  async execute(): Promise<void> {
    if (!this.config.get<boolean>('BILLING_CRON_ENABLED', false)) return;

    await this.cls.run(async () => {
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      this.logger.log('systemContext: charge-due-subscriptions tick');
      await withCronLeader(this.prisma, 'charge-due-subscriptions', async () => {
        await this.runCharge();
      });
    });
  }

  private async runCharge(): Promise<void> {
    const now = new Date();
    // Belt-and-suspenders against Bug B2: even after
    // `record-subscription-payment` advances `currentPeriodEnd`, refuse
    // to re-charge any subscription whose `lastPaymentAt` is within
    // the last 24h. If both signals (period end advanced AND recent
    // payment) somehow misalign we still fail-safe to "do nothing".
    // Oldest-due first so a backlog drains in fair order.
    const recentPaymentCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const due = await this.prisma.$allTenants.subscription.findMany({
      where: {
        currentPeriodEnd: { lte: now },
        status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] },
        OR: [{ lastPaymentAt: null }, { lastPaymentAt: { lt: recentPaymentCutoff } }],
      },
      include: { plan: true, planVersion: true },
      orderBy: { currentPeriodEnd: 'asc' },
    });

    for (const sub of due) {
      await this.chargeSubscription(sub as SubWithPlan, now);
    }

    if (due.length > 0) {
      this.logger.log(`Processed ${due.length} due subscriptions`);
    }
  }

  private async chargeSubscription(sub: SubWithPlan, now: Date): Promise<void> {
    const priceSource: PriceSource =
      this.flags.planVersioningEnabled && sub.planVersion
        ? sub.planVersion
        : sub.plan;
    const flatAmount = new Prisma.Decimal(
      sub.billingCycle === 'ANNUAL'
        ? String(priceSource.priceAnnual)
        : String(priceSource.priceMonthly),
    );

    const { lines: overageDetail, totalOverage } = await this.overage.computeForSubscription({
      subscriptionId: sub.id,
      organizationId: sub.organizationId,
      periodStart: sub.currentPeriodStart,
      limits: (sub.plan.limits as Record<string, number | boolean>) ?? {},
      planVersionLimits: sub.planVersion
        ? (sub.planVersion.limits as Record<string, number | boolean>)
        : undefined,
    });
    const overageAmount = new Prisma.Decimal(totalOverage);
    const flatLine = {
      kind: 'FLAT_FEE' as const,
      description: `Subscription ${sub.billingCycle.toLowerCase()}`,
      amount: flatAmount.toDecimalPlaces(2).toNumber(),
    };
    const overageLines = overageDetail.map((l) => ({
      kind: 'OVERAGE' as const,
      metric: l.metric,
      included: l.included,
      used: l.used,
      overage: l.overage,
      rate: l.rate,
      amount: l.amount,
      description: `Overage: ${l.metric} (${l.overage} × ${l.rate} SAR)`,
    }));
    const subtotal = flatAmount.plus(overageAmount).toDecimalPlaces(2);
    const vatAmt = subtotal.mul(PLATFORM_VAT_RATE).toDecimalPlaces(2).toNumber();
    const lineItems = [
      flatLine,
      ...overageLines,
      { kind: 'VAT' as const, rate: Number(PLATFORM_VAT_RATE), amount: vatAmt },
    ];

    // Apply BillingCredit FIFO before invoicing (gross total after VAT).
    const grossTotal = subtotal.add(new Prisma.Decimal(vatAmt)).toDecimalPlaces(2).toNumber();

    const credits = await this.prisma.$allTenants.billingCredit.findMany({
      where: {
        organizationId: sub.organizationId,
        consumedAt: null,
      },
      orderBy: { grantedAt: 'asc' },
    });

    let remaining = new Prisma.Decimal(grossTotal);
    const creditsApplied: { id: string; amount: number }[] = [];
    for (const credit of credits) {
      if (remaining.lte(0)) break;
      const creditAmount = new Prisma.Decimal(credit.amount.toString());
      const take = Prisma.Decimal.min(remaining, creditAmount);
      if (take.lte(0)) continue;
      creditsApplied.push({ id: credit.id, amount: take.toNumber() });
      remaining = remaining.sub(take).toDecimalPlaces(2);
    }

    const total = remaining.toDecimalPlaces(2).toNumber();

    // Create invoice
    const invoice = await this.prisma.$allTenants.subscriptionInvoice.create({
      data: {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        amount: total,
        flatAmount: flatAmount.toDecimalPlaces(2).toNumber(),
        overageAmount: overageAmount.toDecimalPlaces(2).toNumber(),
        lineItems,
        status: 'DUE',
        billingCycle: sub.billingCycle as never,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        dueDate: now,
      },
    });

    // Stamp consumed credits with the new invoice id — atomically to prevent
    // double-consumption in concurrent cron ticks.
    if (creditsApplied.length > 0) {
      for (const c of creditsApplied) {
        const result = await this.prisma.$allTenants.billingCredit.updateMany({
          where: {
            id: c.id,
            consumedAt: null,
          },
          data: {
            consumedInvoiceId: invoice.id,
            consumedAt: new Date(),
          },
        });
        if (result.count === 0) {
          // Credit was already consumed by another concurrent request — skip.
          this.logger.warn(
            `BillingCredit ${c.id} was already consumed; skipping for invoice ${invoice.id}`,
          );
        }
      }
    }

    // Zero-total after credits — mark invoice paid immediately, skip gateway.
    if (total === 0) {
      await this.prisma.$allTenants.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
      return;
    }

    if (!sub.moyasarCardTokenRef) {
      this.logger.warn(
        `Invoice ${invoice.id} created in DUE state for subscription ${sub.id} — no saved Moyasar card token; manual reconciliation required`,
      );
      return;
    }

    try {
      const payment = await this.moyasar.chargeWithToken({
        token: sub.moyasarCardTokenRef,
        amount: Math.round(total * 100),
        currency: 'SAR',
        idempotencyKey: `subscription-invoice:${invoice.id}`,
        description: `Deqah subscription invoice ${invoice.id}`,
        callbackUrl: this.billingCallbackUrl(),
      });

      if (payment.status.toLowerCase() === 'paid') {
        await this.recordPayment.execute({
          invoiceId: invoice.id,
          moyasarPaymentId: payment.id,
        });
        return;
      }

      await this.recordFailure.execute({
        invoiceId: invoice.id,
        moyasarPaymentId: payment.id,
        reason: `Moyasar returned status ${payment.status}`,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Moyasar charge failed for subscription ${sub.id}, invoice ${invoice.id}: ${reason}`,
      );
      await this.recordFailure.execute({
        invoiceId: invoice.id,
        moyasarPaymentId: 'unavailable',
        reason,
      });
    }
  }

  private billingCallbackUrl(): string {
    const base =
      this.config.get<string>('BACKEND_URL') ??
      this.config.get<string>('DASHBOARD_PUBLIC_URL', '');
    return `${base.replace(/\/+$/, '')}/api/v1/public/billing/webhooks/moyasar`;
  }
}
