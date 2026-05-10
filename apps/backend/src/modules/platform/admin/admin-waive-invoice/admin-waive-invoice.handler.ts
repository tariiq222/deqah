import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SubscriptionInvoiceStatus,
  SuperAdminActionType,
} from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

export interface AdminWaiveInvoiceCommand {
  invoiceId: string;
  superAdminUserId: string;
  ipAddress: string;
  userAgent: string;
}

const WAIVABLE_STATUSES: SubscriptionInvoiceStatus[] = [
  SubscriptionInvoiceStatus.DUE,
  SubscriptionInvoiceStatus.FAILED,
];

@Injectable()
export class AdminWaiveInvoiceHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(cmd: AdminWaiveInvoiceCommand) {
    // $allTenants.$transaction: super-admin action — operates across tenants intentionally.
    // Voids a SubscriptionInvoice (DUE→VOID or FAILED→VOID) on a foreign tenant's billing record;
    // invoice is scoped to the target org — the bypass lets the super-admin reach it.
    return this.prisma.$allTenants.$transaction(async (tx) => {
      const invoice = await tx.subscriptionInvoice.findUnique({
        where: { id: cmd.invoiceId },
        select: { id: true, status: true, organizationId: true, amount: true },
      });
      if (!invoice) throw new NotFoundException('subscription_invoice_not_found');

      if (!WAIVABLE_STATUSES.includes(invoice.status)) {
        throw new BadRequestException(
          `invoice_cannot_be_waived: status=${invoice.status} (only DUE or FAILED can be voided)`,
        );
      }

      const updated = await tx.subscriptionInvoice.update({
        where: { id: cmd.invoiceId },
        data: {
          status: SubscriptionInvoiceStatus.VOID,
          voidedReason: null,
        },
        select: {
          id: true,
          status: true,
          voidedReason: true,
          organizationId: true,
          amount: true,
        },
      });

      await tx.superAdminActionLog.create({
        data: {
          superAdminUserId: cmd.superAdminUserId,
          actionType: SuperAdminActionType.BILLING_WAIVE_INVOICE,
          organizationId: invoice.organizationId,
          reason: null,
          metadata: {
            invoiceId: invoice.id,
            previousStatus: invoice.status,
            amount: invoice.amount.toString(),
          },
          ipAddress: cmd.ipAddress,
          userAgent: cmd.userAgent,
        },
      });

      return updated;
    });
  }
}
