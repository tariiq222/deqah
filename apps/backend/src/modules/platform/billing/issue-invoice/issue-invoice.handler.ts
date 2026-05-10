import { Injectable } from '@nestjs/common';
import type { SubscriptionInvoice } from '@prisma/client';
import { PrismaService, RlsTransactionService } from '../../../../infrastructure/database';
import { InvoiceNumberingService } from './invoice-numbering.service';
import { computeInvoiceHash } from './invoice-hash.util';

/**
 * Phase 7 — issue an invoice (assign sequential number, set issuedAt, link
 * into the per-organization hash chain).
 *
 * Idempotent: re-issuing an already-issued invoice (issuedAt + invoiceNumber
 * non-null) returns it unchanged. Status is NOT mutated here — a paid
 * invoice stays PAID; a DUE invoice stays DUE. "Issued" is a structural
 * property (issuedAt + invoiceNumber non-null), not a status value.
 */
@Injectable()
export class IssueInvoiceHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: InvoiceNumberingService,
    private readonly rlsTx: RlsTransactionService,
  ) {}

  async execute(
    invoiceId: string,
    now: Date = new Date(),
  ): Promise<SubscriptionInvoice> {
    return this.rlsTx.withBypassTransaction(async tx => {
      // bypassRls: platform billing — runs outside tenant CLS context
      const invoice = await tx.subscriptionInvoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      if (invoice.issuedAt && invoice.invoiceNumber) return invoice;

      const invoiceNumber = await this.numbering.allocate(
        invoice.organizationId,
        now,
        tx,
      );

      const prior = await tx.subscriptionInvoice.findFirst({
        where: {
          organizationId: invoice.organizationId,
          issuedAt: { not: null },
          id: { not: invoiceId },
        },
        orderBy: { issuedAt: 'desc' },
        select: { invoiceHash: true },
      });
      const previousHash = prior?.invoiceHash ?? '0';

      const issuedAt = now;
      const invoiceHash = computeInvoiceHash({
        invoiceNumber,
        organizationId: invoice.organizationId,
        amount: invoice.amount.toFixed(2),
        currency: invoice.currency,
        issuedAt: issuedAt.toISOString(),
        periodStart: invoice.periodStart.toISOString(),
        periodEnd: invoice.periodEnd.toISOString(),
        previousHash,
      });

      return tx.subscriptionInvoice.update({
        where: { id: invoiceId },
        data: { invoiceNumber, issuedAt, invoiceHash, previousHash },
      });
    });
  }
}
