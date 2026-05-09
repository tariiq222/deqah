import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database';
import {
  ZohoApiClient,
  type ZohoIntegrationConfig,
} from '../../../../infrastructure/zoho';
import { UpsertContactHandler } from '../contacts/upsert-contact.handler';
import { RecordPaymentHandler } from '../payments/record-payment.handler';

/**
 * Internal handler — creates a Zoho invoice for a Deqah Invoice that has
 * already been paid (or just charged). NOT exposed via HTTP; the only
 * caller is `PaymentCapturedEventHandler` (and the SaaS-billing module's
 * platform-side counterpart).
 *
 * Flow:
 *   1. Reuse the ZohoInvoiceLink row if it already exists (idempotent).
 *   2. Upsert the Zoho contact for the paying client.
 *   3. POST /invoices with a single ad-hoc line item built from the local
 *      invoice subtotal (we don't try to map booking line items to Zoho
 *      items — that's a follow-up).
 *   4. Record the captured payment via /customerpayments so Zoho marks
 *      the invoice paid in the same operation.
 *   5. Persist ZohoInvoiceLink with status='paid' + invoice_url + pdf_url.
 *   6. Optionally email the invoice if defaults.sendOnCreate is true.
 */
@Injectable()
export class CreateZohoInvoiceHandler {
  private readonly logger = new Logger(CreateZohoInvoiceHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: ZohoApiClient,
    private readonly upsertContact: UpsertContactHandler,
    private readonly recordPayment: RecordPaymentHandler,
  ) {}

  async execute(input: {
    organizationId: string;
    invoiceId: string;
    config: ZohoIntegrationConfig;
    /** When set, this captured payment will be recorded against the new Zoho invoice. */
    paymentId?: string;
  }): Promise<{ zohoInvoiceLinkId: string; zohoInvoiceId: string; invoiceUrl?: string }> {
    const existing = await this.prisma.zohoInvoiceLink.findUnique({
      where: {
        zoho_link_org_scope_invoice: {
          organizationId: input.organizationId,
          scope: 'TENANT_CLIENT',
          deqahInvoiceId: input.invoiceId,
        },
      },
    });
    if (existing) {
      return {
        zohoInvoiceLinkId: existing.id,
        zohoInvoiceId: existing.zohoInvoiceId,
        invoiceUrl: existing.invoiceUrl ?? undefined,
      };
    }

    const invoice = await this.prisma.invoice.findFirstOrThrow({
      where: { id: input.invoiceId, organizationId: input.organizationId },
      select: {
        id: true,
        clientId: true,
        bookingId: true,
        subtotal: true,
        total: true,
        currency: true,
        notes: true,
      },
    });

    const { zohoContactId } = await this.upsertContact.execute({
      organizationId: input.organizationId,
      clientId: invoice.clientId,
      config: input.config,
    });

    const apiCtx = {
      organizationId: input.organizationId,
      zohoOrganizationId: input.config.zohoOrganizationId,
      refreshToken: input.config.refreshToken,
      dataCenter: input.config.dataCenter,
    };

    const created = await this.api.createInvoice(
      apiCtx,
      {
        customer_id: zohoContactId,
        reference_number: invoice.id,
        notes: invoice.notes ?? undefined,
        line_items: [
          {
            name: input.config.defaults.itemId
              ? undefined
              : `Booking ${invoice.bookingId}`,
            item_id: input.config.defaults.itemId,
            description: `Deqah invoice ${invoice.id}`,
            quantity: 1,
            rate: Number(invoice.total),
          },
        ],
        branch_id: input.config.defaults.branchId,
        payment_terms: 0,
        payment_terms_label:
          input.config.defaults.paymentTerms ?? 'Due on receipt',
      },
      // Don't auto-send yet — we record the payment first so the email
      // shows the invoice as paid rather than as outstanding.
      { send: false },
    );

    const zohoInvoiceId = created.invoice.invoice_id;

    let status = created.invoice.status;
    if (input.paymentId) {
      await this.recordPayment.execute({
        organizationId: input.organizationId,
        config: input.config,
        zohoInvoiceId,
        zohoCustomerId: zohoContactId,
        paymentId: input.paymentId,
      });
      status = 'paid';
    }

    const link = await this.prisma.zohoInvoiceLink.create({
      data: {
        organizationId: input.organizationId,
        scope: 'TENANT_CLIENT',
        deqahInvoiceId: invoice.id,
        deqahBookingId: invoice.bookingId,
        zohoInvoiceId,
        zohoCustomerId: zohoContactId,
        zohoOrganizationId: input.config.zohoOrganizationId,
        status,
        total: invoice.total,
        currency: invoice.currency,
        invoiceUrl: created.invoice.invoice_url ?? null,
        pdfUrl: created.invoice.pdf_url ?? null,
      },
    });

    if (input.config.defaults.sendOnCreate) {
      try {
        await this.api.sendInvoiceEmail(apiCtx, zohoInvoiceId, {});
        await this.prisma.zohoInvoiceLink.update({
          where: { id: link.id },
          data: { lastSentAt: new Date() },
        });
      } catch (err) {
        // Email failures are non-fatal — the invoice is already issued.
        this.logger.warn(
          `Zoho invoice ${zohoInvoiceId} created but email failed: ${(err as Error).message}`,
        );
      }
    }

    return {
      zohoInvoiceLinkId: link.id,
      zohoInvoiceId,
      invoiceUrl: link.invoiceUrl ?? undefined,
    };
  }
}
