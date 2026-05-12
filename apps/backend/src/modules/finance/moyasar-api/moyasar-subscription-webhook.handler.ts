import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SUPER_ADMIN_CONTEXT_CLS_KEY, SYSTEM_CONTEXT_CLS_KEY, TENANT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { MoyasarSubscriptionClient } from './moyasar-subscription.client';
import { RecordSubscriptionPaymentHandler } from '../../platform/billing/record-subscription-payment/record-subscription-payment.handler';
import { RecordSubscriptionPaymentFailureHandler } from '../../platform/billing/record-subscription-payment-failure/record-subscription-payment-failure.handler';

interface WebhookEventPayload {
  /** Moyasar's outer event id — unique per webhook delivery, used for dedup. */
  id?: string;
  type: string;
  data: {
    id: string;
    status: string;
    /** Payment amount in halalas (1 SAR = 100 halalas). */
    amount: number;
    /** ISO 4217 currency code, e.g. "SAR". */
    currency?: string;
    source?: { message?: string };
  };
}

const PROVIDER = 'MOYASAR_PLATFORM';

@Injectable()
export class MoyasarSubscriptionWebhookHandler {
  private readonly logger = new Logger(MoyasarSubscriptionWebhookHandler.name);

  constructor(
    private readonly client: MoyasarSubscriptionClient,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly recordPayment: RecordSubscriptionPaymentHandler,
    private readonly recordFailure: RecordSubscriptionPaymentFailureHandler,
  ) {}

  async execute(rawBody: Buffer, signature: string): Promise<{ ok: true; deduped?: true }> {
    const rawStr = rawBody.toString('utf8');

    // Stage 1: verify signature
    if (!this.client.verifyWebhookSignature(rawStr, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let event: WebhookEventPayload;
    try {
      event = JSON.parse(rawStr) as WebhookEventPayload;
    } catch {
      throw new BadRequestException('Malformed webhook payload');
    }

    if (!event.type || !event.data?.id) {
      throw new BadRequestException('Malformed webhook payload');
    }

    // Stage 2: idempotency guard.
    // Moyasar redelivers webhooks on receipt failure — without this dedup the
    // RecordSubscriptionPaymentHandler runs twice, double-emails, double-counts.
    // We use the outer event.id when present; fall back to data.id (payment id)
    // for older payloads that don't carry one.
    const eventId = event.id ?? event.data.id;
    const payloadHash = createHash('sha256').update(rawStr).digest('hex');

    let webhookEventRowId: string;
    try {
      const created = await this.prisma.webhookEvent.create({
        data: {
          provider: PROVIDER,
          eventId,
          eventType: event.type,
          payloadHash,
        },
        select: { id: true },
      });
      webhookEventRowId = created.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(
          `Subscription webhook: skipped_duplicate provider=${PROVIDER} eventId=${eventId}`,
        );
        return { ok: true, deduped: true };
      }
      throw err;
    }

    try {
      const result = await this.process(event);
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventRowId },
        data: { processedAt: new Date(), result: 'processed' },
      });
      return result;
    } catch (err) {
      await this.prisma.webhookEvent
        .update({
          where: { id: webhookEventRowId },
          data: { processedAt: new Date(), result: 'error' },
        })
        .catch((updateErr) => {
          this.logger.error(
            `Failed to mark webhook event as error (${webhookEventRowId}): ${String(updateErr)}`,
          );
        });
      throw err;
    }
  }

  private async process(event: WebhookEventPayload): Promise<{ ok: true }> {
    // Stage 3: platform-level lookup (system context — no tenant filter)
    const invoice = await this.cls.run(async () => {
      this.logger.warn('systemContext bypass activated', { context: 'MoyasarSubscriptionWebhookHandler' });
      this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);
      return this.prisma.subscriptionInvoice.findFirst({
        where: { moyasarPaymentId: event.data.id },
        include: { subscription: true },
      });
    });

    if (!invoice) {
      // Unknown payment — swallow and acknowledge
      this.logger.warn(`Subscription webhook: no invoice found for payment ${event.data.id}`);
      return { ok: true };
    }

    // Stage 4 pre-check: cross-check amount + currency to prevent spoofed low-value payments.
    const expectedHalalas = Math.round(Number(invoice.amount) * 100);
    if (event.data.amount !== expectedHalalas) {
      this.logger.error(
        `Subscription webhook amount mismatch for invoice ${invoice.id}: expected=${expectedHalalas} got=${event.data.amount}`,
      );
      throw new BadRequestException('Payment amount does not match subscription invoice');
    }
    if (event.data.currency?.toUpperCase() !== (invoice.currency ?? 'SAR').toUpperCase()) {
      this.logger.error(
        `Subscription webhook currency mismatch for invoice ${invoice.id}: expected=${invoice.currency} got=${event.data.currency}`,
      );
      throw new BadRequestException('Payment currency does not match subscription invoice');
    }

    // Stage 4: enter tenant context for scoped writes.
    // Also set SUPER_ADMIN_CONTEXT_CLS_KEY so that billing handlers can call
    // prisma.$allTenants for cross-tenant owner email lookup without throwing.
    // SAFE: webhook handler; $allTenants used for cross-tenant subscription lookup after payment
    return this.cls.run(async () => {
      this.cls.set(TENANT_CLS_KEY, {
        organizationId: invoice.subscription.organizationId,
        membershipId: 'system',
        id: 'system',
        role: 'system',
        isSuperAdmin: false,
      });
      this.cls.set(SUPER_ADMIN_CONTEXT_CLS_KEY, true);
      this.logger.log('systemContext: moyasar subscription webhook handler');

      if (event.type === 'payment_paid') {
        await this.recordPayment.execute({
          invoiceId: invoice.id,
          moyasarPaymentId: event.data.id,
        });
      } else if (event.type === 'payment_failed') {
        await this.recordFailure.execute({
          invoiceId: invoice.id,
          moyasarPaymentId: event.data.id,
          reason: event.data.source?.message ?? 'unknown',
        });
      } else {
        this.logger.debug(`Subscription webhook: unhandled event type ${event.type}`);
      }

      return { ok: true };
    });
  }
}
