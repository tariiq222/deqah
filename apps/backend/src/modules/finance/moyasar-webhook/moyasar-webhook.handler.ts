import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { MoyasarCredentialsService } from '../../../infrastructure/payments/moyasar-credentials.service';
import { SYSTEM_CONTEXT_CLS_KEY } from '../../../common/tenant/tenant.constants';
import { PaymentCompletedEvent } from '../events/payment-completed.event';
import { PaymentFailedEvent } from '../events/payment-failed.event';
import { MoyasarWebhookDto } from './moyasar-webhook.dto';

export interface MoyasarWebhookRequest {
  payload: MoyasarWebhookDto;
  rawBody: string;
  signature: string;
}

/**
 * Processes Moyasar webhook events with PER-TENANT signature verification.
 *
 * Stage order (changed 2026-05-05):
 *   1. Parse payload — read invoiceId from metadata.
 *   2. System-context lookup of Invoice → resolves the tenant.
 *   3. System-context lookup of OrganizationPaymentConfig for that tenant.
 *   4. Decrypt the tenant's webhook secret (AAD = organizationId).
 *   5. Verify HMAC signature with the tenant's secret.
 *   6. Idempotency check.
 *   7. Validate payload amount + currency match the invoice (anti-spoof).
 *   8. Mutations under the resolved tenant CLS context.
 *
 * Why DB before signature: the tenant secret is per-org, so we cannot verify
 * a signature without first resolving which tenant the payload belongs to.
 * The endpoint is rate-limited (Throttle 120/min) and lookup failures return
 * the same generic responses to avoid acting as an oracle.
 */
@Injectable()
export class MoyasarWebhookHandler {
  private readonly logger = new Logger(MoyasarWebhookHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly cls: ClsService,
    private readonly creds: MoyasarCredentialsService,
  ) {}

  verifySignature(rawBody: string, signature: string, secret: string): void {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');
    if (
      expectedBuf.length !== signatureBuf.length ||
      !timingSafeEqual(expectedBuf, signatureBuf)
    ) {
      throw new BadRequestException('Invalid Moyasar webhook signature');
    }
  }

  async execute(req: MoyasarWebhookRequest): Promise<{ skipped?: boolean }> {
    // STAGE 1 — parse payload.
    const payload = req.payload;
    const { invoiceId } = payload.metadata ?? {};
    if (!invoiceId) {
      this.logger.warn(`Moyasar webhook missing metadata: ${payload.id}`);
      return { skipped: true };
    }

    // STAGE 2 — resolve tenant from invoice (system context bypasses Proxy).
    const invoice = await this.cls.run(async () => {
      this.logger.warn('systemContext bypass activated', { context: 'MoyasarWebhookHandler' });
      this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);
      return this.prisma.invoice.findFirst({ where: { id: invoiceId } });
    });
    if (!invoice) return { skipped: true };

    // STAGE 3 — fetch tenant's payment config (system context).
    const cfg = await this.cls.run(async () => {
      this.logger.warn('systemContext bypass activated', { context: 'MoyasarWebhookHandler' });
      this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);
      return this.prisma.organizationPaymentConfig.findUnique({
        where: { organizationId: invoice.organizationId },
      });
    });
    if (!cfg) {
      throw new BadRequestException('Tenant payment config not found');
    }

    // STAGE 4 — decrypt the tenant's webhook secret (AAD = organizationId).
    let webhookSecret: string;
    try {
      const decoded = this.creds.decrypt<{ webhookSecret: string }>(
        cfg.webhookSecretEnc,
        invoice.organizationId,
      );
      webhookSecret = decoded.webhookSecret;
    } catch (err) {
      this.logger.error(
        `Failed to decrypt webhook secret for org ${invoice.organizationId}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      throw new BadRequestException('Tenant payment config is corrupt');
    }

    // STAGE 5 — verify signature with tenant's own secret.
    this.verifySignature(req.rawBody, req.signature, webhookSecret);

    // STAGE 6 — idempotency check (system context). A given gatewayRef could
    // theoretically belong to any org; we rely on the signed payload as
    // authorization to observe it regardless of CLS.
    const existing = await this.cls.run(async () => {
      this.logger.warn('systemContext bypass activated', { context: 'MoyasarWebhookHandler' });
      this.cls.set(SYSTEM_CONTEXT_CLS_KEY, true);
      return this.prisma.payment.findFirst({
        where: { gatewayRef: payload.id, status: PaymentStatus.COMPLETED },
      });
    });
    if (existing) return { skipped: true };

    // STAGE 7 — verify webhook payload matches the invoice it claims to pay.
    // Without this check, a 1 SAR Moyasar payment with metadata.invoiceId pointing
    // at a 1000 SAR invoice would mark the larger invoice PAID.
    const expectedHalalas = Math.round(Number(invoice.total) * 100);
    if (payload.amount !== expectedHalalas) {
      this.logger.error(
        `Webhook amount mismatch for invoice ${invoice.id}: expected=${expectedHalalas} got=${payload.amount}`,
      );
      throw new BadRequestException('Payment amount does not match invoice total');
    }
    if (payload.currency.toUpperCase() !== invoice.currency.toUpperCase()) {
      this.logger.error(
        `Webhook currency mismatch for invoice ${invoice.id}: expected=${invoice.currency} got=${payload.currency}`,
      );
      throw new BadRequestException('Payment currency does not match invoice');
    }

    // STAGE 8 — run mutations inside the resolved tenant's CLS context.
    return this.cls.run(async () => {
      this.cls.set('tenant', {
        organizationId: invoice.organizationId,
        membershipId: 'system',
        id: 'system',
        role: 'system',
        isSuperAdmin: false,
      });

      const amountSar = payload.amount / 100;
      const status: PaymentStatus =
        payload.status === 'paid' ? PaymentStatus.COMPLETED : PaymentStatus.FAILED;

      const payment = await this.prisma.payment.upsert({
        where: { idempotencyKey: `moyasar:${payload.id}` },
        update: { status, processedAt: new Date(), failureReason: payload.message },
        create: {
          organizationId: invoice.organizationId,
          invoiceId,
          amount: amountSar,
          currency: payload.currency,
          method: PaymentMethod.ONLINE_CARD,
          status,
          gatewayRef: payload.id,
          idempotencyKey: `moyasar:${payload.id}`,
          processedAt: status === PaymentStatus.COMPLETED ? new Date() : undefined,
          failureReason: payload.message,
        },
      });

      if (status === PaymentStatus.COMPLETED) {
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: 'PAID', paidAt: new Date() },
        });

        const event = new PaymentCompletedEvent({
          paymentId: payment.id,
          invoiceId: invoice.id,
          bookingId: invoice.bookingId,
          amount: amountSar,
          currency: invoice.currency,
          organizationId: invoice.organizationId,
        });
        await this.eventBus.publish(event.eventName, event.toEnvelope());
      } else if (status === PaymentStatus.FAILED) {
        const failedEvent = new PaymentFailedEvent({
          paymentId: payment.id,
          invoiceId: invoice.id,
          clientId: invoice.clientId,
          amount: amountSar,
          currency: invoice.currency,
          reason: payload.message,
          organizationId: invoice.organizationId,
        });
        await this.eventBus.publish(failedEvent.eventName, failedEvent.toEnvelope());
      }

      return {};
    });
  }
}
