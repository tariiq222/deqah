import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PaymentStatus, RefundStatus, Prisma } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { RefundCompletedEvent } from '../events/refund-completed.event';
import { MoyasarApiClient } from '../moyasar-api/moyasar-api.client';

interface CreateRefundRequestInTxResult {
  refundRequestId: string;
  idempotencyKey: string;
  payment: {
    id: string;
    gatewayRef: string;
    amount: unknown;
    invoice: {
      id: string;
      bookingId: string;
      clientId: string;
      currency: string;
      organizationId: string;
    };
  };
}

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

  /**
   * Fetch a refund request by id. Used by OnBookingCancelledRefundHandler.
   */
  async getRefundRequest(query: { id: string }): Promise<{
    id: string;
    paymentId: string;
    amount: unknown;
    status: string;
    gatewayRef: string | null;
    organizationId: string;
  } | null> {
    return this.prisma.refundRequest.findUnique({
      where: query,
      select: { id: true, paymentId: true, amount: true, status: true, gatewayRef: true, organizationId: true },
    }) as Promise<{ id: string; paymentId: string; amount: unknown; status: string; gatewayRef: string | null; organizationId: string; } | null>;
  }

  /**
   * Call Moyasar to create a refund and return the result.
   * Exposed for OnBookingCancelledRefundHandler when refund was pre-created
   * in the cancellation transaction.
   */
  async callMoyasarAndFinalize(
    gatewayRef: string,
    amount: number,
    idempotencyKey: string,
    organizationId: string,
  ): Promise<{ id: string }> {
    return this.moyasar.createRefund(organizationId, {
      paymentId: gatewayRef,
      amount: Math.round(amount * 100),
      idempotencyKey,
    });
  }

  /**
   * Phase 3 (finalize) — called by OnBookingCancelledRefundHandler when a
   * refundRequestId is already present on the event (pre-created atomically
   * with the booking cancellation). Updates RefundRequest to COMPLETED,
   * Payment to REFUNDED, and Invoice to REFUNDED in a single transaction.
   */
  async finalizeRefund(
    refundRequestId: string,
    idempotencyKey: string,
    gatewayRef: string,
  ): Promise<void> {
    await this.rlsTx.withTransaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: { status: RefundStatus.COMPLETED, gatewayRef },
      });
      const refundReq = await tx.refundRequest.findUniqueOrThrow({
        where: { id: refundRequestId },
        select: { paymentId: true, amount: true, invoiceId: true },
      });
      await tx.payment.update({
        where: { id: refundReq.paymentId },
        data: {
          status: PaymentStatus.REFUNDED,
          failureReason: `Booking cancellation refund (${idempotencyKey})`,
          refundedAmount: { increment: Number(refundReq.amount) },
        },
      });
      await tx.invoice.update({
        where: { id: refundReq.invoiceId },
        data: { status: 'REFUNDED' },
      });
    });
  }

  /**
   * Phase 1 — create RefundRequest in PROCESSING inside a caller-provided transaction.
   * The caller (e.g. CancelBookingHandler) manages the transaction lifecycle and
   * passes the transaction client `tx` directly.
   *
   * Steps:
   *   1. SELECT FOR UPDATE on Payment to prevent concurrent double-refunds
   *   2. Guard against existing in-flight RefundRequest
   *   3. Fetch Invoice for org/client/booking context
   *   4. Build idempotency key: `refund:{paymentId}:{amount.toFixed(2)}`
   *   5. Persist RefundRequest row in PROCESSING
   *   6. Return { refundRequestId, idempotencyKey, payment }
   */
  async createRefundRequestInTx(
    tx: Prisma.TransactionClient,
    cmd: { paymentId: string; reason: string; performedBy?: string },
  ): Promise<CreateRefundRequestInTxResult> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        gatewayRef: string | null;
        amount: unknown;
        invoiceId: string;
      }>
    >`SELECT id, status, "gatewayRef", amount, "invoiceId"
        FROM "Payment"
        WHERE id = ${cmd.paymentId}
        FOR UPDATE`;

    const row = rows[0];
    if (!row) throw new NotFoundException('Payment not found');
    if (row.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded');
    }
    if (!row.gatewayRef) {
      throw new BadRequestException('Payment has no gateway reference; use manual refund path');
    }

    const existingInFlightRefund = await tx.refundRequest.findFirst({
      where: { paymentId: cmd.paymentId, status: RefundStatus.PROCESSING },
      select: { id: true },
    });
    if (existingInFlightRefund) {
      throw new BadRequestException('Payment refund is already processing');
    }

    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: row.invoiceId },
      select: { id: true, bookingId: true, clientId: true, currency: true, organizationId: true },
    });

    const refundAmount = Number(row.amount);
    const idempotencyKey = `refund:${row.id}:${refundAmount.toFixed(2)}`;
    const refundRequestId = randomUUID();

    await tx.refundRequest.create({
      data: {
        id: refundRequestId,
        organizationId: invoice.organizationId,
        invoiceId: invoice.id,
        paymentId: row.id,
        clientId: invoice.clientId,
        amount: refundAmount,
        reason: cmd.reason,
        status: RefundStatus.PROCESSING,
        processedAt: new Date(),
        processedBy: cmd.performedBy ?? 'system',
      },
      select: { id: true },
    });

    return {
      refundRequestId,
      idempotencyKey,
      payment: {
        id: row.id,
        gatewayRef: row.gatewayRef,
        amount: row.amount,
        invoice,
      },
    };
  }

  /**
   * Phase 3 (finalize) — called by OnBookingCancelledRefundHandler when a
   * RefundRequest was pre-created via createRefundRequestInTx in the
   * cancellation transaction. Calls Moyasar (idempotent) and then
   * atomically updates RefundRequest → COMPLETED, Payment → REFUNDED,
   * Invoice → REFUNDED inside a single RLS transaction.
   */
  async finalizeRefundFromCancellation(
    cmd: { refundRequestId: string; idempotencyKey: string },
  ): Promise<void> {
    const refundReq = await this.prisma.refundRequest.findUniqueOrThrow({
      where: { id: cmd.refundRequestId },
      select: { id: true, paymentId: true, amount: true, invoiceId: true, organizationId: true },
    });

    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: refundReq.paymentId },
      select: { id: true, gatewayRef: true },
    });

