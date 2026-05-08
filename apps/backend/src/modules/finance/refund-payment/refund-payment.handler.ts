import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { RlsHelper } from '../../../common/tenant/rls.helper';
import { RefundCompletedEvent } from '../events/refund-completed.event';
import { MoyasarApiClient } from '../moyasar-api/moyasar-api.client';

interface RefundPaymentCommand {
  paymentId: string;
  reason: string;
  amount?: number;
  performedBy?: string;
}

/**
 * Single-step refund used by `PATCH /payments/:id/refund` (clinic dashboard).
 * Calls Moyasar first; only flips local rows on success. Mirrors the
 * gateway-first pattern in `ApproveRefundHandler`.
 */
@Injectable()
export class RefundPaymentHandler {
  private readonly logger = new Logger(RefundPaymentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly rls: RlsHelper,
    private readonly moyasar: MoyasarApiClient,
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
    if (!payment.gatewayRef) {
      throw new BadRequestException('Payment has no gateway reference; use manual refund path');
    }

    const refundAmount = cmd.amount ?? Number(payment.amount);

    // Gateway round-trip OUTSIDE the DB transaction. Never hold a transaction
    // across an external HTTP call.
    const moyasarRefund = await this.moyasar.createRefund(payment.invoice.organizationId, {
      paymentId: payment.gatewayRef,
      amount: Math.round(refundAmount * 100),
    });

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
          gatewayRef: moyasarRefund.id,
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
      .catch((err) => this.logger.error(`Failed to publish RefundCompletedEvent`, err));

    return updatedPayment;
  }
}
