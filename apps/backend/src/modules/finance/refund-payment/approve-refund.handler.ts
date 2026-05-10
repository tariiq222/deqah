import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { MoyasarApiClient } from '../moyasar-api/moyasar-api.client';
import { RefundCompletedEvent } from '../events/refund-completed.event';

export interface ApproveRefundCommand {
  refundRequestId: string;
  approvedBy: string;
}

export interface RefundApprovalResult {
  id: string;
  status: string;
  gatewayRef?: string;
}

@Injectable()
export class ApproveRefundHandler {
  private readonly logger = new Logger(ApproveRefundHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moyasarClient: MoyasarApiClient,
    private readonly eventBus: EventBusService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: ApproveRefundCommand): Promise<RefundApprovalResult> {
    const refundRequest = await this.prisma.refundRequest.findFirst({
      where: {
        id: cmd.refundRequestId,
        status: 'PENDING_REVIEW',
      },
    });

    if (!refundRequest) {
      throw new NotFoundException('Refund request not found or not pending review');
    }

    await this.prisma.refundRequest.update({
      where: { id: cmd.refundRequestId },
      data: {
        status: 'PROCESSING',
        processedBy: cmd.approvedBy,
        processedAt: new Date(),
      },
    });

    // Track whether Moyasar already moved real money. If so, a subsequent DB
    // failure must NOT mark the row as FAILED — the funds are gone and the
    // gatewayRef must be persisted so reconciliation can finalize the row.
    let moyasarRefundId: string | undefined;

    try {
      const moyasarRefund = await this.moyasarClient.createRefund(
        refundRequest.organizationId,
        {
          paymentId: refundRequest.paymentId,
          amount: Math.round(Number(refundRequest.amount) * 100),
          idempotencyKey: `refund:${refundRequest.id}`,
        },
      );
      moyasarRefundId = moyasarRefund.id;

      // Atomic finalize — the three writes that commit the refund (mark
      // request COMPLETED + invoice REFUNDED + payment REFUNDED) must land
      // together or not at all. Previously they were three sequential awaits;
      // a DB blip between any pair would leave books inconsistent with
      // Moyasar (real money refunded but invoice still ISSUED).
      const { updated, invoice } = await this.rlsTx.withTransaction(async (tx) => {
        const updated = await tx.refundRequest.update({
          where: { id: cmd.refundRequestId },
          data: {
            status: 'COMPLETED',
            gatewayRef: moyasarRefund.id,
          },
        });

        const invoice = await tx.invoice.update({
          where: { id: refundRequest.invoiceId },
          data: { status: 'REFUNDED' },
          select: { id: true, bookingId: true, currency: true },
        });

        await tx.payment.update({
          where: { id: refundRequest.paymentId },
          data: { status: 'REFUNDED' },
        });

        return { updated, invoice };
      });

      // Phase 2 / Bug B11 — fire RefundCompletedEvent so the billing
      // listener can decrement the UsageCounter. Failure to publish must
      // never break the refund itself; reconcile cron is the safety net.
      const event = new RefundCompletedEvent({
        refundRequestId: updated.id,
        organizationId: refundRequest.organizationId,
        invoiceId: invoice.id,
        paymentId: refundRequest.paymentId,
        bookingId: invoice.bookingId,
        amount: Number(refundRequest.amount),
        currency: invoice.currency,
      });
      await this.eventBus
        .publish(event.eventName, event.toEnvelope())
        .catch(() => undefined);

      return {
        id: updated.id,
        status: updated.status,
        gatewayRef: moyasarRefund.id,
      };
    } catch (error) {
      // Two distinct failure modes — handle them differently:
      //
      // 1. Moyasar threw → no money moved. Safe to mark FAILED so the
      //    request can be re-approved later.
      // 2. Moyasar succeeded but the finalize transaction threw → money
      //    HAS been refunded by Moyasar. Marking FAILED here would
      //    desynchronize the books permanently. Persist the gatewayRef
      //    on the row so reconciliation (or a human operator) can
      //    finish the COMPLETED transition. We deliberately leave the
      //    row in PROCESSING — the presence of gatewayRef plus PROCESSING
      //    is the canonical "needs reconciliation" signal.
      if (moyasarRefundId) {
        this.logger.error(
          `Refund ${cmd.refundRequestId}: Moyasar succeeded (gatewayRef=${moyasarRefundId}) but DB finalize failed — left in PROCESSING for reconciliation`,
          error instanceof Error ? error.stack : undefined,
        );
        await this.prisma.refundRequest
          .update({
            where: { id: cmd.refundRequestId },
            data: { gatewayRef: moyasarRefundId },
          })
          .catch((persistErr) => {
            this.logger.error(
              `Refund ${cmd.refundRequestId}: failed to persist gatewayRef after partial-success — manual intervention required`,
              persistErr instanceof Error ? persistErr.stack : undefined,
            );
          });
      } else {
        await this.prisma.refundRequest.update({
          where: { id: cmd.refundRequestId },
          data: { status: 'FAILED' },
        });
      }

      throw error;
    }
  }
}
