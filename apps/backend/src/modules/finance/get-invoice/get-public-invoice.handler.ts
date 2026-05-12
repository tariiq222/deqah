import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database';
import { resolveInvoiceSellerName } from './invoice-seller-name';

export interface GetPublicInvoiceResult {
  id: string;
  sellerName: string;
  branchId: string;
  clientId: string;
  employeeId: string;
  bookingId: string;
  subtotal: number;
  discountAmt: number;
  vatRate: number;
  vatAmt: number;
  total: number;
  refundedAmount: number;
  refundedVatAmt: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

@Injectable()
export class GetPublicInvoiceHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(invoiceId: string, clientId: string): Promise<GetPublicInvoiceResult> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        clientId: clientId,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }

    const sellerName = await resolveInvoiceSellerName(this.prisma, invoice.organizationId);

    return {
      id: invoice.id,
      sellerName,
      branchId: invoice.branchId,
      clientId: invoice.clientId,
      employeeId: invoice.employeeId,
      bookingId: invoice.bookingId,
      subtotal: Number(invoice.subtotal),
      discountAmt: Number(invoice.discountAmt),
      vatRate: Number(invoice.vatRate),
      vatAmt: Number(invoice.vatAmt),
      total: Number(invoice.total),
      refundedAmount: Number(invoice.refundedAmount),
      refundedVatAmt: Number(invoice.refundedVatAmt),
      currency: invoice.currency,
      status: invoice.status,
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      dueAt: invoice.dueAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
    };
  }
}
