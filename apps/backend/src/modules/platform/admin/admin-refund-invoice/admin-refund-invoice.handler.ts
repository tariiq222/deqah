import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionInvoiceStatus,
  SuperAdminActionType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { MoyasarSubscriptionClient } from '../../../finance/moyasar-api/moyasar-subscription.client';

export interface AdminRefundInvoiceCommand {
  invoiceId: string;
  /** Amount in SAR. Omit for full refund of remaining. */
  amount?: number;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class AdminRefundInvoiceHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moyasar: MoyasarSubscriptionClient,
  ) {}

  async execute(cmd: AdminRefundInvoiceCommand) {
    // Fetch + validate OUTSIDE the transaction so we don't hold a row lock
    // while talking to Moyasar over the network.
    const invoice = await this.prisma.$allTenants.subscriptionInvoice.findUnique({
      where: { id: cmd.invoiceId },
      select: {
        id: true,
        status: true,
        organizationId: true,
        amount: true,
        refundedAmount: true,
        moyasarPaymentId: true,
        currency: true,
      },
    });
    if (!invoice) throw new NotFoundException('subscription_invoice_not_found');

    if (invoice.status !== SubscriptionInvoiceStatus.PAID) {
      throw new BadRequestException(
        `invoice_not_refundable: status=${invoice.status} (only PAID can be refunded; DUE/FAILED can be waived instead)`,
      );
    }
    if (!invoice.moyasarPaymentId) {
      throw new BadRequestException('invoice_missing_moyasar_payment_id');
    }

    const totalAmount = new Prisma.Decimal(invoice.amount);
    const alreadyRefunded = invoice.refundedAmount
      ? new Prisma.Decimal(invoice.refundedAmount)
      : new Prisma.Decimal(0);
    const remaining = totalAmount.sub(alreadyRefunded);

    const requestedAmount =
      cmd.amount === undefined ? remaining : new Prisma.Decimal(cmd.amount);

    if (requestedAmount.lte(0)) {
      throw new BadRequestException('refund_amount_must_be_positive');
    }
    if (requestedAmount.gt(remaining)) {
      throw new BadRequestException(
        `refund_exceeds_remaining: requested=${requestedAmount.toFixed(2)} remaining=${remaining.toFixed(2)}`,
      );
    }

    // Idempotency key — same invoice + same target refunded total = same key.
    // Re-trying the exact request is safe; partial-refund retries with a different
    // amount get a different key and Moyasar treats them as new requests.
    const newRefundedTotal = alreadyRefunded.add(requestedAmount);
    const idempotencyKey = `refund:${invoice.id}:${newRefundedTotal.toFixed(2)}`;

    let moyasarRefundId: string;
    try {
      const refund = await this.moyasar.refundPayment({
        paymentId: invoice.moyasarPaymentId,
        amountHalalas: Math.round(requestedAmount.mul(100).toNumber()),
        idempotencyKey,
      });
      moyasarRefundId = refund.id;
    } catch (err) {
      throw new BadGatewayException(
        `moyasar_refund_failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    // Mutation + audit in a single transaction now that Moyasar acknowledged.
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Records the Moyasar refund acknowledgement on a foreign tenant's SubscriptionInvoice
    // (updates refundedAmount/status) + appends the audit log; runs after the network call so
    // the row lock is held only during the DB mutation, not the Moyasar roundtrip.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const fullyRefunded = newRefundedTotal.gte(totalAmount);
      const updated = await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: {
          refundedAmount: newRefundedTotal,
          refundedAt: new Date(),
          status: fullyRefunded
            ? SubscriptionInvoiceStatus.VOID
            : invoice.status,
        },
        select: {
          id: true,
          status: true,
          amount: true,
          refundedAmount: true,
          refundedAt: true,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.BILLING_REFUND,
          organizationId: invoice.organizationId,
          reason: null,
          metadata: {
            invoiceId: invoice.id,
            moyasarPaymentId: invoice.moyasarPaymentId,
            moyasarRefundId,
            amount: requestedAmount.toFixed(2),
            previousRefundedAmount: alreadyRefunded.toFixed(2),
            newRefundedTotal: newRefundedTotal.toFixed(2),
            currency: invoice.currency,
            fullyRefunded,
          },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });
  }
}
