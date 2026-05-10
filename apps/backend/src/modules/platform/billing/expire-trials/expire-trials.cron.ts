import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SubscriptionCacheService } from '../subscription-cache.service';
import { PlatformMailerService } from '../../../../infrastructure/mail';
import { MoyasarSubscriptionClient } from '../../../finance/moyasar-api/moyasar-subscription.client';
import { RecordSubscriptionPaymentHandler } from '../record-subscription-payment/record-subscription-payment.handler';
import { RecordSubscriptionPaymentFailureHandler } from '../record-subscription-payment-failure/record-subscription-payment-failure.handler';

const TRIAL_REMINDER_WINDOW_DAYS = 7;
const TRIAL_REMINDER_MILESTONES = [7, 3, 1] as const;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRIAL_EXPIRED_NO_CARD_REASON = 'Trial ended without a saved payment method';

/** Name stored in CronHeartbeat table for this cron. */
const HEARTBEAT_CRON_NAME = 'expire-trials';

/** Alert if the cron has not run for more than this many ms (25 hours). */
const HEARTBEAT_MISS_THRESHOLD_MS = 25 * 60 * 60 * 1000;

type TrialReminderMilestone = (typeof TRIAL_REMINDER_MILESTONES)[number];

interface TrialSubscription {
  id: string;
  organizationId: string;
  billingCycle: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt: Date | null;
  notifiedTrialEndingAt: Date | null;
  moyasarCardTokenRef: string | null;
  organization: { nameAr: string };
  plan?: {
    priceMonthly: unknown;
    priceAnnual: unknown;
  };
}

@Injectable()
export class ExpireTrialsCron {
  private readonly logger = new Logger(ExpireTrialsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cache: SubscriptionCacheService,
    private readonly mailer: PlatformMailerService,
    @Optional() private readonly moyasar?: MoyasarSubscriptionClient,
    @Optional() private readonly recordPayment?: RecordSubscriptionPaymentHandler,
    @Optional() private readonly recordFailure?: RecordSubscriptionPaymentFailureHandler,
  ) {}

  async execute(): Promise<void> {
    if (!this.config.get<boolean>('BILLING_CRON_ENABLED', false)) return;

    const now = new Date();
    const billingUrl = this.billingUrl();

    await this.notifyTrialMilestones(now, billingUrl);
    await this.processExpiredTrials(now, billingUrl);

    // Write heartbeat — upsert so the row is created on first run.
    await this.prisma.$allTenants.cronHeartbeat.upsert({
      where: { cronName: HEARTBEAT_CRON_NAME },
      create: { cronName: HEARTBEAT_CRON_NAME, lastRunAt: now },
      update: { lastRunAt: now },
    });
  }

  /**
   * Watchdog: called on a separate schedule (e.g. every 1h).
   * If the heartbeat row is missing or stale (> 25h), logs an error.
   * Wire this into a @Cron('@hourly') in the NestJS scheduler or
   * call it from a separate cron handler.
   */
  async checkHeartbeat(): Promise<void> {
    const beat = await this.prisma.$allTenants.cronHeartbeat.findUnique({
      where: { cronName: HEARTBEAT_CRON_NAME },
    });

    const now = Date.now();
    const stale =
      !beat || now - beat.lastRunAt.getTime() > HEARTBEAT_MISS_THRESHOLD_MS;

    if (stale) {
      this.logger.error(
        `[heartbeat-miss] expire-trials cron has not run in > 25h. ` +
          `Last run: ${beat?.lastRunAt.toISOString() ?? 'never'}`,
      );
    }
  }

  private async notifyTrialMilestones(now: Date, billingUrl: string): Promise<void> {
    const windowEnd = new Date(now.getTime() + TRIAL_REMINDER_WINDOW_DAYS * MS_PER_DAY);

    const subs = await this.prisma.$allTenants.subscription.findMany({
      where: {
        status: 'TRIALING',
        trialEndsAt: { gt: now, lte: windowEnd },
      },
      include: {
        organization: {
          select: { nameAr: true },
        },
      },
    });

    for (const sub of subs as TrialSubscription[]) {
      if (!sub.trialEndsAt) continue;

      const daysLeft = this.daysUntil(sub.trialEndsAt, now);
      const milestone = this.reminderMilestone(daysLeft);
      if (!milestone) continue;
      if (!this.shouldSendMilestone(sub, milestone)) continue;

      const owner = await this.lookupOwner(sub.organizationId);
      if (!owner) continue;

      await this.sendMilestoneEmail(milestone, owner.email, {
        ownerName: owner.name,
        orgName: sub.organization.nameAr,
        daysLeft,
        upgradeUrl: billingUrl,
      });

      await this.prisma.$allTenants.subscription.update({
        where: { id: sub.id },
        data: { notifiedTrialEndingAt: now },
      });
    }
  }

  private async processExpiredTrials(now: Date, billingUrl: string): Promise<void> {
    const expired = await this.prisma.$allTenants.subscription.findMany({
      where: {
        status: 'TRIALING',
        trialEndsAt: { lte: now },
      },
      include: {
        organization: {
          select: { nameAr: true },
        },
        plan: true,
      },
    });

    for (const sub of expired as TrialSubscription[]) {
      if (sub.moyasarCardTokenRef) {
        await this.chargeExpiredTrial(sub, now);
        continue;
      }

      await this.suspendExpiredTrialWithoutCard(sub, now, billingUrl);
    }

    if (expired.length > 0) {
      this.logger.log(`Processed ${expired.length} expired trial subscriptions`);
    }
  }

