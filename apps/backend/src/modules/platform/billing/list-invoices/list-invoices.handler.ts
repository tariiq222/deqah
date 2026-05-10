import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { TenantContextService } from '../../../../common/tenant/tenant-context.service';
import {
  type InvoiceListItemDto,
  type ListInvoicesQueryDto,
} from '../dto/invoice.dto';

/**
 * Phase 7 — list invoices for the current tenant, enriched with Zoho URLs
 * so the dashboard can link directly to the Zoho-hosted invoice / PDF instead
 * of generating a local PDF.
 *
 * `SubscriptionInvoice` is intentionally NOT in `SCOPED_MODELS`, so the
 * `where: { organizationId }` filter is mandatory and explicit. Cross-org
 * isolation is verified by `tenant-billing-invoices.e2e-spec.ts`.
 */
@Injectable()
export class ListInvoicesHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantContextService,
  ) {}

  async execute(
    query: ListInvoicesQueryDto,
  ): Promise<{ items: InvoiceListItemDto[]; nextCursor: string | null }> {
    const organizationId = this.tenant.requireOrganizationId();
    const limit = query.limit ?? 20;

    const rows = await this.prisma.subscriptionInvoice.findMany({
      where: {
        organizationId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const sliced = rows.slice(0, limit);

    // Batch-load the Zoho mirror rows for this page so we can enrich each
    // invoice with its Zoho URLs without N+1 queries.
    const invoiceIds = sliced.map(r => r.id);
    const zohoLinks = invoiceIds.length > 0
      ? await this.prisma.zohoInvoiceLink.findMany({
          where: {
            organizationId,
            scope: 'SAAS_TENANT',
            deqahInvoiceId: { in: invoiceIds },
          },
          select: {
            deqahInvoiceId: true,
            invoiceUrl: true,
            pdfUrl: true,
          },
        })
      : [];

    const zohoByInvoiceId = new Map(
      zohoLinks.map(l => [l.deqahInvoiceId, l]),
    );

    const items: InvoiceListItemDto[] = sliced.map(row => {
      const zoho = zohoByInvoiceId.get(row.id);
      return {
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        status: row.status,
        amount: row.amount.toFixed(2),
        currency: row.currency,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        issuedAt: row.issuedAt ? row.issuedAt.toISOString() : null,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        zohoInvoiceUrl: zoho?.invoiceUrl ?? null,
        zohoPdfUrl: zoho?.pdfUrl ?? null,
      };
    });

    return {
      items,
      nextCursor: hasMore ? sliced[sliced.length - 1].id : null,
    };
  }
}
