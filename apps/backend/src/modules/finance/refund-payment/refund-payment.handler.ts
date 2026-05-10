import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentStatus } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
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
 *
 * Ordering — CRITICAL for money-safety:
 *   1. Persist a RefundRequest row in PROCESSING with the chosen idempotencyKey
 *      BEFORE calling Moyasar. This way, if Moyasar succeeds but our DB write
 *      fails afterwards, we have a record of the in-flight refund (with its
 *      idempotencyKey) so reconciliation can complete it without double-charging.
 *   2. Call Moyasar (real money moves).
 *   3. Atomic finalize: flip RefundRequest → COMPLETED + Payment → REFUNDED +
 *      Invoice → REFUNDED in a single transaction. If this transaction fails
 *      after Moyasar succeeded, we keep the gatewayRef on the row and leave
 *      it in PROCESSING for reconciliation.
 */
@Injectable()
export class RefundPaymentHandler {
  private readonly logger = new Logger(RefundPaymentHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly rlsTx: RlsTransactionService,
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
    const refundRequestId = randomUUID();
    const idempotencyKey = `refund:${payment.id}:${Number(refundAmount).toFixed(2)}`;

    // Step 1 — record the in-flight refund BEFORE calling Moyasar. If we
    // crash between Moyasar success and step 3, this row (with its
    // idempotencyKey) is the breadcrumb reconciliation needs to know
    // a refund is owed and avoid double-issuing.
    await this.prisma.refundRequest.create({
      data: {
        id: refundRequestId,
        organizationId: payment.invoice.organizationId,
        invoiceId: payment.invoice.id,
        paymentId: payment.id,
        clientId: payment.invoice.clientId,
        amount: refundAmount,
        reason: cmd.reason,
        status: 'PROCESSING',
        processedAt: new Date(),
        processedBy: cmd.performedBy ?? 'system',
      },
      select: { id: true },
    });

    // Step 2 — gateway round-trip OUTSIDE any DB transaction. Never hold a
    // transaction across an external HTTP call.
    let moyasarRefundId: string | undefined;
    try {
      const moyasarRefund = await this.moyasar.createRefund(payment.invoice.organizationId, {
        paymentId: payment.gatewayRef,
        amount: Math.round(refundAmount * 100),
        idempotencyKey,
      });
      moyasarRefundId = moyasarRefund.id;
    } catch (error) {
      // Moyasar refused the refund. No money moved. Safe to mark FAILED.
      await this.prisma.refundRequest
        .update({ where: { id: refundRequestId }, data: { status: 'FAILED' } })
        .catch((persistErr) => {
          this.logger.error(
            `Refund ${refundRequestId}: failed to mark FAILED after Moyasar rejection`,
            persistErr instanceof Error ? persistErr.stack : undefined,
          );
        });
      throw error;
    }

    // Step 3 — atomic finalize. If this transaction fails, money has
    // already moved at Moyasar; we persist gatewayRef separately and
    // leave the row in PROCESSING for reconciliation.
    let updatedPayment;
    try {
      updatedPayment = await this.rlsTx.withTransaction(async (tx) => {
        await tx.refundRequest.update({
          where: { id: refundRequestId },
          data: { status: 'COMPLETED', gatewayRef: moyasarRefundId },
        });
        const updated = await tx.payment.update({
          where: { id: cmd.paymentId },
          data: { status: PaymentStatus.REFUNDED, failureReason: cmd.reason },
        });
        await tx.invoice.update({
          where: { id: payment.invoice.id },
          data: { status: 'REFUNDED' },
        });
        return updated;
      });
    } catch (error) {
      this.logger.error(
        `Refund ${refundRequestId}: Moyasar succeeded (gatewayRef=${moyasarRefundId}) but DB finalize failed — left in PROCESSING for reconciliation`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.prisma.refundRequest
        .update({ where: { id: refundRequestId }, data: { gatewayRef: moyasarRefundId } })
        .catch((persistErr) => {
          this.logger.error(
            `Refund ${refundRequestId}: failed to persist gatewayRef after partial-success — manual intervention required`,
            persistErr instanceof Error ? persistErr.stack : undefined,
          );
        });
      throw error;
    }

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
