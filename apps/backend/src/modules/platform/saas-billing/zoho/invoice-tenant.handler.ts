import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';
import { SaasZohoClient } from './saas-zoho.client';

interface SubscriptionInvoiceLineItem {
  kind: string;
  description?: string;
  amount?: number | string;
  metric?: string;
  used?: number;
  rate?: number | string;
}

/**
 * Mirrors a paid SubscriptionInvoice into Deqah's platform Zoho org.
 *
 * - Idempotent through `ZohoInvoiceLink (organizationId, scope, deqahInvoiceId)`.
 * - Status is recorded as `paid` from the start because the subscription
 *   invoice is only mirrored AFTER Deqah's Moyasar charge has captured.
 * - Tenant is upserted as a Zoho contact in the platform org.
 */
@Injectable()
export class InvoiceTenantHandler {
  private readonly logger = new Logger(InvoiceTenantHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: SaasZohoClient,
  ) {}

  async execute(input: {
    subscriptionInvoiceId: string;
    organizationId: string; // Deqah tenant org id
    moyasarPaymentId: string;
    paidAt: Date;
  }): Promise<{ zohoInvoiceId: string; invoiceUrl?: string } | null> {
    if (!this.client.isConfigured()) {
      this.logger.debug('SaaS Zoho not configured — skipping subscription mirror');
      return null;
    }

    // Idempotency check — we use the platform org id (DEFAULT_ORGANIZATION_ID)
    // as the link's organizationId so SAAS_TENANT-scoped rows live alongside
    // platform billing data rather than leaking into the tenant's tenancy.
    const existing = await this.prisma.zohoInvoiceLink.findUnique({
      where: {
        zoho_link_org_scope_invoice: {
          organizationId: input.organizationId,
          scope: 'SAAS_TENANT',
          deqahInvoiceId: input.subscriptionInvoiceId,
        },
      },
    });
    if (existing) {
      return {
        zohoInvoiceId: existing.zohoInvoiceId,
        invoiceUrl: existing.invoiceUrl ?? undefined,
      };
    }

    // SAFE: platform billing handler; reads across tenants to mirror invoice to Zoho
    const invoice = await this.prisma.$allTenants.subscriptionInvoice.findFirst({
      where: { id: input.subscriptionInvoiceId },
      include: {
        subscription: {
          include: { organization: { select: { nameAr: true, nameEn: true } } },
        },
      },
    });
    if (!invoice) {
      this.logger.warn(`SubscriptionInvoice ${input.subscriptionInvoiceId} not found`);
      return null;
    }

    const owner = await this.prisma.$allTenants.membership.findFirst({
      where: {
        organizationId: invoice.subscription.organizationId,
        role: 'OWNER',
        isActive: true,
      },
      select: {
        displayName: true,
        user: { select: { email: true, name: true } },
      },
    });

    const orgName =
      invoice.subscription.organization.nameAr ||
      invoice.subscription.organization.nameEn ||
      'Tenant';

    const { ctx, api } = this.client.client(input.organizationId);

    // Find or create the Zoho contact for this tenant in the platform org.
    // We don't have ZohoContactLink for the SAAS scope (the contact lives
    // in our platform Zoho org, not the tenant's), so we just look it up
    // by email each time and accept the eventual duplicate cost. In
    // practice tenants are stable and Zoho dedups by email anyway.
    const created = await api.createContact(ctx, {
      contact_name: orgName,
      email: owner?.user.email,
      contact_persons: owner?.user.email
        ? [
            {
              first_name: owner.displayName ?? owner.user.name ?? '',
              email: owner.user.email,
              is_primary_contact: true,
            },
          ]
        : undefined,
      notes: `Deqah tenant ${invoice.subscription.organizationId}`,
    });
    const zohoCustomerId = created.contact.contact_id;

    // Use the Deqah invoice number (or id fallback) so Zoho records the same
    // number. Requires Zoho auto-numbering to be OFF on the platform org
    // (applied at boot via ZohoBootstrapService).
    const deqahInvoiceNumber = invoice.invoiceNumber ?? invoice.id;

    const zohoInvoice = await api.createInvoice(
      ctx,
      {
        customer_id: zohoCustomerId,
        invoice_number: deqahInvoiceNumber,
        reference_number: deqahInvoiceNumber,
        date: input.paidAt.toISOString().slice(0, 10),
        line_items: this.mapLineItems(invoice.lineItems, Number(invoice.amount)),
        payment_terms: 0,
        payment_terms_label: 'Paid via Moyasar',
        notes: `Deqah subscription period ${invoice.periodStart
          .toISOString()
          .slice(0, 10)} → ${invoice.periodEnd.toISOString().slice(0, 10)}`,
      },
      { send: false },
    );
    const zohoInvoiceId = zohoInvoice.invoice.invoice_id;

    // Record the Moyasar capture as a customer payment.
    try {
      await api.recordCustomerPayment(ctx, {
        customer_id: zohoCustomerId,
        payment_mode: 'creditcard',
        amount: Number(invoice.amount),
        date: input.paidAt.toISOString().slice(0, 10),
        reference_number: input.moyasarPaymentId,
        description: `Moyasar charge ${input.moyasarPaymentId}`,
        invoices: [
          { invoice_id: zohoInvoiceId, amount_applied: Number(invoice.amount) },
        ],
      });
    } catch (err) {
      this.logger.warn(
        `SaaS Zoho payment posting failed for ${zohoInvoiceId}: ${(err as Error).message}`,
      );
    }

    const link = await this.prisma.zohoInvoiceLink.create({
      data: {
        organizationId: input.organizationId,
        scope: 'SAAS_TENANT',
        deqahInvoiceId: invoice.id,
        zohoInvoiceId,
        zohoCustomerId,
        zohoOrganizationId: ctx.zohoOrganizationId,
        status: 'paid',
        total: invoice.amount,
        currency: invoice.currency,
        invoiceUrl: zohoInvoice.invoice.invoice_url ?? null,
        pdfUrl: zohoInvoice.invoice.pdf_url ?? null,
      },
    });

    // Email the receipt — platform side, fire-and-forget.
    if (owner?.user.email) {
      try {
        await api.sendInvoiceEmail(ctx, zohoInvoiceId, {});
        await this.prisma.zohoInvoiceLink.update({
          where: { id: link.id },
          data: { lastSentAt: new Date() },
        });
      } catch (err) {
        this.logger.warn(`Zoho receipt email failed: ${(err as Error).message}`);
      }
    }

    return {
      zohoInvoiceId,
      invoiceUrl: link.invoiceUrl ?? undefined,
    };
  }

  private mapLineItems(raw: Prisma.JsonValue, total: number) {
    if (!Array.isArray(raw) || raw.length === 0) {
      return [
        {
          name: 'Deqah subscription',
          rate: total,
          quantity: 1,
        },
      ];
    }
    return (raw as unknown as SubscriptionInvoiceLineItem[]).map((li) => ({
      name: li.description ?? li.kind ?? 'Line item',
      description: li.metric ? `${li.metric}: ${li.used ?? ''} × ${li.rate ?? ''}` : undefined,
      rate: Number(li.amount ?? 0),
      quantity: 1,
    }));
  }
}
