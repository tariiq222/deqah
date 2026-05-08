import { Injectable } from '@nestjs/common';
import { Prisma, SubscriptionInvoiceStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database';

/**
 * Joins each SubscriptionInvoice with its Zoho mirror row (scope=SAAS_TENANT)
 * for the admin's Zoho-billing screen. The mirror is left-joined: rows where
 * the platform Zoho integration is unconfigured, or where the invoice is
 * still pending payment, simply have a null `zohoMirror`.
 *
 * Schedule visibility: each row also carries the parent subscription's
 * billingCycle + currentPeriodEnd so the UI can render an upcoming-charge
 * indicator without a separate query.
 *
 * Pagination correctness: when zohoMirrored filter is active we resolve the
 * set of matching invoice IDs from zohoInvoiceLink BEFORE the main query so
 * that both findMany AND count use the same filtered where clause. This
 * prevents the old bug where count reported the unfiltered total while
 * items showed only the in-memory-filtered subset.
 */
export interface ListZohoSaasInvoicesQuery {
  page: number;
  perPage: number;
  status?: SubscriptionInvoiceStatus;
  organizationId?: string;
  zohoMirrored?: 'yes' | 'no'; // filter: only show mirrored / only show un-mirrored
}

@Injectable()
export class ListZohoSaasInvoicesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(q: ListZohoSaasInvoicesQuery) {
    const where: Prisma.SubscriptionInvoiceWhereInput = {
      status: q.status ?? { not: SubscriptionInvoiceStatus.DRAFT },
    };
    if (q.organizationId) where.organizationId = q.organizationId;

    // Resolve zohoMirrored filter into an id set BEFORE the main query so
    // that both findMany and count use the same where clause.
    if (q.zohoMirrored === 'yes' || q.zohoMirrored === 'no') {
      const mirroredLinks = await this.prisma.$allTenants.zohoInvoiceLink.findMany({
        where: { scope: 'SAAS_TENANT', deqahInvoiceId: { not: null } },
        select: { deqahInvoiceId: true },
      });
      const mirroredIds = mirroredLinks
        .map((l) => l.deqahInvoiceId)
        .filter((id): id is string => id !== null);

      if (q.zohoMirrored === 'yes') {
        where.id = { in: mirroredIds };
      } else {
        where.id = { notIn: mirroredIds };
      }
    }

    const [rawInvoices, total] = await Promise.all([
      this.prisma.$allTenants.subscriptionInvoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.perPage,
        take: q.perPage,
        select: {
          id: true,
          subscriptionId: true,
          organizationId: true,
          invoiceNumber: true,
          amount: true,
          flatAmount: true,
          overageAmount: true,
          currency: true,
          status: true,
          billingCycle: true,
          periodStart: true,
          periodEnd: true,
          dueDate: true,
          issuedAt: true,
          paidAt: true,
          createdAt: true,
          subscription: {
            select: {
              billingCycle: true,
              currentPeriodEnd: true,
              status: true,
              organization: {
                select: {
                  id: true,
                  slug: true,
                  nameAr: true,
                  nameEn: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.$allTenants.subscriptionInvoice.count({ where }),
    ]);

    if (rawInvoices.length === 0) {
      return {
        items: [],
        meta: { page: q.page, perPage: q.perPage, total, totalPages: Math.ceil(total / q.perPage) || 1 },
      };
    }

    // Look up Zoho mirror rows in one shot for hydration. The link is keyed
    // by deqahInvoiceId and scope=SAAS_TENANT; organizationId on the link is
    // the platform org. This is hydration only — filtering is done in the
    // where clause above.
    const ids = rawInvoices.map((r) => r.id);
    const mirrors = await this.prisma.$allTenants.zohoInvoiceLink.findMany({
      where: {
        scope: 'SAAS_TENANT',
        deqahInvoiceId: { in: ids },
      },
      select: {
        deqahInvoiceId: true,
        zohoInvoiceId: true,
        status: true,
        invoiceUrl: true,
        pdfUrl: true,
        viewedAt: true,
        lastSentAt: true,
        createdAt: true,
      },
    });
    const mirrorByInvoice = new Map(mirrors.map((m) => [m.deqahInvoiceId!, m]));

    const items = rawInvoices.map(({ subscription, ...invoice }) => {
      const zohoMirror = mirrorByInvoice.get(invoice.id) ?? null;
      return {
        ...invoice,
        nextChargeAt: subscription.currentPeriodEnd,
        subscriptionStatus: subscription.status,
        organization: subscription.organization,
        zohoMirror,
      };
    });

    return {
      items,
      meta: {
        page: q.page,
        perPage: q.perPage,
        total,
        totalPages: Math.ceil(total / q.perPage) || 1,
      },
    };
  }
}
