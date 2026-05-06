import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { RlsHelper } from '../../../common/tenant/rls.helper';
import { RefundCompletedEvent } from '../events/refund-completed.event';

interface RefundPaymentCommand {
  paymentId: string;
  reason: string;
  amount?: number;
  performedBy?: string;
}

/**
 * Legacy single-step refund path used by the dashboard
 * `PATCH /payments/:id/refund` endpoint. Unlike `ApproveRefundHandler` this
 * does NOT call Moyasar — it only flips the local Payment row. We create a
 * COMPLETED `RefundRequest` row alongside the status flip so:
 *
 *   1. Audit trail is uniform (one model for every refund, regardless of
 *      whether the gateway round-trip happened).
 *   2. The `RefundCompletedEvent` carries a stable refundRequestId, which the
 *      DecrementOnRefundListener uses as the idempotency key.
 */
@Injectable()
export class RefundPaymentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly rls: RlsHelper,
  ) {}

  async execute(cmd: RefundPaymentCommand) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: cmd.paymentId },
      include: { invoice: { select: { id: true, bookingId: true, clientId: true, currency: true, organizationId: true } } },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    const refundAmount = cmd.amount ?? Number(payment.amount);

    const { updatedPayment, refundRequestId } = await this.prisma.$transaction(async (tx) => {
      await this.rls.applyInTransaction(tx);
      const refundRow = await tx.refundRequest.create({
        data: {
          organizationId: payment.invoice.organizationId,
          invoiceId: payment.invoice.id,
          paymentId: payment.id,
          clientId: payment.invoice.clientId,
          amount: refundAmount,
          reason: cmd.reason,
          status: 'COMPLETED',
          processedAt: new Date(),
          processedBy: cmd.performedBy ?? 'system',
        },
        select: { id: true },
      });

      const updated = await tx.payment.update({
        where: { id: cmd.paymentId },
        data: { status: PaymentStatus.REFUNDED, failureReason: cmd.reason },
      });

      await tx.invoice.update({
        where: { id: payment.invoice.id },
        data: { status: 'REFUNDED' },
      });

      return { updatedPayment: updated, refundRequestId: refundRow.id };
    });

    // Phase 2 / Bug B11 — emit RefundCompletedEvent so billing listener
    // decrements UsageCounter. Fire-and-forget; reconcile cron is the safety net.
    const event = new RefundCompletedEvent({
      refundRequestId,
      organizationId: payment.invoice.organizationId,
      invoiceId: payment.invoice.id,
      paymentId: payment.id,
      bookingId: payment.invoice.bookingId,
      amount: refundAmount,
      currency: payment.invoice.currency,
    });
    await this.eventBus
      .publish(event.eventName, event.toEnvelope())
      .catch(() => undefined);

    return updatedPayment;
  }
}
