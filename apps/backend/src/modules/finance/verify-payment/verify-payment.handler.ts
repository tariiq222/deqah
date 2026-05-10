import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { PaymentCompletedEvent } from '../events/payment-completed.event';

interface VerifyPaymentCommand {
  paymentId: string;
  action: 'approve' | 'reject';
  transferRef?: string;
}

@Injectable()
export class VerifyPaymentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(cmd: VerifyPaymentCommand) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: cmd.paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');

    if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Payment is not pending verification');
    }

    if (cmd.action === 'reject') {
      return this.prisma.payment.update({
        where: { id: cmd.paymentId },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: 'Bank transfer rejected',
        },
      });
    }

    // Approve path: mirror ProcessPaymentHandler — mark the payment COMPLETED,
    // recompute invoice.status from the sum of completed payments, and flip the
    // invoice to PAID/PARTIALLY_PAID atomically. Without this, downstream
    // consumers (reports, booking confirmation) see a stuck
    // ISSUED invoice even though the money has been received.
    const { updatedPayment, newInvoiceStatus } = await this.rlsTx.withTransaction(
      async (tx) => {
        const updated = await tx.payment.update({
          where: { id: cmd.paymentId },
          data: {
            status: PaymentStatus.COMPLETED,
            processedAt: new Date(),
            gatewayRef: cmd.transferRef ?? payment.gatewayRef,
          },
        });

        const invoice = await tx.invoice.findFirst({
          where: { id: payment.invoiceId },
        });
        if (!invoice) {
          throw new NotFoundException(`Invoice ${payment.invoiceId} not found`);
        }

        // payment.organizationId is available from the Proxy-scoped findFirst above.
        // Pass it explicitly because tx bypasses the tenant Proxy.
        const totalPaid = await tx.payment.aggregate({
          where: { invoiceId: payment.invoiceId, organizationId: payment.organizationId, status: PaymentStatus.COMPLETED },
          _sum: { amount: true },
        });

        const paid = Number(totalPaid._sum.amount ?? 0);
        const total = Number(invoice.total);
        const status: InvoiceStatus =
          paid >= total ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            status,
            paidAt: status === InvoiceStatus.PAID ? new Date() : undefined,
          },
        });

        return { updatedPayment: updated, newInvoiceStatus: status };
      },
    );

    if (newInvoiceStatus === InvoiceStatus.PAID) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: payment.invoiceId },
        select: { id: true, bookingId: true, currency: true },
      });
      if (invoice) {
        const event = new PaymentCompletedEvent({
          paymentId: updatedPayment.id,
          invoiceId: invoice.id,
          bookingId: invoice.bookingId,
          amount: Number(updatedPayment.amount),
          currency: invoice.currency,
        });
        await this.eventBus.publish(event.eventName, event.toEnvelope());
      }
    }

    return updatedPayment;
  }
}
