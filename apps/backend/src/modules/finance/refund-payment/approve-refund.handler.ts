import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly moyasarClient: MoyasarApiClient,
    private readonly eventBus: EventBusService,
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

    try {
      const moyasarRefund = await this.moyasarClient.createRefund(
        refundRequest.organizationId,
        {
          paymentId: refundRequest.paymentId,
          amount: Math.round(Number(refundRequest.amount) * 100),
          idempotencyKey: `refund:${refundRequest.id}`,
        },
      );

      const updated = await this.prisma.refundRequest.update({
        where: { id: cmd.refundRequestId },
        data: {
          status: 'COMPLETED',
          gatewayRef: moyasarRefund.id,
        },
      });

      const invoice = await this.prisma.invoice.update({
        where: { id: refundRequest.invoiceId },
        data: { status: 'REFUNDED' },
        select: { id: true, bookingId: true, currency: true },
      });

      await this.prisma.payment.update({
        where: { id: refundRequest.paymentId },
        data: { status: 'REFUNDED' },
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
      await this.prisma.refundRequest.update({
        where: { id: cmd.refundRequestId },
        data: {
          status: 'FAILED',
        },
      });

      throw error;
    }
  }
}