const moyasarRefund = await this.moyasar.createRefund(refundReq.organizationId, {
      paymentId: payment.gatewayRef ?? '',
      amount: Math.round(Number(refundReq.amount) * 100),
      idempotencyKey: cmd.idempotencyKey,
    });

    await this.rlsTx.withTransaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: cmd.refundRequestId },
        data: { status: RefundStatus.COMPLETED, gatewayRef: moyasarRefund.id },
      });
      await tx.payment.update({
        where: { id: refundReq.paymentId },
        data: {
          status: PaymentStatus.REFUNDED,
          failureReason: `Booking cancellation refund (${cmd.idempotencyKey})`,
          refundedAmount: { increment: Number(refundReq.amount) },
        },
      });
      await tx.invoice.update({
        where: { id: refundReq.invoiceId },
        data: { status: 'REFUNDED' },
      });
    });

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: refundReq.invoiceId },
      select: { id: true, bookingId: true, currency: true, organizationId: true },
    });

    const event = new RefundCompletedEvent({
      refundRequestId: cmd.refundRequestId,
      organizationId: refundReq.organizationId,
      invoiceId: refundReq.invoiceId,
      paymentId: refundReq.paymentId,
      bookingId: invoice?.bookingId ?? '',
      amount: Number(refundReq.amount),
      currency: invoice?.currency ?? '',
    });
    await this.eventBus
      .publish(event.eventName, event.toEnvelope())
      .catch((err) => this.logger.error(`Failed to publish RefundCompletedEvent`, err));
  }

  async execute(cmd: RefundPaymentCommand) {
    // ── Locking transaction: read + validate + persist in-flight record ──
    // SELECT FOR UPDATE prevents two concurrent requests from both reading
    // Payment.status=COMPLETED and proceeding to issue a double-refund.
    const { payment, refundAmount, refundRequestId, idempotencyKey } =
      await this.rlsTx.withTransaction(async (tx) => {
        // Lock the payment row for the duration of this transaction.
        const rows = await tx.$queryRaw<
          Array<{
            id: string;
            status: string;
            gatewayRef: string | null;
            amount: unknown;
            invoiceId: string;
          }>
        >`SELECT id, status, "gatewayRef", amount, "invoiceId"
            FROM "Payment"
            WHERE id = ${cmd.paymentId}
            FOR UPDATE`;

        const row = rows[0];
        if (!row) throw new NotFoundException('Payment not found');
        if (row.status !== PaymentStatus.COMPLETED) {
          throw new BadRequestException('Only completed payments can be refunded');
        }
        if (!row.gatewayRef) {
          throw new BadRequestException('Payment has no gateway reference; use manual refund path');
        }

        // Fetch invoice relation (needed for org/client/booking context).
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: row.invoiceId },
          select: { id: true, bookingId: true, clientId: true, currency: true, organizationId: true },
        });

        const lockedPayment = {
          id: row.id,
          status: row.status as PaymentStatus,
          gatewayRef: row.gatewayRef,
          amount: row.amount,
          invoice,
        };

        const existingInFlightRefund = await tx.refundRequest.findFirst({
          where: {
            paymentId: cmd.paymentId,
            status: RefundStatus.PROCESSING,
          },
          select: { id: true },
        });
        if (existingInFlightRefund) {
          throw new BadRequestException('Payment refund is already processing');
        }

        const refAmt = cmd.amount ?? Number(lockedPayment.amount);
        const reqId = randomUUID();
        const iKey = `refund:${lockedPayment.id}:${Number(refAmt).toFixed(2)}`;

        // Step 1 — persist in-flight refund record inside the lock so no
        // concurrent request can slip past the PROCESSING check before this row exists.
        await tx.refundRequest.create({
          data: {
            id: reqId,
            organizationId: invoice.organizationId,
            invoiceId: invoice.id,
            paymentId: lockedPayment.id,
            clientId: invoice.clientId,
            amount: refAmt,
            reason: cmd.reason,
            status: RefundStatus.PROCESSING,
            processedAt: new Date(),
            processedBy: cmd.performedBy ?? 'system',
          },
          select: { id: true },
        });

        return { payment: lockedPayment, refundAmount: refAmt, refundRequestId: reqId, idempotencyKey: iKey };
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
        .update({ where: { id: refundRequestId }, data: { status: RefundStatus.FAILED } })
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
          data: { status: RefundStatus.COMPLETED, gatewayRef: moyasarRefundId },
        });
        const updated = await tx.payment.update({
          where: { id: cmd.paymentId },
          data: {
            status: PaymentStatus.REFUNDED,
            failureReason: cmd.reason,
            refundedAmount: { increment: refundAmount },
          },
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
