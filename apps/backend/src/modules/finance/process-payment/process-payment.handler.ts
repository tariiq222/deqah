import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../infrastructure/database';
import { EventBusService } from '../../../infrastructure/events';
import { TenantContextService } from '../../../common/tenant/tenant-context.service';
import { PaymentCompletedEvent } from '../events/payment-completed.event';
import { ProcessPaymentDto } from './process-payment.dto';

export type ProcessPaymentCommand = ProcessPaymentDto;

@Injectable()
export class ProcessPaymentHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly tenant: TenantContextService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(dto: ProcessPaymentCommand) {
    // Capture organizationId from CLS before entering the tx callback.
    // Inside $transaction the Proxy is bypassed, so we must pass it explicitly.
    const organizationId = this.tenant.requireOrganizationIdOrDefault();

    // Run the invoice check, payment insert, sum-aggregate, and invoice status
    // update inside a single transaction so a concurrent payment cannot slip
    // between the aggregate and the update and produce a wrong status or stale
    // paidAt. The @unique(idempotencyKey) constraint is the final guard against
    // duplicate payments — the pre-check is kept only as a fast short-circuit.
    const { payment, newStatus } = await this.rlsTx.withTransaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: dto.invoiceId, organizationId },
      });
      if (!invoice) throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);
      if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.REFUNDED) {
        throw new BadRequestException(
          `Invoice ${dto.invoiceId} cannot accept payments (status: ${invoice.status})`,
        );
      }

      let createdPayment;
      try {
        createdPayment = await tx.payment.create({
          data: {
            organizationId,
            invoiceId: dto.invoiceId,
            amount: dto.amount,
            method: dto.method,
            gatewayRef: dto.gatewayRef,
            idempotencyKey: dto.idempotencyKey,
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });
      } catch (err) {
        // P2002 = unique constraint violation — idempotencyKey already used.
        // Return the existing payment instead of failing the whole request.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' &&
          dto.idempotencyKey
        ) {
          const existing = await tx.payment.findFirst({
            where: { idempotencyKey: dto.idempotencyKey, organizationId },
          });
          if (existing) return { payment: existing, newStatus: null as InvoiceStatus | null };
        }
        throw err;
      }

      const totalPaid = await tx.payment.aggregate({
        where: { invoiceId: dto.invoiceId, organizationId, status: 'COMPLETED' },
        _sum: { amount: true },
      });

      const paid = Number(totalPaid._sum.amount ?? 0);
      const total = Number(invoice.total);
      const status: InvoiceStatus =
        paid >= total ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;

      await tx.invoice.update({
        where: { id: dto.invoiceId },
        data: {
          status,
          paidAt: status === InvoiceStatus.PAID ? new Date() : undefined,
        },
      });

      return { payment: createdPayment, newStatus: status };
    });

    // Publish the event outside the transaction so we never publish an event
    // for a payment that was rolled back.
    if (newStatus === InvoiceStatus.PAID) {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoiceId, organizationId },
        select: { id: true, bookingId: true, currency: true },
      });
      if (invoice) {
        const event = new PaymentCompletedEvent({
          paymentId: payment.id,
          invoiceId: invoice.id,
          bookingId: invoice.bookingId,
          amount: Number(dto.amount),
          currency: invoice.currency,
        });
        await this.eventBus.publish(event.eventName, event.toEnvelope());
      }
    }

    return payment;
  }
}