  private shouldSendMilestone(
    sub: Pick<TrialSubscription, 'trialEndsAt' | 'notifiedTrialEndingAt'>,
    milestone: TrialReminderMilestone,
  ): boolean {
    if (!sub.trialEndsAt || !sub.notifiedTrialEndingAt) return true;

    const previousDaysLeft = this.daysUntil(sub.trialEndsAt, sub.notifiedTrialEndingAt);
    return previousDaysLeft > milestone;
  }

  private async suspendExpiredTrialWithoutCard(
    sub: TrialSubscription,
    now: Date,
    billingUrl: string,
  ): Promise<void> {
    // $allTenants.$transaction: cron job runs without tenant context — must scan all orgs to find expiring trials.
    // Atomically suspends both the Organization row (status→SUSPENDED) and the Subscription row
    // (status→SUSPENDED) for a trial that expired with no saved payment method.
    await this.prisma.$allTenants.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: sub.organizationId },
        data: {
          status: 'SUSPENDED',
          suspendedAt: now,
          suspendedReason: 'TRIAL_EXPIRED_NO_CARD',
        },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'SUSPENDED',
          pastDueSince: null,
          lastFailureReason: TRIAL_EXPIRED_NO_CARD_REASON,
        },
      });
    });

    this.cache.invalidate(sub.organizationId);

    const owner = await this.lookupOwner(sub.organizationId);
    if (owner) {
      await this.mailer.sendTrialSuspendedNoCard(owner.email, {
        ownerName: owner.name,
        orgName: sub.organization.nameAr,
        billingUrl,
      });
    }
  }

  private async chargeExpiredTrial(sub: TrialSubscription, now: Date): Promise<void> {
    const cardToken = sub.moyasarCardTokenRef;
    if (!cardToken || !this.moyasar || !this.recordPayment || !this.recordFailure || !sub.plan) {
      this.logger.warn(
        `Trial ${sub.id} has a saved card but billing charge services are unavailable`,
      );
      return;
    }

    const flatAmount =
      sub.billingCycle === 'ANNUAL'
        ? Number(sub.plan.priceAnnual)
        : Number(sub.plan.priceMonthly);

    const invoice = await this.prisma.$allTenants.subscriptionInvoice.create({
      data: {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        amount: flatAmount,
        flatAmount,
        overageAmount: 0,
        status: 'DUE',
        billingCycle: sub.billingCycle as never,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        dueDate: now,
      },
    });

    try {
      const payment = await this.moyasar.chargeWithToken({
        token: cardToken,
        amount: Math.round(flatAmount * 100),
        currency: 'SAR',
        idempotencyKey: `trial-conversion:${invoice.id}`,
        description: `Deqah trial conversion invoice ${invoice.id}`,
        callbackUrl: this.billingCallbackUrl(),
      });

      if (payment.status.toLowerCase() === 'paid') {
        await this.recordPayment.execute({
          invoiceId: invoice.id,
          moyasarPaymentId: payment.id,
        });
        await this.markOrganizationStatus(sub.organizationId, 'ACTIVE');
        return;
      }

      await this.recordFailure.execute({
        invoiceId: invoice.id,
        moyasarPaymentId: payment.id,
        reason: `Moyasar returned status ${payment.status}`,
      });
      await this.markOrganizationStatus(sub.organizationId, 'PAST_DUE');
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Trial conversion charge failed for subscription ${sub.id}, invoice ${invoice.id}: ${reason}`,
      );
      await this.recordFailure.execute({
        invoiceId: invoice.id,
        moyasarPaymentId: 'unavailable',
        reason,
      });
      await this.markOrganizationStatus(sub.organizationId, 'PAST_DUE');
    }
  }

  private async markOrganizationStatus(
    organizationId: string,
    status: 'ACTIVE' | 'PAST_DUE',
  ): Promise<void> {
    await this.prisma.$allTenants.organization.update({
      where: { id: organizationId },
      data:
        status === 'ACTIVE'
          ? { status, suspendedAt: null, suspendedReason: null }
          : { status },
    });
    this.cache.invalidate(organizationId);
  }

  private reminderMilestone(daysLeft: number): TrialReminderMilestone | null {
    return TRIAL_REMINDER_MILESTONES.find((day) => day === daysLeft) ?? null;
  }

  private daysUntil(target: Date, now: Date): number {
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / MS_PER_DAY));
  }

  private async sendMilestoneEmail(
    milestone: TrialReminderMilestone,
    to: string,
    vars: {
      ownerName: string;
      orgName: string;
      daysLeft: number;
      upgradeUrl: string;
    },
  ): Promise<void> {
    if (milestone === 7) {
      await this.mailer.sendTrialDay7Reminder(to, vars);
      return;
    }
    if (milestone === 3) {
      await this.mailer.sendTrialDay3Warning(to, vars);
      return;
    }
    await this.mailer.sendTrialDay1Final(to, vars);
  }

  private async lookupOwner(
    organizationId: string,
  ): Promise<{ email: string; name: string } | null> {
    const membership = await this.prisma.$allTenants.membership.findFirst({
      where: { organizationId, role: 'OWNER', isActive: true },
      select: {
        displayName: true,
        user: { select: { email: true, name: true } },
      },
    });
    if (!membership?.user) return null;
    return {
      email: membership.user.email,
      name: membership.displayName ?? membership.user.name ?? '',
    };
  }

  private billingUrl(): string {
    const base = this.config.get<string>(
      'PLATFORM_DASHBOARD_URL',
      'https://app.webvue.pro/dashboard',
    );
    return `${base.replace(/\/+$/, '')}/settings/billing`;
  }

  private billingCallbackUrl(): string {
    const base =
      this.config.get<string>('BACKEND_URL') ??
      this.config.get<string>('DASHBOARD_PUBLIC_URL', '');
    return `${base.replace(/\/+$/, '')}/api/v1/public/billing/webhooks/moyasar`;
  }
}
